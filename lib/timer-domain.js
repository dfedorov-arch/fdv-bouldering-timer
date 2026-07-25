"use strict";

const LIMITS = Object.freeze({
  maxRotationMinutes: 240,
  maxClassicBreakSeconds: 60 * 60,
  maxFestivalBreakSeconds: 240 * 60
});

function boundedInteger(value, min, max, fallback) {
  const fallbackNumber = Number(fallback);
  const safeFallback = Number.isFinite(fallbackNumber)
    ? Math.min(max, Math.max(min, Math.round(fallbackNumber)))
    : min;
  if (value === null || value === undefined || value === "") return safeFallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return safeFallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeOptionalClockPart(value, max) {
  if (value === null || value === undefined || value === "") return "";
  return boundedInteger(value, 0, max, 0);
}

function scheduledStartTime(now, hoursValue, minutesValue, restorePast = false) {
  const hasHours = hoursValue !== null && hoursValue !== undefined && hoursValue !== "";
  const hasMinutes = minutesValue !== null && minutesValue !== undefined && minutesValue !== "";
  if (!hasHours && !hasMinutes) return now;

  const hours = boundedInteger(hoursValue, 0, 23, 0);
  const minutes = boundedInteger(minutesValue, 0, 59, 0);
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);
  if (!restorePast && target.getTime() <= now) target.setDate(target.getDate() + 1);
  return target.getTime();
}

function createTimerDomain(defaults = {}) {
  const classicRotationMinutes = boundedInteger(
    defaults.classicRotationMinutes,
    1,
    LIMITS.maxRotationMinutes,
    4
  );
  const classicBreakSeconds = boundedInteger(
    defaults.classicBreakSeconds,
    0,
    LIMITS.maxClassicBreakSeconds,
    15
  );
  const maxRotationSeconds = LIMITS.maxRotationMinutes * 60;

  function normalizeActiveSettings(source = {}, fallback = {}) {
    const safeSource = source && typeof source === "object" ? source : {};
    const safeFallback = fallback && typeof fallback === "object" ? fallback : {};
    const oneShot = Boolean(safeSource.oneShot);
    const fallbackRotation = boundedInteger(
      safeFallback.rotationSeconds,
      1,
      maxRotationSeconds,
      classicRotationMinutes * 60
    );
    const fallbackBreak = boundedInteger(
      safeFallback.breakSeconds,
      0,
      LIMITS.maxFestivalBreakSeconds,
      classicBreakSeconds
    );
    return {
      rotationSeconds: boundedInteger(safeSource.rotationSeconds, 1, maxRotationSeconds, fallbackRotation),
      breakSeconds: safeSource.breakSeconds === "" && oneShot
        ? 0
        : boundedInteger(
          safeSource.breakSeconds,
          0,
          LIMITS.maxFestivalBreakSeconds,
          fallbackBreak
        ),
      oneShot
    };
  }

  function normalizeDraftSettings(source = {}, activePreset = "") {
    const safeSource = source && typeof source === "object" ? source : {};
    const oneShot = Boolean(safeSource.oneShot);
    const maxBreakSeconds = activePreset === "festival"
      ? LIMITS.maxFestivalBreakSeconds
      : LIMITS.maxClassicBreakSeconds;
    return {
      rotationMinutes: boundedInteger(
        safeSource.rotationMinutes,
        1,
        LIMITS.maxRotationMinutes,
        classicRotationMinutes
      ),
      breakSeconds: oneShot && safeSource.breakSeconds === ""
        ? ""
        : boundedInteger(safeSource.breakSeconds, 0, maxBreakSeconds, classicBreakSeconds),
      oneShot,
      startHours: normalizeOptionalClockPart(safeSource.startHours, 23),
      startMinutes: normalizeOptionalClockPart(safeSource.startMinutes, 59)
    };
  }

  return Object.freeze({
    normalizeActiveSettings,
    normalizeDraftSettings
  });
}

module.exports = {
  LIMITS,
  boundedInteger,
  createTimerDomain,
  normalizeOptionalClockPart,
  scheduledStartTime
};
