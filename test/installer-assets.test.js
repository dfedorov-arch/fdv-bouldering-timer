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
  assert.match(workflow, /linux-installers:[\s\S]*?\.deb/);
  assert.match(workflow, /macos-installers:[\s\S]*?\.pkg/);
  assert.match(workflow, /android-apk:[\s\S]*?android-standalone\.apk/);
  assert.match(workflow, /ANDROID_KEYSTORE_BASE64/);
});

test("Android package is a local standalone timer and suppresses browser installation UI", () => {
  const builder = read("scripts/build-standalone-html.js");
  const index = read("index.html");
  const activity = read("android/app/src/main/java/ru/fdv/boulderingtimer/standalone/MainActivity.java");
  assert.match(builder, /process\.argv\.includes\("--android"\)/);
  assert.match(builder, /window\.FDV_ANDROID_STANDALONE/);
  assert.match(index, /window\.FDV_ANDROID_STANDALONE === true[\s\S]*?display-mode: standalone/);
  assert.match(activity, /file:\/\/\/android_asset\/timer\.html/);
  assert.doesNotMatch(read("android/app/src/main/AndroidManifest.xml"), /android\.permission\.INTERNET/);
});
