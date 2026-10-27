"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const tls = require("node:tls");
const https = require("node:https");
const net = require("node:net");
const {spawnSync, spawn} = require("node:child_process");
const {httpsCertificatePaths} = require("../lib/https-certificate-storage");
const root = path.resolve(__dirname, "..");

test("macOS/Linux certificate resolution matches installed, portable and user fallback precedence", () => {
  for (const platform of ["darwin", "linux"]) {
    for (const xdg of [undefined, "relative", "/custom-state"]) {
      const user = platform === "darwin" ? "/home/test/Library/Application Support/FDV Bouldering Timer/https"
        : (xdg === "/custom-state" ? xdg : "/home/test/.local/state") + "/fdv-bouldering-timer/https";
      const portable = "/timer/https/timer-cert.pfx";
      const plan = files => httpsCertificatePaths("/timer", {platform, homeDirectory:"/home/test",
        environment: {XDG_STATE_HOME:xdg}, fileSystem:{existsSync: file => files.includes(file)}});
      assert.equal(plan([]).managed, false);
      assert.equal(plan([portable, user + "/timer-cert.pfx"]).pfxPath, portable);
      assert.equal(plan([user + "/timer-cert.pfx"]).pfxPath, user + "/timer-cert.pfx");
      assert.equal(plan(["/timer/fdv-installed.marker", portable, user + "/timer-cert.pfx"]).pfxPath, user + "/timer-cert.pfx");
      assert.equal(plan(["/timer/fdv-installed.marker", portable]).managed, false);
    }
  }
});

