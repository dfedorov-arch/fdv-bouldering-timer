"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("release workflow produces installable assets for every supported operating system", () => {
  const workflow = read(".github/workflows/release.yml");
  assert.match(workflow, /windows-installer:[\s\S]*?\.msi/);
  const wixProject = read("installer/windows/FDVInstaller.wixproj");
  assert.match(wixProject, /WixToolset\.Heat/);
  assert.match(wixProject, /WixToolset\.UI\.wixext/);
  assert.match(wixProject, /<BindPath Include="\$\(PayloadDir\)"/);
  const product = read("installer/windows/Product.wxs");
  const installerUi = read("installer/windows/InstallDirNoLicense.wxs");
  assert.match(product, /InstallDir_NoLicense/);
  assert.doesNotMatch(installerUi, /LicenseAgreementDlg/);
  assert.match(product, /Создать ярлык в меню «Пуск»/);
  assert.match(product, /Создать ярлык на рабочем столе/);
  assert.match(product, /Запустить таймер после установки/);
  assert.match(product, /Condition="WIXUI_EXITDIALOGOPTIONALCHECKBOX = 1"/);
  assert.match(workflow, /linux-installers:[\s\S]*?\.deb/);
  assert.match(workflow, /macos-installers:[\s\S]*?\.pkg/);
  assert.match(workflow, /android-apk:[\s\S]*?android-standalone\.apk/);
  assert.match(workflow, /ANDROID_KEYSTORE_BASE64/);
  const androidUpdateWorkflow = read(".github/workflows/update-android-release.yml");
  assert.match(androidUpdateWorkflow, /workflow_dispatch/);
  assert.match(androidUpdateWorkflow, /gh release upload/);
});

test("Android package is a local standalone timer and suppresses browser installation UI", () => {
  const builder = read("scripts/build-standalone-html.js");
  const index = read("index.html");
  const activity = read("android/app/src/main/java/ru/fdv/boulderingtimer/standalone/MainActivity.java");
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  assert.match(builder, /process\.argv\.includes\("--android"\)/);
  assert.match(builder, /window\.FDV_ANDROID_STANDALONE/);
  assert.match(index, /window\.FDV_ANDROID_STANDALONE === true[\s\S]*?display-mode: standalone/);
  assert.match(activity, /file:\/\/\/android_asset\/timer\.html/);
  assert.match(activity, /setUseWideViewPort\(true\)/);
  assert.match(activity, /setLoadWithOverviewMode\(false\)/);
  assert.match(index, /html\.android-standalone \.compact-actions \{\s*display: flex;/);
  assert.match(index, /html\.android-standalone footer \{\s*display: block;/);
  assert.match(index, /html\.android-standalone \.schedule \{\s*display: grid;/);
  assert.match(index, /document\.documentElement\.classList\.toggle\("android-standalone", window\.FDV_ANDROID_STANDALONE === true\)/);
  assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/);
  assert.ok(fs.existsSync(path.join(root, "android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml")));
  assert.doesNotMatch(manifest, /android\.permission\.INTERNET/);
});

test("local standalone restores never inherit a browser viewer role", () => {
  const index = read("index.html");
  assert.match(index, /const restoredPrimaryClientId = localStandalone\s*\? null/);
  assert.match(index, /isViewerClient = !localStandalone && Boolean\(state\.primaryClientId && !isPrimaryClient\)/);
});
