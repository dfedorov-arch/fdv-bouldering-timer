const test = require("node:test");
const assert = require("node:assert/strict");

const syncRateOptions = {
  normalMin: 0.999,
  normalMax: 1.001,
  largeMin: 0.90,
  largeMax: 1.10,
  largeThresholdPpm: 1000,
  largeMinSpanMs: 30000,
  largeMinSamples: 12,
  largeMaxResidualMs: 120,
  largeMaxHalfDiffPpm: 2000,
  largeMaxOutlierShare: 0.2,
  deadband: 0.0001,
  smoothing: 0.25
};

const signalLateGraceMs = {
  rotationBoundary: 3000,
  minute: 1000
};

const manualStartAudioLeadMs = 300;
const primaryPinMaxFailures = 5;
const primaryPinBlockStepsMs = [5000, 30000, 300000];
const audioTestRateLimitMs = 3000;

function clampFloat(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(sortedValues, ratio) {
  if (!sortedValues.length) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.round((sortedValues.length - 1) * ratio)));
  return sortedValues[index];
}

function fitClockRate(samples) {
  if (!samples.length) return null;
  const meanPerf = samples.reduce((sum, item) => sum + item.perfTime, 0) / samples.length;
  const meanServer = samples.reduce((sum, item) => sum + item.serverTime, 0) / samples.length;
  const denominator = samples.reduce((sum, item) => {
    const diff = item.perfTime - meanPerf;
    return sum + (diff * diff);
  }, 0);
  if (denominator <= 0) return null;
  const numerator = samples.reduce((sum, item) => {
    return sum + ((item.perfTime - meanPerf) * (item.serverTime - meanServer));
  }, 0);
  let rate = numerator / denominator;
  rate = clampFloat(rate, syncRateOptions.largeMin, syncRateOptions.largeMax, 1);
  const offsets = samples
    .map((item) => item.serverTime - (rate * item.perfTime))
    .sort((a, b) => a - b);
  const offset = median(offsets);
  const residuals = samples
    .map((item) => item.serverTime - (offset + (rate * item.perfTime)))
    .sort((a, b) => a - b);
  const residualJitter = residuals.length > 1
    ? percentile(residuals, 0.9) - percentile(residuals, 0.1)
    : 0;
  const outlierLimit = Math.max(syncRateOptions.largeMaxResidualMs * 2, residualJitter * 3, 250);
  const outliers = residuals.filter((value) => Math.abs(value) > outlierLimit).length;
  return {
    rate,
    offset,
    residualJitter,
    residualMinMax: residuals.length > 1 ? residuals[residuals.length - 1] - residuals[0] : 0,
    outlierShare: samples.length ? outliers / samples.length : 0
  };
}

