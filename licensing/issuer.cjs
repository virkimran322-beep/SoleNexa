const {DatabaseSync}=require('node:sqlite');
const {randomBytes,randomUUID,createHash,sign}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const hash=s=>createHash('sha256').update(s).digest('hex');
function signedToken(claims,key){const body=Buffer.from(JSON.stringify(claims));return body.toString('base64url')+'.'+sign(null,body,key).toString('base64url');}
class Issuer {
 constructor({file,privateKey,now=Date.now}){
  if(file!==':memory:')fs.mkdirSync(path.dirname(file),{recursive:true});
  this.db=new DatabaseSync(file);this.key=privateKey;this.now=now;
  this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS licenses(id TEXT PRIMARY KEY,customer TEXT NOT NULL,code_hash TEXT UNIQUE NOT NULL,expires INTEGER NOT NULL,seats INTEGER NOT NULL,offline_days INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS devices(license_id TEXT NOT NULL,device_id TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,last_issued INTEGER NOT NULL,PRIMARY KEY(license_id,device_id));
   CREATE TABLE IF NOT EXISTS issuer_audit(id INTEGER PRIMARY KEY,at INTEGER NOT NULL,action TEXT NOT NULL,license_id TEXT NOT NULL,device_id TEXT NOT NULL);`);
 }
 audit(action,id,device=''){this.db.prepare('INSERT INTO issuer_audit(at,action,license_id,device_id) VALUES(?,?,?,?)').run(this.now(),action,id,device);}
 issue({customer,expiresAt,seats,offlineDays}){
  if(typeof customer!=='string' || !customer.trim() || customer.length>200)throw Error('Customer name required (maximum 200 characters).');
  if(!Number.isSafeInteger(expiresAt) || expiresAt<=this.now())throw Error('Choose a future expiry date.');
  if(!Number.isInteger(seats) || seats<1 || seats>1000)throw Error('Device limit must be 1–1000.');
  if(!Number.isInteger(offlineDays) || offlineDays<1 || offlineDays>3660)throw Error('Offline allowance must be 1–3660 days.');
  const id=randomUUID(),code=randomBytes(24).toString('base64url');
  this.db.prepare('INSERT INTO licenses VALUES(?,?,?,?,?,?,0)').run(id,customer.trim(),hash(code),expiresAt,seats,offlineDays);this.audit('issue',id);
  return {licenseId:id,activationCode:code};
 }
 activate({code,deviceId}){
  if(typeof code!=='string' || code.length>200 || typeof deviceId!=='string' || !/^[a-f0-9]{64}$/.test(deviceId))throw Error('Invalid activation request.');
  this.db.exec('BEGIN IMMEDIATE');
  try {
   const l=this.db.prepare('SELECT * FROM licenses WHERE code_hash=?').get(hash(code));
   if(!l || l.revoked || l.expires<=this.now())throw Error('Activation code invalid, expired or revoked.');
   const previous=this.db.prepare('SELECT * FROM devices WHERE license_id=? AND device_id=?').get(l.id,deviceId);
   if(previous && !previous.active)throw Error('This device registration was revoked. Contact IQ Links.');
   const count=this.db.prepare('SELECT count(*) AS n FROM devices WHERE license_id=? AND active=1').get(l.id).n;
   if(!previous && count>=l.seats)throw Error('Device limit reached. Contact IQ Links for a transfer.');
   const now=this.now();
   const token=signedToken({version:1,product:'SoleNexa',licenseId:l.id,customer:l.customer,deviceId,issuedAt:now,expiresAt:l.expires,offlineUntil:Math.min(l.expires,now+l.offline_days*86400000)},this.key);
   this.db.prepare('INSERT INTO devices VALUES(?,?,1,?) ON CONFLICT(license_id,device_id) DO UPDATE SET last_issued=excluded.last_issued').run(l.id,deviceId,now);
   this.audit('activate',l.id,deviceId);this.db.exec('COMMIT');return {token};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 revoke({licenseId,deviceId}){
  if(!this.db.prepare('SELECT id FROM licenses WHERE id=?').get(licenseId))throw Error('Licence not found.');
  if(deviceId){const r=this.db.prepare('UPDATE devices SET active=0 WHERE license_id=? AND device_id=?').run(licenseId,deviceId);if(!r.changes)throw Error('Device not found.');}
  else this.db.prepare('UPDATE licenses SET revoked=1 WHERE id=?').run(licenseId);
  this.audit(deviceId?'revoke-device':'revoke-license',licenseId,deviceId || '');return {ok:true};
 }
 list(){return this.db.prepare('SELECT id,customer,expires,seats,offline_days,revoked FROM licenses').all().map(l=>({...l,devices:this.db.prepare('SELECT device_id,active,last_issued FROM devices WHERE license_id=?').all(l.id)}));}
 close(){this.db.close();}
}
module.exports={Issuer,signedToken};
