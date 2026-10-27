"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync, spawn } = require("node:child_process");
const { fixture } = require("./helpers/controlled-clock-server");

const projectRoot = path.resolve(__dirname, "..");

test("Windows launcher reloads settings and links on every server restart", () => {
  const source = fs.readFileSync(
    path.join(projectRoot, "launcher", "windows", "FdvBoulderingTimerLauncher.cs"),
    "utf8"
  );
  const startServer = source.slice(
    source.indexOf("private void StartServer"),
    source.indexOf("private void CheckServerReady")
  );
  assert.match(startServer, /_settings = LauncherSettings\.Load\(_baseDirectory\)/);
  assert.match(startServer, /_hasHttps = HasHttpsCertificate\(\)/);
  assert.match(startServer, /PopulateAddresses\(\)/);
});

test("Windows language switch remembers the choice and queues only authenticated language synchronization", () => {
  const source=fs.readFileSync(path.join(projectRoot,"launcher/windows/FdvBoulderingTimerLauncher.cs"),"utf8");
  const switchBody=source.slice(source.indexOf("private void SwitchLanguage"),source.indexOf("private bool HasHttpsCertificate"));
  assert.match(switchBody,/LauncherLanguage.Russian = !LauncherLanguage.Russian/);
  assert.match(switchBody,/ApplyLanguage\(\)/);
  assert.match(switchBody,/LauncherLanguage.Save/);
  assert.match(switchBody,/QueueServerLanguage\(false\)/);
  assert.doesNotMatch(switchBody,/StartServer|StopServer|\.Start\(|_settings\s*=/);
  assert.match(source,/AppendRawLog\(args.Data\)/);
  assert.match(fs.readFileSync(path.join(projectRoot,"launcher/windows/HttpsCertificateDialog.cs"),"utf8"),/LauncherLanguage.Text\("HTTPS certificate"\)/);
});

test("native RU/EN launcher preserves state and sends authenticated language to an isolated server",{timeout:30000},async t=>{
  if(process.platform!=="win32" || process.env.FDV_TEST_WINDOWS_CERTIFICATES!=="1")
    return t.skip("Opt in on Windows with FDV_TEST_WINDOWS_CERTIFICATES=1 for passive native UI tests");
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"fdv-launcher-language-"));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const compiler=path.join(process.env.WINDIR,"Microsoft.NET/Framework64/v4.0.30319/csc.exe");
  const sources=["launcher/windows/FdvBoulderingTimerLauncher.cs","launcher/windows/HttpsCertificate.cs",
    "launcher/windows/HttpsCertificateDialog.cs","launcher/windows/LauncherLanguage.cs","test/helpers/windows-launcher-harness.cs"].map(file=>path.join(projectRoot,file));
  const imagePrefix=path.join(projectRoot,"dist/windows-launcher-language");
  fs.mkdirSync(path.dirname(imagePrefix),{recursive:true});
  function compileAndRun(legacy){
    const executable=path.join(directory,legacy?"legacy.exe":"modern.exe");
    const references=process.env.FDV_NET20_REFERENCES;
    const args=["/nologo","/codepage:65001","/target:exe","/main:WindowsLauncherHarness","/out:"+executable];
    if(legacy){
      args.push("/noconfig","/nostdlib+","/platform:x86","/define:FDV_LEGACY_WINDOWS",
        ...["mscorlib.dll","System.dll","System.Drawing.dll","System.Windows.Forms.dll"].map(file=>"/reference:"+path.join(references,file)));
      sources.push(path.join(projectRoot,"compat/windows-legacy/LauncherCompatibility.cs"));
    }else args.push("/reference:System.Drawing.dll","/reference:System.Windows.Forms.dll");
    const compiled=spawnSync(compiler,[...args,...sources],{encoding:"utf8"});assert.equal(compiled.status,0,compiled.stdout+compiled.stderr);
    if(legacy)fs.copyFileSync(path.join(projectRoot,"compat/windows-legacy/launcher.exe.config"),executable+".config");
    const result=spawnSync(executable,[path.join(directory,legacy?"legacy":"modern"),imagePrefix+(legacy?"-legacy":"")],{encoding:"utf8",timeout:15000});
    assert.equal(result.status,0,result.stdout+result.stderr);
    return executable;
  }
  const executables=[compileAndRun(false)];
  if(process.env.FDV_NET20_REFERENCES)executables.push(compileAndRun(true));
  const token="1".repeat(64), server=await fixture(t,null,{launcherToken:token});
  for(const executable of executables){
    for(const language of ["en","ru"]){
      const status=await new Promise((resolve,reject)=>{
        const build=fs.readFileSync(path.join(projectRoot,"serve-bouldering-timer.js"),"utf8").match(/const BUILD_NUMBER = (\d+);/)[1];
        const child=spawn(executable,["switch-server-language",path.join(directory,"transport"),new URL(server.baseUrl).port,token,language,build],{stdio:"pipe"});
        let errors="";child.stderr.on("data",data=>errors+=data);child.once("error",reject);child.once("exit",code=>resolve({code,errors}));
      });
      assert.equal(status.code,0,status.errors);
      assert.equal((await server.state()).language,language);
    }
  }
});

test("Windows launcher refreshes network links from debounced system events", () => {
  const source = fs.readFileSync(
    path.join(projectRoot, "launcher", "windows", "FdvBoulderingTimerLauncher.cs"),
    "utf8"
  );
  assert.match(source, /NetworkChange\.NetworkAddressChanged \+= OnNetworkAddressChanged/);
  assert.match(source, /_networkRefreshTimer\.Interval = 750/);
  assert.match(source, /_networkRefreshTimer\.Tick \+= RefreshNetworkAddresses/);
  assert.match(source, /if \(HasSameAddresses\(updatedAddresses\)\) return false/);
  assert.match(source, /if \(PopulateAddresses\(\)\) AppendLog\("Network addresses changed\."\)/);
  assert.doesNotMatch(source, /AppendLog\("Network addresses updated\."\)/);
  assert.match(source, /NetworkChange\.NetworkAddressChanged -= OnNetworkAddressChanged/);
});
