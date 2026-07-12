"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createTimerDomain } = require("../lib/timer-domain");
const { createTimerTransitions } = require("../lib/timer-transitions");

const domain = createTimerDomain({
  classicRotationMinutes: 4,
  classicBreakSeconds: 15
});
const transitions = createTimerTransitions(domain, { manualStartAudioLeadMs: 300 });

function baseState(overrides = {}) {
  return {
    running: false,
    completed: false,
    countdownOnly: false,
    waitingForManualStart: false,
    manualStartLeadMs: 0,
    manualStartDisplayHold: false,
    elapsedBeforePause: 0,
    startedAt: 0,
    activePreset: "classic",
    activeSettings: { rotationSeconds: 240, breakSeconds: 15, oneShot: false },
    draftSettings: {
      rotationMinutes: 4,
      breakSeconds: 15,
      oneShot: false,
      startHours: "",
      startMinutes: ""
    },
    version: 10,
    ...overrides
  };
}

test("fresh manual start creates an audio lead without mutating the previous state", () => {
  const state = baseState();
  const result = transitions.applyTimerAction(state, {
    type: "start",
    startMode: "manual",
    startHours: "",
    startMinutes: "",
    startAudioLead: true,
    settings: { rotationSeconds: 60, breakSeconds: 0, oneShot: true }
  }, { now: 100000, actionNow: 100000, elapsedAtAction: 0 });

  assert.equal(result.changed, true);
  assert.equal(result.state.running, true);
  assert.equal(result.state.startedAt, 100300);
  assert.equal(result.state.manualStartLeadMs, 300);
  assert.equal(result.state.manualStartDisplayHold, true);
  assert.equal(result.state.version, 11);
  assert.equal(result.effects.clock, "set");
  assert.equal(result.effects.transitionAt, 160300);
  assert.deepEqual(result.effects.audioWakeCommand, {
    kind: "prewarm",
    startedAt: 100300,
    leadMs: 300
  });
  assert.deepEqual(state, baseState());
});

test("resume preserves elapsed time and does not replay the manual audio lead", () => {
  const state = baseState({ elapsedBeforePause: 12.5 });
  const result = transitions.applyTimerAction(state, {
    type: "start",
    startMode: "manual",
    startAudioLead: true
  }, { now: 100000, actionNow: 100000, elapsedAtAction: 12.5 });

  assert.equal(result.state.startedAt, 87500);
  assert.equal(result.state.manualStartLeadMs, 0);
  assert.equal(result.state.manualStartDisplayHold, false);
  assert.equal(result.effects.audioWakeCommand, null);
});

test("scheduled one-shot enters countdown-only mode until its start", () => {
  const now = new Date(2026, 6, 12, 10, 0, 0, 0).getTime();
  const result = transitions.applyTimerAction(baseState(), {
    type: "start",
    startMode: "scheduled",
    startHours: 11,
    startMinutes: 0,
    settings: { rotationSeconds: 120, breakSeconds: 0, oneShot: true }
  }, { now, actionNow: now, elapsedAtAction: 0 });

  const expectedStart = new Date(2026, 6, 12, 11, 0, 0, 0).getTime();
  assert.equal(result.state.countdownOnly, true);
  assert.equal(result.state.startedAt, expectedStart);
  assert.equal(result.effects.transitionAt, expectedStart);
});

test("pause records effective elapsed time and clears the active clock", () => {
  const state = baseState({ running: true, startedAt: 90000 });
  const result = transitions.applyTimerAction(state, { type: "pause" }, {
    now: 100000,
    actionNow: 100000,
    elapsedAtAction: 10.25
  });

  assert.equal(result.changed, true);
  assert.equal(result.state.running, false);
  assert.equal(result.state.elapsedBeforePause, 10.25);
  assert.equal(result.state.startedAt, 0);
  assert.equal(result.effects.clock, "clear");
  assert.equal(result.effects.transitionAt, 0);
});

test("pause cannot cancel a future scheduled countdown", () => {
  const state = baseState({ running: true, countdownOnly: true, startedAt: 110000 });
  const result = transitions.applyTimerAction(state, { type: "pause" }, {
    now: 100000,
    actionNow: 100000,
    elapsedAtAction: 0
  });

  assert.equal(result.changed, false);
  assert.deepEqual(result.state, state);
});

test("stopCountdown only cancels a future start", () => {
  const future = baseState({
    running: true,
    countdownOnly: true,
    waitingForManualStart: true,
    startedAt: 110000
  });
  const stopped = transitions.applyTimerAction(future, { type: "stopCountdown" }, {
    now: 100000,
    actionNow: 100000,
    elapsedAtAction: 0
  });
  assert.equal(stopped.changed, true);
  assert.equal(stopped.state.running, false);
  assert.equal(stopped.state.waitingForManualStart, false);

  const active = baseState({ running: true, startedAt: 90000 });
  assert.equal(transitions.applyTimerAction(active, { type: "stopCountdown" }, {
    now: 100000,
    actionNow: 100000,
    elapsedAtAction: 10
  }).changed, false);
});

test("reset clears runtime flags and normalizes the next active settings", () => {
  const state = baseState({
    running: true,
    completed: true,
    elapsedBeforePause: 50,
    startedAt: 50000
  });
  const result = transitions.applyTimerAction(state, {
    type: "reset",
    settings: { rotationSeconds: -5, breakSeconds: 999999, oneShot: false }
  }, { now: 100000, actionNow: 100000, elapsedAtAction: 50 });

  assert.equal(result.state.running, false);
  assert.equal(result.state.completed, false);
  assert.equal(result.state.elapsedBeforePause, 0);
  assert.deepEqual(result.state.activeSettings, {
    rotationSeconds: 1,
    breakSeconds: 14400,
    oneShot: false
  });
});

test("seek works only while stopped and clamps negative elapsed time", () => {
  const stopped = transitions.applyTimerAction(baseState(), { type: "seek", elapsed: -12 }, {
    now: 100000,
    actionNow: 100000,
    elapsedAtAction: 0
  });
  assert.equal(stopped.changed, true);
  assert.equal(stopped.state.elapsedBeforePause, 0);

  const running = baseState({ running: true, startedAt: 90000 });
  assert.equal(transitions.applyTimerAction(running, { type: "seek", elapsed: 12 }, {
    now: 100000,
    actionNow: 100000,
    elapsedAtAction: 10
  }).changed, false);
});

test("settings update the draft and idle zero-position active settings", () => {
  const result = transitions.applyTimerAction(baseState(), {
    type: "settings",
    activePreset: "festival",
    settings: {
      rotationMinutes: 120,
      breakSeconds: 1800,
      oneShot: true,
      startHours: "",
      startMinutes: ""
    }
  }, { now: 100000, actionNow: 100000, elapsedAtAction: 0 });

  assert.equal(result.state.activePreset, "festival");
  assert.deepEqual(result.state.activeSettings, {
    rotationSeconds: 7200,
    breakSeconds: 1800,
    oneShot: true
  });
  assert.equal(result.state.version, 11);
});
