"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const index = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

function source(name) {
  const match = index.match(new RegExp(`function ${name}\\([\\s\\S]*?\\) \\{[\\s\\S]*?\\n    \\}`));
  assert.ok(match, name);
  return match[0];
}

function harness(settings = { rotationSeconds: 60, breakSeconds: 0, oneShot: false }) {
  let now = 0;
  let elapsed = 0;
  let nextTimer = 0;
  const timers = new Map();
  const audio = [];
  const noop = () => {};
  const elements = {};
  for (const key of ["phase", "status", "cycleMeta", "rotationMeta", "nextMeta", "timeMinutes", "timeSeconds"]) {
    elements[key] = { textContent: "" };
  }
  elements.time = { setAttribute: noop };
  const context = vm.createContext({
    performance: { now: () => now },
    window: {
      setTimeout: (callback, delay) => {
        const id = ++nextTimer;
        timers.set(id, { callback, at: now + delay });
        return id;
      },
      clearTimeout: id => timers.delete(id)
    },
    document: { hidden: false, body: { classList: { contains: () => false } } },
    state: { running: true, completed: false, timeline: [1], serverStartedAt: 0,
      elapsedBeforePause: 0, runtimePreset: "classic" },
    lastServerInstanceId: "server-a", lastServerVersion: 1, language: "ru",
    standaloneMode: false, isViewerClient: false, isScrubbing: false, resumeSnapPending: false,
    serverClockRate: 1,
    performanceLongRunDiagnostics: false,
    activeSettings: () => settings, buildTimeline: () => [1],
    elapsedSeconds: () => elapsed, serverNow: () => 100000 + elapsed * 1000,
    isManualStartHoldPending: () => false, cycleInputEditable: () => false,
    t: text => text, formatTime: seconds => String(seconds),
    setElementText: (element, text) => { element.textContent = text; },
    setElementClass: noop, setElementClassName: noop, setProgressWidth: noop,
    scheduleDisplayBoundary: noop, scheduleFitTimer: noop,
    syncAudioTestButtons: noop, syncButtonsWhenScheduledStartStateChanges: noop,
    syncButtons: noop, finalizeStandaloneState: noop, invalidateRuntimeUiCache: noop,
    performanceCount: noop, performanceStart: noop, performanceEnd: noop,
    scheduleStartListRender: noop, drawSchedule: noop, setScheduleMarkup: noop,
    scheduleSegmentSignals: (segment, remaining, duration, includePhase) => {
      audio.push({ cycle: segment.cycle, type: segment.type, remaining, duration, includePhase });
    },
    scheduleFinalWarnings: noop, els: elements
  });
  vm.runInContext(`
    const displayRollbackThresholdMs = 100;
    const displayRollbackHoldMs = 100;
    let timerDisplayCheckpoint = null, displayRollbackTimer = null;
    let lastDisplayTimeLabel = "", lastDisplayMinuteDigits = 0;
    let lastRuntimeMetaKey = "", lastProgressSegmentKey = "", lastSegmentIndex = -1;
    let lastRenderAt = 0;
    ${["getCurrentSegment", "timeParts", "setDisplayTime", "displayedCycleNumber", "setCycleMeta",
      "protectTimerDisplayFrame", "scheduleDisplayRollbackRelease", "renderCanonicalSegmentSignals", "render"]
      .map(source).join("\n")}
  `, context);
  return {
    context, elements, timers, audio,
    frame(value) { return { elapsed: value, segment: context.getCurrentSegment(value) }; },
    guard(frame, at, enabled = true, identity = "server-a:1") {
      now = at;
      return context.protectTimerDisplayFrame(frame, now, enabled, identity);
    },
    render(value, at) { elapsed = value; now = at; context.render(); },
    fireTimers(at) {
      now = at;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= at) { timers.delete(id); timer.callback(); }
      }
    },
    label() { return `${elements.timeMinutes.textContent}:${elements.timeSeconds.textContent}`; }
  };
}

test("actual render suppresses 10 -> 11 -> 10 and minute-digit rollback without delaying forward seconds", () => {
  for (const [duration, before, boundary, backwards, expected] of [
    [60, 49.995, 50.008, 49.993, "00:10"],
    [120, 60.995, 61.008, 60.993, "00:59"]
  ]) {
    const h = harness({ rotationSeconds: duration, breakSeconds: 0, oneShot: false });
    h.render(before, 0);
    h.render(boundary, 13);
    assert.equal(h.label(), expected);
    h.render(backwards, 14);
    assert.equal(h.label(), expected);
    assert.equal(h.timers.size, 1);
    h.render(boundary + 0.010, 39);
    assert.equal(h.label(), expected);
    assert.equal(h.timers.size, 0);
    h.render(boundary + 1, 1013);
    assert.equal(h.label(), duration === 60 ? "00:09" : "00:58");
  }
});

test("actual render holds rotation and break boundaries but audio sees unmodified canonical segments", () => {
  for (const [settings, boundary, cycle, phase] of [
    [{ rotationSeconds: 60, breakSeconds: 0, oneShot: false }, 60, 2, "rotation"],
    [{ rotationSeconds: 60, breakSeconds: 10, oneShot: false }, 60, 1, "break"],
    [{ rotationSeconds: 60, breakSeconds: 10, oneShot: false }, 70, 2, "rotation"],
    [{ rotationSeconds: 60, breakSeconds: 10, oneShot: true }, 60, 1, "break"]
  ]) {
    const h = harness(settings);
    h.render(boundary - 0.01, 0);
    h.render(boundary + 0.008, 18);
    const label = h.label();
    h.render(boundary - 0.007, 19);
    assert.equal(h.elements.phase.textContent, phase);
    assert.equal(h.elements.cycleMeta.textContent, `cycle ${cycle}`);
    assert.equal(h.label(), label);
    const canonical = h.context.getCurrentSegment(boundary - 0.007);
    assert.equal(h.audio.at(-1).type, canonical.type);
    assert.equal(h.audio.at(-1).cycle, canonical.cycle);
    assert.ok(Math.abs(h.audio.at(-1).remaining - 0.007) < 1e-9);
    assert.equal(h.context.elapsedSeconds(), boundary - 0.007);
  }
});

