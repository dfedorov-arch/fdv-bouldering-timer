"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  LIMITS,
  assessClockContinuity,
  boundedInteger,
  clockContinuityCorrectionMs,
  createTimerDomain,
  monotonicClockIncludesSleep,
  normalizeOptionalClockPart,
  runningElapsedAfterRestore,
  scheduledStartTime
} = require("../lib/timer-domain");

const domain = createTimerDomain({
  classicRotationMinutes: 4,
  classicBreakSeconds: 15
});

test("bounded integers reject invalid input and clamp finite values", () => {
  assert.equal(boundedInteger(undefined, 1, 10, 4), 4);
  assert.equal(boundedInteger("invalid", 1, 10, 4), 4);
  assert.equal(boundedInteger(-2, 1, 10, 4), 1);
  assert.equal(boundedInteger(20, 1, 10, 4), 10);
  assert.equal(boundedInteger(4.6, 1, 10, 4), 5);
});

test("active settings are normalized without mutating their inputs", () => {
  const source = { rotationSeconds: -1, breakSeconds: 999999, oneShot: false };
  const fallback = { rotationSeconds: 240, breakSeconds: 15, oneShot: false };

  assert.deepEqual(domain.normalizeActiveSettings(source, fallback), {
    rotationSeconds: 1,
    breakSeconds: LIMITS.maxFestivalBreakSeconds,
    oneShot: false,
    finalRoundFormat: "old",
    finalRestRotations: 3
  });
  assert.deepEqual(source, { rotationSeconds: -1, breakSeconds: 999999, oneShot: false });
  assert.deepEqual(fallback, { rotationSeconds: 240, breakSeconds: 15, oneShot: false });
});

test("one-shot active settings accept a blank break as zero", () => {
  assert.deepEqual(domain.normalizeActiveSettings({
    rotationSeconds: 120,
    breakSeconds: "",
    oneShot: true
  }), {
    rotationSeconds: 120,
    breakSeconds: 0,
    oneShot: true,
    finalRoundFormat: "old",
    finalRestRotations: 3
  });
});

test("draft break limit depends on the selected preset", () => {
  const settings = {
    rotationMinutes: 999,
    breakSeconds: 999999,
    oneShot: false,
    startHours: 99,
    startMinutes: -5
  };

  assert.deepEqual(domain.normalizeDraftSettings(settings, "classic"), {
    rotationMinutes: LIMITS.maxRotationMinutes,
    breakSeconds: LIMITS.maxClassicBreakSeconds,
    oneShot: false,
    finalRoundFormat: "old",
    finalRestRotations: 3,
    startHours: 23,
    startMinutes: 0
  });
  assert.equal(
    domain.normalizeDraftSettings(settings, "festival").breakSeconds,
    LIMITS.maxFestivalBreakSeconds
  );
});

test("running restore keeps the absolute start when monotonic snapshot elapsed drifted", () => {
  const savedAt = 2_000_000;
  const now = savedAt + 5_000;
  const savedStart = savedAt - 120_000;
  assert.equal(runningElapsedAfterRestore(savedStart, savedAt, 20, now), 125);
  assert.equal(runningElapsedAfterRestore(0, savedAt, 20, now), 25);
  assert.equal(runningElapsedAfterRestore(savedAt + 2_000, savedAt, 0, now), 3);
  assert.equal(runningElapsedAfterRestore(savedStart, savedAt, 20, now, 50_000, 55_000), 25);
  assert.equal(runningElapsedAfterRestore(savedStart, savedAt, 20, now, 55_000, 5_000), 125);
  assert.equal(runningElapsedAfterRestore(savedStart, savedAt, 122.2, now, 50_000, 55_000), 125);
});

test("server clock continuity repair advances through a suspended monotonic clock", () => {
  assert.equal(clockContinuityCorrectionMs(5000, 5000, 5000), 0);
  assert.equal(clockContinuityCorrectionMs(63240, 3240, 63000), 60000);
  assert.equal(clockContinuityCorrectionMs(63350, 3350, 64000), 60000);
  assert.equal(clockContinuityCorrectionMs(2000, 0, 2000), 0);
  assert.equal(clockContinuityCorrectionMs(5000, 4950, 5000), 0);
  assert.equal(clockContinuityCorrectionMs(105000, 5000, 5000), 0);
  assert.equal(clockContinuityCorrectionMs(5000, 3900, 5000), 0);
  assert.equal(clockContinuityCorrectionMs(5001, 3900, 5001), 1101);
});