function evaluateClockRate(samples, currentRate = 1, options = {}) {
  const modelSpan = samples.length > 1 ? samples[samples.length - 1].perfTime - samples[0].perfTime : 0;
  const model = modelSpan >= 8000 ? fitClockRate(samples) : null;
  const holdExistingRate = Boolean(options.holdExistingRate);
  if (!model) {
    return {
      nextRate: currentRate,
      confidence: "default",
      gateReason: "collecting"
    };
  }

  let fittedRate = model.rate;
  const candidateRatePpm = Math.round((fittedRate - 1) * 1000000);
  const largeRateCandidate = Math.abs(candidateRatePpm) > syncRateOptions.largeThresholdPpm;
  const firstHalf = samples.slice(0, Math.floor(samples.length / 2));
  const secondHalf = samples.slice(Math.ceil(samples.length / 2));
  const firstFit = firstHalf.length >= 4 ? fitClockRate(firstHalf) : null;
  const secondFit = secondHalf.length >= 4 ? fitClockRate(secondHalf) : null;
  const halfDiffPpm = firstFit && secondFit
    ? Math.abs((firstFit.rate - secondFit.rate) * 1000000)
    : Infinity;
  const stableHalfRates = !largeRateCandidate || halfDiffPpm <= syncRateOptions.largeMaxHalfDiffPpm;
  const highConfidenceLargeRate = largeRateCandidate
    && modelSpan >= syncRateOptions.largeMinSpanMs
    && samples.length >= syncRateOptions.largeMinSamples
    && model.residualJitter <= syncRateOptions.largeMaxResidualMs
    && stableHalfRates
    && model.outlierShare <= syncRateOptions.largeMaxOutlierShare;

  let confidence = "normal";
  let gateReason = "normal";
  if (largeRateCandidate && !highConfidenceLargeRate) {
    fittedRate = holdExistingRate ? currentRate : 1;
    confidence = holdExistingRate ? "resume-held" : "gated";
    if (modelSpan < syncRateOptions.largeMinSpanMs) gateReason = "short-window";
    else if (samples.length < syncRateOptions.largeMinSamples) gateReason = "few-samples";
    else if (model.residualJitter > syncRateOptions.largeMaxResidualMs) gateReason = "unstable-residuals";
    else if (!stableHalfRates) gateReason = "unstable-rate";
    else if (model.outlierShare > syncRateOptions.largeMaxOutlierShare) gateReason = "outliers";
    else gateReason = "gated";
  } else {
    fittedRate = largeRateCandidate
      ? fittedRate
      : clampFloat(fittedRate, syncRateOptions.normalMin, syncRateOptions.normalMax, 1);
    confidence = highConfidenceLargeRate ? "high" : "normal";
    gateReason = largeRateCandidate ? "accepted-large" : "normal";
  }
  if (Math.abs(fittedRate - 1) < syncRateOptions.deadband) fittedRate = 1;
  const smoothing = samples.length < 8 ? 0.45 : syncRateOptions.smoothing;
  const nextRate = currentRate + ((fittedRate - currentRate) * smoothing);
  return {
    nextRate,
    fittedRate,
    confidence,
    gateReason,
    highConfidence: highConfidenceLargeRate,
    candidateRatePpm,
    acceptedRatePpm: Math.round((nextRate - 1) * 1000000),
    residualJitter: model.residualJitter,
    halfDiffPpm: Number.isFinite(halfDiffPpm) ? Math.round(halfDiffPpm) : null,
    outlierShare: model.outlierShare
  };
}

function makeSamples(rate, count = 16, stepMs = 2500, options = {}) {
  const offset = options.offset ?? 100000;
  const noise = options.noise || (() => 0);
  return Array.from({ length: count }, (_, index) => {
    const perfTime = index * stepMs;
    return {
      perfTime,
      serverTime: offset + (perfTime * rate) + noise(index)
    };
  });
}

function holdServerClockRateForOffline(currentRate) {
  return {
    rate: currentRate,
    confidence: "offline-held",
    gateReason: "offline-held",
    acceptedRatePpm: Math.round((currentRate - 1) * 1000000)
  };
}

function reanchorServerClockModelForResume(currentRate) {
  return {
    rate: currentRate,
    confidence: "resume-held",
    gateReason: "resume-held",
    acceptedRatePpm: Math.round((currentRate - 1) * 1000000)
  };
}

function buildTimeline(settings, labels = { rotation: "rotation", break: "break" }) {
  return [
    { type: "rotation", label: labels.rotation, duration: settings.rotationSeconds },
    { type: "break", label: labels.break, duration: settings.breakSeconds }
  ].filter((segment) => segment.duration > 0);
}

