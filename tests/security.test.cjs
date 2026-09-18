const test=require('node:test'),assert=require('node:assert/strict');
const {Store}=require('../desktop/store.cjs');
const {Security,verifyPassword}=require('../desktop/security.cjs');
function setup(){const store=new Store(':memory:');let now=Date.now();const sec=new Security(store,()=>now);sec.run('activate',{key:'IQ-LINKS-OWNER-2026',validityDays:365});sec.run('setup-company',{companyName:'Test',owner:'Test Owner',pin:'123456',pinConfirm:'123456'});sec.run('create-user',{username:'owner',role:'owner',password:'Testing123'});sec.run('login',{username:'owner',password:'Testing123'});return {store,sec,tick:()=>now+=16*60*1000};}
test('PIN challenges do not count as failures, but set-pin cannot bypass lockout',()=>{
 const {store,sec}=setup();
 for(let i=0;i<6;i++)assert.throws(()=>sec.authorize('backup'),/PIN required/);
 assert.equal(store.db.prepare('SELECT count(*) n FROM login_attempts').get().n,0);
 assert.doesNotThrow(()=>sec.authorize('backup',{pin:'123456'}));
 const client=new Security(store);
 for(let i=0;i<5;i++)assert.throws(()=>client.run('set-pin',{pin:'000000',pinConfirm:'000000'}),/incorrect/);
 assert.throws(()=>client.run('set-pin',{pin:'123456',pinConfirm:'123456'}),/Too many/);
 store.close();
});
test('idle logout requires fresh PIN and snapshots never expose the PIN hash',()=>{
 const {store,sec}=setup();
 assert.equal(sec.run('snapshot').config.pinHash,undefined);
 sec.run('logout');assert.throws(()=>sec.run('resume-login'),/PIN/);
 sec.run('unlock-pin',{pin:'123456'});assert.equal(sec.run('resume-login').username,'owner');store.close();
});
test('factory PIN is required after restart and for protected changes',()=>{const {store,sec}=setup();const restarted=new Security(store);assert.equal(restarted.run('status').pinUnlocked,false);const duplicate=new Security(store);assert.equal(duplicate.run('set-pin',{pin:'123456',pinConfirm:'123456'}).pinUnlocked,true);assert.throws(()=>restarted.run('login',{username:'owner',password:'Testing123'}),/PIN/);restarted.run('unlock-pin',{pin:'123456'});restarted.run('login',{username:'owner',password:'Testing123'});assert.throws(()=>restarted.run('theme',{theme:'dark'}),/PIN/);restarted.run('theme',{theme:'dark',pin:'123456'});store.close();});
test('owner can permanently clear factory data only with PIN and exact confirmation',()=>{const {store,sec}=setup();assert.throws(()=>sec.run('delete-all-data',{confirmation:'DELETE ALL FACTORY DATA',pin:'000000'}),/PIN/);sec.run('delete-all-data',{confirmation:'DELETE ALL FACTORY DATA',pin:'123456'});assert.equal(store.all('user').length,0);assert.equal(store.config().setupComplete,false);assert.equal(store.config().pinHash,'');store.close();});
test('activation and setup cannot be bypassed',()=>{const st=new Store(':memory:'),s=new Security(st);assert.throws(()=>s.run('snapshot'));assert.throws(()=>s.run('create-user',{username:'bad',role:'owner',password:'Testing123'}));assert.throws(()=>s.run('login',{}));st.close();});
test('unauthenticated callers cannot create more accounts or change company',()=>{const {store}=setup();const s=new Security(store);for(const a of ['create-user','setup-company','snapshot','access','theme'])assert.throws(()=>s.run(a,{}));store.close();});
test('new hashes are salted and secrets never leave snapshots',()=>{const {store,sec}=setup();const u=sec.run('create-user',{username:'other',role:'manager',password:'Testing123',pin:'123456'});assert.equal(u.passwordHash,undefined);const saved=store.userByUsername('other');assert.ok(saved.passwordHash.startsWith('scrypt:'));assert.ok(verifyPassword('Testing123',saved.passwordHash));assert.notEqual(saved.passwordHash,store.userByUsername('owner').passwordHash);assert.ok(!JSON.stringify(sec.run('snapshot')).includes('passwordHash'));store.close();});
test('role checks apply to every backend write and sensitive export',()=>{const {store,sec}=setup();for(const role of ['manager','supervisor','storekeeper','accountant','worker']){sec.run('create-user',{username:role,role,password:'Testing123',pin:'123456'});const client=new Security(store);client.run('unlock-pin',{pin:'123456'});client.run('login',{username:role,password:'Testing123'});for(const action of ['access','create-user','reset-password','restore','backup'])assert.throws(()=>client.authorize(action));if(['manager','accountant'].includes(role))assert.doesNotThrow(()=>client.authorize('export-csv'));else assert.throws(()=>client.authorize('export-csv'));}store.close();});
test('authorized CSV export is dispatched through Security.run',()=>{const {store,sec}=setup();store.add('material',{name:'CSV Leather',unit:'kg',rate:45000,reorder:20});const csv=sec.run('export-csv',{kind:'materials'});assert.match(csv,/CSV Leather/);assert.throws(()=>sec.run('export-csv',{kind:'not-a-kind'}),/supported CSV/);store.close();});
test('account disable invalidates existing sessions, owner cannot disable self',()=>{const {store,sec}=setup();const u=sec.run('create-user',{username:'worker1',role:'worker',password:'Testing123',pin:'123456'});const c=new Security(store);c.run('unlock-pin',{pin:'123456'});c.run('login',{username:'worker1',password:'Testing123'});assert.deepEqual(c.run('snapshot').events,[]);sec.run('set-user-active',{id:u.id,active:false,pin:'123456'});assert.throws(()=>c.run('snapshot'));assert.throws(()=>sec.run('set-user-active',{id:sec.session.id,active:false}));store.close();});
test('password change and reset invalidate sessions and require correct current password',()=>{const {store,sec}=setup();assert.throws(()=>sec.run('change-password',{currentPassword:'wrong',password:'NewTest123'}));sec.run('change-password',{currentPassword:'Testing123',password:'NewTest123',pin:'123456'});assert.throws(()=>sec.run('snapshot'));sec.run('unlock-pin',{pin:'123456'});sec.run('login',{username:'owner',password:'NewTest123'});assert.ok(sec.run('access').audit.some(x=>x.action==='change-password'));store.close();});
test('idle session expires and login attempts are locked persistently',()=>{const {store,sec,tick}=setup();tick();assert.throws(()=>sec.run('snapshot'));assert.equal(sec.run('status').pinUnlocked,false);sec.run('unlock-pin',{pin:'123456'});for(let i=0;i<5;i++)assert.throws(()=>sec.run('login',{username:'owner',password:'wrong'}));const locked=new Security(store);locked.run('unlock-pin',{pin:'123456'});assert.throws(()=>locked.run('login',{username:'owner',password:'Testing123'}),/Too many/);store.close();});
test('factory PIN can resume the last active account without storing a password',()=>{const {store,sec}=setup();const first=sec.run('login',{username:'owner',password:'Testing123',pin:'123456'});assert.equal(store.config().rememberedUserId,first.id);const reopened=new Security(store);reopened.run('unlock-pin',{pin:'123456'});assert.equal(reopened.run('status').rememberedUser.username,'owner');assert.equal(reopened.run('resume-login').username,'owner');assert.equal(store.userByUsername('owner').passwordHash.startsWith('scrypt:'),true);reopened.run('logout',{forgetUser:true});assert.equal(store.config().rememberedUserId,'');store.close();});