test("integer uptime cannot move a normally progressing timer at any sampling phase", () => {
  // Sweep the phase relative to uptime's second boundary over an hour of checks.
  for (let phase = 0; phase < 1000; phase += 37) {
    let previousMono = phase;
    for (let check = 0; check < 1200; check += 1) {
      const mono = previousMono + (check % 2 ? 3650.25 : 2350.75);
      const delta = mono - previousMono;
      const uptimeDelta = Math.floor(mono / 1000) * 1000 - Math.floor(previousMono / 1000) * 1000;
      assert.equal(clockContinuityCorrectionMs(delta, delta, uptimeDelta), 0);
      previousMono = mono;
    }
  }
  assert.equal(clockContinuityCorrectionMs(5000, 4899, 5000), 0);
  assert.equal(clockContinuityCorrectionMs(3000, 3500, 3000), 0);
});

test("the sleep-inclusive policy is limited to verified macOS runtimes", () => {
  for (const version of ["1.49.0", "1.52.1"]) assert.equal(monotonicClockIncludesSleep("darwin", version), true);
  for (const version of ["1.48.0", "1.9.0", "", undefined]) assert.equal(monotonicClockIncludesSleep("darwin", version), false);
  for (const platform of ["win32", "linux", "unknown"]) assert.equal(monotonicClockIncludesSleep(platform, "1.52.1"), false);
});

test("sleep-inclusive monotonic clocks never receive uptime corrections", () => {
  const options = { monotonicIncludesSleep: true };
  for (const [wall, mono, uptime] of [[63240, 63240, 63000], [63240, 63240, 64000], [63240, 3240, 63000]]) {
    assert.equal(clockContinuityCorrectionMs(wall, mono, uptime, 3000, 100, options), 0);
  }
});

test("system clock changes and ambiguous gaps preserve monotonic elapsed", () => {
  for (const wall of [105000, -95000]) {
    const result = assessClockContinuity(wall, 5000, 5000);
    assert.equal(result.correctionMs, 0);
    assert.equal(result.reason, "wall-clock-adjustment");
    assert.equal(result.status, "warn");
  }
  assert.equal(assessClockContinuity(-119500, 500, 0).reason, "wall-clock-adjustment");
  for (const [wall, mono, uptime] of [[123240, 3240, 63000], [3240, 3240, 63000], [63240, 3240, 3000]]) {
    assert.equal(clockContinuityCorrectionMs(wall, mono, uptime), 0);
  }
  assert.equal(assessClockContinuity(123240, 3240, 63000).status, "bad");
  assert.equal(assessClockContinuity(3000, 4000, 1000).status, "bad");
  for (const args of [[NaN, 3000, 3000], [3000, Infinity, 3000], [3000, -1, 3000], [3000, 3000, -1]]) {
    assert.equal(assessClockContinuity(...args).correctionMs, 0);
    assert.equal(assessClockContinuity(...args).status, "bad");
  }
});

test("Final format and rest rotations are normalized", () => {
  assert.deepEqual(domain.normalizeActiveSettings({
    rotationSeconds: 240,
    breakSeconds: 0,
    oneShot: true,
    finalRoundFormat: "new",
    finalRestRotations: 120
  }), {
    rotationSeconds: 240,
    breakSeconds: 0,
    oneShot: true,
    finalRoundFormat: "new",
    finalRestRotations: LIMITS.maxFinalRestRotations
  });
});

test("optional clock parts preserve blank values", () => {
  assert.equal(normalizeOptionalClockPart("", 23), "");
  assert.equal(normalizeOptionalClockPart(null, 59), "");
  assert.equal(normalizeOptionalClockPart(80, 59), 59);
});

test("scheduled start with blank clock fields starts immediately", () => {
  const now = Date.now();
  assert.equal(scheduledStartTime(now, "", ""), now);
});

test("scheduled start rolls a past local time to the next day", () => {
  const nowDate = new Date(2026, 6, 12, 10, 30, 0, 0);
  const result = new Date(scheduledStartTime(nowDate.getTime(), 9, 0));

  assert.equal(result.getFullYear(), nowDate.getFullYear());
  assert.equal(result.getMonth(), nowDate.getMonth());
  assert.equal(result.getDate(), nowDate.getDate() + 1);
  assert.equal(result.getHours(), 9);
  assert.equal(result.getMinutes(), 0);
});
