"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const index = fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");

test("display rendering uses an adaptive timer instead of every animation frame", () => {
  assert.doesNotMatch(index, /requestAnimationFrame\(tick\)/);
  assert.match(index, /const renderIdleIntervalMs = 1000;/);
  assert.match(index, /const renderRunningIntervalMs = 100;/);
  assert.match(index, /const renderCriticalIntervalMs = 50;/);
  assert.match(index, /window\.setTimeout\(tick, interval\);/);
});

test("schedule markup is replaced only when its content changes", () => {
  assert.match(index, /if \(markup === lastScheduleMarkup\) return;/);
  assert.match(index, /lastScheduleMarkup = markup;\s*els\.schedule\.innerHTML = markup;/);
});

test("timer fitting avoids a resize feedback loop and repeated binary-search layouts", () => {
  assert.doesNotMatch(index, /for \(let i = 0; i < 13; i \+= 1\)/);
  assert.match(index, /const scale = Math\.min\(maxWidth \/ timeRect\.width, maxHeight \/ timeRect\.height\);/);
  assert.match(index, /if \(minuteDigitsChanged\) scheduleFitTimer\(\);/);
  assert.match(index, /Math\.abs\(entry\.contentRect\.width - lastTimerFitContainerWidth\) > 2/);
  assert.match(index, /window\.addEventListener\("orientationchange", scheduleOrientationFits\);/);
});

test("critical visual updates use animation frames without rendering every display frame", () => {
  assert.match(index, /requestAnimationFrame\(criticalTick\);/);
  assert.match(index, /frameTime - lastCriticalRenderAt >= renderCriticalIntervalMs - 1/);
  assert.match(index, /if \(interval !== renderCriticalIntervalMs\)/);
});

test("timer time remains derived from the synchronized server clock", () => {
  assert.match(index, /return Math\.max\(0, \(serverNow\(\) - state\.serverStartedAt\) \/ 1000\);/);
  assert.match(index, /source\.start\(start\);/);
});