test("all Unix builds compile the common certificate UI and keep restart opt-in", () => {
  const launcher = fs.readFileSync(path.join(root,"launcher/unix/Program.cs"),"utf8");
  const dialog = fs.readFileSync(path.join(root,"launcher/unix/HttpsCertificateDialog.cs"),"utf8");
  const generator = fs.readFileSync(path.join(root,"launcher/unix/HttpsCertificate.cs"),"utf8");
  assert.match(launcher,/Content = "Create HTTPS certificate"/);
  assert.match(launcher,/return HttpsCertificate.Exists\(_baseDirectory\)/);
  assert.match(launcher,/if \(dialog.RestartRequested && !_allowClose\) StartServer\(false\)/);
  assert.match(dialog,/Task.Run\(\(\) => HttpsCertificate.Generate/);
  assert.match(dialog,/if \(replace && !await Confirm/);
  assert.match(dialog,/dialog.Opened \+= .*no.Focus/);
  assert.match(dialog,/Closing \+= .*if \(_busy\) args.Cancel = true/);
  assert.doesNotMatch(generator,/Process.Start|X509Store|Dns.GetHost|DNSServiceBrowse/);
});

test("Unix native certificates work with Node HTTPS, backup atomically and activate only after restart", {timeout:120000}, async t => {
  if (process.platform === "win32" || process.env.FDV_TEST_UNIX_CERTIFICATES !== "1")
    return t.skip("Opt in with FDV_TEST_UNIX_CERTIFICATES=1 and .NET SDK; only temporary certificate directories are used");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),"fdv-unix-certificate-"));
  t.after(() => fs.rmSync(directory,{recursive:true,force:true}));
  const output = path.join(directory,"build");
  const rid = (process.platform === "darwin" ? "osx" : "linux") + "-" + process.arch;
  const built = spawnSync(process.env.DOTNET || "dotnet", ["publish", path.join(root,"test/helpers/unix-certificates/Harness.csproj"),
    "-c","Release","-r",rid,"--self-contained","true","-o",output,
    "-p:BaseIntermediateOutputPath="+path.join(directory,"obj")+path.sep], {encoding:"utf8",timeout:90000});
  assert.equal(built.status,0,built.stdout+built.stderr);
  function run(args, status=0) {
    const result = spawnSync(path.join(output,"Harness"),args,{encoding:"utf8",timeout:15000});
    assert.equal(result.status,status,result.stdout+result.stderr); return result.stdout.trim();
  }
  assert.equal(run(["names","LOCALHOST; https://timer.example:8443/ 127.0.0.1 ::1 localhost"]),"localhost|timer.example|127.0.0.1|::1");
  for (const invalid of ["*.*","http://user:pass@timer.example/","https://timer.example/path","bad_name","0.0.0.0","fe80::1%4",""])
    run(["names",invalid],1);
  run(["names",Array.from({length:65},(_,i)=>`host-${i}.example`).join(",")],1);
  assert.ok(run(["defaults"]).split("|").includes("127.0.0.1"));
  const app = path.join(directory,"server"); fs.mkdirSync(app);
  const fallback = path.join(directory,"fallback");
  const names = "localhost,127.0.0.1,::1,timer.example,192.168.1.222";
  const target = run(["generate",app,names,"create",fallback]);
  assert.equal(target,path.join(app,"https"));
  const publicFile = path.join(target,"timer-public.cer"), pfxFile = path.join(target,"timer-cert.pfx");
  let certificate = new crypto.X509Certificate(fs.readFileSync(publicFile));
  const originalPfx = fs.readFileSync(pfxFile);
  assert.equal(certificate.publicKey.asymmetricKeyDetails.modulusLength,2048);
  assert.equal(certificate.ca,false); assert.equal(certificate.verify(certificate.publicKey),true);
  assert.equal(certificate.checkIP("127.0.0.1"),"127.0.0.1"); assert.ok(certificate.checkIP("::1"));
  assert.equal(certificate.checkHost("timer.example"),"timer.example");
  assert.equal(certificate.checkHost("other.example"),undefined);
  assert.deepEqual(certificate.keyUsage,["1.3.6.1.5.5.7.3.1"]);
  assert.ok(certificate.raw.includes(Buffer.from("06092a864886f70d01010b","hex")));
  assert.ok(Date.parse(certificate.validTo)-Date.now()>364*86400000);
  tls.createSecureContext({pfx:originalPfx,passphrase:"bouldering-timer"});
  assert.equal(fs.statSync(target).mode & 0o777,0o700);
  assert.equal(fs.statSync(pfxFile).mode & 0o777,0o600);
  run(["generate",app,names,"create",fallback],1);
  assert.deepEqual(fs.readFileSync(pfxFile),originalPfx);
  run(["storage-error",app,names,"replace",fallback,"portable"],1);
  assert.deepEqual(fs.readFileSync(pfxFile),originalPfx);
  const readOnly = path.join(directory,"readonly"); fs.mkdirSync(readOnly);
  assert.equal(run(["storage-error",readOnly,names,"create",fallback,"portable"]),fallback);
  const installed = path.join(directory,"installed"); fs.mkdirSync(installed);
  fs.writeFileSync(path.join(installed,"fdv-installed.marker"),"");
  assert.equal(run(["directory",installed,fallback]),fallback);
  assert.equal(run(["generate",installed,names,"replace",fallback]),fallback);
  const badFallback = path.join(directory,"bad-fallback");
  run(["storage-error",readOnly,names,"create",badFallback,"both"],1);
  assert.equal(fs.existsSync(path.join(badFallback,"timer-cert.pfx")),false);
  const rollbackRoot=path.join(directory,"rollback");
  fs.mkdirSync(path.join(rollbackRoot,"https/timer-cert.pfx"),{recursive:true});
  const rollbackPublic=path.join(rollbackRoot,"https/timer-public.cer");
  fs.copyFileSync(publicFile,rollbackPublic);
  const previousPublic=fs.readFileSync(rollbackPublic);
  run(["generate",rollbackRoot,names,"replace",path.join(directory,"rollback-fallback")],1);
  assert.deepEqual(fs.readFileSync(rollbackPublic),previousPublic,"Public certificate is restored when PFX publication fails");
  // Isolated real server: neither the user's server nor its data are touched.
  for (const file of ["serve-bouldering-timer.js","params.txt"]) fs.copyFileSync(path.join(root,file),path.join(app,file));
  for (const folder of ["lib","fonts","beeps"]) fs.cpSync(path.join(root,folder),path.join(app,folder),{recursive:true});
  async function freePort() {
    const s=net.createServer(); await new Promise(resolve=>s.listen(0,"127.0.0.1",resolve));
    const port=s.address().port; await new Promise(resolve=>s.close(resolve)); return port;
  }
  const httpPort = await freePort(); let httpsPort = await freePort(); while(httpsPort===httpPort) httpsPort=await freePort();
  let child, logs="";
  async function stop() {
    if(child && child.exitCode === null && child.signalCode === null)
      await new Promise(resolve=>{child.once("exit",resolve);child.kill();});
  }
  t.after(stop);
  function state() {
    return new Promise((resolve,reject)=>{
      const request=https.get({hostname:"127.0.0.1",port:httpsPort,path:"/api/state",ca:certificate.toString(),agent:false},response=>{
        const fingerprint=response.socket.getPeerCertificate().fingerprint256;
        response.resume();response.on("end",()=>resolve({status:response.statusCode,fingerprint}));
      });request.on("error",reject);
    });
  }
  async function launch() {
    child=spawn(process.execPath,[path.join(app,"serve-bouldering-timer.js")],{cwd:app,
      env:{...process.env,HOST:"127.0.0.1",PORT:String(httpPort),HTTPS_PORT:String(httpsPort),HOME:path.join(directory,"home"),XDG_STATE_HOME:""},
      stdio:["ignore","pipe","pipe"]});
    child.stdout.on("data",data=>{logs+=data;});child.stderr.on("data",data=>{logs+=data;});
    const deadline=Date.now()+5000;
    while(true){try{await state();return;}catch(error){if(Date.now()>deadline||child.exitCode!==null)throw new Error(error.message+"\n"+logs);await new Promise(r=>setTimeout(r,50));}}
  }
  try {
    await launch();assert.equal((await state()).status,200);
    const oldFingerprint=certificate.fingerprint256;
    run(["generate",app,names,"replace",fallback]);
    assert.notDeepEqual(fs.readFileSync(pfxFile),originalPfx);
    assert.equal((await state()).fingerprint,oldFingerprint,"Generation leaves the running listener unchanged");
    for(const file of fs.readdirSync(target).filter(name=>name.includes(".backup-")&&name.endsWith(".pfx")))
      assert.equal(fs.statSync(path.join(target,file)).mode&0o777,0o600);
    assert.ok(fs.readdirSync(target).some(name=>name.includes(".backup-")&&name.endsWith(".pfx")));
    certificate=new crypto.X509Certificate(fs.readFileSync(publicFile));
    await stop();await launch();assert.equal((await state()).fingerprint,certificate.fingerprint256);
    assert.equal((await fetch(`http://127.0.0.1:${httpPort}/https/timer-cert.pfx`)).status,403);
    // Installing the same payload changes managed precedence: per-user PFX,
    // never an old portable key shipped beside an installed app.
    await stop();
    fs.writeFileSync(path.join(app,"fdv-installed.marker"),"");
    const installedUser=httpsCertificatePaths(app,{homeDirectory:path.join(directory,"home"),environment:{},
      fileSystem:{existsSync:file=>file===path.join(app,"fdv-installed.marker")}});
    const userDir=process.platform==="darwin"
      ?path.join(directory,"home/Library/Application Support/FDV Bouldering Timer/https")
      :path.join(directory,"home/.local/state/fdv-bouldering-timer/https");
    assert.equal(installedUser.managed,false);
    assert.equal(run(["generate",app,names,"create",userDir]),userDir);
    certificate=new crypto.X509Certificate(fs.readFileSync(path.join(userDir,"timer-public.cer")));
    await launch();assert.equal((await state()).fingerprint,certificate.fingerprint256);
  } finally {await stop();}
});
