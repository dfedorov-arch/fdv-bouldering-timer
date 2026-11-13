"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process');
async function main(){
  const [root,profile]=process.argv.slice(2);assert.ok(root&&profile);
  fs.mkdirSync(profile,{recursive:true});
  const expectedBuild=Number(fs.readFileSync(path.join(root,'index.html'),'utf8').match(/const pageBuildNumber = (\d+);/)[1]);
  const listener=net.createServer();await new Promise((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve);});
  const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const child=spawn(path.join(root,'runtime/win/node.exe'),[path.join(root,'serve-bouldering-timer.js')],{
    cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],
    env:{...process.env,HOST:'127.0.0.1',PORT:String(port),HTTPS_PORT:'0',HOME:profile,USERPROFILE:profile,LOCALAPPDATA:path.join(profile,'AppData','Local'),XDG_STATE_HOME:path.join(profile,'.local','state'),FDV_LAUNCHER_LANGUAGE_TOKEN:''}
  });
  let output='',spawnError;child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',e=>spawnError=e);
  const closed=new Promise(resolve=>child.once('close',resolve));
  try{
    const deadline=Date.now()+20000;let state;
    while(Date.now()<deadline){
      if(spawnError)throw spawnError;
      if(child.exitCode!==null)throw Error('Extracted server exited: '+output);
      try{const response=await fetch('http://127.0.0.1:'+port+'/api/state',{signal:AbortSignal.timeout(1500)});if(response.ok){state=await response.json();break;}}catch{}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.ok(state,'Extracted server did not become ready: '+output);
    assert.equal(Number(state.config.buildNumber),expectedBuild);assert.equal(state.running,false);
    console.log('Isolated extracted MSI server: HTTP200, build'+expectedBuild+', stopped timer.');
  }finally{if(child.exitCode===null&&!spawnError)child.kill('SIGTERM');await closed;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
