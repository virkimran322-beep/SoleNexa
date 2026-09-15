const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),path=require('path');
const {Store}=require('../desktop/store.cjs');const {Security}=require('../desktop/security.cjs');
const {LicenceManager}=require('../desktop/licence.cjs');
const {signedToken}=require('../licensing/issuer.cjs');
const {generateKeyPairSync,randomUUID}=require('node:crypto');
const testKeys=generateKeyPairSync('ed25519'),device='a'.repeat(64),time=Date.now();
const testLicence=signedToken({version:1,product:'SoleNexa',licenseId:'ui-test',customer:'UI Test Factory',deviceId:device,issuedAt:time,expiresAt:time+86400000,offlineUntil:time+86400000},testKeys.privateKey);
const licenceFile=path.resolve(__dirname,'../artifacts/ui-licence-'+randomUUID()+'.json');
app.whenReady().then(async()=>{
const store=new Store(':memory:'),sec=new Security(store,Date.now,new LicenceManager({publicKey:testKeys.publicKey,file:licenceFile,deviceId:device}));const errors=[];store.add('worker',{name:'Test Labour Profile',basis:'piece',rate:200});
const win=new BrowserWindow({show:false,width:1400,height:960,webPreferences:{preload:path.resolve(__dirname,'../desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
ipcMain.handle('sole:call',(_e,a,p)=>{try{return{ok:true,data:a==='info'?(sec.authorize(a),{dbPath:'Test only'}):sec.run(a,p)}}catch(e){return{ok:false,error:e.message}}});
win.webContents.on('console-message',(_e,...args)=>{console.log('RENDER',...args);if(args.some(x=>typeof x==='string' && /Uncaught/.test(x)))errors.push(args.join(' '));});
try{
 await win.loadFile(path.resolve(__dirname,'../src/index.html'));
 const result=await win.webContents.executeJavaScript(`(async()=>{
 const delay=()=>new Promise(r=>setTimeout(r,120));
 async function wait(fn){for(let i=0;i<40;i++){if(fn())return;await delay();}throw Error('UI wait timed out: '+document.querySelector('h1')?.textContent+' '+document.querySelector('.error')?.textContent);}
 async function submit(values){console.log('Submitting',Object.keys(values).join(','));const form=document.querySelector('dialog[open] form') || document.querySelector('#main form');for(const [k,v]of Object.entries(values))form.querySelector('[name="'+k+'"]').value=v;form.requestSubmit(form.querySelector("button[type=submit]"));await delay();}
 await wait(()=>document.querySelector('[name=key]'));
 const activationDevice=document.querySelector('[name=deviceId]')?.value;
 if(activationDevice!=='a'.repeat(64))throw Error('Activation screen must show this computer device ID');
 const activationFields=[...document.querySelectorAll('.gate-card input,.gate-card textarea')];
 if(activationFields.some(field=>!field.closest('label')))throw Error('Activation fields must have visible labels');
 if(document.querySelector('.gate-card button').getBoundingClientRect().height<44)throw Error('Activation action must be at least 44px high');
 await submit({key:'IQ-LINKS-OWNER-2026'});await wait(()=>document.querySelector('.gate-card .error')?.textContent.includes('Licence'));
 if(!document.activeElement?.classList.contains('error'))throw Error('Activation error must receive keyboard focus');
 await submit({key:${JSON.stringify(testLicence)}});await wait(()=>document.querySelector('[name=companyName]'));
 await submit({companyName:'Factory UI Trial',owner:'Test Owner'});await wait(()=>document.querySelector('[name=role]'));
 await submit({username:'owner',role:'owner',password:'Testing123'});await wait(()=>document.querySelector('h1')?.textContent==='Sign in to SoleNexa');
 await submit({username:'owner',password:'Testing123'});await wait(()=>document.querySelector('#nav a'));
 location.hash='access';await wait(()=>document.querySelector('[data-action=user-new]'));await wait(()=>document.querySelector('#access-content table'));
 document.querySelector('[data-action=user-new]').click();await submit({username:'worker1',role:'worker',password:'Testing123'});await wait(()=>!document.querySelector('#modal').open);await wait(()=>document.querySelector('#access-content')?.textContent.includes('worker1'));
 document.querySelector('[data-action=user-link]').click();
 const profile=document.querySelector('#modal [name=workerId]');
 await submit({workerId:profile.options[1].value});
 await wait(()=>!document.querySelector('#modal').open);
 const accountCreated=true;
 document.querySelector('[data-action=logout]').click();await wait(()=>document.querySelector('h1')?.textContent==='Sign in to SoleNexa');
 await submit({username:'worker1',password:'Testing123'});await wait(()=>document.querySelector('h1')?.textContent.includes('Test Labour Profile'));
 const restricted=document.querySelectorAll('#nav a').length===1;
 const denied=await window.sole.call('create-user',{username:'intruder',role:'owner',password:'Testing123'});
 document.querySelector('[data-action=logout]').click();await wait(()=>document.querySelector('h1')?.textContent==='Sign in to SoleNexa');
 await submit({username:'owner',password:'Testing123'});await wait(()=>document.querySelector('#nav a'));
 location.hash='access';await wait(()=>document.querySelector('#access-content table'));
 await new Promise(r=>setTimeout(r,2100));
 for(const page of ['dashboard','materials','costs','orders','production','workers','ledger','inventory','settings','access']) {location.hash=page;await delay();if(!document.querySelector('h1'))throw Error('Missing page '+page);}
 return {accountCreated,restricted,denied:!denied.ok,activationA11y:true,nodeExposed:typeof window.require!=='undefined',overflow:document.documentElement.scrollWidth>innerWidth};
 })()`);
 if(!result.accountCreated || !result.restricted || !result.denied || result.nodeExposed || result.overflow || errors.length)throw Error(JSON.stringify({result,errors}));
 console.log(await win.webContents.executeJavaScript("JSON.stringify({splash:document.querySelector('#splash').className,opacity:getComputedStyle(document.querySelector('#splash')).opacity})"));
 fs.mkdirSync(path.resolve(__dirname,'../artifacts'),{recursive:true});
 fs.writeFileSync(path.resolve(__dirname,'../artifacts/phase1-ui.png'),(await win.webContents.capturePage()).toPNG());
 fs.writeFileSync(path.resolve(__dirname,'../artifacts/phase1-ui.json'),JSON.stringify(result,null,2));
 win.setContentSize(800,800);
 await new Promise(r=>setTimeout(r,250));
 const narrow=await win.webContents.executeJavaScript('document.documentElement.scrollWidth<=innerWidth');
 if(!narrow)throw Error('Narrow desktop overflow');
 await win.webContents.executeJavaScript("document.body.classList.add('light')");
 fs.writeFileSync(path.resolve(__dirname,'../artifacts/phase1-light.png'),(await win.webContents.capturePage()).toPNG());
 console.log('PHASE 1 UI PASS',JSON.stringify({...result,narrow}));store.close();if(fs.existsSync(licenceFile))fs.unlinkSync(licenceFile);app.quit();
}catch(e){if(fs.existsSync(licenceFile))fs.unlinkSync(licenceFile);console.error(e,errors);console.error(await win.webContents.executeJavaScript('document.body.innerText'));app.exit(1);}
});
