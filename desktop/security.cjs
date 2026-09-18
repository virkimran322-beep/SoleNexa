const { randomBytes, scryptSync, timingSafeEqual, createHash } = require('node:crypto');
const roles = {
  owner: ['*'],
  manager: ['material','material-revise','cost','po','worker','worker-revise','assignment','receipt','scan-receipt','stock','finished','dispatch','department','department-revise','supplier','supplier-revise','purchase','purchase-return','supplier-payment','warehouse','bin','stock-count','stock-count-submit','stock-count-approve','stock-count-reject','correct-event','cancel-assignment','export-csv','whatsapp-share'],
  supervisor: ['assignment','receipt','scan-receipt'],
  storekeeper: ['material','material-revise','stock','finished','dispatch','supplier','purchase','purchase-return','warehouse','bin','stock-count','stock-count-submit','whatsapp-share'],
  accountant: ['worker','worker-revise','advance','attendance','salary','settlement','supplier','supplier-revise','supplier-payment','export-csv','whatsapp-share'],
  worker: [],
};
const aliases = {admin:'owner','sub-manager':'supervisor',production:'supervisor',inventory:'storekeeper',accounts:'accountant',viewer:'worker'};
const roleOf = r => aliases[r] || r;
const safeUser = u => ({id:u.id,username:u.username,role:roleOf(u.role),active:u.active,workerId:u.workerId || null});
const pinActions = new Set(['company-profile','material','material-revise','cost','po','worker','worker-revise','assignment','receipt','scan-receipt','stock','finished','dispatch','department','department-revise','supplier','supplier-revise','purchase','purchase-return','supplier-payment','warehouse','bin','stock-count','stock-count-submit','stock-count-approve','stock-count-reject','advance','attendance','salary','settlement','correct-event','cancel-assignment','backup','restore','create-user','link-worker','change-password','reset-password','set-user-active','theme','delete-all-data']);
function validPin(value) { return typeof value === 'string' && /^\d{6}$/.test(value); }
function passwordHash(value) {
  if(typeof value !== 'string' || value.length < 8 || value.length > 500) throw Error('Password must be 8–500 characters.');
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(value,salt,64).toString('hex')}`;
}
function verifyPassword(value, hash) {
  if(typeof value !== 'string' || value.length > 500 || !hash) return false;
  const parts = hash.split(':');
  const actual = parts.length === 3 ? scryptSync(value,parts[1],64) : createHash('sha256').update(value).digest();
  const expected = Buffer.from(parts.length === 3 ? parts[2] : hash,'hex');
  return actual.length === expected.length && timingSafeEqual(actual,expected);
}
class Security {
  constructor(store, now = Date.now, licence = null) {
    this.licence=licence;
    this.store=store; this.now=now; this.session=null; this.pinUnlocked=false;
    store.db.exec('CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, outcome TEXT NOT NULL); CREATE TABLE IF NOT EXISTS login_attempts (username TEXT PRIMARY KEY, failures INTEGER NOT NULL, locked_until INTEGER NOT NULL);');
  }
  audit(action,target='',outcome='success',actor=this.session?.username || 'setup') {
    this.store.db.prepare('INSERT INTO audit(at,actor,action,target,outcome) VALUES(?,?,?,?,?)').run(new Date(this.now()).toISOString(),actor,action,String(target).slice(0,100),outcome);
  }
  current() {
    const s=this.session;
    if(!s || this.now()-s.last > 15*60*1000) {this.session=null; this.pinUnlocked=false; throw Error('Session expired. Please sign in again.');}
    const u=this.store.get('user',s.id);
    if(!u.active || u.passwordHash!==s.hash) {this.session=null; throw Error('Account changed. Please sign in again.');}
    s.last=this.now(); return safeUser(u);
  }
  verifyPin(pin) {
    const hash=this.store.config().pinHash;
    if(!hash) throw Error('Factory PIN is not configured.');
    if(pin === undefined) throw Error('Factory PIN required.');
    const key='__factory_pin__', row=this.store.db.prepare('SELECT * FROM login_attempts WHERE username=?').get(key);
    if(row?.locked_until>this.now()) throw Error('Too many PIN attempts. Try again in 5 minutes.');
    if(!validPin(pin) || !verifyPassword('pin:'+pin,hash)) {
      const failures=(row?.locked_until && row.locked_until<=this.now()?0:row?.failures||0)+1;
      this.store.db.prepare('INSERT OR REPLACE INTO login_attempts VALUES(?,?,?)').run(key,failures,failures>=5?this.now()+300000:0);
      this.audit('pin','','failed'); throw Error('Factory PIN is incorrect.');
    }
    this.store.db.prepare('DELETE FROM login_attempts WHERE username=?').run(key);
    return true;
  }
  authorize(action,p={}) {
    const u=this.current();
    if(this.licence)this.licence.ensure();
    if(!this.store.config().activated) throw Error('Activate SoleNexa first.');
    const allowed=roles[u.role] || [];
    if(!allowed.includes('*') && !allowed.includes(action) && !['snapshot','change-password','logout','theme','language','info','qr-code'].includes(action) && !(u.role!=='worker' && ['print','pdf'].includes(action))) {
      this.audit(action,'','denied'); throw Error('Your role does not permit this action.');
    }
    if(pinActions.has(action)) this.verifyPin(p.pin);
    return u;
  }
  run(action,p={}) {
    const db=this.store.db;
    if(action==='status') {
      const status=this.store.publicStatus();
      if(this.licence){
        status.licence=this.licence.status();
        status.activated=status.licence.active;
        // A fresh database may be paired with an already-valid local licence.
        // Reconcile the cached database flag before rendering setup, otherwise
        // the UI can show factory setup while setup-company is still rejected.
        if(status.licence.active && !this.store.config().activated){
          const c={...this.store.config(),activated:true};
          this.store.db.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify(c),c.id);
        }
      }
      status.pinConfigured=!!this.store.config().pinHash; status.pinUnlocked=this.pinUnlocked;
      const remembered = this.store.config().rememberedUserId && this.store.all('user').find(u=>u.id===this.store.config().rememberedUserId && u.active);
      status.rememberedUser = remembered ? safeUser(remembered) : null;
      return status;
    }
    if(action==='activate' && this.licence){
      const status=this.licence.activate(p.key, p.validityDays);
      const c={...this.store.config(),activated:true};
      db.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify(c),c.id);
      this.audit('activate-license','offline-local-key');
      return this.run('status');
    }
    if(this.licence && action!=='logout')this.licence.ensure();
    if(action==='unlock-pin') { this.verifyPin(p.pin); this.pinUnlocked=true; this.audit('unlock-pin'); return this.run('status'); }
    if(action==='set-pin') {
      const c=this.store.config();
      if(c.pinHash) {
        this.verifyPin(p.pin);
        if(p.pin!==p.pinConfirm) throw Error('PIN confirmation must match.');
        this.pinUnlocked=true; return this.run('status');
      }
      if(c.setupComplete) throw Error('Factory PIN is already configured.');
      if(!validPin(p.pin) || p.pin!==p.pinConfirm) throw Error('PIN must be exactly 6 matching digits.');
      c.pinHash=passwordHash('pin:'+p.pin); this.store.db.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify(c),c.id); this.pinUnlocked=true; this.audit('set-pin'); return this.run('status');
    }
    if(action==='login') {
      if(!this.store.config().activated || !this.store.config().setupComplete) throw Error('Complete activation and factory setup first.');
      if(this.store.config().pinHash && !this.pinUnlocked) throw Error('Factory PIN required before sign in.');
      const name=String(p.username || '').trim().toLowerCase().slice(0,40);
      const attempt=db.prepare('SELECT * FROM login_attempts WHERE username=?').get(name);
      if(attempt?.locked_until>this.now()) throw Error('Too many attempts. Try again in 5 minutes.');
      const u=this.store.userByUsername(name);
      if(!u?.active || !verifyPassword(p.password,u.passwordHash)) {
        const count=(attempt?.locked_until && attempt.locked_until<=this.now() ? 0 : attempt?.failures || 0)+1;
        db.prepare('INSERT OR REPLACE INTO login_attempts VALUES(?,?,?)').run(name,count,count>=5?this.now()+300000:0);
        this.audit('login','','failed',name); throw Error('Username or password is incorrect.');
      }
      db.prepare('DELETE FROM login_attempts WHERE username=?').run(name);
      if(!u.passwordHash.startsWith('scrypt:')) {u.passwordHash=passwordHash(p.password); this.save(u);}
      this.session={...safeUser(u),hash:u.passwordHash,last:this.now()};
      const c={...this.store.config(),rememberedUserId:u.id}; this.store.db.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify(c),c.id);
      this.audit('login'); return safeUser(u);
    }
    if(action==='resume-login') {
      if(!this.pinUnlocked) throw Error('Factory PIN required before sign in.');
      const id=this.store.config().rememberedUserId, u=id ? this.store.get('user',id) : null;
      if(!u || !u.active) throw Error('Remembered account is no longer available. Sign in with username and password.');
      this.session={...safeUser(u),hash:u.passwordHash,last:this.now()}; this.audit('resume-login'); return safeUser(u);
    }
    const setup=!this.store.config().setupComplete;
    const bootstrap=setup && ['activate','setup-company','create-user'].includes(action);
    if(bootstrap) {
      if(action==='create-user' && (this.store.all('user').length || p.role!=='owner' || !this.store.config().companyName)) throw Error('Create the first owner after factory setup.');
      if(action==='setup-company') { if(!validPin(p.pin) || p.pin!==p.pinConfirm) throw Error('PIN must be exactly 6 matching digits.'); }
    } else this.authorize(action,p);
    if(action==='logout') {if(p.forgetUser){const c={...this.store.config(),rememberedUserId:''};this.store.db.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify(c),c.id);}this.audit('logout'); this.session=null; if(!p.forgetUser)this.pinUnlocked=false; return true;}
    if(action==='snapshot') return this.snapshot();
    if(action==='access') return {users:this.store.all('user').map(safeUser), audit:db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 200').all(),roles:Object.keys(roles)};
    if(action==='export-csv') return this.store.exportCsv(String(p.kind || ''));
    db.exec('BEGIN IMMEDIATE');
    try {
      let result;
      if(action==='link-worker') {
        const u=this.store.get('user',p.id);
        if(roleOf(u.role)!=='worker') throw Error('Only worker accounts can link to a labour profile.');
        const workerId=p.workerId || null;
        if(workerId) {
          this.store.get('worker',workerId);
          if(this.store.all('user').some(x=>x.id!==u.id && x.workerId===workerId)) throw Error('This labour profile is already linked to another account.');
        }
        u.workerId=workerId;this.save(u);result=safeUser(u);
      } else if(['change-password','reset-password','set-user-active'].includes(action)) {
        const u=this.store.get('user',action==='change-password'?this.session.id:p.id);
        if(action==='change-password' && !verifyPassword(p.currentPassword,u.passwordHash)) throw Error('Current password is incorrect.');
        if(action==='set-user-active') {
          if(u.id===this.session.id) throw Error('You cannot disable your own account.');
          if(typeof p.active!=='boolean') throw Error('Choose active or disabled.');
          if(roleOf(u.role)==='owner' && !p.active && this.store.all('user').filter(x=>x.active && roleOf(x.role)==='owner').length<=1) throw Error('Keep at least one active owner.');
          u.active=p.active;
        } else {u.passwordHash=passwordHash(p.password); db.prepare('DELETE FROM login_attempts WHERE username=?').run(u.username);}
        this.save(u); result=safeUser(u);
      } else {
        if(action==='create-user' && !roles[p.role]) throw Error('Choose a valid role.');
        const payload={...p};
        if(action==='setup-company') { payload.pinHash=passwordHash('pin:'+p.pin); delete payload.pin; delete payload.pinConfirm; this.pinUnlocked=true; }
        delete payload.pin;
        result=this.store.execute(action,payload);
        if(action==='create-user') {result.passwordHash=passwordHash(p.password); this.save(result); result=safeUser(result);}
      }
      this.audit(action,p.id || result?.id || ''); db.exec('COMMIT');
      if(action==='change-password' || (action==='reset-password' && p.id===this.session?.id)) this.session=null;
      if(result && typeof result==='object') { result={...result}; delete result.pinHash; }
      return result;
    } catch(e) {db.exec('ROLLBACK'); throw e;}
  }
  save(u) {this.store.db.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify(u),u.id);}
  snapshot() {
    const u=this.current(), s=this.store.snapshot();
    delete s.user; delete s.settings; s.users=[];
    delete s.config.pinHash;
    if(this.licence)s.licence=this.licence.status();
    s.currentUser=u; s.permissions=roles[u.role] || [];
    // Build a strict personal-data view before clearing the factory snapshot.
    if(u.role==='worker') {
      const w=u.workerId ? s.worker.find(x=>x.id===u.workerId) : null;
      s.myWork=w ? {
        name:w.name,
        balance:s.balances[w.id],
        assignments:s.assignment.filter(a=>a.workerId===w.id).map(a=>({
          id:a.id,date:a.date,quantity:a.quantity,unit:a.unit,rate:a.rate,basis:a.basis,
          po:s.po.find(p=>p.id===a.poId)?.number || '',
          article:s.po.find(p=>p.id===a.poId)?.article || '',
          department:s.department.find(d=>d.id===a.departmentId)?.name || '',
          accepted:s.events.filter(e=>e.kind==='receipt' && e.target===a.id).reduce((n,e)=>n+e.data.accepted,0),
        })),
        entries:s.events.filter(e=>e.target===w.id && ['earning','advance','attendance','salary','settlement'].includes(e.kind)).map(e=>({id:e.id,date:e.date,kind:e.kind,amount:e.data.amount,recovery:e.data.recovery || 0})),
      } : null;
      // Notes, other workers, cost sheets and factory balances never leave the backend.
      s.config={companyName:s.config.companyName,companyLogo:s.config.companyLogo,theme:'light',language:'en'};
      for(const key of ['material','cost','po','poCosts','worker','assignment','department','events','warehouse','bin','lot','stock-count','supplier','purchase']) s[key]=[];
      s.balances={};s.stocks={};s.poStats={};
    }
    if(!['owner','accountant'].includes(u.role)) {
      s.balances={}; s.events=s.events.filter(e=>!['advance','earning','salary','attendance','settlement'].includes(e.kind));
      s.worker=s.worker.map(({id,name,basis,rate,active})=>({id,name,basis,rate,active}));
    }
    if(!['owner','manager','storekeeper','accountant'].includes(u.role)) {
      s.supplier=[]; s.purchase=[]; s.supplierBalances={};
      s.events=s.events.filter(e=>e.kind!=='supplier-payment' && e.kind!=='purchase-return' && !e.data?.purchaseId);
    }
    return s;
  }
}
module.exports={Security,roles,passwordHash,verifyPassword};
