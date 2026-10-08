"use strict";

const LIMITS = Object.freeze({
  maxRotationMinutes: 240,
  maxClassicBreakSeconds: 60 * 60,
  maxFestivalBreakSeconds: 240 * 60,
  maxFinalRestRotations: 9
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

function runningElapsedAfterRestore(
  savedStart,
  savedAt,
  savedElapsed,
  now,
  savedUptimeMs = null,
  currentUptimeMs = null
) {
  const safeNow = Number(now);
  const safeSavedAt = Number(savedAt);
  const safeStart = Number(savedStart);
  const fallbackElapsed = Math.max(0, Number(savedElapsed) || 0);
  const safeSavedUptime = Number(savedUptimeMs);
  const safeCurrentUptime = Number(currentUptimeMs);
  const absoluteElapsed = Number.isFinite(safeStart) && safeStart > 0 && Number.isFinite(safeNow)
    ? Math.max(0, (safeNow - safeStart) / 1000)
    : null;
  if (
    savedUptimeMs !== null
    && currentUptimeMs !== null
    && Number.isFinite(safeSavedUptime)
    && Number.isFinite(safeCurrentUptime)
    && safeSavedUptime >= 0
    && safeCurrentUptime >= safeSavedUptime
  ) {
    const uptimeElapsed = fallbackElapsed + (safeCurrentUptime - safeSavedUptime) / 1000;
    // A normal process restart must not turn an exact scheduled start such as
    // 09:55:00 into 09:55:02.8 because of a small saved elapsed discrepancy.
    // Prefer uptime only when wall time and uptime indicate a material clock change.
    if (absoluteElapsed !== null && Math.abs(absoluteElapsed - uptimeElapsed) <= 5) {
      return absoluteElapsed;
    }
    return uptimeElapsed;
  }
  const snapshotAgeSeconds = Number.isFinite(safeNow) && Number.isFinite(safeSavedAt)
    ? Math.max(0, safeNow - safeSavedAt) / 1000
    : 0;
  if (absoluteElapsed !== null) return absoluteElapsed;
  return fallbackElapsed + snapshotAgeSeconds;
}

function monotonicClockIncludesSleep(platform, libuvVersion) {
  if (platform !== "darwin") return false;
  const version = /^(\d+)\.(\d+)\./.exec(String(libuvVersion || ""));
  // libuv >= 1.49 directly uses mach_continuous_time on supported macOS.
  // Older/unknown runtimes use the conservative corroborated-gap policy.
  return Boolean(version && (Number(version[1]) > 1 || (Number(version[1]) === 1 && Number(version[2]) >= 49)));
}

function assessClockContinuity(
  wallDeltaMs,
  monotonicDeltaMs,
  uptimeDeltaMs,
  gapMs = 3000,
  mismatchMs = 100,
  options = {}
) {
  const wallDelta = Number(wallDeltaMs);
  const monotonicDelta = Number(monotonicDeltaMs);
  const uptimeDelta = Number(uptimeDeltaMs);
  const result = (status, reason, correctionMs = 0) => ({ status, reason, correctionMs });
  if (!Number.isFinite(wallDelta) || !Number.isFinite(monotonicDelta)
    || !Number.isFinite(uptimeDelta) || monotonicDelta < 0 || uptimeDelta < 0) {
    return result("bad", "invalid-clock-sample");
  }
  const tolerance = Math.max(0, Number(options.uptimeToleranceMs ?? 1000) || 0);
  const threshold = tolerance + Math.max(0, Number(mismatchMs) || 0);
  const wallMissing = wallDelta - monotonicDelta;
  const uptimeMissing = uptimeDelta - monotonicDelta;
  // A sleep-inclusive monotonic clock is already authoritative. In particular,
  // bundled Node.js on macOS uses mach_continuous_time; integer uptime is not
  // a more accurate clock and must never move the running timer.
  if (options.monotonicIncludesSleep) {
    if (Math.abs(wallMissing) > threshold) return result("warn", "wall-clock-adjustment");
    if (Math.abs(uptimeMissing) > threshold) return result("warn", "uptime-disagreement");
    return result("neutral", "stable");
  }
  if (Math.abs(wallMissing) > threshold && Math.abs(uptimeMissing) <= threshold) {
    return result("warn", "wall-clock-adjustment");
  }
  if (Math.max(monotonicDelta, uptimeDelta) < Math.max(0, Number(gapMs) || 0)) {
    return result("neutral", "stable");
  }
  if (wallMissing > threshold && uptimeMissing > threshold) {
    if (Math.abs(wallDelta - uptimeDelta) <= tolerance) {
      // Uptime confirms the gap; wall time supplies its fractional precision.
      // Never apply a negative correction or replay an uptime rounding error.
      return result("warn", "suspension-repaired", wallMissing);
    }
    return result("bad", "ambiguous-clock-gap");
  }
  if (Math.abs(uptimeMissing) > threshold) return result("bad", "ambiguous-clock-gap");
  return result("neutral", "stable");
}

function clockContinuityCorrectionMs(...args) {
  return assessClockContinuity(...args).correctionMs;
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
    const fallbackFinalRoundFormat = safeFallback.finalRoundFormat === "new" ? "new" : "old";
    const finalRoundFormat = safeSource.finalRoundFormat === "old" || safeSource.finalRoundFormat === "new"
      ? safeSource.finalRoundFormat
      : fallbackFinalRoundFormat;
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
      breakSeconds: oneShot
        ? 0
        : boundedInteger(
          safeSource.breakSeconds,
          0,
          LIMITS.maxFestivalBreakSeconds,
          fallbackBreak
        ),
      oneShot,
      finalRoundFormat,
      finalRestRotations: boundedInteger(
        safeSource.finalRestRotations,
        1,
        LIMITS.maxFinalRestRotations,
        safeFallback.finalRestRotations || 3
      )
    };
  }

  function normalizeDraftSettings(source = {}, activePreset = "") {
    const safeSource = source && typeof source === "object" ? source : {};
    const oneShot = Boolean(safeSource.oneShot);
    const finalRoundFormat = safeSource.finalRoundFormat === "new" ? "new" : "old";
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
      breakSeconds: oneShot
        ? 0
        : boundedInteger(safeSource.breakSeconds, 0, maxBreakSeconds, classicBreakSeconds),
      oneShot,
      finalRoundFormat,
      finalRestRotations: boundedInteger(safeSource.finalRestRotations, 1, LIMITS.maxFinalRestRotations, 3),
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
  assessClockContinuity,
  boundedInteger,
  clockContinuityCorrectionMs,
  createTimerDomain,
  monotonicClockIncludesSleep,
  normalizeOptionalClockPart,
  runningElapsedAfterRestore,
  scheduledStartTime
};
