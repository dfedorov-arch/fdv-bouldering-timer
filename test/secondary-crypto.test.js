"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),http=require('node:http');
const {createSecureTransport,hkdf}=require('../lib/secondary-crypto');
const {requestJson}=require('../lib/secondary-server');
const {fixture}=require('./helpers/controlled-clock-server');
const {authenticatedFetch,credentials}=require('./helpers/browser-session');

async function until(fn){const deadline=Date.now()+7000;while(Date.now()<deadline){if(await fn())return;await new Promise(r=>setTimeout(r,30));}assert.fail('Encrypted peer state did not converge');}
async function configure(a,address){return authenticatedFetch(a.baseUrl+'/api/sec/configure',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({clientId:'clock-test',address})});}
async function relay(t,target,mutate){
  const records=[];
  const server=http.createServer((req,res)=>{
    let request='';req.on('data',b=>{request+=b;});req.on('end',()=>{
      const record={path:req.url,headers:req.headers,request};records.push(record);
      let body=request;
      if(mutate)body=mutate('request',record,body);
      const headers={...req.headers};if(body)headers['content-length']=Buffer.byteLength(body);
      const upstream=http.request(new URL(req.url,target),{method:req.method,headers},reply=>{
        let response='';reply.on('data',b=>{response+=b;});reply.on('end',()=>{
          record.status=reply.statusCode;record.response=response;
          const transformed=mutate?mutate('response',record,response):response;
          const finish=()=>{res.writeHead(reply.statusCode,{'content-type':'application/json'});res.end(transformed);};
          if(record.delayMs)setTimeout(finish,record.delayMs);else finish();
        });reply.on('error',()=>res.destroy());
      });upstream.on('error',()=>res.destroy());req.on('error',()=>upstream.destroy());upstream.end(body||undefined);
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  return {url:'http://127.0.0.1:'+server.address().port,records};
}
function memoryPeers(options={}){
  let root='',lastPacket,lastResponse,lastClient;
  const incoming=createSecureTransport({instanceId:'server',key:()=>root,canPair:()=>!root,request:()=>{throw Error('unexpected');}});
  const outgoing=createSecureTransport({instanceId:'client',key:()=>root,canPair:()=>false,request:async(address,path,body)=>{
    if(path==='/api/sec/handshake')return {status:200,body:incoming.handshake({headers:{}},body)};
    lastPacket=JSON.parse(JSON.stringify(body));
    const context=incoming.open(path!=="/api/sec/pair"&&options.path?options.path:path,body);if(path==='/api/sec/pair')root=context.key;
    lastClient=context.body;
    lastResponse=context.reply(200,{echo:context.body});
    return {status:path!=="/api/sec/pair"&&options.status?options.status:200,body:lastResponse};
  }});
  return {incoming,outgoing,root:()=>root,packet:()=>lastPacket,response:()=>lastResponse,client:()=>lastClient};
}

test('Node12-compatible HKDF matches RFC5869 case 1 and the modern native implementation',()=>{
  const ikm=Buffer.alloc(22,0x0b),salt=Buffer.from('000102030405060708090a0b0c','hex'),info=Buffer.from('f0f1f2f3f4f5f6f7f8f9','hex');
  assert.equal(hkdf(ikm,salt,info,42).toString('hex'),'3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865');
  assert.deepEqual(hkdf(ikm,salt,info,72),Buffer.from(crypto.hkdfSync('sha256',ikm,salt,info,72)));
});

test('AEAD binds path, status, channel and counter; requests cannot be replayed',async()=>{
  const p=memoryPeers();
  await p.outgoing.pair('memory',{pair:'secret'});
  const result=await p.outgoing.request('memory','/api/sec/ping',{secret:'private-state'},p.root());
  assert.equal(result.body.echo.secret,'private-state');
  const packet=p.packet();
  assert.ok(!JSON.stringify(packet).includes('private-state'));
  assert.throws(()=>p.incoming.open('/api/sec/ping',packet),/encrypted/);
  for(const change of [v=>{v.counter++;},v=>{v.tag=Buffer.alloc(16).toString('base64');},v=>{v.ciphertext='AAAA';}]){
    const altered=JSON.parse(JSON.stringify(packet));change(altered);
    assert.throws(()=>p.incoming.open('/api/sec/ping',altered));
  }
  const root=p.root();
  const wrongResponder=createSecureTransport({instanceId:'evil',key:()=>root,canPair:()=>false,request:()=>{}});
  assert.throws(()=>wrongResponder.open('/api/sec/ping',packet));
  for(const options of [{path:"/api/sec/promote"},{status:201}]){
    const bound=memoryPeers(options);await bound.outgoing.pair("memory",{});
    await assert.rejects(bound.outgoing.request("memory","/api/sec/ping",{},bound.root()));
  }
  // A plaintext 200 or another request's encrypted response is never accepted.
  for(const response of [{status:200,body:{ok:true}},{status:201,body:p.response()}]){
    const honest=p.incoming;
    const fake=createSecureTransport({instanceId:'client2',key:()=>root,canPair:()=>false,request:async(a,path,b)=>path==='/api/sec/handshake'?{status:200,body:honest.handshake({headers:{}},b)}:response});
    await assert.rejects(fake.request('memory','/api/sec/ping',{},root));
  }
});

test('wire capture contains no pairing secret, private state, PIN or forwarded browser credential; restart rejects old channels', {timeout:20000},async t=>{
  const a=await fixture(t,null),b=await fixture(t,null);
  const proxy=await relay(t,b.baseUrl);
  await a.action({type:'primary',primaryClientId:'clock-test'});
  await a.action({type:'primaryPin',pin:'7319'});
  await a.action({type:'startLists',startLists:[{headers:['#','Name'],rows:[['1','ENCRYPTED-PRIVATE-PARTICIPANT-448']],routeCount:4}]});
  const paired=await configure(a,proxy.url);assert.equal(paired.status,200,await paired.text());
  await until(async()=>(await b.state()).startLists?.[0]?.rows[0][1]==='ENCRYPTED-PRIVATE-PARTICIPANT-448');
  const c=await credentials(b.baseUrl,'clock-test');
  const command=await authenticatedFetch(b.baseUrl+'/api/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({clientId:'clock-test',type:'language',language:'en'})});
  assert.equal(command.status,200);
  await until(async()=>(await a.state()).language==='en');
  const root=a.snapshot().secondary.pair.key;
  const wire=JSON.stringify(proxy.records);
  for(const secret of [root,c.secret,'ENCRYPTED-PRIVATE-PARTICIPANT-448','primaryPinHash','browserSessions','"pin":"7319"'])assert.ok(!wire.includes(secret),secret);
  const privatePackets=proxy.records.filter(r=>r.headers['content-type']==='application/json'&&r.path!='/api/sec/handshake');
  assert.ok(privatePackets.length>=3);
  for(const r of privatePackets){assert.equal(r.headers['x-fdv-secondary-key'],undefined);assert.equal(JSON.parse(r.request).secure,1);if(r.response)assert.equal(JSON.parse(r.response).secure,1);}
  const captured=proxy.records.filter(r=>r.path==='/api/sec/replicate'&&r.response).at(-1);
  const replay=await fetch(b.baseUrl+captured.path,{method:'POST',headers:{'content-type':'application/json'},body:captured.request});
  assert.equal(replay.status,403);
  const downgrade=await fetch(b.baseUrl+'/api/sec/ping',{method:'POST',headers:{'content-type':'application/json','x-fdv-secondary-key':root},body:'{}'});
  assert.equal(downgrade.status,409);
  await b.restart();
  const stale=await fetch(b.baseUrl+captured.path,{method:'POST',headers:{'content-type':'application/json'},body:captured.request});
  assert.equal(stale.status,409);
  await until(async()=>(await a.state()).sec.ready&&(await b.state()).sec.ready);
  await a.action({type:'language',language:'ru'});
  await until(async()=>(await b.state()).language==='ru');
  assert.equal(b.snapshot().secondary.pair.key,root);
});

test('tampered replication cannot mutate standby, and encrypted transport recovers without plaintext fallback',{timeout:20000},async t=>{
  const a=await fixture(t,null),b=await fixture(t,null);let corrupt=false,damage=0;
  const proxy=await relay(t,b.baseUrl,(phase,record,body)=>{
    if(corrupt&&phase==='request'&&record.path==='/api/sec/replicate'){
      const value=JSON.parse(body);value.ciphertext=(value.ciphertext[0]==='A'?'B':'A')+value.ciphertext.slice(1);damage++;return JSON.stringify(value);
    }return body;
  });
  await a.action({type:'primary',primaryClientId:'clock-test'});
  assert.equal((await configure(a,proxy.url)).status,200);
  const before=await b.state();corrupt=true;
  await a.action({type:'language',language:before.language==='ru'?'en':'ru'});
  await until(()=>damage>0);
  assert.equal((await b.state()).language,before.language);
  corrupt=false;
  await until(async()=>(await b.state()).language!==(before.language));
});

test('an old plaintext peer is rejected during pairing without sending any secret',async t=>{
  const a=await fixture(t,null);await a.action({type:'primary',primaryClientId:'clock-test'});await a.start();
  const before=await a.state(),requests=[];
  const old=http.createServer((req,res)=>{let body='';req.on('data',b=>body+=b);req.on('end',()=>{requests.push({path:req.url,headers:req.headers,body});res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({serverInstanceId:'old-server',build:before.config.buildNumber}));});});
  await new Promise(resolve=>old.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{old.closeAllConnections();old.close(resolve);}));
  const result=await configure(a,'http://127.0.0.1:'+old.address().port);
  assert.equal(result.status,400);assert.equal((await result.json()).code,'SEC_CRYPTO_UNSUPPORTED');
  assert.equal((await a.state()).sec,null);assert.equal((await a.state()).timerClock.startedAt,before.timerClock.startedAt);
  assert.ok(requests.every(r=>r.path!='/api/sec/pair'&&!r.headers['x-fdv-secondary-key']));
});

test('a slow key exchange is excluded from the standby clock measurement',async t=>{
  const a=await fixture(t,null),b=await fixture(t,null);
  const proxy=await relay(t,b.baseUrl,(phase,record,body)=>{
    if(phase==='response'&&record.path==='/api/sec/handshake')record.delayMs=220;
    return body;
  });
  await a.action({type:'primary',primaryClientId:'clock-test'});await a.start();
  const result=await configure(a,proxy.url);assert.equal(result.status,200,await result.text());
  const primary=await a.state(),standby=await b.state();
  assert.ok(Math.abs(standby.timerClock.now-primary.timerClock.now)<30,'DH setup delay must not shift the timer clock');
  assert.ok(standby.sec.clockErrorMs<30);
});
