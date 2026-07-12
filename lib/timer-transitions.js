"use strict";

const { scheduledStartTime } = require("./timer-domain");

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cloneTimerState(state) {
  return {
    ...state,
    activeSettings: { ...state.activeSettings },
    draftSettings: { ...state.draftSettings }
  };
}

function createTimerTransitions(domain, options = {}) {
  if (!domain || typeof domain.normalizeActiveSettings !== "function"
    || typeof domain.normalizeDraftSettings !== "function") {
    throw new TypeError("A timer domain with settings normalizers is required");
  }
  const manualStartAudioLeadMs = Math.max(0, finiteNumber(options.manualStartAudioLeadMs, 0));

  function applyTimerAction(state, action = {}, context = {}) {
    const nextState = cloneTimerState(state);
    const now = finiteNumber(context.now, Date.now());
    const actionNow = finiteNumber(context.actionNow, now);
    const elapsedAtAction = Math.max(0, finiteNumber(context.elapsedAtAction, state.elapsedBeforePause));
    const type = action.type;
    const effects = {
      clock: "keep",
      transitionAt: null,
      audioWakeCommand: null
    };
    let changed = false;

    if (type === "start") {
      const settings = action.settings || state.activeSettings;
      const requestedElapsed = Number(action.elapsedBeforePause);
      const pausedElapsed = Number.isFinite(requestedElapsed)
        ? Math.max(0, requestedElapsed)
        : state.elapsedBeforePause;
      const elapsed = state.completed ? 0 : state.running ? elapsedAtAction : pausedElapsed;
      const hasScheduledStartFields = action.startHours !== "" || action.startMinutes !== "";
      const startMode = action.startMode === "scheduled" || (!action.startMode && hasScheduledStartFields)
        ? "scheduled"
        : "manual";
      const scheduledStart = startMode === "scheduled";
      const manualAfterCountdown = Boolean(action.manualStart || state.waitingForManualStart);
      const freshManualStart = !scheduledStart && elapsed === 0;
      const startAudioLeadMs = freshManualStart && action.startAudioLead === true
        ? manualStartAudioLeadMs
        : 0;

      nextState.activeSettings = domain.normalizeActiveSettings(settings, state.activeSettings);
      nextState.running = true;
      nextState.completed = false;
      nextState.elapsedBeforePause = 0;
      nextState.manualStartLeadMs = startAudioLeadMs;
      nextState.manualStartDisplayHold = freshManualStart;
      nextState.countdownOnly = Boolean(
        nextState.activeSettings.oneShot
        && scheduledStart
        && !manualAfterCountdown
        && elapsed === 0
      );
      nextState.waitingForManualStart = false;
      const scheduledTime = scheduledStart
        ? scheduledStartTime(now, action.startHours, action.startMinutes, !nextState.activeSettings.oneShot)
        : 0;
      nextState.startedAt = elapsed > 0
        ? actionNow - elapsed * 1000
        : scheduledStart ? scheduledTime : actionNow + startAudioLeadMs;
      if (manualAfterCountdown) {
        nextState.draftSettings.startHours = "";
        nextState.draftSettings.startMinutes = "";
      }

      const oneShotDuration = nextState.activeSettings.rotationSeconds + nextState.activeSettings.breakSeconds;
      effects.clock = "set";
      effects.transitionAt = nextState.countdownOnly
        ? nextState.startedAt
        : nextState.activeSettings.oneShot
          ? nextState.startedAt + oneShotDuration * 1000
          : 0;
      effects.audioWakeCommand = startAudioLeadMs > 0
        ? { kind: "prewarm", startedAt: nextState.startedAt, leadMs: startAudioLeadMs }
        : null;
      changed = true;
    } else if (type === "pause" && state.running && state.startedAt <= now) {
      nextState.elapsedBeforePause = elapsedAtAction;
      nextState.running = false;
      nextState.countdownOnly = false;
      nextState.manualStartLeadMs = 0;
      nextState.manualStartDisplayHold = false;
      nextState.startedAt = 0;
      effects.clock = "clear";
      effects.transitionAt = 0;
      changed = true;
    } else if (type === "stopCountdown" && state.running && state.startedAt > now) {
      nextState.running = false;
      nextState.countdownOnly = false;
      nextState.waitingForManualStart = false;
      nextState.elapsedBeforePause = 0;
      nextState.manualStartLeadMs = 0;
      nextState.manualStartDisplayHold = false;
      nextState.startedAt = 0;
      effects.clock = "clear";
      effects.transitionAt = 0;
      changed = true;
    } else if (type === "reset") {
      const settings = action.settings || state.draftSettings;
      nextState.running = false;
      nextState.completed = false;
      nextState.countdownOnly = false;
      nextState.waitingForManualStart = false;
      nextState.elapsedBeforePause = 0;
      nextState.manualStartLeadMs = 0;
      nextState.manualStartDisplayHold = false;
      nextState.startedAt = 0;
      nextState.activeSettings = domain.normalizeActiveSettings(settings, state.activeSettings);
      effects.clock = "clear";
      effects.transitionAt = 0;
      changed = true;
    } else if (type === "seek" && !state.running) {
      const elapsed = Number(action.elapsed);
      if (Number.isFinite(elapsed)) {
        nextState.elapsedBeforePause = Math.max(0, elapsed);
        nextState.manualStartLeadMs = 0;
        nextState.manualStartDisplayHold = false;
        nextState.startedAt = 0;
        effects.clock = "clear";
        changed = true;
      }
    } else if (type === "settings") {
      nextState.activePreset = action.activePreset || "";
      nextState.draftSettings = domain.normalizeDraftSettings(action.settings || {}, nextState.activePreset);
      if (!state.running && state.elapsedBeforePause === 0) {
        nextState.activeSettings = domain.normalizeActiveSettings({
          rotationSeconds: nextState.draftSettings.rotationMinutes * 60,
          breakSeconds: Number(nextState.draftSettings.breakSeconds) || 0,
          oneShot: nextState.draftSettings.oneShot
        }, state.activeSettings);
      }
      changed = true;
    }

    if (changed) nextState.version = finiteNumber(state.version, 0) + 1;
    return { changed, state: nextState, effects };
  }

  return Object.freeze({ applyTimerAction });
}

module.exports = {
  cloneTimerState,
  createTimerTransitions
};
