"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const index = fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");

function inlineFunction(name) {
  const match = index.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}`));
  assert.ok(match, `${name} must exist in index.html`);
  return vm.runInNewContext(`(${match[0]})`);
}

test("display rendering targets synchronized second boundaries without an animation-frame loop", () => {
  assert.doesNotMatch(index, /requestAnimationFrame\(tick\)/);
  assert.doesNotMatch(index, /requestAnimationFrame\(criticalTick\)/);
  assert.match(index, /const renderIdleIntervalMs = 1000;/);
  assert.match(index, /const renderRunningIntervalMs = 250;/);
  assert.match(index, /const displayBoundaryGuardMs = 8;/);
  assert.match(index, /function nextSecondBoundaryServerTime\(currentServerTime, endServerTime\)/);
  assert.match(index, /const displayedSeconds = Math\.ceil\(remainingMs \/ 1000\);/);
  assert.match(index, /\(targetServerTime - serverNow\(\)\) \/ clockRate/);
  assert.match(index, /scheduleDisplayBoundary\(true\);/);
  assert.match(index, /window\.setTimeout\(tick, interval\);/);
});

test("second-boundary calculation targets the exact next displayed value", () => {
  const nextBoundary = inlineFunction("nextSecondBoundaryServerTime");
  assert.equal(nextBoundary(100000, 153742), 100742);
  assert.equal(nextBoundary(100000, 153000), 101000);
  assert.equal(nextBoundary(152999.5, 153000), 153000);
  assert.equal(nextBoundary(153001, 153000), null);
});

test("schedule markup is replaced only when its content changes", () => {
  assert.match(index, /if \(scheduleStateKey === lastScheduleStateKey\) return;/);
  assert.match(index, /if \(markup === lastScheduleMarkup\) return;/);
  assert.match(index, /lastScheduleMarkup = markup;\s*els\.schedule\.innerHTML = markup;/);
});

test("progress animation stays on the compositor and is updated at a lower rate", () => {
  assert.match(index, /const progressUpdateIntervalMs = 250;/);
  assert.match(index, /transform: scaleX\(0\);/);
  assert.match(index, /transition: transform \.25s linear;/);
  assert.match(index, /els\.progressBar\.style\.transform = `scaleX\(\$\{scale\}\)`;/);
  assert.doesNotMatch(index, /els\.progressBar\.style\.width =/);
});

test("static runtime metadata is cached separately from timer digits", () => {
  assert.match(index, /if \(runtimeMetaKey !== lastRuntimeMetaKey\)/);
  assert.match(index, /setDisplayTime\(remaining\);\s*const runtimeMetaKey/);
  assert.match(index, /setProgressWidth\(donePercent, progressSegmentChanged \|\| isScrubbing\);/);
});

test("desktop audio calibration scrolls its editor into view", () => {
  assert.match(index, /const interactive = \/\\sdata-\(\?:audio-client\|legacy-mode-client\)=\//);
  assert.match(index, /const tagName = interactive \? "button" : "span";/);
  assert.match(index, /toggleNow - lastAudioChipToggleAt < 300/);
  assert.match(index, /function revealAudioOffsetEditor\(\)/);
  assert.match(index, /editor\.scrollIntoView\(\{ block: "nearest", inline: "nearest" \}\);/);
  assert.match(index, /renderBrowserList\(lastKnownClients\);\s*revealAudioOffsetEditor\(\);/);
});

test("audio unlock does not replace a diagnostic button during pointerdown", () => {
  assert.match(index, /async function unlockAudio\(refreshDiagnostics = true\)/);
  assert.match(index, /unlockAudio\(eventName === "click"\);/);
});

test("timer fitting avoids a resize feedback loop and repeated binary-search layouts", () => {
  assert.doesNotMatch(index, /for \(let i = 0; i < 13; i \+= 1\)/);
  assert.match(index, /const scale = Math\.min\(maxWidth \/ timeRect\.width, maxHeight \/ timeRect\.height\);/);
  assert.match(index, /if \(minuteDigitsChanged\) scheduleFitTimer\(\);/);
  assert.match(index, /Math\.abs\(entry\.contentRect\.width - lastTimerFitContainerWidth\) > 2/);
  assert.match(index, /window\.addEventListener\("orientationchange", scheduleOrientationFits\);/);
});

test("a delayed boundary callback renders current server time and rearms itself", () => {
  assert.match(index, /displayBoundaryTimer = window\.setTimeout\(\(\) => \{/);
  assert.match(index, /checkClockContinuity\(\);\s*render\(\);/);
  assert.match(index, /function render\(\) \{\s*lastRenderAt = performance\.now\(\);\s*scheduleDisplayBoundary\(\);/);
});

test("timer time remains derived from the synchronized server clock", () => {
  assert.match(index, /return Math\.max\(0, \(serverNow\(\) - state\.serverStartedAt\) \/ 1000\);/);
  assert.match(index, /source\.start\(start\);/);
});

test("a suspended performance clock is repaired without replacing the server clock", () => {
  assert.match(index, /const clockContinuityMismatchMs = 100;/);
  assert.match(index, /const trustedClockAnchorIntervalMs = 60000;/);
  assert.match(index, /perfNow - trustedServerClockAnchor\.perfAt/);
  assert.match(index, /trustedServerClockAnchor\.serverAt \+ trustedWallDelta/);
  assert.match(index, /applyServerClockModel\(estimatedServerTime, serverClockRate, true\);/);
  assert.match(index, /\(Number\.isFinite\(savedServerNow\) \? savedServerNow : savedAtWall\)\s*\+ age;/);
  assert.doesNotMatch(index, /age \* restoredRate/);
  assert.match(index, /syncSamples = \[\];\s*resetServerClockRateConfirmation\(\);/);
  assert.match(index, /if \(resetStaleSignals && !synchronized && state\.running && !state\.countdownOnly\)/);
});

test("iOS audio falls back when its decoded-buffer context is not running", () => {
  assert.match(index, /if \(audioContext\.state !== "running" && audioContext\.state !== "closed"\)/);
  assert.match(index, /if \(!canPlaySound\(\) \|\| !audioContext \|\| audioContext\.state !== "running"\) return false;/);
  assert.doesNotMatch(index, /if \(audioUnlocked\) return;/);
});

test("standalone iOS reuses gesture-authorized HTML audio for every manual start", () => {
  assert.match(index, /const iosAudioWorkaroundEnabled = \/iPad\|iPhone\|iPod\/i/);
  assert.match(index, /function playImmediateGestureAudio\(kind\)/);
  assert.match(index, /standaloneMode && iosAudioWorkaroundEnabled && playImmediateGestureAudio\("start"\)/);
  assert.match(index, /unlockSource\.buffer = audioContext\.createBuffer\(1, 1, 22050\);/);
});

test("all standalone iOS signals keep the authorized media element and server scheduler", () => {
  assert.match(index, /immediateGestureAudio\.src = source;\s*immediateGestureAudioSource = source;/);
  assert.match(index, /standaloneMode && iosAudioWorkaroundEnabled && audioKinds\.includes\(kind\) && delaySeconds === 0/);
  assert.match(index, /if \(standaloneMode && iosAudioWorkaroundEnabled\) return false;\s*if \(scheduledByBuffer/);
  assert.match(index, /scheduleServerTimeoutAt\(targetServerTime, \(\) => beep\(kind\)/);
});

test("a short mobile sleep cannot leave rendering permanently frozen", () => {
  assert.match(index, /function markResumeDisplayStale\(\) \{[\s\S]*?beginResumeSnapPending\(\);/);
  assert.match(index, /if \(!resetStaleSignals && resumeSnapPending\) clearResumeSnapPending\(false\);/);
  assert.doesNotMatch(index, /!resetStaleSignals && \(resumeSyncInProgress \|\| resumeSnapPending\)/);
});
