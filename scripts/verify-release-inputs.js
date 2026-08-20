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
  ["legacy.html", matchBuild("legacy.html", /var legacyBuildNumber = (\d+);/)],
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
  "favicon.ico",
  "help.html",
  "lib/offline-audio.js",
  "params.txt",
  "prepare-timer-mac.command",
  "serve-bouldering-timer.js",
  "sw.js",
  "scripts/build-standalone-html.js",
  "lib/client-action-transport.js",
  "lib/vendor/xlsx.mini.min.js",
  "lib/vendor/SHEETJS-LICENSE.txt",
  "lib/timer-domain.js",
  "lib/timer-transitions.js",
  "beeps",
  "fonts",
  "help-assets"
].forEach(requirePath);

if ((fs.statSync(path.join(root, "prepare-timer-mac.command")).mode & 0o111) === 0) {
  throw new Error("prepare-timer-mac.command must be executable");
}

const index = read("index.html");
if (!index.includes('<script src="lib/client-action-transport.js"></script>')) {
  throw new Error("index.html does not load lib/client-action-transport.js");
}
if (!index.includes('<script src="lib/offline-audio.js">')) {
  throw new Error("index.html does not load lib/offline-audio.js");
}
const serviceWorker = read("sw.js");
if (!serviceWorker.includes('"/standalone.html"')) {
  throw new Error("Service worker does not cache the published standalone timer");
}
if (!serviceWorker.includes('url.pathname === "/standalone.html"')
    || !serviceWorker.includes('? ["/standalone.html"]')) {
  throw new Error("Service worker does not restore the standalone timer offline");
}
if (!serviceWorker.includes('"/lib/client-action-transport.js"')) {
  throw new Error("Service worker does not cache the client action transport");
}
if (!serviceWorker.includes('"/lib/offline-audio.js"')) {
  throw new Error("Service worker does not cache the offline audio bundle");
}
if (!serviceWorker.includes('"/lib/vendor/xlsx.mini.min.js"')) {
  throw new Error("Service worker does not cache the XLSX reader");
}
if (!serviceWorker.includes('"/manifest.webmanifest"')
    || !serviceWorker.includes('"/app-icon.svg"')
    || !serviceWorker.includes('"/favicon.ico"')) {
  throw new Error("Service worker does not cache PWA manifest and icons");
}
const manifest = JSON.parse(read("manifest.webmanifest"));
if (manifest.start_url !== "./index.html" || manifest.scope !== "./") {
  throw new Error("PWA manifest must use deployment-relative start URL and scope");
}
if (!manifest.icons?.every((icon) => String(icon.src || "").startsWith("./"))) {
  throw new Error("PWA manifest icons must use deployment-relative paths");
}
const buildScript = read("scripts/build-portable-releases.sh");
if (!buildScript.includes('"$ROOT_DIR/manifest.webmanifest"')
    || !buildScript.includes('"$ROOT_DIR/app-icon.svg"')
    || !buildScript.includes('"$ROOT_DIR/favicon.ico"')) {
  throw new Error("Portable release script does not copy PWA manifest and icons");
}
const legacy = read("legacy.html");
const releaseBuild = [...uniqueBuilds][0];
if (!legacy.includes(`src="lib/start-list-display.js?v=${releaseBuild}"`)) {
  throw new Error(`legacy.html start-list display cache key does not match build ${releaseBuild}`);
}
if (!legacy.includes('href="favicon.ico"') || !legacy.includes('href="app-icon.svg"')) {
  throw new Error("Legacy page does not include ICO and SVG favicons");
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
if (!standaloneScript.includes("window.FDV_WEB_STANDALONE")) {
  throw new Error("Standalone HTML does not identify whether it is the published web build");
}
if (!standaloneScript.includes("window.FDV_ANDROID_STANDALONE")) {
  throw new Error("Standalone HTML does not identify its Android-app variant");
}
if (!standaloneScript.includes("window.FDV_XLSX_LIBRARY_SOURCE")) {
  throw new Error("Standalone build does not embed the XLSX reader");
}
const pagesWorkflow = read(".github/workflows/pages.yml");
if (!pagesWorkflow.includes('"sw.js"') || !pagesWorkflow.includes("cp sw.js _site/sw.js")) {
  throw new Error("GitHub Pages deployment does not publish the service worker");
}

console.log(`Release inputs verified for build ${[...uniqueBuilds][0]}.`);
