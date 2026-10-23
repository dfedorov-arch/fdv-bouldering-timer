"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const https = require("node:https");
const tls = require("node:tls");
const net = require("node:net");
const { spawnSync, spawn } = require("node:child_process");
const { httpsCertificatePaths } = require("../lib/https-certificate-storage");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

function plan(files, platform = "win32") {
  return httpsCertificatePaths(platform === "win32" ? "C:\\Timer" : "/timer", {
    platform, environment:{LOCALAPPDATA:"C:\\Profile\\Local"},
    fileSystem:{existsSync:file=>files.includes(file)}
  });
}

async function freePort() {
  const server=net.createServer();await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;
}

function getHttps(port,certificate) {
  return new Promise((resolve,reject)=>{
    const request=https.get({hostname:"127.0.0.1",port,path:"/api/state",ca:certificate.toString()},response=>{
      const peer=response.socket.getPeerCertificate().fingerprint256;
      let text="";response.on("data",chunk=>{text+=chunk;});response.on("end",()=>{try{resolve({status:response.statusCode,body:JSON.parse(text),peer});}catch(error){reject(error);}});
    });request.on("error",reject);
  });
}

test("certificate locations preserve legacy PEM/PFX and choose managed portable or installed user storage", () => {
  assert.deepEqual(plan([]),{managed:false,directory:"C:\\Timer",keyPath:"C:\\Timer\\timer-key.pem",
    certPath:"C:\\Timer\\timer-cert.pem",pfxPath:"C:\\Timer\\timer-cert.pfx"});
  const portable="C:\\Timer\\https\\timer-cert.pfx", user="C:\\Profile\\Local\\FDV Bouldering Timer\\https\\timer-cert.pfx";
  assert.equal(plan([portable,user]).pfxPath,portable);
  assert.equal(plan([user]).pfxPath,user);
  assert.equal(plan(["C:\\Timer\\fdv-installed.marker",portable,user]).pfxPath,user);
  assert.equal(plan(["C:\\Timer\\fdv-installed.marker",portable]).managed,false);
  assert.equal(plan(["/timer/https/timer-cert.pfx"],"linux").managed,true);
  assert.equal(plan([],"linux").pfxPath,"/timer/timer-cert.pfx");
});

