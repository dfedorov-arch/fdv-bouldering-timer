"use strict";

// Deliberately a separate, short-lived process. Never imported by the server.
// Node 12 compatible, including its TLS stack on legacy Windows.
const https = require("https");
const fs = require("fs");
const path = require("path");
const REPO = "https://api.github.com/repos/dfedorov-arch/fdv-bouldering-timer";
const PAGE = "https://github.com/dfedorov-arch/fdv-bouldering-timer/releases/latest";

function version(value) {
  const m = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value || "");
  return m ? m.slice(1).map(Number) : null;
}

function newer(local, remote, localBuild, remoteBuild) {
  const a = version(local), b = version(remote);
  if (!b) throw Error("Invalid release version");
  if (a && (a[0] !== 0 || a[1] !== 0)) {
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return b[i] > a[i];
    return false;
  }
  // Source/CI/develop builds must never be offered an older stable build.
  if (!Number.isSafeInteger(localBuild) || !Number.isSafeInteger(remoteBuild) || remoteBuild < 1)
    throw Error("Missing build metadata");
  return remoteBuild > localBuild;
}

function getJson(url, budget, redirects) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    if (target.protocol !== "https:" || target.username || target.password) return reject(Error("HTTPS required"));
    const remaining = budget - Date.now();
    if (remaining <= 0) return reject(Error("Deadline"));
    const request = https.get(target, { headers: {
      "User-Agent": "FDV-Bouldering-Timer-update-check", "Accept": "application/json"
    } }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && redirects > 0 && response.headers.location) {
        response.resume();
        resolve(getJson(new URL(response.headers.location, target).href, budget, redirects - 1));
        return;
      }
      if (response.statusCode !== 200) { response.resume(); reject(Error("HTTP status")); return; }
      let size = 0, chunks = [];
      response.on("data", chunk => {
        size += chunk.length;
        if (size > 262144) { response.destroy(); reject(Error("Response too large")); }
        else chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch (error) { reject(error); }
      });
    });
    const timer = setTimeout(() => request.destroy(Error("Deadline")), remaining);
    request.on("close", () => clearTimeout(timer));
    request.on("error", reject);
  });
}

async function check(root, fetchJson = getJson) {
  const deadline = Date.now() + 7000;
  const release = await fetchJson(REPO + "/releases/latest", deadline, 0);
  if (release.draft !== false || release.prerelease !== false || !version(release.tag_name)) throw Error("Not stable");
  let local = "";
  try { local = fs.readFileSync(path.join(root, "release-version.txt"), "utf8").trim(); } catch (_) { }
  const source = fs.readFileSync(path.join(root, "serve-bouldering-timer.js"), "utf8");
  const match = /\b(?:const|var|let) BUILD_NUMBER = (\d+);/.exec(source);
  const build = match ? Number(match[1]) : NaN;
  let remoteBuild = NaN;
  if (!version(local) || /^v?0\.0\./.test(local)) {
    const asset = (release.assets || []).find(a => a.name === "update-info.json");
    const expected = "https://github.com/dfedorov-arch/fdv-bouldering-timer/releases/download/" + release.tag_name + "/update-info.json";
    if (!asset || asset.browser_download_url !== expected) throw Error("Missing release metadata");
    const info = await fetchJson(expected, deadline, 3);
    if (info.version !== release.tag_name) throw Error("Mismatched release metadata");
    remoteBuild = info.buildNumber;
  }
  return newer(local, release.tag_name, build, remoteBuild) ? "available|" + release.tag_name : "current";
}

if (require.main === module) {
  // Absolute deadline also covers DNS, redirect chains and a stalled stream.
  const deadline = setTimeout(() => { process.stdout.write("unavailable\n"); process.exit(0); }, 8000);
  check(path.resolve(__dirname, "..")).then(result => {
    clearTimeout(deadline); process.stdout.write(result + "\n"); process.exit(0);
  }, () => { clearTimeout(deadline); process.stdout.write("unavailable\n"); process.exit(0); });
}
module.exports = { check, newer, version, PAGE };