function getCurrentSegment(elapsed, settings, labels = { rotation: "rotation", break: "break" }) {
  const timeline = buildTimeline(settings, labels);
  if (!timeline.length) return null;
  if (settings.oneShot) {
    const totalDuration = settings.rotationSeconds + settings.breakSeconds;
    if (elapsed >= totalDuration) return null;
    const isBreak = settings.breakSeconds > 0 && elapsed >= settings.rotationSeconds;
    return {
      type: isBreak ? "break" : "rotation",
      label: isBreak ? labels.break : labels.rotation,
      cycle: 1,
      start: isBreak ? settings.rotationSeconds : 0,
      end: isBreak ? totalDuration : settings.rotationSeconds
    };
  }
  const cycleDuration = settings.rotationSeconds + settings.breakSeconds;
  const safeCycleDuration = Math.max(1, cycleDuration);
  const cycleIndex = Math.floor(elapsed / safeCycleDuration);
  const offset = elapsed % safeCycleDuration;
  const isBreak = settings.breakSeconds > 0 && offset >= settings.rotationSeconds;
  const start = cycleIndex * safeCycleDuration + (isBreak ? settings.rotationSeconds : 0);
  const duration = isBreak ? settings.breakSeconds : settings.rotationSeconds;
  return {
    type: isBreak ? "break" : "rotation",
    label: isBreak ? labels.break : labels.rotation,
    cycle: cycleIndex + 1,
    start,
    end: start + duration
  };
}

function scheduledStartTime(now, hoursValue, minutesValue, restorePast = false) {
  const hasHours = hoursValue !== null && hoursValue !== undefined && hoursValue !== "";
  const hasMinutes = minutesValue !== null && minutesValue !== undefined && minutesValue !== "";
  if (!hasHours && !hasMinutes) return now;
  const hours = Math.min(23, Math.max(0, Math.round(Number.isFinite(Number(hoursValue)) ? Number(hoursValue) : 0)));
  const minutes = Math.min(59, Math.max(0, Math.round(Number.isFinite(Number(minutesValue)) ? Number(minutesValue) : 0)));
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);
  if (!restorePast && target.getTime() <= now) target.setDate(target.getDate() + 1);
  return target.getTime();
}

function shouldScheduleServerSignal(targetServerTime, currentServerTime, lateGraceMs) {
  return targetServerTime - currentServerTime >= -lateGraceMs;
}

function shouldRestoreSnapshot(savedAtWall, now, maxAgeMs) {
  const age = now - savedAtWall;
  return Number.isFinite(savedAtWall) && age >= 0 && age <= maxAgeMs;
}

function manualStartLeadMs(freshStart, soundNeeded) {
  return freshStart && soundNeeded ? manualStartAudioLeadMs : 0;
}

function nextPrimaryPinFailure(entry = {}, now = 0) {
  if (entry.blockedUntil > now) return entry;
  const blockLevel = Math.max(0, Number(entry.blockLevel) || 0);
  const count = (Number(entry.count) || 0) + 1;
  if (count < primaryPinMaxFailures) return { count, blockedUntil: 0, blockLevel };
  const blockMs = primaryPinBlockStepsMs[Math.min(blockLevel, primaryPinBlockStepsMs.length - 1)];
  return {
    count: 0,
    blockedUntil: now + blockMs,
    blockLevel: blockLevel + 1
  };
}

function primaryControlAllowed(primaryClientId, clientId) {
  if (!primaryClientId) return true;
  return Boolean(clientId && primaryClientId === clientId);
}

function primaryActionAllowed(primaryClientId, clientId, nextPrimaryClientId) {
  if (!primaryClientId) return !nextPrimaryClientId || nextPrimaryClientId === clientId;
  if (primaryClientId === clientId) return true;
  return Boolean(nextPrimaryClientId && nextPrimaryClientId === clientId);
}

function consumeAudioTestRateLimit(lastCommandAt, now) {
  const retryAfterMs = audioTestRateLimitMs - (now - lastCommandAt);
  if (retryAfterMs > 0) return { allowed: false, retryAfterMs };
  return { allowed: true, retryAfterMs: 0, lastCommandAt: now };
}

test("stable large VM clock rate is accepted after enough samples", () => {
  const result = evaluateClockRate(makeSamples(1.078, 16, 2500));

  assert.equal(result.confidence, "high");
  assert.equal(result.gateReason, "accepted-large");
  assert.equal(result.highConfidence, true);
  assert.ok(Math.abs(result.candidateRatePpm - 78000) <= 1);
  assert.ok(result.acceptedRatePpm > 19000);
  assert.ok(result.residualJitter <= 1);
});

