"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  LIMITS,
  boundedInteger,
  createTimerDomain,
  normalizeOptionalClockPart,
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
    oneShot: false
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
    oneShot: true
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
    startHours: 23,
    startMinutes: 0
  });
  assert.equal(
    domain.normalizeDraftSettings(settings, "festival").breakSeconds,
    LIMITS.maxFestivalBreakSeconds
  );
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