test("native certificate UI requires replacement and restart consent and never modifies trust stores", () => {
  const source=read("launcher/windows/HttpsCertificate.cs"), dialog=read("launcher/windows/HttpsCertificateDialog.cs");
  const launcher=read("launcher/windows/FdvBoulderingTimerLauncher.cs");
  assert.match(source,/CertCreateSelfSignCertificate/);
  assert.match(source,/1\.2\.840\.113549\.1\.1\.11/);
  assert.match(source,/RSACryptoServiceProvider\(2048/);
  assert.match(source,/PersistKeyInCsp = false/);
  assert.match(source,/File\.Replace\(temporary, path, backup\)/);
  assert.match(source,/File\.SetAccessControl/);
  assert.match(dialog,/bool replace = HttpsCertificate\.Exists/);
  assert.match(dialog,/MessageBoxDefaultButton\.Button2/);
  assert.match(dialog,/RestartRequested = true/);
  assert.match(dialog,/ThreadPool\.QueueUserWorkItem/);
  assert.match(dialog,/protected override void OnPaint/);
  assert.match(dialog,/TextRenderer\.DrawText[\s\S]*DisabledText/);
  assert.match(launcher,/if \(dialog\.RestartRequested\) StartServer\(false\)/);
  assert.doesNotMatch(source+dialog,/New-SelfSignedCertificate|Get-NetIPAddress|openssl|X509Store\(|CertAddCertificateContextToStore|certutil/i);
  assert.match(read("serve-bouldering-timer.js"),/!certificatePaths\.managed && fs\.existsSync\(keyPath\)/);
  assert.ok(read("serve-bouldering-timer.js").includes("(?:runtime-state|\\.git|https)"));
  assert.match(read("launcher/windows/build-launcher.ps1"),/\$source \$certificateSource \$certificateDialog \$compatibility/);
});

test("Windows CryptoAPI generates usable SAN certificates with backups, private ACLs and no automatic trust",{timeout:60000},async t=>{
  if(process.platform !== "win32" || process.env.FDV_TEST_WINDOWS_CERTIFICATES !== "1")
    return t.skip("Opt in with FDV_TEST_WINDOWS_CERTIFICATES=1 on Windows; generates only temporary user keys/certificates");
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"fdv-cert-test-"));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const executable=path.join(directory,"certificate-harness.exe");
  const compiler=path.join(process.env.WINDIR,"Microsoft.NET","Framework64","v4.0.30319","csc.exe");
  const compilerArgs=["/nologo","/codepage:65001","/target:exe","/reference:System.Drawing.dll","/reference:System.Windows.Forms.dll",
    "/out:"+executable,path.join(root,"launcher/windows/HttpsCertificate.cs"),path.join(root,"launcher/windows/HttpsCertificateDialog.cs"),path.join(root,"launcher/windows/LauncherLanguage.cs"),
    path.join(root,"test/helpers/https-certificate-harness.cs")];
  const compiled=spawnSync(compiler,compilerArgs,{encoding:"utf8"});
  assert.equal(compiled.status,0,compiled.stdout+compiled.stderr);
  function run(args, expected=0, file=executable) {
    const result=spawnSync(file,args,{encoding:"utf8",timeout:20000});
    assert.equal(result.status,expected,result.stdout+result.stderr);
    return result.stdout.trim();
  }
  assert.equal(run(["names","LOCALHOST; https://timer.example:8443/ 127.0.0.1 ::1 localhost"]),"localhost|timer.example|127.0.0.1|::1");
  for(const invalid of ["*.*","http://user:pass@timer.example/","https://timer.example/path","bad_name","0.0.0.0","fe80::1%4",""])
    run(["names",invalid],1);
  const timerRoot=path.join(directory,"portable");
  const names="localhost,127.0.0.1,::1,timer.example,192.168.1.222";
  const certificateDirectory=run(["generate",timerRoot,names,"create"]);
  assert.ok(certificateDirectory.startsWith(timerRoot+path.sep),"Tests must never fall back into real application state");
  const pfxFile=path.join(certificateDirectory,"timer-cert.pfx"), publicFile=path.join(certificateDirectory,"timer-public.cer");
  const pfx=fs.readFileSync(pfxFile), certificate=new crypto.X509Certificate(fs.readFileSync(publicFile));
  assert.equal(run(["permissions",pfxFile]),"private");
  assert.equal(certificate.publicKey.asymmetricKeyDetails.modulusLength,2048);
  assert.equal(certificate.ca,false);
  assert.equal(certificate.verify(certificate.publicKey),true);
  assert.equal(certificate.checkIP("127.0.0.1"),"127.0.0.1");
  assert.ok(certificate.checkIP("::1"));
  assert.equal(certificate.checkHost("timer.example"),"timer.example");
  assert.equal(certificate.checkHost("other.example"),undefined);
  assert.deepEqual(certificate.keyUsage,["1.3.6.1.5.5.7.3.1"]);
  assert.ok(certificate.raw.includes(Buffer.from("06092a864886f70d01010b","hex")),"SHA256-RSA OID is explicit");
  assert.ok(Date.parse(certificate.validTo)-Date.now()>364*86400000);
  tls.createSecureContext({pfx,passphrase:"bouldering-timer"});
  const server=https.createServer({pfx,passphrase:"bouldering-timer"},(_request,response)=>response.end("certificate-test"));
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try {
    const body=await new Promise((resolve,reject)=>{
      const request=https.get({hostname:"127.0.0.1",port:server.address().port,servername:"timer.example",ca:certificate.toString()},response=>{
        let data="";response.on("data",chunk=>{data+=chunk;});response.on("end",()=>resolve(data));
      });request.on("error",reject);
    });
    assert.equal(body,"certificate-test");
  }finally{await new Promise(resolve=>server.close(resolve));}
  run(["generate",timerRoot,names,"create"],1);
  assert.deepEqual(fs.readFileSync(pfxFile),pfx,"Replacement requires explicit confirmation");
  const replacements=Array.from({length:24},(_,i)=>"route-"+i+".example").join(",");
  run(["generate",timerRoot,"localhost,127.0.0.1,"+replacements,"replace"]);
  assert.notDeepEqual(fs.readFileSync(pfxFile),pfx);
  assert.equal(new crypto.X509Certificate(fs.readFileSync(publicFile)).checkHost("route-23.example"),"route-23.example");
  assert.ok(fs.readdirSync(certificateDirectory).some(name=>name.includes(".backup-")&&name.endsWith(".pfx")));
  for(const file of fs.readdirSync(certificateDirectory).filter(name=>name.endsWith(".pfx")))
    assert.equal(run(["permissions",path.join(certificateDirectory,file)]),"private");
  const installed=path.join(directory,"installed");fs.mkdirSync(installed);fs.writeFileSync(path.join(installed,"fdv-installed.marker"),"");
  assert.equal(run(["directory",installed]),path.join(process.env.LOCALAPPDATA,"FDV Bouldering Timer","https"));
  assert.equal(run(["generate",installed,names,"create"]),path.join(installed,"test-fallback"));
  assert.equal(fs.existsSync(path.join(installed,"https")),false);
  // Older Framework ACL errors must choose a secured per-user directory,
  // never continue with an unprotected portable key or swallow crypto errors.
  for(const failure of ["invalid-operation","unsupported"]){
    const storageRoot=path.join(directory,"storage-"+failure);
    const fallback=run(["storage-error",storageRoot,names,"create",failure]);
    assert.equal(fallback,path.join(storageRoot,"test-fallback"));
    assert.equal(fs.existsSync(path.join(storageRoot,"https/timer-cert.pfx")),false);
    assert.equal(run(["permissions",path.join(fallback,"timer-cert.pfx")]),"private");
    tls.createSecureContext({pfx:fs.readFileSync(path.join(fallback,"timer-cert.pfx")),passphrase:"bouldering-timer"});
  }
  for(const failure of ["both","bug"]){
    const storageRoot=path.join(directory,"storage-"+failure);
    run(["storage-error",storageRoot,names,"create",failure],1);
    assert.equal(fs.existsSync(path.join(storageRoot,"test-fallback/timer-cert.pfx")),false);
  }
  const protectedRoot=path.join(directory,"storage-active");
  const protectedDirectory=run(["generate",protectedRoot,names,"create"]);
  const originalKey=fs.readFileSync(path.join(protectedDirectory,"timer-cert.pfx"));
  run(["storage-error",protectedRoot,names,"replace","invalid-operation"],1);
  assert.deepEqual(fs.readFileSync(path.join(protectedDirectory,"timer-cert.pfx")),originalKey);
  assert.equal(fs.existsSync(path.join(protectedRoot,"test-fallback")),false,"Do not shadow an inaccessible active portable certificate");
  // Real application startup, not only a standalone TLS fixture. Generation
  // must neither replace the in-memory listener nor restart its competition.
  const app=path.join(directory,"server");fs.mkdirSync(app);
  for(const file of ["serve-bouldering-timer.js","params.txt"]) fs.copyFileSync(path.join(root,file),path.join(app,file));
  for(const folder of ["lib","fonts","beeps"]) fs.cpSync(path.join(root,folder),path.join(app,folder),{recursive:true});
  fs.mkdirSync(path.join(app,"https"));
  fs.copyFileSync(path.join(certificateDirectory,"timer-cert.pfx"),path.join(app,"https/timer-cert.pfx"));
  fs.copyFileSync(publicFile,path.join(app,"https/timer-public.cer"));
  let currentCertificate=new crypto.X509Certificate(fs.readFileSync(publicFile));
  const httpPort=await freePort();let httpsPort=await freePort();while(httpsPort===httpPort) httpsPort=await freePort();
  let child=null;const output=[];
  async function stop() {
    if(child&&child.exitCode===null&&child.signalCode===null) await new Promise(resolve=>{child.once("exit",resolve);child.kill();});
  }
  t.after(stop);
  async function launch() {
    child=spawn(process.execPath,[path.join(app,"serve-bouldering-timer.js")],{cwd:app,env:{...process.env,HOST:"127.0.0.1",PORT:String(httpPort),HTTPS_PORT:String(httpsPort),LOCALAPPDATA:path.join(directory,"isolated-profile")},stdio:["ignore","pipe","pipe"]});
    child.stdout.on("data",data=>output.push(data.toString()));child.stderr.on("data",data=>output.push(data.toString()));
    const deadline=Date.now()+5000;
    while(true){try{await getHttps(httpsPort,currentCertificate);return;}catch(error){if(Date.now()>deadline||child.exitCode!==null) throw new Error(error.message+"\n"+output.join(""));await new Promise(resolve=>setTimeout(resolve,50));}}
  }
  try {
    await launch();
    const state=await getHttps(httpsPort,currentCertificate);assert.equal(state.status,200);
    assert.equal(state.peer,currentCertificate.fingerprint256);
    for(const file of ["https/timer-cert.pfx","https/timer-public.cer","https/temporary.txt",
      "nested%2f..%2fhttps/timer-public.cer","nested%5c..%5chttps/timer-public.cer"])
      assert.equal((await fetch(`http://127.0.0.1:${httpPort}/`+file)).status,403);
    run(["generate",app,names,"replace"]);
    const unchanged=await getHttps(httpsPort,currentCertificate);
    assert.equal(unchanged.peer,currentCertificate.fingerprint256,"Generation must not replace a running listener");
    currentCertificate=new crypto.X509Certificate(fs.readFileSync(path.join(app,"https/timer-public.cer")));
    await stop();await launch();
    assert.equal((await getHttps(httpsPort,currentCertificate)).peer,currentCertificate.fingerprint256);
  } finally {await stop();}
  const nativeNode12=process.env.FDV_LEGACY_NODE;
  if(nativeNode12){
    const check=spawnSync(nativeNode12,["-e","require('tls').createSecureContext({pfx:require('fs').readFileSync(process.argv[1]),passphrase:'bouldering-timer'});",pfxFile],{encoding:"utf8"});
    assert.equal(check.status,0,check.stderr);
  }
  for(const language of ["ru","en"]){
    const image=path.join(root,"dist","https-certificate-dialog-"+language+".png");fs.mkdirSync(path.dirname(image),{recursive:true});
    run(["render",timerRoot,image,language]);assert.ok(fs.statSync(image).size>5000);
  }
  const references=process.env.FDV_NET20_REFERENCES;
  if(references){
    const legacy=path.join(directory,"certificate-harness-legacy.exe");
    const legacyArgs=["/nologo","/noconfig","/nostdlib+","/codepage:65001","/platform:x86","/target:exe","/out:"+legacy,
      ...["mscorlib.dll","System.dll","System.Drawing.dll","System.Windows.Forms.dll"].map(file=>"/reference:"+path.join(references,file)),
      path.join(root,"launcher/windows/HttpsCertificate.cs"),path.join(root,"launcher/windows/HttpsCertificateDialog.cs"),path.join(root,"launcher/windows/LauncherLanguage.cs"),path.join(root,"test/helpers/https-certificate-harness.cs")];
    const legacyBuild=spawnSync(compiler,legacyArgs,{encoding:"utf8"});assert.equal(legacyBuild.status,0,legacyBuild.stdout+legacyBuild.stderr);
    fs.copyFileSync(path.join(root,"compat/windows-legacy/launcher.exe.config"),legacy+".config");
    const legacyDirectory=run(["generate",path.join(directory,"legacy"),names,"create"],0,legacy);
    tls.createSecureContext({pfx:fs.readFileSync(path.join(legacyDirectory,"timer-cert.pfx")),passphrase:"bouldering-timer"});
    const legacyFallback=run(["storage-error",path.join(directory,"legacy-storage"),names,"create","invalid-operation"],0,legacy);
    assert.equal(run(["permissions",path.join(legacyFallback,"timer-cert.pfx")],0,legacy),"private");
  }
});
