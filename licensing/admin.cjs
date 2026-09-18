const fs=require('fs'),path=require('path');
const {generateKeyPairSync,randomBytes}=require('node:crypto');
const {Issuer}=require('./issuer.cjs');
const root=path.resolve(__dirname,'../.licensing-private');
const command=process.argv[2];
if(command==='init'){
 fs.mkdirSync(root,{recursive:true});
 const privateFile=path.join(root,'private.pem'),publicFile=path.resolve(__dirname,'../desktop/licence-public.pem');
 if(fs.existsSync(privateFile) || fs.existsSync(publicFile))throw Error('Signing keys already exist. Back them up; do not replace a deployed public key.');
 const keys=generateKeyPairSync('ed25519');
 fs.writeFileSync(privateFile,keys.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600,flag:'wx'});
 fs.writeFileSync(publicFile,keys.publicKey.export({type:'spki',format:'pem'}),{flag:'wx'});
 fs.writeFileSync(path.join(root,'admin-token'),randomBytes(32).toString('base64url'),{mode:0o600,flag:'wx'});
 console.log('Signing key and admin credential saved under .licensing-private. Public key saved under desktop. Back up the private directory securely.');
}else if(command==='grant'){
 const request=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
 const issuer=new Issuer({file:path.join(root,'issuer.sqlite'),privateKey:fs.readFileSync(path.join(root,'private.pem'),'utf8')});
 try{
  const params={...request};
  if(request.expiresAt !== undefined) params.expiresAt=Date.parse(request.expiresAt);
  const issued=issuer.issue(params);
  const {token}=issuer.activate({code:issued.activationCode,deviceId:request.deviceId});
  const out=path.join(root,'issued');fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,issued.licenseId+'.json'),JSON.stringify(issued,null,2),{mode:0o600});
  const file=path.join(out,issued.licenseId+'.license');fs.writeFileSync(file,token,{mode:0o600});
  console.log('Licence file: '+file);
 }finally{issuer.close();}
}else console.log('Usage: node licensing/admin.cjs init | grant request.json');
