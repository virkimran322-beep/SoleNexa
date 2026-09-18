const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),path=require('path');
const {Store}=require('../desktop/store.cjs');const {Security}=require('../desktop/security.cjs');
const {LicenceManager}=require('../desktop/licence.cjs');
const {randomUUID}=require('node:crypto');
const time=Date.now();
const licenceFile=path.resolve(__dirname,'../artifacts/ui-licence-'+randomUUID()+'.json');
app.whenReady().then(async()=>{
const store=new Store(':memory:'),sec=new Security(store,Date.now,new LicenceManager({file:licenceFile,now:()=>time}));const errors=[];const uiDate=new Date().toISOString().slice(0,10);const uiMaterial=store.add('material',{name:'Test Leather',unit:'yard',rate:10000,reorder:5});const uiWorker=store.add('worker',{name:'Test Labour Profile',basis:'piece',rate:200});const uiDepartment=store.all('department')[0];const uiCost=store.add('cost',{name:'UI Article',sku:'UI-01',lines:[{materialId:uiMaterial.id,name:uiMaterial.name,unit:uiMaterial.unit,rate:uiMaterial.rate,quantity:1,wastage:0,amount:uiMaterial.rate}],labour:0,overhead:0,total:uiMaterial.rate,date:uiDate});const uiPo=store.add('po',{number:'PO-UI',costId:uiCost.id,article:uiCost.name,sku:uiCost.sku,costSnapshot:uiCost,quantity:10,departments:[uiDepartment.id],departmentNames:{[uiDepartment.id]:uiDepartment.name},date:uiDate,due:uiDate,notes:''});const uiAssignment=store.add('assignment',{poId:uiPo.id,departmentId:uiDepartment.id,workerId:uiWorker.id,quantity:2,unit:'pair',factor:1,rate:200,basis:'piece',date:uiDate});const uiReceipt=store.event('receipt',uiAssignment.id,uiDate,{accepted:1,rejected:0,note:'UI correction test'});store.event('earning',uiWorker.id,uiDate,{amount:200,assignmentId:uiAssignment.id,receiptId:uiReceipt.id,note:'UI correction test'});
const win=new BrowserWindow({show:false,width:1400,height:960,webPreferences:{preload:path.resolve(__dirname,'../desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
ipcMain.handle('sole:call',(_e,a,p)=>{try{return{ok:true,data:a==='info'?(sec.authorize(a),{dbPath:'Test only'}):sec.run(a,p)}}catch(e){return{ok:false,error:e.message}}});
win.webContents.on('console-message',(_e,...args)=>{console.log('RENDER',...args);if(args.some(x=>typeof x==='string' && /Uncaught/.test(x)))errors.push(args.join(' '));});
try{
 await win.loadFile(path.resolve(__dirname,'../src/index.html'));
 const result=await win.webContents.executeJavaScript(`(async()=>{
 const delay=()=>new Promise(r=>setTimeout(r,120));
 async function wait(fn){for(let i=0;i<40;i++){if(fn())return;await delay();}throw Error('UI wait timed out: '+document.querySelector('h1')?.textContent+' '+document.querySelector('.error')?.textContent);}
 async function submit(values){console.log('Submitting',Object.keys(values).join(','));const form=document.querySelector('dialog[open] form') || document.querySelector('#main form');for(const [k,v]of Object.entries(values))form.querySelector('[name="'+k+'"]').value=v;form.requestSubmit(form.querySelector("button[type=submit]"));for(let i=0;i<40 && !document.querySelector('.pin-prompt');i++)await delay();const pinForm=document.querySelector('.pin-prompt');if(pinForm){pinForm.querySelector('[name=pin]').value='123456';pinForm.requestSubmit(pinForm.querySelector("button[type=submit]"));await delay();}}
 await wait(()=>document.querySelector('[name=key]'));
 const activationFields=[...document.querySelectorAll('.gate-card input,.gate-card textarea')];
 if(activationFields.some(field=>!field.closest('label')))throw Error('Activation fields must have visible labels');
 if(document.querySelector('.gate-card button').getBoundingClientRect().height<44)throw Error('Activation action must be at least 44px high');
 if(document.querySelector('[name=deviceId]'))throw Error('Device ID must not be shown on activation screen');
 if(document.querySelector('.gate-card')?.textContent.includes('Contact IQ Links'))throw Error('Legacy renewal message must not be shown');
 await submit({key:'IQ-LINKS-OWNER-2026',validityDays:'365'});await wait(()=>document.querySelector('[name=companyName]'));
 await submit({companyName:'Factory UI Trial',owner:'Test Owner',pin:'123456',pinConfirm:'123456'});await wait(()=>document.querySelector('[name=role]'));
 await submit({username:'owner',role:'owner',password:'Testing123'});await delay();
 await submit({username:'owner',password:'Testing123'});await wait(()=>document.querySelector('#nav a'));
 if(document.querySelector('#workspace-name')?.textContent!=='Factory UI Trial')throw Error('Company name is not shown in workspace card');
 if(document.querySelector('#workspace-profile')?.textContent.includes('Production & accounts'))throw Error('Legacy workspace subtitle is still shown');
 document.querySelector('#workspace-profile').click();await wait(()=>document.querySelector('h1')?.textContent.includes('Company profile'));if(!document.querySelector('[data-action=company-profile]'))throw Error('Company profile page edit action missing');document.querySelector('[data-action=company-profile]').click();await wait(()=>document.querySelector('#modal [name=companyLogoFile]'));if(!document.querySelector('#modal [name=removeLogo]'))throw Error('Company logo controls missing');document.querySelector('#modal [data-action=close]').click();
 location.hash='dashboard';await wait(()=>document.querySelector('[name=reportDepartment]'));if(!document.querySelector('[name=reportWorker]')||!document.querySelector('[name=reportPo]')||!document.querySelector('[name=reportFrom]')||!document.querySelector('[name=reportTo]'))throw Error('Report filters missing');
location.hash='settings';await wait(()=>document.querySelector('[data-action=company-profile]'));await wait(()=>document.querySelector('#backup-health'));if(!document.querySelector('#backup-health')?.textContent.includes('Backup health'))throw Error('Backup health status missing');document.querySelector('[data-action=company-profile]').click();await wait(()=>document.querySelector('#modal [name=companyName]'));if(document.querySelector('#modal [name=companyName]').value!=='Factory UI Trial')throw Error('Factory profile did not prefill');await submit({companyName:'Factory UI Updated',owner:'Updated Owner',contact:'0312-9876543',address:'Updated factory address'});await wait(()=>!document.querySelector('#modal').open);await wait(()=>document.querySelector('#main')?.textContent.includes('Factory UI Updated'));location.hash='settings';await wait(()=>document.querySelector('[data-action=csv-materials]'));if(document.querySelectorAll('[data-action^=csv-]').length!==5)throw Error('CSV export controls missing');
location.hash='materials';await wait(()=>document.querySelector('[data-action=material-revise]'));

 document.querySelector('[data-action=material-revise]').click();await wait(()=>document.querySelector('#modal [name=active]'));if(!document.querySelector('#modal [name=active]').checked)throw Error('Active status control missing or unchecked for active material');await submit({name:'Premium Leather',unit:'yard',rate:'150',reorder:'8',reason:'Supplier rate changed'});await wait(()=>!document.querySelector('#modal').open);await wait(()=>document.querySelector('#main')?.textContent.includes('Premium Leather'));
 document.querySelector('[data-action=material-history]').click();await wait(()=>document.querySelector('#modal[open]')?.textContent.includes('Supplier rate changed'));document.querySelector('#modal [data-action=close]').click();
 location.hash='production';await wait(()=>document.querySelector('[data-action=correct-event]'));
 document.querySelector('[data-action=correct-event]').click();await wait(()=>document.querySelector('#modal[open] textarea[name=reason]'));
 const correctionReason=document.querySelector('#modal textarea[name=reason]');if(!correctionReason.required)throw Error('Correction reason must be required');await submit({reason:'UI test correction approved'});await wait(()=>!document.querySelector('#modal').open);await wait(()=>document.querySelector('#main')?.textContent.includes('Corrected'));
 const assignmentId=document.querySelector('[data-action=receipt]').dataset.id;
 document.querySelector('#main').focus();
 for(const key of 'SNX1|'+assignmentId)document.querySelector('#main').dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));
 document.querySelector('#main').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
 await wait(()=>document.querySelector('.pin-prompt'));
 const scanPin=document.querySelector('.pin-prompt');scanPin.querySelector('[name=pin]').value='123456';scanPin.requestSubmit(scanPin.querySelector('button[type=submit]'));
 await wait(()=>document.querySelector('#modal[open]')?.textContent.includes('WORK COMPLETION RECEIPT'));
 if(document.querySelectorAll('#modal tbody tr').length!==5)throw Error('Completion receipt rows missing');
 document.querySelector('#modal [data-action=close]').click();
location.hash='dashboard';await wait(()=>document.querySelector('[data-action=stock]'));document.querySelector('[data-action=stock]').click();await wait(()=>document.querySelector('#modal [name=quantity]'));await submit({materialId:'${uiMaterial.id}',binId:'${store.defaultBin().id}',type:'receive',quantity:'10',lotCode:'UI-LOT-1',note:'UI stock receive'});await wait(()=>!document.querySelector('#modal').open);location.hash='inventory';await wait(()=>document.querySelector('[data-action=reservation]'));document.querySelector('[data-action=reservation]').click();await wait(()=>document.querySelector('#modal [name=quantity]'));await submit({materialId:'${uiMaterial.id}',binId:'${store.defaultBin().id}',lotCode:'UI-LOT-1',quantity:'6',note:'UI reservation'});await wait(()=>document.querySelector('[data-action=reservation-release]'));document.querySelector('[data-action=reservation-release]').click();await wait(()=>document.querySelector('#modal [name=quantity]'));await submit({quantity:'2',note:'UI partial release'});await wait(()=>document.querySelector('#main')?.textContent.includes('4'));location.hash='inventory';await wait(()=>document.querySelector('[data-action=stock-count]'));document.querySelector('[data-action=stock-count]').click();await wait(()=>document.querySelector('#modal [name=counted]'));await submit({counted:'0',note:'UI stock count'});await wait(()=>document.querySelector('[data-action=stock-count-submit]'));document.querySelector('[data-action=stock-count-submit]').click();await delay();if(document.querySelector('.pin-prompt')){document.querySelector('.pin-prompt [name=pin]').value='123456';document.querySelector('.pin-prompt').requestSubmit();}await wait(()=>document.querySelector('#main')?.textContent.includes('submitted'));if(!document.querySelector('[data-action=stock-count-approve]'))throw Error('Stock count approval action missing');document.querySelector('[data-action=stock-count-approve]').click();await delay();if(document.querySelector('.pin-prompt')){document.querySelector('.pin-prompt [name=pin]').value='123456';document.querySelector('.pin-prompt').requestSubmit();}await wait(()=>document.querySelector('#main')?.textContent.includes('approved'));location.hash='access';await wait(()=>document.querySelector('[data-action=user-new]'));await wait(()=>document.querySelector('#access-content table'));
 document.querySelector('[data-action=user-new]').click();await submit({username:'worker1',role:'worker',password:'Testing123'});await wait(()=>!document.querySelector('#modal').open);await wait(()=>document.querySelector('#access-content')?.textContent.includes('worker1'));
 document.querySelector('[data-action=user-link]').click();
 const profile=document.querySelector('#modal [name=workerId]');
 await submit({workerId:profile.options[1].value});
 await wait(()=>!document.querySelector('#modal').open);
 const accountCreated=true;
 document.querySelector('[data-action=logout]').click();await wait(()=>document.querySelector('h1')?.textContent.includes('Sign in to SoleNexa'));
 await submit({username:'worker1',password:'Testing123'});await wait(()=>document.querySelector('h1')?.textContent.includes('Test Labour Profile'));
 const restricted=document.querySelectorAll('#nav a').length===1;
 const denied=await window.sole.call('create-user',{username:'intruder',role:'owner',password:'Testing123'});
 document.querySelector('[data-action=logout]').click();await wait(()=>document.querySelector('h1')?.textContent.includes('Sign in to SoleNexa'));
 await submit({username:'owner',password:'Testing123'});await wait(()=>document.querySelector('#nav a'));
 location.hash='suppliers';await wait(()=>document.querySelector('[data-action=supplier]'));document.querySelector('[data-action=supplier]').click();await submit({name:'WhatsApp Supplier',phone:'03001234567'});await wait(()=>document.querySelector('[data-action=supplier-whatsapp]'));const supplierWhatsApp=true;
 location.hash='access';await wait(()=>document.querySelector('#access-content table'));
 await new Promise(r=>setTimeout(r,2100));
 for(const page of ['dashboard','materials','costs','orders','production','workers','ledger','inventory','settings','access']) {location.hash=page;await delay();if(!document.querySelector('h1'))throw Error('Missing page '+page);}
 location.hash='settings';await wait(()=>document.querySelector('[data-action=delete-all-data]'));document.querySelector('[data-action=delete-all-data]').click();await wait(()=>document.querySelector('#modal [name=confirmation]'));await submit({confirmation:'DELETE ALL FACTORY DATA'});await wait(()=>document.querySelector('[name=companyName]'));const deleted=true;
 return {accountCreated,restricted,denied:!denied.ok,deleted,supplierWhatsApp,activationA11y:true,nodeExposed:typeof window.require!=='undefined',overflow:document.documentElement.scrollWidth>innerWidth};
 })()`);
 if(!result.accountCreated || !result.restricted || !result.denied || !result.deleted || !result.supplierWhatsApp || result.nodeExposed || result.overflow || errors.length)throw Error(JSON.stringify({result,errors}));
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
