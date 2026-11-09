"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const {spawn, spawnSync} = require("node:child_process");
const {check, newer} = require("../lib/launcher-updates");
const root = path.resolve(__dirname, "..");

test("release comparison handles equal versions, numeric ordering and develop/CI without downgrades", () => {
  assert.equal(newer("v2.3.9", "v2.3.10"), true);
  assert.equal(newer("v2.3.10", "v2.3.9"), false);
  assert.equal(newer("v2.3.10", "v2.3.10"), false);
  assert.equal(newer("local", "v2.3.2", 448, 440), false);
  assert.equal(newer("v0.0.999", "v2.3.2", 448, 440), false);
  assert.equal(newer("local", "v2.4.0", 448, 450), true);
  assert.throws(() => newer("local", "v2.3.2", 448, NaN));
  assert.throws(() => newer("v2.3.2", "v2.4.0-beta"));
});

test("checker reads isolated metadata, rejects previews and never confuses failed checks with current", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fdv-update-test-"));
  t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  fs.writeFileSync(path.join(dir, "serve-bouldering-timer.js"), "const BUILD_NUMBER = 448;");
  const url = "https://github.com/dfedorov-arch/fdv-bouldering-timer/releases/download/v2.4.0/update-info.json";
  const release = {tag_name:"v2.4.0", draft:false, prerelease:false, assets:[{name:"update-info.json", browser_download_url:url}]};
  const requests = [];
  const fetch = async (target, deadline) => {
    requests.push(target); assert.ok(deadline > Date.now());
    return target === url ? {version:"v2.4.0", buildNumber:450} : release;
  };
  assert.equal(await check(dir, fetch), "available|v2.4.0");
  assert.equal(requests.length, 2);
  await assert.rejects(check(dir, async target => target === url ? {version:"v2.5.0", buildNumber:450} : release));
  release.prerelease = true; await assert.rejects(check(dir, fetch)); release.prerelease = false;
  release.assets = []; await assert.rejects(check(dir, fetch));
  fs.writeFileSync(path.join(dir, "release-version.txt"), "v2.4.0");
  assert.equal(await check(dir, fetch), "current");
  fs.writeFileSync(path.join(dir, "release-version.txt"), "v2.3.2");
  assert.equal(await check(dir, fetch), "available|v2.4.0");
  await assert.rejects(check(dir, async () => { throw Error("offline"); }));
});

test("Windows launcher checker stays responsive and preserves server process/timers", {timeout:30000}, async t => {
  if (process.platform !== "win32") return t.skip("Windows native harness");
  fs.mkdirSync(path.join(root,"dist"), {recursive:true});
  const dir = fs.mkdtempSync(path.join(root,"dist", "fdv-update-ui-"));
  t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  const image = path.join(root, "dist", "launcher-updates"); fs.mkdirSync(path.dirname(image), {recursive:true});
  const executable = path.join(dir, "harness.exe");
  const sources = ["launcher/windows/FdvBoulderingTimerLauncher.cs", "launcher/windows/HttpsCertificate.cs",
    "launcher/windows/HttpsCertificateDialog.cs", "launcher/windows/LauncherLanguage.cs",
    "launcher/windows/LauncherUpdates.cs", "test/helpers/windows-launcher-harness.cs"];
  const compiler = path.join(process.env.WINDIR, "Microsoft.NET/Framework64/v4.0.30319/csc.exe");
  const compiled = spawnSync(compiler, ["/nologo", "/codepage:65001", "/target:exe", "/main:WindowsLauncherHarness",
    "/reference:System.Drawing.dll", "/reference:System.Windows.Forms.dll", "/out:" + executable, ...sources.map(f=>path.join(root,f))], {encoding:"utf8"});
  assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
  await new Promise((resolve,reject) => {
    const child = spawn(executable, ["updates", path.join(dir,"fixture"), process.execPath, image]);
    let output = ""; child.stdout.on("data", c=>output+=c); child.stderr.on("data", c=>output+=c);
    child.on("error",reject); child.on("exit",code=>{try {assert.equal(code,0,output);resolve();}catch(e){reject(e);}});
  });
});

// A socket/DNS stall must still terminate the isolated checker on its wall deadline.
test("CLI bounds a hung network operation and reports unavailable", {timeout:12000}, async t => {
  fs.mkdirSync(path.join(root,"dist"), {recursive:true});
  const dir = fs.mkdtempSync(path.join(root,"dist","update-network-"));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const preload = path.join(dir,"hang.cjs");
  fs.writeFileSync(preload, "require('https').get=()=>{const e=new(require('events').EventEmitter)();e.destroy=()=>{};return e;};");
  const started=Date.now();
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,["--require",preload,path.join(root,"lib/launcher-updates.js")]);
    let output="";child.stdout.on("data",c=>output+=c);child.on("error",reject);
    child.on("exit",code=>{try{assert.equal(code,0);assert.equal(output.trim(),"unavailable");resolve();}catch(e){reject(e);}});
  });
  assert.ok(Date.now()-started < 11000);
});
