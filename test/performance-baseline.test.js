const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const baseline = require("../scripts/lib/performance-baseline");
const recordedBaseline = JSON.parse(fs.readFileSync(
  path.join(__dirname, "..", "docs", "baselines", "bce8a92-four-120x5-incidents.json"),
  "utf8"
));
const optimizedBaseline = JSON.parse(fs.readFileSync(
  path.join(__dirname, "..", "docs", "baselines", "optimization-01-canonical-start-lists.json"),
  "utf8"
));
const legacyFitBaseline = JSON.parse(fs.readFileSync(
  path.join(__dirname, "..", "docs", "baselines", "optimization-03-legacy-timer-fit.json"),
  "utf8"
));

test("baseline scenarios generate deterministic maximum-size protocols", () => {
  const scenario = baseline.createScenario("four-120x5-incidents");

  assert.equal(scenario.startLists.length, 4);
  scenario.startLists.forEach((list, index) => {
    assert.equal(list.title, `Performance baseline ${index + 1}`);
    assert.equal(list.rows.length, 120);
    assert.equal(list.routeCount, 5);
    assert.equal(list.incidents.length, 100);
  });
});

test("empty baseline scenario does not create placeholder protocols", () => {
  const scenario = baseline.createScenario("empty");

  assert.deepEqual(scenario.startLists, []);
  assert.equal(scenario.definition.listCount, 0);
});

test("client analysis compares clock offsets and canonical sound targets", () => {
  const clients = [
    {
      identity: { clientId: "a", mode: "modern" },
      clock: { offsetFromWallMs: 12, syncErrorMs: 8, serverAvailable: true },
      audio: { scheduledSignals: [{ id: "cycle:start", canonicalTargetServerTimeMs: 1000 }] }
    },
    {
      identity: { clientId: "b", mode: "modern" },
      clock: { offsetFromWallMs: 15.5, syncErrorMs: 11, serverAvailable: true },
      audio: { scheduledSignals: [{ id: "cycle:start", canonicalTargetServerTimeMs: 1000 }] }
    },
    {
      identity: { clientId: "legacy", mode: "legacy" },
      clock: { offsetFromWallMs: 14, syncErrorMs: null, serverAvailable: true },
      audio: { scheduledSignals: [] }
    }
  ];
  const result = baseline.analyzeClientSnapshots(clients);

  assert.equal(result.clientCount, 3);
  assert.equal(result.modernClients, 2);
  assert.equal(result.legacyClients, 1);
  assert.equal(result.clockOffsetSpreadMs, 3.5);
  assert.equal(result.maxReportedSyncErrorMs, 11);
  assert.equal(result.comparableSoundSignals, 1);
  assert.equal(result.maxCanonicalSoundTargetSpreadMs, 0);
  assert.equal(result.allServersAvailable, true);
});

test("repeated warning targets are aligned by order instead of collapsed by id", () => {
  const result = baseline.analyzeClientSnapshots([
    {
      identity: { clientId: "a", mode: "modern" },
      clock: { serverAvailable: true },
      audio: { scheduledSignals: [
        { id: "1:rotation:warn", canonicalTargetServerTimeMs: 1000 },
        { id: "1:rotation:warn", canonicalTargetServerTimeMs: 2000 }
      ] }
    },
    {
      identity: { clientId: "b", mode: "modern" },
      clock: { serverAvailable: true },
      audio: { scheduledSignals: [
        { id: "1:rotation:warn", canonicalTargetServerTimeMs: 1001 },
        { id: "1:rotation:warn", canonicalTargetServerTimeMs: 2001 }
      ] }
    }
  ]);

  assert.equal(result.comparableSoundSignals, 2);
  assert.equal(result.maxCanonicalSoundTargetSpreadMs, 1);
});

test("unknown baseline scenarios fail explicitly", () => {
  assert.throws(() => baseline.createScenario("unknown"), /Unknown performance scenario/);
});

test("recorded maximum baseline identifies its source and measurement limits", () => {
  assert.equal(recordedBaseline.schemaVersion, 1);
  assert.match(recordedBaseline.sourceCommit, /^bce8a92/);
  assert.equal(recordedBaseline.scenario.id, "four-120x5-incidents");
  assert.equal(recordedBaseline.invariants.displayLabelsMatched, true);
  assert.ok(recordedBaseline.invariants.maxCanonicalSoundTargetSpreadMs <= 1);
  assert.equal(recordedBaseline.fieldChecks.physicalSoundSync, "not-measured");
  assert.equal(recordedBaseline.recovery.offline.allClientsDetectedOutage, true);
  assert.equal(recordedBaseline.recovery.restart.allClientsReconnected, true);
});

test("first optimization report preserves synchronization and reduces render-path sanitation", () => {
  assert.equal(optimizedBaseline.baselineFile, "bce8a92-four-120x5-incidents.json");
  assert.equal(optimizedBaseline.scenario.id, "four-120x5-incidents");
  assert.equal(optimizedBaseline.invariants.displayLabelsMatched, true);
  assert.ok(optimizedBaseline.invariants.maxCanonicalSoundTargetSpreadMs <= 1);
  assert.equal(optimizedBaseline.invariants.browserConsoleErrors, 0);
  optimizedBaseline.comparison.startListNormalizations.reductionPercent.forEach((reduction) => {
    assert.ok(reduction >= 85);
  });
  assert.equal(optimizedBaseline.fieldChecks.physicalSoundSync, "not-measured");
});

test("Legacy timer-fit report proves steady seconds avoid measurement work", () => {
  assert.equal(legacyFitBaseline.scenario.id, "legacy-timer-fit");
  assert.ok(legacyFitBaseline.steadyState.delta.renderCalls >= 100);
  assert.equal(legacyFitBaseline.steadyState.delta.timerFitCalls, 0);
  assert.equal(legacyFitBaseline.steadyState.delta.timerFitSearches, 0);
  assert.equal(legacyFitBaseline.resizeChecks.additionalFitSearches, 2);
  assert.ok(legacyFitBaseline.resizeChecks.derivedCachedSkips > 0);
  assert.equal(legacyFitBaseline.invariants.resizeRecomputedFontAtBothSizes, true);
  assert.equal(legacyFitBaseline.invariants.timerContinuedAcrossResize, true);
  assert.equal(legacyFitBaseline.weakVmFieldValidation.legacy.timerFitSearches, 3);
  assert.equal(legacyFitBaseline.weakVmFieldValidation.legacy.maximumRenderDurationMs, 4);
  assert.ok(legacyFitBaseline.weakVmFieldValidation.alignedDisplayBoundaries.count >= 8);
  assert.equal(
    legacyFitBaseline.weakVmFieldValidation.alignedDisplayBoundaries.averageCommitSpreadMs,
    legacyFitBaseline.weakVmFieldValidation.alignedDisplayBoundaries.expectedGuardDifferenceMs
  );
  assert.equal(legacyFitBaseline.invariants.weakVmLegacySearchCountStableAfterStartup, true);
  assert.equal(legacyFitBaseline.invariants.crossClientSpreadMatchesIntentionalBoundaryGuards, true);
  assert.equal(legacyFitBaseline.invariants.browserConsoleErrors, 0);
});
