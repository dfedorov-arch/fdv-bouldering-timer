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
  ["offline-audio.js", matchBuild("offline-audio.js", /"buildNumber":(\d+)/)]
]);
const uniqueBuilds = new Set(builds.values());
if (uniqueBuilds.size !== 1) {
  throw new Error(`Build numbers do not match: ${[...builds].map(([file, build]) => `${file}=${build}`).join(", ")}`);
}

[
  "LICENSE",
  "index.html",
  "legacy.html",
  "help.html",
  "offline-audio.js",
  "params.txt",
  "serve-bouldering-timer.js",
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
const serviceWorker = read("sw.js");
if (!serviceWorker.includes('"/lib/client-action-transport.js"')) {
  throw new Error("Service worker does not cache the client action transport");
}
const buildScript = read("scripts/build-portable-releases.sh");
if (!buildScript.includes('cp -R "$ROOT_DIR/lib" "$target/"')) {
  throw new Error("Portable release script does not copy lib/");
}

console.log(`Release inputs verified for build ${[...uniqueBuilds][0]}.`);