test("large clock rate is gated before the confidence window is long enough", () => {
  const result = evaluateClockRate(makeSamples(1.078, 8, 2500));

  assert.equal(result.confidence, "gated");
  assert.equal(result.gateReason, "short-window");
  assert.equal(result.acceptedRatePpm, 0);
});

test("held VM clock rate survives the short post-resume confidence window", () => {
  const result = evaluateClockRate(makeSamples(1.078, 8, 2500), 1.078, { holdExistingRate: true });

  assert.equal(result.confidence, "resume-held");
  assert.equal(result.gateReason, "short-window");
  assert.equal(result.acceptedRatePpm, 78000);
});

test("unstable large clock rate is gated even with enough samples", () => {
  const samples = makeSamples(1.078, 16, 2500, {
    noise: (index) => index >= 8 ? index * 900 : 0
  });
  const result = evaluateClockRate(samples);

  assert.equal(result.confidence, "gated");
  assert.match(result.gateReason, /^unstable-/);
});

test("small clock rate correction is accepted as normal and clamped to normal range", () => {
  const result = evaluateClockRate(makeSamples(1.0005, 12, 2500));

  assert.equal(result.confidence, "normal");
  assert.equal(result.gateReason, "normal");
  assert.ok(result.acceptedRatePpm > 0);
  assert.ok(result.acceptedRatePpm < 1000);
});

test("offline hold keeps the applied clock rate instead of resetting to 1", () => {
  const held = holdServerClockRateForOffline(1.078);

  assert.equal(held.confidence, "offline-held");
  assert.equal(held.rate, 1.078);
  assert.equal(held.acceptedRatePpm, 78000);
});

test("stale resume reanchor keeps the applied clock rate instead of resetting to 1", () => {
  const held = reanchorServerClockModelForResume(0.9231);

  assert.equal(held.confidence, "resume-held");
  assert.equal(held.rate, 0.9231);
  assert.equal(held.acceptedRatePpm, -76900);
});

test("classic timeline with break switches at rotation and cycle boundaries", () => {
  const settings = { rotationSeconds: 240, breakSeconds: 15, oneShot: false };

  assert.deepEqual(getCurrentSegment(239.999, settings), {
    type: "rotation",
    label: "rotation",
    cycle: 1,
    start: 0,
    end: 240
  });
  assert.deepEqual(getCurrentSegment(240, settings), {
    type: "break",
    label: "break",
    cycle: 1,
    start: 240,
    end: 255
  });
  assert.deepEqual(getCurrentSegment(255, settings), {
    type: "rotation",
    label: "rotation",
    cycle: 2,
    start: 255,
    end: 495
  });
});

test("classic timeline without break starts next rotation at previous end", () => {
  const settings = { rotationSeconds: 240, breakSeconds: 0, oneShot: false };

  assert.deepEqual(getCurrentSegment(240, settings), {
    type: "rotation",
    label: "rotation",
    cycle: 2,
    start: 240,
    end: 480
  });
});

test("final one-shot without break ends after its rotation", () => {
  const settings = { rotationSeconds: 240, breakSeconds: 0, oneShot: true };

  assert.equal(getCurrentSegment(239.999, settings).type, "rotation");
  assert.equal(getCurrentSegment(240, settings), null);
});

test("one-shot with break returns break segment before completion", () => {
  const settings = { rotationSeconds: 120, breakSeconds: 15, oneShot: true };

  assert.deepEqual(getCurrentSegment(120, settings), {
    type: "break",
    label: "break",
    cycle: 1,
    start: 120,
    end: 135
  });
  assert.equal(getCurrentSegment(135, settings), null);
});

test("scheduled start rolls to tomorrow unless restorePast is requested", () => {
  const now = new Date("2026-07-02T10:30:00+03:00").getTime();
  const sameMorning = scheduledStartTime(now, 9, 0, false);
  const restoredMorning = scheduledStartTime(now, 9, 0, true);

  assert.equal(new Date(sameMorning).getDate(), 3);
  assert.equal(new Date(restoredMorning).getDate(), 2);
  assert.equal(new Date(restoredMorning).getHours(), 9);
});

