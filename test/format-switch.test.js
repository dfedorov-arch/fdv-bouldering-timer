"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createTimerDomain } = require("../lib/timer-domain");
const { createTimerTransitions } = require("../lib/timer-transitions");
const index = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const translations = vm.runInNewContext(`(${index.match(/const translations = (\{[\s\S]*?\n    \});/)[1]})`);
const transitions = createTimerTransitions(createTimerDomain({ classicRotationMinutes: 4, classicBreakSeconds: 15 }));

function source(name) {
  const match = index.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\) \\{[\\s\\S]*?\\n    \\}`));
  assert.ok(match, name);
  return match[0];
}

function harness({ standalone = false, answer = true, language = "ru", overrides = {} } = {}) {
  const state = { running: false, completed: false, countdownOnly: false, waitingForManualStart: false,
    elapsedBeforePause: 0, startedAt: 0, version: 8, activePreset: "final", runtimePreset: "final",
    startListFinalCycle: 17, activeSettings: { rotationSeconds: 240, breakSeconds: 0, oneShot: true,
      finalRoundFormat:"old", finalRestRotations:3 },
    draftSettings: { rotationMinutes: 4, breakSeconds: 0, oneShot: true,
      finalRoundFormat:"old", finalRestRotations:3 },
    startLists: [{ headers: ["#", "Name"], rows: [["1", "Test participant"]], routeCount: 2 }],
    ...overrides };
  let inputs = { ...state.draftSettings };
  let available = true;
  let sendResult = true;
  let waitForSend = null;
  const actions = [];
  const confirmations = [];
  const toggles = [];
  const snapshots = [];
  const resets = [];
  const buttons = ["classic", "festival", "final"].map(name => ({ dataset: { preset: name },
    classList: { toggle: (key, value) => toggles.push([name, key, value]) } }));
  const radios = ["old","new"].map(value=>({value,checked:value===inputs.finalRoundFormat}));
  const context = vm.createContext({ state, standaloneMode: standalone, els: { presets: buttons, finalRoundFormatInputs:radios },
    presets: {
      classic: { rotationMinutes: 4, breakSeconds: 15, oneShot: false },
      festival: { rotationMinutes: 120, breakSeconds: 1800, oneShot: false },
      final: { rotationMinutes: 4, breakSeconds: 0, oneShot: true }
    },
    controlsAvailable: () => available,
    t: key => translations[language][key],
    window: { confirm: message => { confirmations.push(message); return answer; } },
    setInputsFromDraft: value => { inputs = { ...value }; radios.forEach(r=>{r.checked=r.value===(value.finalRoundFormat||"old");}); },
    draftSettings: () => ({ ...inputs,finalRoundFormat:radios.find(r=>r.checked)?.value||"old" }),
    updateParameterLabels: () => {},
    saveOfflineSnapshot: () => snapshots.push(JSON.stringify(state)),
    syncButtons: () => {},
    sendServerAction: async (type, payload) => {
      actions.push({ type, ...payload });
      if (waitForSend) await waitForSend;
      if (sendResult === true) Object.assign(state, transitions.applyTimerAction(state, { type, ...payload }).state);
      return sendResult;
    },
    hardReset: async shouldSignal => {
      resets.push(shouldSignal);
      Object.assign(state, transitions.applyTimerAction(state, {
        type: "reset", activePreset: state.activePreset,
        settings: { rotationSeconds: inputs.rotationMinutes * 60, breakSeconds: inputs.breakSeconds,
          oneShot: inputs.oneShot, finalRoundFormat:radios.find(r=>r.checked)?.value||"old",
          finalRestRotations:inputs.finalRestRotations }
      }).state);
    }
  });
  vm.runInContext(`let presetChangeInFlight = false;
    ${["finalRoundProgressLocked", "formatSelectionLocked", "setPreset"].map(source).join("\n")}`, context);
  return { state, actions, confirmations, toggles, snapshots, resets, context,
    select: (name,options) => context.setPreset(name,options),
    selectRound: value => {radios.forEach(r=>{r.checked=r.value===value;});return context.setPreset("final",{finalRoundFormat:value});},
    selectedRound: () => radios.find(r=>r.checked)?.value,
    setAvailable: value => { available = value; },
    setSendResult: value => { sendResult = value; },
    deferSend: promise => { waitForSend = promise; },
    snapshot: () => JSON.stringify({ state, inputs, toggles, snapshots, resets, actions })
  };
}

test("stopped Final can switch directly to either repeating format without returning to Rotation 1", async () => {
  for (const standalone of [false, true]) {
    for (const preset of ["classic", "festival"]) {
      const h = harness({ standalone });
      assert.equal(h.context.formatSelectionLocked(), false);
      await h.select(preset);
      assert.deepEqual(h.confirmations, ['Вы уверены, что хотите завершить "Финал"?']);
      assert.equal(h.state.activePreset, preset);
      assert.equal(h.state.runtimePreset, preset);
      assert.equal(h.state.startListFinalCycle, 0);
      assert.equal(h.state.activeSettings.oneShot, false);
      assert.deepEqual(h.resets, [false]);
      assert.equal(h.state.startLists[0].rows[0][1], "Test participant");
      assert.equal(h.actions.length, standalone ? 0 : 1);
      if (!standalone) assert.equal(h.actions[0].type, "settings");
    }
  }
});

test("both Final round formats use the same confirmation and reset progress in server and standalone modes", async () => {
  for(const standalone of [false,true]) for(const [from,to] of [["old","new"],["new","old"]]) {
    const h=harness({standalone,overrides:{
      activeSettings:{rotationSeconds:360,breakSeconds:0,oneShot:true,finalRoundFormat:from,finalRestRotations:5},
      draftSettings:{rotationMinutes:6,breakSeconds:0,oneShot:true,finalRoundFormat:from,finalRestRotations:5}
    }});
    await h.selectRound(to);
    assert.deepEqual(h.confirmations,['Вы уверены, что хотите завершить "Финал"?']);
    assert.equal(h.state.activeSettings.finalRoundFormat,to);
    assert.equal(h.state.activeSettings.rotationSeconds,360);
    assert.equal(h.state.activeSettings.finalRestRotations,5);
    assert.equal(h.state.startListFinalCycle,0);
    assert.equal(h.state.runtimePreset,"final");
    assert.equal(h.selectedRound(),to);
    assert.deepEqual(h.resets,[false]);
    assert.equal(h.state.startLists[0].rows[0][1],"Test participant");
  }
});

test("cancelling a Final round change restores the native radio selection without writes", async () => {
  for(const standalone of [false,true]) {
    const h=harness({standalone,answer:false});
    const before=h.snapshot();
    await h.selectRound("new");
    assert.equal(h.selectedRound(),"old");
    assert.equal(h.snapshot(),before);
    assert.equal(h.confirmations.length,1);
  }
});

test("round changes are no-ops for the same selection and cannot bypass running or read-only locks", async () => {
  const same=harness();await same.selectRound("old");
  assert.equal(same.confirmations.length,0);assert.equal(same.actions.length,0);assert.equal(same.state.startListFinalCycle,17);
  for(const overrides of [{running:true},{elapsedBeforePause:12},{completed:true},{waitingForManualStart:true}]) {
    const h=harness({overrides});await h.selectRound("new");
    assert.equal(h.selectedRound(),"old");assert.equal(h.confirmations.length,0);assert.equal(h.actions.length,0);
  }
  const readonly=harness();readonly.setAvailable(false);await readonly.selectRound("new");
  assert.equal(readonly.selectedRound(),"old");assert.equal(readonly.confirmations.length,0);
});

test("round change waits for acknowledgement, rejects duplicates and restores selection on failure", {timeout:2000}, async () => {
  for(const result of [true,false,"conflict"]) {
    const h=harness();let finish;
    h.deferSend(new Promise(resolve=>{finish=resolve;}));h.setSendResult(result);
    const pending=h.selectRound("new");
    await h.select("festival");
    assert.equal(h.actions.length,1);assert.equal(h.confirmations.length,1);assert.equal(h.resets.length,0);
    finish();await pending;
    assert.equal(h.resets.length,result===true?1:0);
    assert.equal(h.selectedRound(),result===true?"new":"old");
    assert.equal(h.state.startListFinalCycle,result===true?0:17);
  }
});

test("cancelling Final exit preserves settings, progress, lists, selected buttons and snapshots", async () => {
  for (const standalone of [false, true]) {
    for (const preset of ["classic", "festival"]) {
      const h = harness({ standalone, answer: false });
      const before = h.snapshot();
      await h.select(preset);
      assert.equal(h.snapshot(), before);
      assert.equal(h.confirmations.length, 1);
    }
  }
});

test("confirmation is localized and is not shown for a Final that has not started", async () => {
  const english = harness({ answer: false, language: "en" });
  await english.select("classic");
  assert.deepEqual(english.confirmations, ['Are you sure you want to end "Final"?']);
  for (const standalone of [false, true]) {
    const h = harness({ standalone, overrides: { startListFinalCycle: 0 } });
    await h.select("festival");
    assert.equal(h.confirmations.length, 0);
    assert.equal(h.state.runtimePreset, "festival");
    const round = harness({ standalone, overrides: { startListFinalCycle: 0 } });
    await round.selectRound("new");
    assert.equal(round.confirmations.length, 0);
    assert.equal(round.state.activeSettings.finalRoundFormat, "new");
    assert.equal(round.state.startListFinalCycle, 0);
  }
});

test("running, paused, naturally completed and manual-start-waiting Finals remain locked until Stop", async () => {
  for (const overrides of [
    { running: true }, { elapsedBeforePause: 12 },
    { completed: true, elapsedBeforePause: 240 }, { waitingForManualStart: true },
    { running: true, countdownOnly: true }
  ]) {
    const h = harness({ overrides });
    const before = h.snapshot();
    assert.equal(h.context.formatSelectionLocked(), true);
    await h.select("classic");
    assert.equal(h.confirmations.length, 0);
    assert.equal(h.snapshot(), before);
  }
});

test("reselecting the current progressed Final does not reset its locked parameters or progress", async () => {
  const h = harness();
  const before = h.snapshot();
  await h.select("final");
  assert.equal(h.confirmations.length, 0);
  assert.equal(h.snapshot(), before);
});

test("ordinary format switches do not ask to finish Final", async () => {
  const h = harness({ overrides: { activePreset: "classic", runtimePreset: "classic", startListFinalCycle: 0 } });
  await h.select("festival");
  assert.equal(h.confirmations.length, 0);
  assert.equal(h.state.runtimePreset, "festival");
});

test("preset reset waits for the settings response, prevents duplicate switches and stops on failure", async () => {
  for (const result of [true, false, "conflict"]) {
    const h = harness();
    let finishSend;
    h.deferSend(new Promise(resolve => { finishSend = resolve; }));
    h.setSendResult(result);
    const pending = h.select("classic");
    assert.equal(h.resets.length, 0);
    await h.select("festival");
    assert.equal(h.actions.length, 1);
    assert.equal(h.confirmations.length, 1);
    finishSend();
    await pending;
    assert.equal(h.resets.length, result === true ? 1 : 0);
    assert.equal(vm.runInContext("presetChangeInFlight", h.context), false);
  }
});

test("unavailable controls and invalid presets cannot ask for confirmation or mutate Final", async () => {
  for (const unavailable of [false, true]) {
    const h = harness();
    h.setAvailable(!unavailable);
    const before = h.snapshot();
    await h.select(unavailable ? "classic" : "unknown");
    assert.equal(h.snapshot(), before);
    assert.equal(h.confirmations.length, 0);
  }
});
