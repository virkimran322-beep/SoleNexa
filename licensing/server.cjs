const http=require('node:http');
const {timingSafeEqual}=require('node:crypto');
function makeServer(issuer,adminToken){
 if(typeof adminToken!=='string' || adminToken.length<32)throw Error('A strong administrator token is required.');
 const limits=new Map();
 return http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  const reply=(status,data)=>{res.writeHead(status);res.end(JSON.stringify(data));};
  try {
   if(req.url==='/health' && req.method==='GET')return reply(200,{ok:true});
   const address=req.socket.remoteAddress;const now=Date.now();let bucket=limits.get(address);
   if(!bucket || bucket.until<now){bucket={count:0,until:now+60000};limits.set(address,bucket);}
   if(limits.size>10000)for(const [k,v] of limits)if(v.until<now)limits.delete(k);
   if(++bucket.count>60)return reply(429,{error:'Too many requests. Try again later.'});
   if(req.url.startsWith('/admin/')){
    const got=Buffer.from((req.headers.authorization || '').replace(/^Bearer /,'')),expected=Buffer.from(adminToken);
    if(got.length!==expected.length || !timingSafeEqual(got,expected))return reply(401,{error:'Administrator authentication required.'});
    if(req.url==='/admin/licenses' && req.method==='GET')return reply(200,issuer.list());
   }
   if(req.method!=='POST' || !['/activate','/admin/issue','/admin/revoke'].includes(req.url))return reply(404,{error:'Not found.'});
   if(!req.headers['content-type']?.startsWith('application/json'))return reply(415,{error:'JSON required.'});
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>16000)return reply(413,{error:'Request too large.'});}
   const p=JSON.parse(body);
   if(!p || typeof p!=='object' || Array.isArray(p))throw Error('Invalid request.');
   const data=req.url==='/activate'?issuer.activate(p):req.url==='/admin/issue'?issuer.issue(p):issuer.revoke(p);
   reply(200,data);
  }catch(e){reply(400,{error:e.message});}
 }).on('clientError',(_e,socket)=>socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'));
}
if(require.main===module){
 const fs=require('node:fs'),path=require('node:path');const {Issuer}=require('./issuer.cjs');
 const root=path.resolve(__dirname,'../.licensing-private');
 const issuer=new Issuer({file:path.join(root,'issuer.sqlite'),privateKey:fs.readFileSync(path.join(root,'private.pem'),'utf8')});
 const server=makeServer(issuer,fs.readFileSync(path.join(root,'admin-token'),'utf8').trim());
 server.requestTimeout=15000;server.headersTimeout=10000;
 server.listen(Number(process.env.LICENSE_PORT || 4180),'127.0.0.1',()=>console.log('IQ Links activation service listening on loopback. Use an HTTPS reverse proxy for deployment.'));
}
module.exports={makeServer};