test("transition signal is eligible even one millisecond before boundary", () => {
  const target = 100000;

  assert.equal(shouldScheduleServerSignal(target, target - 1, signalLateGraceMs.rotationBoundary), true);
});

test("late transition signal is dropped after grace to avoid next-phase noise", () => {
  const target = 100000;

  assert.equal(shouldScheduleServerSignal(target, target + signalLateGraceMs.rotationBoundary, signalLateGraceMs.rotationBoundary), true);
  assert.equal(shouldScheduleServerSignal(target, target + signalLateGraceMs.rotationBoundary + 1, signalLateGraceMs.rotationBoundary), false);
});

test("minute signal remains eligible around seek to 1:02 and 1:01", () => {
  const minuteTarget = 100000;

  assert.equal(shouldScheduleServerSignal(minuteTarget, minuteTarget - 2000, signalLateGraceMs.minute), true);
  assert.equal(shouldScheduleServerSignal(minuteTarget, minuteTarget - 1000, signalLateGraceMs.minute), true);
});

test("snapshot restore accepts twelve hours and rejects anything older", () => {
  const maxAge = 12 * 60 * 60 * 1000;
  const now = 2000000000000;

  assert.equal(shouldRestoreSnapshot(now - maxAge, now, maxAge), true);
  assert.equal(shouldRestoreSnapshot(now - maxAge - 1, now, maxAge), false);
  assert.equal(shouldRestoreSnapshot(now + 1, now, maxAge), false);
});

test("manual start lead is used only when a fresh start needs sound", () => {
  assert.equal(manualStartLeadMs(true, true), 300);
  assert.equal(manualStartLeadMs(true, false), 0);
  assert.equal(manualStartLeadMs(false, true), 0);
});

test("primary PIN lockout escalates after repeated failure windows", () => {
  let entry = {};
  for (let index = 0; index < 4; index += 1) entry = nextPrimaryPinFailure(entry, 1000);
  assert.deepEqual(entry, { count: 4, blockedUntil: 0, blockLevel: 0 });

  entry = nextPrimaryPinFailure(entry, 1000);
  assert.deepEqual(entry, { count: 0, blockedUntil: 6000, blockLevel: 1 });
  assert.equal(nextPrimaryPinFailure(entry, 2000), entry);

  for (let index = 0; index < 5; index += 1) entry = nextPrimaryPinFailure(entry, 7000);
  assert.deepEqual(entry, { count: 0, blockedUntil: 37000, blockLevel: 2 });

  for (let index = 0; index < 5; index += 1) entry = nextPrimaryPinFailure(entry, 38000);
  assert.deepEqual(entry, { count: 0, blockedUntil: 338000, blockLevel: 3 });

  for (let index = 0; index < 5; index += 1) entry = nextPrimaryPinFailure(entry, 339000);
  assert.deepEqual(entry, { count: 0, blockedUntil: 639000, blockLevel: 4 });
});

test("primary-selected mode accepts control only from the primary client", () => {
  assert.equal(primaryControlAllowed(null, "viewer"), true);
  assert.equal(primaryControlAllowed("primary", "primary"), true);
  assert.equal(primaryControlAllowed("primary", "viewer"), false);
  assert.equal(primaryControlAllowed("primary", ""), false);

  assert.equal(primaryActionAllowed("primary", "primary", null), true);
  assert.equal(primaryActionAllowed("primary", "viewer", null), false);
  assert.equal(primaryActionAllowed("primary", "viewer", "other"), false);
  assert.equal(primaryActionAllowed("primary", "viewer", "viewer"), true);
});

test("audio test rate limit allows one command every three seconds", () => {
  let rate = consumeAudioTestRateLimit(0, 10000);
  assert.equal(rate.allowed, true);

  rate = consumeAudioTestRateLimit(rate.lastCommandAt, 12000);
  assert.equal(rate.allowed, false);
  assert.equal(rate.retryAfterMs, 1000);

  rate = consumeAudioTestRateLimit(10000, 13000);
  assert.equal(rate.allowed, true);
});
