const {verify,createHash}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
function machineId(){
 let identity;
 if(process.platform==='win32') {
   const output=execFileSync('reg.exe',['query','HKLM\\SOFTWARE\\Microsoft\\Cryptography','/v','MachineGuid','/reg:64'],{encoding:'utf8',windowsHide:true,timeout:10000});
   identity=/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i.exec(output)?.[1]?.trim();
   if(!identity)throw Error('Windows device identity could not be read. Contact IQ Links.');
 }else identity=process.platform+':'+os.hostname();
 return createHash('sha256').update('SoleNexa/device/v1:'+identity).digest('hex');
}
function verifyLicence(token,publicKey,deviceId,now=Date.now()){
 if(typeof token!=='string' || token.length>16000)throw Error('Enter a valid IQ Links licence.');
 const parts=token.trim().split('.');
 if(parts.length!==2 || parts.some(x=>!x || !/^[A-Za-z0-9_-]+$/.test(x)))throw Error('Licence format is invalid.');
 const body=Buffer.from(parts[0],'base64url'),signature=Buffer.from(parts[1],'base64url');
 if(signature.length!==64 || !verify(null,body,publicKey,signature))throw Error('Licence signature is invalid.');
 const c=JSON.parse(body.toString('utf8'));
 if(c.version!==1 || c.product!=='SoleNexa' || typeof c.licenseId!=='string' || typeof c.customer!=='string')throw Error('Licence does not belong to SoleNexa.');
 if(c.deviceId!==deviceId)throw Error('Licence belongs to a different device.');
 for(const key of ['issuedAt','expiresAt','offlineUntil'])if(!Number.isSafeInteger(c[key]) || c[key]<=0)throw Error('Licence dates are invalid.');
 if(c.offlineUntil>c.expiresAt || c.issuedAt>=c.offlineUntil)throw Error('Licence dates are invalid.');
 if(c.issuedAt>now+300000)throw Error('Check this computer’s date and time.');
 if(now>=c.expiresAt)throw Error('Licence expired. Contact IQ Links for renewal.');
 if(now>=c.offlineUntil)throw Error('Licence refresh required. Contact IQ Links or activate online.');
 return c;
}
class LicenceManager {
 constructor({publicKey,file,deviceId=machineId(),now=Date.now}){this.publicKey=publicKey;this.file=file;this.deviceId=deviceId;this.now=now;}
 read(){try{return JSON.parse(fs.readFileSync(this.file,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw Error('Licence file could not be read. Import your licence again.');}}
 write(data){fs.mkdirSync(path.dirname(this.file),{recursive:true});const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data),{mode:0o600});fs.renameSync(tmp,this.file);}
 status(){
  try {
   const data=this.read();if(!data.token)return {active:false,deviceId:this.deviceId,reason:'Activation required.'};
   const c=verifyLicence(data.token,this.publicKey,this.deviceId,this.now());
   if(data.lastSeen>this.now()+300000)throw Error('Clock moved backwards. Correct the computer date and time.');
   if(!data.lastSeen || this.now()-data.lastSeen>60000)this.write({...data,lastSeen:this.now()});
   return {active:true,deviceId:this.deviceId,customer:c.customer,licenseId:c.licenseId,expiresAt:c.expiresAt,offlineUntil:c.offlineUntil};
  }catch(e){return {active:false,deviceId:this.deviceId,reason:e.message};}
 }
 ensure(){const s=this.status();if(!s.active)throw Error('Licence required: '+s.reason);return s;}
 activate(token){
  verifyLicence(token,this.publicKey,this.deviceId,this.now());
  let previous={};try{previous=this.read();}catch{}
  if(previous.lastSeen>this.now()+300000)throw Error('Correct the computer date and time before activating.');
  this.write({token:token.trim(),lastSeen:this.now()});return this.ensure();
 }
}
module.exports={LicenceManager,verifyLicence,machineId};
