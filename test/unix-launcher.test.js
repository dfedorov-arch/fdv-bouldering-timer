"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os"),crypto=require("node:crypto");
const {spawnSync,spawn}=require("node:child_process");
const {fixture}=require("./helpers/controlled-clock-server");
const root=path.resolve(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");

test("desktop launchers share labels, language preference and certificate translations",()=>{
  const unix=read("launcher/unix/Program.cs"),windows=read("launcher/windows/FdvBoulderingTimerLauncher.cs");
  for(const text of ["Open timer","Copy link","Restart server","Stop and exit","Create HTTPS certificate","Show launcher"])
    for(const source of [unix,windows])assert.ok(source.includes('"'+text+'"'),text);
  assert.match(read("launcher/unix/FdvBoulderingTimer.Launcher.csproj"),/Compile Include="\.\.\/windows\/LauncherLanguage.cs"/);
  assert.match(read("launcher/unix/HttpsCertificateDialog.cs"),/T\("HTTPS certificate"\)/);
  assert.match(read("launcher/windows/HttpsCertificateDialog.cs"),/LauncherLanguage.Text\("HTTPS certificate"\)/);
  const switching=unix.slice(unix.indexOf("private void SwitchLanguage"),unix.indexOf("private void QueueServerLanguage"));
  assert.match(switching,/LauncherLanguage.Save/);assert.match(switching,/QueueServerLanguage\(false\)/);
  assert.doesNotMatch(switching,/StartServer|StopServer|_settings\s*=/);
  assert.match(unix,/FDV_LAUNCHER_LANGUAGE_TOKEN/);assert.match(unix,/RandomNumberGenerator.GetBytes\(32\)/);
  assert.match(unix,/generation != _probeGeneration \|\| _serverProcess != process/);
  assert.match(unix,/technical: true/);
});

test("Unix close hides without stopping, and all recovery entry points restore the same window",()=>{
  const source=read("launcher/unix/Program.cs");
  const closing=source.slice(source.indexOf("private void OnClosing"),source.indexOf("private void BeginNewProbeCycle"));
  assert.match(closing,/args.Cancel = true/);assert.match(closing,/Hide\(\)/);
  assert.doesNotMatch(closing,/StopServerProcess|CancelPendingProbes|StopNetworkMonitoring/);
  assert.match(closing,/WindowCloseReason.ApplicationShutdown or WindowCloseReason.OSShutdown/);
  assert.match(source,/activation.Activated.*ActivationKind.Reopen/);
  assert.match(source,/new LauncherInstance/);assert.match(source,/instance.ReopenExisting/);
  const windows=read("launcher/windows/FdvBoulderingTimerLauncher.cs");
  assert.match(windows,/RegisterWindowMessage\("FDV.BoulderingTimer.Launcher.Show"\)/);
  assert.match(windows,/CloseReason.WindowsShutDown/);
  const exiting=windows.slice(windows.indexOf("private void PrepareExit"),windows.indexOf("private void OnFormClosing"));
  assert.match(exiting,/StopServerProcess\(\)/);assert.doesNotMatch(exiting,/StopPortListeners/);
  const instance=read("launcher/unix/LauncherInstance.cs");
  assert.match(instance,/PipeOptions.CurrentUserOnly/);assert.match(instance,/WaitForConnectionAsync/);
  assert.doesNotMatch(instance,/TcpListener|HttpListener|Process.Start|serve-bouldering/);
});

test("Unix headless UI, real language endpoint and per-user single-instance restore",{timeout:180000},async t=>{
  if(process.platform==="win32"||process.env.FDV_TEST_UNIX_LAUNCHER!=="1")return t.skip("Opt in with FDV_TEST_UNIX_LAUNCHER=1 and .NET SDK; no real GUI or user profile is modified");
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"fdv-launcher442-"));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const output=path.join(directory,"build"),rid=(process.platform==="darwin"?"osx":"linux")+"-"+process.arch;
  const build=spawnSync(process.env.DOTNET||"dotnet",["publish",path.join(root,"test/helpers/unix-launcher/Harness.csproj"),"-c","Release","-r",rid,"--self-contained","true","-o",output,"-p:UsedAvaloniaProducts="],{encoding:"utf8",timeout:120000});
  assert.equal(build.status,0,build.stdout+build.stderr);
  const executable=path.join(output,"Harness");
  function run(args,expected=0,env=process.env){const result=spawnSync(executable,args,{encoding:"utf8",timeout:30000,env});assert.equal(result.status,expected,result.stdout+result.stderr);return result.stdout.trim();}
  const token=crypto.randomBytes(32).toString("hex"),server=await fixture(t,null,{launcherToken:token});
  await server.action({type:"primary",primaryClientId:"clock-test"});await server.start();server.frame(9000);
  const before=await server.state(),port=new URL(server.baseUrl).port;
  assert.match(run(["ui",path.join(directory,"ui"),port,token]),/RU\/EN.*hide\/reopen.*OK/);
  for(const language of ["ru","en"])for(const width of ["normal","min"]){
    const image=path.join(directory,`launcher-${language}-${width}.png`);
    run(["render",path.join(directory,"render"),image,language,...(width==="min"?["min"]:[])]);
    assert.ok(fs.statSync(image).size>2000,"Rendered control frame must contain content");
  }
  const after=await server.state();assert.equal(after.language,"ru");
  assert.equal(after.version,before.version+2,"Only two explicit button choices change state; health adoption must not POST back");
  for(const field of ["running","primaryClientId","activePreset","elapsedBeforePause","soundProfile"])
    assert.deepEqual(after[field],before[field],field+" must not change");
  assert.equal(after.timerClock.startedAt,before.timerClock.startedAt);
  run(["send-language",port,token,"en"]);assert.equal((await server.state()).language,"en");
  run(["send-language",port,"0".repeat(64),"ru"],1);assert.equal((await server.state()).language,"en");
  const identity=path.join(directory,"instance");let owner,logs="";
  async function stopOwner(){if(owner&&owner.exitCode===null&&owner.signalCode===null)await new Promise(resolve=>{owner.once("exit",resolve);owner.stdin.end("exit\n");});}
  t.after(stopOwner);
  async function launchOwner(){logs="";owner=spawn(executable,["instance",identity],{stdio:["pipe","pipe","pipe"]});owner.stdout.on("data",data=>{logs+=data;});owner.stderr.on("data",data=>{logs+=data;});
    const deadline=Date.now()+5000;while(!logs.includes("owner")){if(Date.now()>deadline||owner.exitCode!==null)throw Error(logs||"Owner did not start");await new Promise(r=>setTimeout(r,20));}}
  await launchOwner();assert.equal(run(["instance",identity]),"existing");
  const deadline=Date.now()+5000;while(!logs.includes("reopened")){if(Date.now()>deadline)throw Error("First instance did not receive reopen");await new Promise(r=>setTimeout(r,20));}
  assert.equal(owner.exitCode,null,"Reopen must not stop the first instance");
  await stopOwner();await launchOwner();assert.equal(run(["instance",identity]),"existing");await stopOwner();
  if(process.platform==="linux"){
    for(const value of ["relative",path.join(directory,"custom-state")]){
      const pref=run(["language-path"],0,{...process.env,XDG_STATE_HOME:value});
      assert.ok(pref.endsWith("fdv-bouldering-timer/launcher-language.txt"));
      if(path.isAbsolute(value))assert.ok(pref.startsWith(value+path.sep));else assert.ok(!pref.startsWith(value));
    }
  }
});
