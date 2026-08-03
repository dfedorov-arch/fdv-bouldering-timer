const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const legacy = fs.readFileSync(path.join(root, "legacy.html"), "utf8");
const server = fs.readFileSync(path.join(root, "serve-bouldering-timer.js"), "utf8");
const params = fs.readFileSync(path.join(root, "params.txt"), "utf8");
const help = fs.readFileSync(path.join(root, "help.html"), "utf8");

function inlineScripts(html) {
  return Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g), (match) => match[1]);
}

function inlineFunction(html, name) {
  const match = html.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}`));
  assert.ok(match, `${name} must exist`);
  return new Function(`return (${match[0]})`)();
}

test("modern inline scripts remain syntactically valid", () => {
  for (const script of inlineScripts(index)) new Function(script);
});

test("modern performance diagnostics are opt-in and preserve critical render ordering", () => {
  assert.match(index, /performanceDiagnosticsValue = new URLSearchParams\(window\.location\.search\)\.get\("perf"\)/);
  assert.match(index, /performanceDiagnosticsLevel = performanceDiagnosticsValue === "4" \? 4 : performanceDiagnosticsValue === "3" \? 3 : performanceDiagnosticsValue === "2" \? 2 : performanceDiagnosticsValue === "1" \? 1 : 0/);
  assert.match(index, /performanceDiagnosticsEnabled = performanceDiagnosticsLevel > 0/);
  assert.match(index, /performanceSoundForced = performanceDiagnosticsLevel >= 2/);
  assert.match(index, /performanceLongRunDiagnostics = performanceDiagnosticsLevel >= 3/);
  assert.match(index, /performanceAudioKeepaliveExperiment = performanceDiagnosticsLevel === 4/);
  assert.match(index, /performanceAggregateDiagnostics = performanceDiagnosticsEnabled && !performanceLongRunDiagnostics/);
  assert.match(index, /window\.FDVPerformanceDiagnostics = \{[\s\S]*?snapshot: performanceSnapshot,[\s\S]*?reset: resetPerformanceDiagnostics/);
  assert.match(index, /if \(performanceDiagnosticsEnabled\) \{[\s\S]*?if \(!performanceLongRunDiagnostics\) \{[\s\S]*?eventLoopLagSamples[\s\S]*?\}, 1000\);/);
  assert.match(index, /const reportPerformanceSnapshot = \(\) => \{\s*console\.info\(`FDV_PERFORMANCE_SNAPSHOT/);
  assert.match(index, /if \(!performanceLongRunDiagnostics\) \{[\s\S]*?reportPerformanceSnapshot\(\);[\s\S]*?window\.setInterval\(reportPerformanceSnapshot, 5000\)/);
  assert.match(index, /identity:\s*\{[\s\S]*?mode:\s*"modern"[\s\S]*?clock:\s*\{[\s\S]*?serverInstanceId:\s*lastServerInstanceId/);
  assert.match(index, /audioUserOffsetMs:\s*event\.audioUserOffsetMs \?\? null/);
  assert.match(index, /nextSignalTargetServerTimeMs:\s*event\.nextSignalTargetServerTimeMs \?\? null[\s\S]*?scheduledStopServerTimeMs:\s*event\.scheduledStopServerTimeMs \?\? null[\s\S]*?scheduledDurationMs:\s*event\.scheduledDurationMs \?\? null/);
  assert.match(index, /function performanceAudioTargetDetails\([^)]*explicitDetails[^)]*\)[\s\S]*?canonicalTargetServerTimeMs[\s\S]*?audioUserOffsetMs/);
  assert.match(index, /function canPlaySound\(\) \{\s*if \(performanceSoundForced\) return true;/);
  assert.match(index, /function performanceAudioTarget\(signalKey\)[\s\S]*?if \(!normalizedSignalKey\) return null;[\s\S]*?if \(!targetText\) return null;/);
  assert.match(index, /function shouldUseManualStartAudioLead\(\)[\s\S]*?if \(performanceSoundForced\) return true;/);
  assert.match(index, /forcedByDiagnostics:\s*performanceSoundForced/);
  assert.match(index, /scheduleEvents:\s*performanceAudioScheduleEvents\.slice\(\)/);
  assert.match(index, /stage:\s*"plan"[\s\S]*?canonicalTargetServerTimeMs:[\s\S]*?leadMs:/);
  assert.match(index, /stage:\s*"node"[\s\S]*?estimatedServerStartMs:[\s\S]*?targetErrorMs:/);
  assert.match(index, /stage:\s*"fallback"[\s\S]*?actualServerTimeMs:[\s\S]*?latenessMs:[\s\S]*?bufferAttemptCount,[\s\S]*?bufferLastFailure/);
  assert.match(index, /function shouldLogPerformanceAudioSchedule\(event\)[\s\S]*?performanceDiagnosticsLevel < 2[\s\S]*?event\.stage === "offset"[\s\S]*?event\.stage === "cancelled"[\s\S]*?event\.stage === "expired"[\s\S]*?startsWith\("rotationBoundary:"\)[\s\S]*?event\.kind === "warn"/);
  assert.match(index, /function recordPerformanceAudioSchedule\(event\)[\s\S]*?const normalizedEvent[\s\S]*?queuePerformanceAudioSchedule\(normalizedEvent\)/);
  assert.match(index, /performanceConsoleQueue\.push\(\{ prefix, payload \}\)[\s\S]*?window\.setTimeout[\s\S]*?JSON\.stringify\(item\.payload\)/);
  assert.match(index, /FDV_AUDIO_SCHEDULE/);
  assert.match(index, /FDV_TRANSITION/);
  assert.match(index, /FDV_SERVER_INSTANCE/);
  assert.match(index, /function recordPerformanceRenderedPhase\(segment, event\)[\s\S]*?previousPhaseKey === phaseKey[\s\S]*?queuePerformanceTransition/);
  assert.match(index, /canonicalTargetServerTimeMs:\s*event\.canonicalTargetServerTimeMs \?\? event\.targetServerTimeMs/);
  assert.match(index, /renderSource:\s*event\.renderSource \|\| "unknown"/);
  assert.match(index, /longRun:\s*performanceLongRunDiagnostics/);
  assert.match(index, /const performanceDisplayBoundaryEventLimit = 16;/);
  assert.match(index, /display:\s*\{[\s\S]*?visibilityState:[\s\S]*?boundaryEvents:\s*performanceDisplayBoundaryEvents\.slice\(\)/);
  assert.match(index, /checkClockContinuity\(\);[\s\S]*?lastRenderDelayMs = Number\(\(callbackServerTime - targetServerTime\)\.toFixed\(1\)\);[\s\S]*?if \(!performanceAggregateDiagnostics\) \{\s*render\("boundary"\);\s*return;\s*\}[\s\S]*?targetServerTimeMs:[\s\S]*?callbackLatenessMs:[\s\S]*?commitLatenessMs:/);
  assert.match(index, /displayBoundaryLate100ms[\s\S]*?displayBoundaryLate500ms[\s\S]*?displayBoundaryLate1000ms/);
  assert.match(index, /function render\(renderSource = "direct"\)[\s\S]*?lastRenderAt = performance\.now\(\);\s*scheduleDisplayBoundary\(\);/);
  assert.match(index, /function renderStartList\(\) \{\s*loadStoredStartListScrollPositions\(\);\s*updateStartListVisibility\(\);/);
  assert.match(index, /performanceCount\("offlineSnapshotWrites"\)/);
  assert.match(index, /performanceCount\("startListTableRebuilds"\)/);
});

test("modern diagnostics can be downloaded on a phone and retain audio-clock evidence", () => {
  assert.match(index, /id="performanceExportBtn"[^>]*hidden>Скачать лог<\/button>/);
  assert.match(index, /if \(performanceDiagnosticsEnabled\) \{[\s\S]*?performanceExportBtn\.hidden = false;[\s\S]*?addEventListener\("click", downloadPerformanceDiagnostics\)/);
  assert.match(index, /const performanceMobileRecordLimit = 4000;/);
  assert.match(index, /function queuePerformanceConsoleRecord\(prefix, payload\)[\s\S]*?retainPerformanceMobileRecord\(prefix, payload\)[\s\S]*?performanceConsoleQueue\.push/);
  assert.match(index, /function downloadPerformanceDiagnostics\(\)[\s\S]*?FDV_MOBILE_EXPORT[\s\S]*?performanceMobileRecords\.map[\s\S]*?FDV_PERFORMANCE_SNAPSHOT[\s\S]*?new Blob[\s\S]*?link\.download/);
  assert.match(index, /link\.download = `\$\{host\}-\$\{Date\.now\(\)\}\.txt`/);
  assert.match(index, /window\.FDVPerformanceDiagnostics = \{[\s\S]*?download:\s*downloadPerformanceDiagnostics/);
  assert.match(index, /function performanceAudioClockSample\(\)[\s\S]*?getOutputTimestamp[\s\S]*?audioClockOffsetFromPerformanceMs[\s\S]*?audioOutputTimestampAgeMs[\s\S]*?audioOutputContextLagMs/);
  assert.match(index, /function sampleAudioNodeTiming\(item\)[\s\S]*?callbackLatenessMs = callbackServerTimeMs - targetServerTimeMs[\s\S]*?expectedAudioContextTimeMs = scheduledAudioContextTimeMs \+ callbackLatenessMs[\s\S]*?audioContextProgressErrorMs/);
  assert.match(index, /function recordPerformanceAudioNodeTarget\(item, timingSample\)[\s\S]*?stage:\s*"node-target-check"[\s\S]*?audioContextProgressErrorMs/);
  assert.match(index, /FDV_AUDIO_SCHEDULE[\s\S]*?audioContextState:[\s\S]*?\.\.\.performanceAudioClockSample\(\)/);
  assert.equal((index.match(/const timingSample = sampleAudioNodeTiming\(item\);/g) || []).length, 2);
  assert.equal((index.match(/if \(performanceDiagnosticsLevel >= 2\) recordPerformanceAudioNodeTarget\(item, timingSample\);/g) || []).length, 2);
  assert.match(index, /function wakeAudioOutput\([^)]*\)[\s\S]*?prewarm-request[\s\S]*?resume-request[\s\S]*?resume-resolved[\s\S]*?prewarm-direct/);
  assert.match(index, /function scheduleFinalWarnings\(segment\)[\s\S]*?warning-batch-plan[\s\S]*?cycle:\s*segment\.cycle[\s\S]*?phase:\s*segment\.type/);
});

test("sparse diagnostics trace every technical audio prewarm to a terminal outcome", () => {
  assert.match(index, /const performancePendingPrewarmPlans = new Map\(\);/);
  assert.match(index, /function performancePrewarmPlanKey\([^)]*\)[\s\S]*?if \(!performanceLongRunDiagnostics/);
  assert.match(index, /function recordPerformancePrewarmLifecycle\([^)]*\)[\s\S]*?recordPerformanceAudioClock\(stage/);
  assert.match(index, /function scheduleSignalAt\([^)]*\)[\s\S]*?recordPerformancePrewarmLifecycle\("prewarm-plan", plan\)[\s\S]*?return;/);
  assert.match(index, /scheduleServerTimeoutAt\(soundTargetServerTime,[\s\S]*?wakeAudioOutput\(kind\);\s*finishPerformancePrewarmPlan\(planKey, "prewarm-fire"/);
  assert.match(index, /onStale:\s*\(\) => \{[\s\S]*?finishPerformancePrewarmPlan\(planKey, "prewarm-stale"[\s\S]*?scheduler-window-missed/);
  assert.match(index, /function finalizeClearedPerformancePrewarmPlans\([^)]*\)[\s\S]*?"prewarm-cancelled"[\s\S]*?cancellationReason/);
  assert.match(index, /function clearSignalTimers\([^)]*\) \{[\s\S]*?finalizeClearedPerformanceAudioPlans\(preserveTransition\);\s*finalizeClearedPerformancePrewarmPlans\([\s\S]*?signalTimers\.forEach/);
  assert.match(index, /pendingPrewarmPlans:\s*performancePendingPrewarmPlans\.size/);
});

test("params can mute technical warm-up tones without disabling silent audio preparation", () => {
  assert.match(params, /flashing=true\r?\nno_sound_warm=false\r?\n/);
  assert.match(server, /noSoundWarm:\s*false/);
  assert.match(server, /noSoundWarm:\s*boolParam\(params, "no_sound_warm", defaultConfig\.noSoundWarm\)/);
  assert.match(index, /let noSoundWarm = false;/);
  assert.match(index, /noSoundWarm = config\.noSoundWarm === true;\s*if \(startupConfigApplied\) return;/);
  assert.match(index, /function playSoundWarmTone\(kind\) \{\s*if \(noSoundWarm && \(kind === "warm" \|\| kind === "prewarm"\)\)[\s\S]*?recordPerformanceAudioClock\("prewarm-muted", \{ kind \}\)[\s\S]*?return beep\(kind\)/);
  assert.equal((index.match(/playSoundWarmTone\(kind\);/g) || []).length, 2);
  assert.match(index, /forcedByDiagnostics:\s*performanceSoundForced,\s*noSoundWarm,/);
  assert.match(help, /<code>no_sound_warm<\/code><\/td><td>Отключить тихие технические тоны прогрева/);
  assert.match(help, /<code>no_sound_warm<\/code><\/td><td>Disable quiet technical warm-up tones/);
});

test("perf=4 isolates the Android audio-clock keepalive experiment from normal operation", () => {
  assert.match(index, /const performanceAudioKeepaliveLeadSeconds = 10;/);
  assert.match(index, /const performanceAudioKeepaliveGain = 0\.00005;/);
  assert.match(index, /function startPerformanceAudioKeepalive\(segment, boundaryServerTimeMs, desiredStartServerTimeMs\)[\s\S]*?if \(!performanceAudioKeepaliveExperiment \|\| !canPlaySound\(\) \|\| !state\.running\) return;/);
  assert.match(index, /createOscillator\(\)[\s\S]*?gain\.gain\.setValueAtTime\(performanceAudioKeepaliveGain, start\)[\s\S]*?oscillator\.stop\(start \+ durationSeconds\)/);
  assert.match(index, /recordPerformanceAudioClock\("keepalive-start"[\s\S]*?startLatenessMs:[\s\S]*?scheduledDurationMs:/);
  assert.match(index, /recordPerformanceAudioClock\("keepalive-end"[\s\S]*?boundaryLatenessMs:/);
  assert.match(index, /function schedulePerformanceAudioKeepalive\(segment\)[\s\S]*?Math\.max\(segment\.start, segment\.end - performanceAudioKeepaliveLeadSeconds\)[\s\S]*?scheduleSegmentTimeoutAt/);
  assert.match(index, /function scheduleSegmentSignals\(segment, remaining, duration, includePhase = true\) \{[\s\S]*?if \(document\.hidden\)[\s\S]*?clearSignalTimers\(true\);\s*if \(!state\.running\) return;\s*schedulePerformanceAudioKeepalive\(segment\);/);
  assert.match(index, /function clearSignalTimers\([^)]*\) \{[\s\S]*?performanceAudioKeepaliveExperiment && \(!preserveTransition \|\| forceStopAudio\)[\s\S]*?stopPerformanceAudioKeepalive/);
  assert.match(index, /audioKeepaliveExperiment:\s*performanceAudioKeepaliveExperiment/);
});

test("server restart diagnostics expose timer continuity before sparse logging resumes", () => {
  assert.match(index, /function reconcileServerStateIdentity\(remote\)[\s\S]*?identity\.serverRestarted[\s\S]*?previousStartedAtMs:[\s\S]*?previousElapsedMs,[\s\S]*?previousPhaseKey:/);
  assert.match(index, /function recordPerformanceServerInstanceChange\(remote\)[\s\S]*?timelineShiftMs[\s\S]*?elapsedDiscontinuityMs:/);
  assert.match(index, /function recordPerformanceServerInstanceChange\(remote\)[\s\S]*?queuePerformanceServerInstanceChange\(\{/);
  assert.match(index, /render\("state-update"\);\s*recordPerformanceServerInstanceChange\(remote\);\s*if \(!isScrubbing\) saveOfflineSnapshot\(\);/);
});

test("modern offline snapshots skip unchanged payloads but retain a safety checkpoint", () => {
  const writeReason = inlineFunction(index, "offlineSnapshotWriteReason");
  assert.equal(writeReason("a", "", 1000, 0, 5000), "changed");
  assert.equal(writeReason("b", "a", 2000, 1000, 5000), "changed");
  assert.equal(writeReason("a", "a", 4999, 1000, 5000), "");
  assert.equal(writeReason("a", "a", 6000, 1000, 5000), "safety");
  assert.equal(writeReason("a", "a", 900, 1000, 5000), "safety");

  const keyFunction = index.match(/function offlineSnapshotContentKey\([^)]*\) \{[\s\S]*?\n    \}/)?.[0] || "";
  assert.match(keyFunction, /startListDataRevision/);
  assert.match(keyFunction, /serverStateIdentity:\s*standaloneMode \? "" : `\$\{lastServerInstanceId\}:\$\{lastServerVersion\}`/);
  assert.match(keyFunction, /serverStartedAt:\s*standaloneMode \? state\.serverStartedAt : null/);
  assert.doesNotMatch(keyFunction, /startLists:\s*state\.startLists/);
  assert.doesNotMatch(keyFunction, /savedAtWall|serverNow\(\)|serverClockRate/);
  assert.match(index, /const offlineSnapshotSafetyIntervalMs = 5000;/);
  assert.match(index, /offlineSnapshotSkipsUnchanged/);
  assert.match(index, /offlineSnapshotChangedWrites/);
  assert.match(index, /offlineSnapshotSafetyWrites/);
  assert.match(index, /lastOfflineSnapshotContentKey = offlineSnapshotContentKey\(localStandalone\)[\s\S]*?lastOfflineSnapshotSavedAt = savedAtWall/);
  assert.match(index, /scheduleOfflineSnapshotSafetyWrite\(\);/);
  assert.doesNotMatch(index, /setInterval\(saveOfflineSnapshot, 2000\)/);
});

test("sparse diagnostics log the actual rendered phase commit against its canonical target", () => {
  assert.match(index, /performanceLastRenderedPhaseKey !== segmentKey[\s\S]*?serverTimeForElapsed\(segment\.start\)[\s\S]*?recordPerformanceRenderedPhase/);
  assert.match(index, /callbackLatenessMs:\s*Number\(\(transitionRenderStartedServerTime - transitionTargetServerTime\)/);
  assert.match(index, /commitLatenessMs:\s*Number\(\(transitionRenderCompletedServerTime - transitionTargetServerTime\)/);
  assert.match(index, /render\("periodic"\)/);
  assert.match(index, /render\("state-update"\)/);
});

test("transition audio promotion survives safe signal rescheduling", () => {
  assert.match(index, /const bufferPromotionScheduler = preserveOnTransition && allowAfterSegment\s*\? scheduleServerTimeoutAt/);
  assert.match(index, /bufferPromotionScheduler\([\s\S]*?preserveOnTransition\s*\}/);
  assert.match(index, /let bufferAttemptCount = 0;[\s\S]*?bufferLastFailure = "not-attempted"/);
  assert.match(index, /function beepSynthetic\([^)]*scheduled[^)]*\)[\s\S]*?if \(scheduled && audioContext\.state !== "running"\) return false;/);
  assert.match(index, /const scheduled = beep\([^;]+;[\s\S]*?if \(!scheduled\) \{\s*bufferLastFailure = audioContext\?\.state === "running" \? "beep-rejected" : "audio-context-not-running"/);
});

test("audio node diagnostics retain the calibrated and canonical targets", () => {
  assert.match(index, /const appliedAudioOffsetMs = soundTargetServerTime - targetServerTime/);
  assert.match(index, /stage:\s*"plan"[\s\S]*?audioUserOffsetMs:\s*Number\(appliedAudioOffsetMs\.toFixed\(3\)\)/);
  assert.match(index, /const scheduled = beep\([\s\S]*?targetServerTimeMs:\s*soundTargetServerTime,[\s\S]*?canonicalTargetServerTimeMs:\s*targetServerTime,[\s\S]*?audioUserOffsetMs:\s*appliedAudioOffsetMs/);
  assert.match(index, /stage:\s*"node"[\s\S]*?\.\.\.targetDetails,[\s\S]*?targetErrorMs:\s*Number\(\(estimatedServerStartMs - targetDetails\.targetServerTimeMs\)/);
  assert.match(index, /function performanceAudioTargetDetails[\s\S]*?nextSignalTargetServerTimeMs:\s*hasExplicitNextTarget/);
  assert.match(index, /stage:\s*"node"[\s\S]*?scheduledStopServerTimeMs:[\s\S]*?scheduledDurationMs:/);
  assert.match(index, /if \(audioOffsetChanged\) \{[\s\S]*?stage:\s*"offset"[\s\S]*?previousAudioUserOffsetMs:[\s\S]*?audioUserOffsetMs:/);
});

test("audio diagnostics identify cancelled nodes and their replacement window", () => {
  assert.match(index, /function recordCancelledAudioNode\(item, cancellationReason[\s\S]*?stage:\s*"cancelled"[\s\S]*?scheduledStopServerTimeMs:[\s\S]*?scheduledDurationMs:[\s\S]*?nodeStarted:[\s\S]*?cancellationReason/);
  assert.match(index, /function clearSignalTimers[\s\S]*?node\.stop\(0\)[\s\S]*?recordCancelledAudioNode\(item/);
  assert.match(index, /scheduledNodes:[\s\S]*?estimatedServerStopMs:[\s\S]*?scheduledDurationMs:/);
});

test("page suspension diagnostics cannot delay forced audio invalidation", () => {
  assert.match(index, /function invalidateSignalsForPageSuspension\([^)]*\) \{[\s\S]*?clearSignalTimers\(false, true\);\s*recordPerformanceAudioClock\("page-audio-invalidated"/);
  assert.match(index, /recordPerformanceAudioClock\("page-audio-reschedule"/);
  assert.match(index, /audioScheduleGeneration \+= 1;\s*stopActiveHtmlAudio\(\);/);
});

test("audio diagnostics identify planned signals whose scheduler window expired", () => {
  const shouldExpire = inlineFunction(index, "shouldExpirePerformanceAudioPlan");
  assert.equal(shouldExpire({ targetServerTimeMs: 1000, lateGraceMs: 1200, preserveOnTransition: false }, false, 2200), false);
  assert.equal(shouldExpire({ targetServerTimeMs: 1000, lateGraceMs: 1200, preserveOnTransition: false }, false, 2201), true);
  assert.equal(shouldExpire({ targetServerTimeMs: 1000, lateGraceMs: 300, preserveOnTransition: false }, true, 1400), true);
  assert.equal(shouldExpire({ targetServerTimeMs: 1000, lateGraceMs: 1200, preserveOnTransition: true }, true, 5000), false);
  assert.match(index, /const performancePendingAudioPlans = new Map\(\)/);
  assert.match(index, /function finalizeClearedPerformanceAudioPlans[\s\S]*?stage:\s*"expired"[\s\S]*?suppressionReason:\s*"scheduler-window-missed"/);
  assert.match(index, /function clearSignalTimers\([^)]*\) \{[\s\S]*?finalizeClearedPerformanceAudioPlans\(preserveTransition\)/);
  assert.match(index, /stage:\s*"plan"[\s\S]*?lateGraceMs,[\s\S]*?preserveOnTransition,[\s\S]*?bufferAttemptCount,[\s\S]*?bufferLastFailure/);
});

test("critical audio lateness is bounded by signal meaning", () => {
  assert.match(index, /rotationBoundary:\s*1200,[\s\S]*?start:\s*1500,[\s\S]*?end:\s*1200,[\s\S]*?warn:\s*300/);
  assert.match(index, /prewarm:\s*500,[\s\S]*?warm:\s*250/);
  assert.match(index, /if \(kind === "warm" \|\| kind === "prewarm"\) return signalLateGraceMs\[kind\]/);
  assert.match(index, /Number\(remote\.elapsed \|\| 0\) \* 1000 <= signalLateGraceMs\.start/g);
  assert.match(index, /lateGraceMs:\s*Math\.max\(0, signalLateGraceMs\.start - manualStartWatchdogDelayMs\)/);
  assert.match(index, /phaseElapsedSeconds >= 0[\s\S]*?phaseElapsedSeconds \* 1000 <= signalLateGraceMs\.start/);
});

test("warning fallbacks cannot overlap the next countdown sound", () => {
  global.warningSeparationGuardMs = 20;
  try {
    const suppressionReason = inlineFunction(index, "warningFallbackSuppressionReason");
    assert.equal(suppressionReason("warn", 1000, 2000, 300), "");
    assert.equal(suppressionReason("warn", 1700, 2000, 300), "warning-overlap-risk");
    assert.equal(suppressionReason("warn", 1000, 2000, null), "warning-duration-unavailable");
    assert.equal(suppressionReason("start", 1700, 2000, 300), "");
  } finally {
    delete global.warningSeparationGuardMs;
  }
  assert.match(index, /kind === "warn"[\s\S]*?const limitedStop = start \+ availableDurationSeconds[\s\S]*?linearRampToValueAtTime\(0, limitedStop\)/);
  assert.match(index, /stage:\s*"suppressed"[\s\S]*?suppressionReason/);
  assert.match(index, /nextSignalTargetServerTime[\s\S]*?warningFallbackSuppressionReason/);
});

test("audio fallback diagnostics distinguish accepted playback from a terminal suppression", () => {
  const suppressionReason = inlineFunction(index, "fallbackPlaybackSuppressionReason");
  assert.equal(suppressionReason(true, true), "");
  assert.equal(suppressionReason(false, false), "sound-not-allowed");
  assert.equal(suppressionReason(true, false), "playback-rejected");

  const scheduler = index.match(/function scheduleBufferedSignalAt\([^]*?\n    function nextPhaseSignalKey/)?.[0] || "";
  assert.match(scheduler, /if \(!markSignalPlayed\(signalKey\)\) return;[\s\S]*?const playbackServerTime = serverNow\(\);[\s\S]*?let playbackAccepted = false;[\s\S]*?playbackAccepted = fallback \? fallback\(\) !== false : beep\(kind\);/);
  assert.match(scheduler, /if \(playbackSuppressionReason\) \{[\s\S]*?recordSuppressedSignal\(playbackSuppressionReason, playbackServerTime\);[\s\S]*?options\.onPlay\?\.\(\);[\s\S]*?return;/);
  assert.match(scheduler, /if \(playbackSuppressionReason\)[\s\S]*?stage:\s*"fallback"/);
  assert.doesNotMatch(scheduler, /stage:\s*"fallback"[\s\S]*?(?:if \(fallback\) fallback\(\)|else beep\(kind\))/);
});

test("audio diagnostics ignore scheduler work without a logical signal target", () => {
  const performanceAudioTarget = inlineFunction(index, "performanceAudioTarget");
  assert.equal(performanceAudioTarget(""), null);
  assert.equal(performanceAudioTarget(null), null);
  assert.equal(performanceAudioTarget("rotationBoundary:7:break:1785492977368"), 1785492977368);
});

test("Legacy diagnostics remain explicitly enabled and ES5-compatible", () => {
  assert.match(legacy, /performanceDiagnosticsValue = queryValue\("perf"\)/);
  assert.match(legacy, /performanceDiagnosticsLevel = performanceDiagnosticsValue === "3" \? 3 : performanceDiagnosticsValue === "2" \? 2 : performanceDiagnosticsValue === "1" \? 1 : 0/);
  assert.match(legacy, /performanceDiagnosticsEnabled = performanceDiagnosticsLevel > 0/);
  assert.match(legacy, /performanceLongRunDiagnostics = performanceDiagnosticsLevel === 3/);
  assert.match(legacy, /performanceAggregateDiagnostics = performanceDiagnosticsEnabled && !performanceLongRunDiagnostics/);
  assert.match(legacy, /window\.FDVLegacyPerformanceDiagnostics = \{/);
  assert.match(legacy, /if \(performanceDiagnosticsEnabled\) \{[\s\S]*?if \(!performanceLongRunDiagnostics\) \{[\s\S]*?window\.setInterval\(updatePerformanceOverlay, 5000\);/);
  assert.match(legacy, /FDV_PERFORMANCE_SNAPSHOT/);
  assert.match(legacy, /FDV_TRANSITION/);
  assert.match(legacy, /performanceDiagnosticsEnabled && !performanceLongRunDiagnostics/);
  assert.match(legacy, /if \(performanceLongRunDiagnostics && !isTransition\) return;/);
  assert.match(legacy, /identity:\s*\{[\s\S]*?mode:\s*"legacy"[\s\S]*?clock:\s*\{[\s\S]*?serverInstanceId:/);
  assert.match(legacy, /var performanceDisplayBoundaryEventLimit = 16;/);
  assert.match(legacy, /forcedByDiagnostics:\s*false/);
  assert.match(legacy, /display:\s*\{[\s\S]*?visibilityState:[\s\S]*?boundaryEvents:\s*performanceDisplayBoundaryEvents\.slice\(0\)/);
  assert.match(legacy, /function currentTimerCycle\(\)[\s\S]*?Math\.floor\(Math\.max\(0, elapsed\) \/ cycleLength\) \+ 1/);
  assert.match(legacy, /recordDisplayBoundary\(\{[\s\S]*?cycle:\s*currentTimerCycle\(\)/);
  assert.match(legacy, /if \(!performanceDiagnosticsEnabled\) \{\s*scheduleRender\(render\(\)\);\s*return;\s*\}[\s\S]*?targetServerTimeMs:[\s\S]*?callbackLatenessMs:[\s\S]*?commitLatenessMs:/);
  assert.doesNotMatch(legacy, /\b(?:const|let)\b|=>|\?\.|\?\?/);
});

test("server diagnostics require an explicit startup flag", () => {
  assert.match(server, /process\.argv\.includes\("--performance-diagnostics"\)/);
  assert.match(server, /process\.env\.FDV_PERFORMANCE_DIAGNOSTICS === "1"/);
  assert.match(server, /requestUrl\.pathname === "\/api\/performance"[\s\S]*?Performance diagnostics are disabled/);
  assert.match(server, /if \(performanceDiagnosticsEnabled\) \{[\s\S]*?eventLoopLagSamples/);
  assert.match(server, /function performanceSnapshot\(\)[\s\S]*?clock:\s*\{[\s\S]*?serverInstanceId/);
  assert.match(server, /performanceCount\("startListSanitizations"\)/);
  assert.match(server, /performanceCount\("sseStateBytes"/);
  assert.match(server, /function repairTimerClockContinuity\(\)[\s\S]*?systemUptimeNow\(\)[\s\S]*?clockContinuityCorrectionMs[\s\S]*?recordClockContinuityAnomaly[\s\S]*?timerStartedAtMono -= correction[\s\S]*?FDV_SERVER_CLOCK_REPAIR/);
  assert.match(server, /function elapsedSeconds\([^)]*\)[\s\S]*?repairTimerClockContinuity\(\)/);
  assert.match(server, /function snapshotPayload\(\)[\s\S]*?savedAtUptimeMs = systemUptimeNow\(\)[\s\S]*?savedElapsedDifferenceMs[\s\S]*?clockDiagnostics:\s*publicClockDiagnostics\(\)/);
  assert.match(server, /function restoreTimerSnapshot\(\)[\s\S]*?runningElapsedAfterRestore\([\s\S]*?savedAtUptimeMs,[\s\S]*?currentUptimeMs/);
  assert.match(server, /timerClockDiagnostics\.lastRestore = sanitizeClockDiagnosticRecord\([\s\S]*?snapshotAgeDifferenceMs[\s\S]*?restoredElapsedMs/);
  assert.match(server, /function diagnosticsPayload\(\)[\s\S]*?clockDiagnostics:\s*publicClockDiagnostics\(\)/);
  assert.match(index, /negativeClockAnomalies[\s\S]*?snapshotClockDifference[\s\S]*?restoreClockDifference[\s\S]*?serverClockStatus/);
});
