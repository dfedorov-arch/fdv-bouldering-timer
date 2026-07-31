const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const legacy = fs.readFileSync(path.join(root, "legacy.html"), "utf8");
const server = fs.readFileSync(path.join(root, "serve-bouldering-timer.js"), "utf8");

function inlineScripts(html) {
  return Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g), (match) => match[1]);
}

test("modern inline scripts remain syntactically valid", () => {
  for (const script of inlineScripts(index)) new Function(script);
});

test("modern performance diagnostics are opt-in and preserve critical render ordering", () => {
  assert.match(index, /performanceDiagnosticsEnabled = new URLSearchParams\(window\.location\.search\)\.get\("perf"\) === "1"/);
  assert.match(index, /window\.FDVPerformanceDiagnostics = \{[\s\S]*?snapshot: performanceSnapshot,[\s\S]*?reset: resetPerformanceDiagnostics/);
  assert.match(index, /if \(performanceDiagnosticsEnabled\) \{[\s\S]*?eventLoopLagSamples[\s\S]*?\}, 1000\);/);
  assert.match(index, /function render\(\) \{\s*lastRenderAt = performance\.now\(\);\s*scheduleDisplayBoundary\(\);/);
  assert.match(index, /function renderStartList\(\) \{\s*loadStoredStartListScrollPositions\(\);\s*updateStartListVisibility\(\);/);
  assert.match(index, /performanceCount\("offlineSnapshotWrites"\)/);
  assert.match(index, /performanceCount\("startListTableRebuilds"\)/);
});

test("Legacy diagnostics remain explicitly enabled and ES5-compatible", () => {
  assert.match(legacy, /performanceDiagnosticsEnabled = queryValue\("perf"\) === "1"/);
  assert.match(legacy, /window\.FDVLegacyPerformanceDiagnostics = \{/);
  assert.match(legacy, /if \(performanceDiagnosticsEnabled\) \{[\s\S]*?window\.setInterval\(updatePerformanceOverlay, 5000\);/);
  assert.doesNotMatch(legacy, /\b(?:const|let)\b|=>|\?\.|\?\?/);
});

test("server diagnostics require an explicit startup flag", () => {
  assert.match(server, /process\.argv\.includes\("--performance-diagnostics"\)/);
  assert.match(server, /process\.env\.FDV_PERFORMANCE_DIAGNOSTICS === "1"/);
  assert.match(server, /requestUrl\.pathname === "\/api\/performance"[\s\S]*?Performance diagnostics are disabled/);
  assert.match(server, /if \(performanceDiagnosticsEnabled\) \{[\s\S]*?eventLoopLagSamples/);
  assert.match(server, /performanceCount\("startListSanitizations"\)/);
  assert.match(server, /performanceCount\("sseStateBytes"/);
});