test('worker profile linking is owner-only, unique and isolates personal data',()=>{
 const {store,sec}=setup();
 const w1=store.add('worker',{name:'Personal worker',basis:'piece',rate:200});
 const w2=store.add('worker',{name:'PRIVATE OTHER WORKER',basis:'piece',rate:999});
 store.event('advance',w1.id,'2026-01-01',{amount:100,note:'Own advance'});
 store.event('advance',w2.id,'2026-01-01',{amount:999,note:'PRIVATE NOTE'});
 const u=sec.run('create-user',{username:'linked',role:'worker',password:'Testing123',pin:'123456'});
 const other=sec.run('create-user',{username:'otherlogin',role:'worker',password:'Testing123',pin:'123456'});
 sec.run('link-worker',{id:u.id,workerId:w1.id,pin:'123456'});
 assert.throws(()=>sec.run('link-worker',{id:other.id,workerId:w1.id,pin:'123456'}),/already linked/);
 assert.throws(()=>sec.run('link-worker',{id:other.id,workerId:'missing',pin:'123456'}));
 const c=new Security(store);c.run('unlock-pin',{pin:'123456'});c.run('login',{username:'linked',password:'Testing123'});
 assert.throws(()=>c.run('link-worker',{id:u.id,workerId:w2.id,pin:'123456'}));
 const view=c.run('snapshot');assert.equal(view.myWork.name,'Personal worker');assert.equal(view.myWork.balance.advanceDue,100);assert.deepEqual(view.warehouse,[]);assert.deepEqual(view.bin,[]);assert.deepEqual(view['stock-count'],[]);
 assert.ok(!JSON.stringify(view).includes('PRIVATE'));assert.deepEqual(view.worker,[]);assert.deepEqual(view.balances,{});
 sec.run('link-worker',{id:u.id,workerId:'',pin:'123456'});assert.equal(c.run('snapshot').myWork,null);
 store.close();
});
test('master data revisions follow manager permissions and preserve worker restrictions',()=>{
 const {store,sec}=setup();
 const material=store.add('material',{name:'Leather',unit:'yard',rate:10000,reorder:5});
 const worker=store.add('worker',{name:'Ali',basis:'piece',rate:2000});
 const department=store.all('department')[0];
 const manager=sec.run('create-user',{username:'manager1',role:'manager',password:'Testing123',pin:'123456'});
 const managerClient=new Security(store);managerClient.run('unlock-pin',{pin:'123456'});managerClient.run('login',{username:'manager1',password:'Testing123'});
 managerClient.run('material-revise',{id:material.id,name:'Leather Plus',unit:'yard',rate:120,reorder:6,reason:'Approved change',pin:'123456'});
 managerClient.run('worker-revise',{id:worker.id,name:'Ali',phone:'',basis:'piece',rate:25,reason:'Approved change',pin:'123456'});
 managerClient.run('department-revise',{id:department.id,name:'Upper Line',reason:'Approved change',pin:'123456'});
 const workerUser=sec.run('create-user',{username:'worker2',role:'worker',password:'Testing123',pin:'123456'});
 const workerClient=new Security(store);workerClient.run('unlock-pin',{pin:'123456'});workerClient.run('login',{username:'worker2',password:'Testing123'});
 assert.throws(()=>workerClient.run('material-revise',{id:material.id,name:'Forbidden',unit:'yard',rate:1,reorder:1}));
 assert.throws(()=>workerClient.run('worker-revise',{id:worker.id,name:'Forbidden',basis:'piece',rate:1}));
 store.close();
});
test('English is the only language and night mode stays disabled',()=>{
 const {store,sec}=setup();
 assert.equal(store.config().language,'en');
 assert.equal(store.config().theme,'light');
 sec.run('language',{language:'ur'});
 assert.equal(store.config().language,'en');
 assert.equal(store.config().theme,'light');
 assert.deepEqual(store.publicStatus().language,'en');
 store.close();
});
