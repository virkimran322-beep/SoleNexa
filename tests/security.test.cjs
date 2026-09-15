const test=require('node:test'),assert=require('node:assert/strict');
const {Store}=require('../desktop/store.cjs');
const {Security,verifyPassword}=require('../desktop/security.cjs');
function setup(){const store=new Store(':memory:');let now=Date.now();const sec=new Security(store,()=>now);sec.run('activate',{key:'IQ-LINKS-OWNER-2026'});sec.run('setup-company',{companyName:'Test',owner:'Test Owner'});sec.run('create-user',{username:'owner',role:'owner',password:'Testing123'});sec.run('login',{username:'owner',password:'Testing123'});return {store,sec,tick:()=>now+=16*60*1000};}
test('activation and setup cannot be bypassed',()=>{const st=new Store(':memory:'),s=new Security(st);assert.throws(()=>s.run('snapshot'));assert.throws(()=>s.run('create-user',{username:'bad',role:'owner',password:'Testing123'}));assert.throws(()=>s.run('login',{}));st.close();});
test('unauthenticated callers cannot create more accounts or change company',()=>{const {store}=setup();const s=new Security(store);for(const a of ['create-user','setup-company','snapshot','access','theme'])assert.throws(()=>s.run(a,{}));store.close();});
test('new hashes are salted and secrets never leave snapshots',()=>{const {store,sec}=setup();const u=sec.run('create-user',{username:'other',role:'manager',password:'Testing123'});assert.equal(u.passwordHash,undefined);const saved=store.userByUsername('other');assert.ok(saved.passwordHash.startsWith('scrypt:'));assert.ok(verifyPassword('Testing123',saved.passwordHash));assert.notEqual(saved.passwordHash,store.userByUsername('owner').passwordHash);assert.ok(!JSON.stringify(sec.run('snapshot')).includes('passwordHash'));store.close();});
test('role checks apply to every backend write and sensitive export',()=>{const {store,sec}=setup();for(const role of ['manager','supervisor','storekeeper','accountant','worker']){sec.run('create-user',{username:role,role,password:'Testing123'});const client=new Security(store);client.run('login',{username:role,password:'Testing123'});for(const action of ['access','create-user','reset-password','restore','backup'])assert.throws(()=>client.authorize(action));}store.close();});
test('account disable invalidates existing sessions, owner cannot disable self',()=>{const {store,sec}=setup();const u=sec.run('create-user',{username:'worker1',role:'worker',password:'Testing123'});const c=new Security(store);c.run('login',{username:'worker1',password:'Testing123'});assert.deepEqual(c.run('snapshot').events,[]);sec.run('set-user-active',{id:u.id,active:false});assert.throws(()=>c.run('snapshot'));assert.throws(()=>sec.run('set-user-active',{id:sec.session.id,active:false}));store.close();});
test('password change and reset invalidate sessions and require correct current password',()=>{const {store,sec}=setup();assert.throws(()=>sec.run('change-password',{currentPassword:'wrong',password:'NewTest123'}));sec.run('change-password',{currentPassword:'Testing123',password:'NewTest123'});assert.throws(()=>sec.run('snapshot'));sec.run('login',{username:'owner',password:'NewTest123'});assert.ok(sec.run('access').audit.some(x=>x.action==='change-password'));store.close();});
test('idle session expires and login attempts are locked persistently',()=>{const {store,sec,tick}=setup();tick();assert.throws(()=>sec.run('snapshot'));for(let i=0;i<5;i++)assert.throws(()=>sec.run('login',{username:'owner',password:'wrong'}));assert.throws(()=>new Security(store).run('login',{username:'owner',password:'Testing123'}),/Too many/);store.close();});

test('worker profile linking is owner-only, unique and isolates personal data',()=>{
 const {store,sec}=setup();
 const w1=store.add('worker',{name:'Personal worker',basis:'piece',rate:200});
 const w2=store.add('worker',{name:'PRIVATE OTHER WORKER',basis:'piece',rate:999});
 store.event('advance',w1.id,'2026-01-01',{amount:100,note:'Own advance'});
 store.event('advance',w2.id,'2026-01-01',{amount:999,note:'PRIVATE NOTE'});
 const u=sec.run('create-user',{username:'linked',role:'worker',password:'Testing123'});
 const other=sec.run('create-user',{username:'otherlogin',role:'worker',password:'Testing123'});
 sec.run('link-worker',{id:u.id,workerId:w1.id});
 assert.throws(()=>sec.run('link-worker',{id:other.id,workerId:w1.id}),/already linked/);
 assert.throws(()=>sec.run('link-worker',{id:other.id,workerId:'missing'}));
 const c=new Security(store);c.run('login',{username:'linked',password:'Testing123'});
 assert.throws(()=>c.run('link-worker',{id:u.id,workerId:w2.id}));
 const view=c.run('snapshot');assert.equal(view.myWork.name,'Personal worker');assert.equal(view.myWork.balance.advanceDue,100);
 assert.ok(!JSON.stringify(view).includes('PRIVATE'));assert.deepEqual(view.worker,[]);assert.deepEqual(view.balances,{});
 sec.run('link-worker',{id:u.id,workerId:''});assert.equal(c.run('snapshot').myWork,null);
 store.close();
});
