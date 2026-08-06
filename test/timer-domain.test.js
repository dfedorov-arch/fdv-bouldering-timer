"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  LIMITS,
  boundedInteger,
  clockContinuityCorrectionMs,
  createTimerDomain,
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
  assert.equal(clockContinuityCorrectionMs(5000, 4899, 5000), 101);
  assert.equal(clockContinuityCorrectionMs(2000, 0, 2000), 0);
  assert.equal(clockContinuityCorrectionMs(5000, 4950, 5000), 0);
  assert.equal(clockContinuityCorrectionMs(105000, 5000, 5000), 0);
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
