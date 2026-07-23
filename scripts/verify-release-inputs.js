"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function matchBuild(relativePath, expression) {
  const match = read(relativePath).match(expression);
  if (!match) throw new Error(`Build number was not found in ${relativePath}`);
  return Number(match[1]);
}

function requirePath(relativePath) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    throw new Error(`Required release input is missing: ${relativePath}`);
  }
}

const builds = new Map([
  ["index.html", matchBuild("index.html", /const pageBuildNumber = (\d+);/)],
  ["serve-bouldering-timer.js", matchBuild("serve-bouldering-timer.js", /const BUILD_NUMBER = (\d+);/)],
  ["sw.js", matchBuild("sw.js", /const BUILD_NUMBER = (\d+);/)],
  ["lib/offline-audio.js", matchBuild("lib/offline-audio.js", /"buildNumber":(\d+)/)]
]);
const uniqueBuilds = new Set(builds.values());
if (uniqueBuilds.size !== 1) {
  throw new Error(`Build numbers do not match: ${[...builds].map(([file, build]) => `${file}=${build}`).join(", ")}`);
}

[
  "LICENSE",
  "index.html",
  "legacy.html",
  "manifest.webmanifest",
  "app-icon.svg",
  "help.html",
  "lib/offline-audio.js",
  "params.txt",
  "serve-bouldering-timer.js",
  "sw.js",
  "scripts/build-standalone-html.js",
  "lib/client-action-transport.js",
  "lib/timer-domain.js",
  "lib/timer-transitions.js",
  "beeps",
  "fonts",
  "help-assets"
].forEach(requirePath);

const index = read("index.html");
if (!index.includes('<script src="lib/client-action-transport.js"></script>')) {
  throw new Error("index.html does not load lib/client-action-transport.js");
}
if (!index.includes('<script src="lib/offline-audio.js">')) {
  throw new Error("index.html does not load lib/offline-audio.js");
}
const serviceWorker = read("sw.js");
if (!serviceWorker.includes('"/lib/client-action-transport.js"')) {
  throw new Error("Service worker does not cache the client action transport");
}
if (!serviceWorker.includes('"/lib/offline-audio.js"')) {
  throw new Error("Service worker does not cache the offline audio bundle");
}
if (!serviceWorker.includes('"/manifest.webmanifest"') || !serviceWorker.includes('"/app-icon.svg"')) {
  throw new Error("Service worker does not cache PWA manifest and icon");
}
const manifest = JSON.parse(read("manifest.webmanifest"));
if (manifest.start_url !== "./index.html" || manifest.scope !== "./") {
  throw new Error("PWA manifest must use deployment-relative start URL and scope");
}
if (!manifest.icons?.every((icon) => String(icon.src || "").startsWith("./"))) {
  throw new Error("PWA manifest icons must use deployment-relative paths");
}
const buildScript = read("scripts/build-portable-releases.sh");
if (!buildScript.includes('"$ROOT_DIR/manifest.webmanifest"') || !buildScript.includes('"$ROOT_DIR/app-icon.svg"')) {
  throw new Error("Portable release script does not copy PWA manifest and icon");
}
if (!buildScript.includes('cp -R "$ROOT_DIR/lib" "$target/"')) {
  throw new Error("Portable release script does not copy lib/");
}
if (!buildScript.includes('build-standalone-html.js')) {
  throw new Error("Portable release script does not build standalone HTML");
}
if (!buildScript.includes('fdv-bouldering-timer-standalone.html')) {
  throw new Error("Portable release script does not copy standalone HTML into packages");
}
if (!buildScript.includes("*.zip *.tar.gz *.html")) {
  throw new Error("Portable release script does not include standalone HTML in checksums");
}
const standaloneScript = read("scripts/build-standalone-html.js");
if (!standaloneScript.includes("manifest.start_url = window.location.href")) {
  throw new Error("Standalone HTML does not derive its start URL from the deployed page URL");
}
if (!standaloneScript.includes("window.FDV_SINGLE_FILE_STANDALONE = true")) {
  throw new Error("Standalone HTML does not identify itself as a single-file build");
}

console.log(`Release inputs verified for build ${[...uniqueBuilds][0]}.`);