test("one-shot completion is protected from a small rollback without hiding its canonical audio path", () => {
  const h = harness({ rotationSeconds: 60, breakSeconds: 0, oneShot: true });
  h.render(60.008, 0);
  h.render(59.993, 1);
  assert.equal(h.label(), "00:00");
  assert.equal(h.elements.phase.textContent, "completed");
  assert.ok(Math.abs(h.audio.at(-1).remaining - 0.007) < 1e-9);
});

test("rollback threshold is inclusive at 100 ms; larger discontinuities are rendered immediately", () => {
  for (const rollback of [0.015, 0.050, 0.100, 0.100001, 0.350, 10]) {
    const h = harness();
    const accepted = h.frame(50.008);
    const backwards = h.frame(50.008 - rollback);
    assert.equal(h.guard(accepted, 0), accepted);
    assert.equal(h.guard(backwards, 0), rollback <= 0.100 ? accepted : backwards);
  }
});

test("a large correction cannot hide behind the time elapsed since the previous paint", () => {
  const h = harness();
  h.guard(h.frame(50.008), 0);
  const backwards = h.frame(49.928);
  // 50 ms of normal progress minus a 130 ms correction leaves an 80 ms rollback.
  assert.equal(h.guard(backwards, 50), backwards);
});

test("hold expires at 100 ms from the first reversal and repeated renders never extend its deadline", () => {
  const h = harness();
  const accepted = h.frame(50.008);
  const backwards = h.frame(49.993);
  h.guard(accepted, 0);
  for (const at of [1, 25, 50, 90, 100]) assert.equal(h.guard(backwards, at), accepted);
  assert.equal(h.guard(backwards, 101), backwards);
});

test("a dedicated release render enforces the hold limit even with no second-boundary callback", () => {
  const h = harness();
  h.render(50.008, 0);
  h.render(49.993, 1);
  assert.equal(h.label(), "00:10");
  const deadline = [...h.timers.values()][0].at;
  assert.equal(deadline, 101);
  h.render(49.993, 99);
  assert.equal([...h.timers.values()][0].at, deadline);
  h.fireTimers(101);
  assert.equal(h.label(), "00:11");
  assert.equal(h.timers.size, 0);
});

test("accepted state version, server instance and standalone command identity bypass a pending hold", () => {
  for (const change of [
    h => { h.context.lastServerVersion++; },
    h => { h.context.lastServerInstanceId = "server-b"; },
    h => { h.context.language = "en"; },
    h => { h.context.state.startedAt = 12345; }
  ]) {
    const h = harness();
    h.context.standaloneMode = true;
    h.render(60.008, 0);
    h.render(59.993, 1);
    assert.equal(h.elements.cycleMeta.textContent, "cycle 2");
    change(h);
    h.render(59.993, 2);
    assert.equal(h.elements.cycleMeta.textContent, "cycle 1");
    assert.equal(h.label(), "00:01");
    assert.equal(h.timers.size, 0);
  }
});

test("pause, stop, countdown, completed state, hidden page and scrubbing disable the guard", () => {
  for (const change of [
    h => { h.context.state.running = false; h.context.state.elapsedBeforePause = 50; },
    h => { h.context.state.running = false; },
    h => { h.context.state.countdownOnly = true; },
    h => { h.context.state.waitingForManualStart = true; },
    h => { h.context.state.completed = true; },
    h => { h.context.document.hidden = true; },
    h => { h.context.isScrubbing = true; }
  ]) {
    const h = harness();
    h.render(50.008, 0);
    h.render(49.993, 1);
    change(h);
    h.render(49.993, 2);
    assert.equal(h.timers.size, 0);
    assert.equal(vm.runInContext("timerDisplayCheckpoint", h.context), null);
  }
});

test("ordinary forward countdown and multi-rotation jumps never start a hold", () => {
  const h = harness({ rotationSeconds: 60, breakSeconds: 10, oneShot: false });
  for (const elapsed of [0, 1, 59.999, 60, 60.001, 69.999, 70, 7000]) {
    const frame = h.frame(elapsed);
    assert.equal(h.guard(frame, elapsed * 1000), frame);
  }
});

test("canonical scheduling does not repeat the new-phase signal after a boundary jitter", () => {
  const h = harness();
  const phaseSignals = [];
  Object.assign(h.context, {
    signal: kind => phaseSignals.push(kind), clearSignalTimers: () => {},
    schedulePerformanceAudioKeepalive: () => {}, scheduleFestivalAnnouncements: () => {},
    serverTimeForElapsed: value => value * 1000,
    shouldScheduleServerSignal: () => false, scheduleSignalAt: () => {},
    scheduleSegmentTimeoutAt: () => {}, audioPrewarmSeconds: 1,
    signalLateGraceMs: { start: 1500, rotationBoundary: 1200 },
    suppressPhaseSignalsUntil: 0, lastPhaseSignalKey: "", scheduledPhaseSignalKeys: new Set()
  });
  vm.runInContext(source("scheduleSegmentSignals"), h.context);
  h.render(59.99, 0);
  h.render(60.008, 18);
  h.render(59.993, 19);
  h.render(60.015, 41);
  assert.deepEqual(phaseSignals, ["start"]);
});
