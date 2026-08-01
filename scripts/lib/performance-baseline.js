"use strict";

const scenarioDefinitions = Object.freeze({
  empty: Object.freeze({ listCount: 0, participants: 0, routeCount: 0, incidentMode: "none" }),
  "one-120x5": Object.freeze({ listCount: 1, participants: 120, routeCount: 5, incidentMode: "none" }),
  "four-120x5": Object.freeze({ listCount: 4, participants: 120, routeCount: 5, incidentMode: "none" }),
  "four-120x5-incidents": Object.freeze({ listCount: 4, participants: 120, routeCount: 5, incidentMode: "stress" })
});

function createIncidents(participants, routeCount) {
  const pauses = Array.from({ length: 95 }, (_, index) => {
    const route = (index % routeCount) + 1;
    const participantIndex = index % participants;
    const startCycle = participantIndex + 1 + ((route - 1) * 2);
    return {
      kind: "pause",
      route,
      startCycle,
      resumeCycle: startCycle + 3,
      participantIndex,
      resolution: "resume"
    };
  });
  const stops = Array.from({ length: routeCount }, (_, index) => ({
    kind: "stop",
    route: index + 1,
    startCycle: participants + 20 + index
  }));
  return [...pauses, ...stops].slice(0, 100);
}

function createStartList(listIndex, definition) {
  const rows = Array.from({ length: definition.participants }, (_, participantIndex) => [
    String(participantIndex + 1),
    `Participant ${String(participantIndex + 1).padStart(3, "0")}`,
    `Team ${(participantIndex % 12) + 1}`,
    participantIndex % 2 ? "B" : "A"
  ]);
  const list = {
    title: `Performance baseline ${listIndex + 1}`,
    headers: ["#", "Name", "Team", "Category"],
    rows,
    routeCount: definition.routeCount
  };
  if (definition.incidentMode === "stress") {
    list.incidents = createIncidents(definition.participants, definition.routeCount);
  }
  return list;
}

function createScenario(id) {
  const definition = scenarioDefinitions[id];
  if (!definition) throw new Error(`Unknown performance scenario: ${id}`);
  return {
    id,
    definition: { ...definition },
    startLists: Array.from({ length: definition.listCount }, (_, index) => createStartList(index, definition))
  };
}

function finiteNumbers(values) {
  return values.map(Number).filter(Number.isFinite);
}

function spread(values) {
  const finite = finiteNumbers(values);
  return finite.length > 1 ? Math.max(...finite) - Math.min(...finite) : 0;
}

function analyzeClientSnapshots(clients) {
  const snapshots = (Array.isArray(clients) ? clients : []).filter(Boolean);
  const clockOffsets = finiteNumbers(snapshots.map((snapshot) => snapshot.clock?.offsetFromWallMs));
  const syncErrors = finiteNumbers(snapshots.map((snapshot) => snapshot.clock?.syncErrorMs));
  const signalGroups = new Map();
  snapshots.forEach((snapshot) => {
    const clientId = snapshot.identity?.clientId || "";
    (snapshot.audio?.scheduledSignals || []).forEach((signal) => {
      if (!signal?.id || !Number.isFinite(Number(signal.canonicalTargetServerTimeMs))) return;
      if (!signalGroups.has(signal.id)) signalGroups.set(signal.id, new Map());
      const clientTargets = signalGroups.get(signal.id);
      if (!clientTargets.has(clientId)) clientTargets.set(clientId, []);
      clientTargets.get(clientId).push(Number(signal.canonicalTargetServerTimeMs));
    });
  });
  const signalSpreads = [];
  signalGroups.forEach((clientTargets, id) => {
    const targetSets = [...clientTargets.values()].map((targets) => [...targets].sort((left, right) => left - right));
    if (targetSets.length < 2) return;
    const comparableCount = Math.min(...targetSets.map((targets) => targets.length));
    for (let index = 0; index < comparableCount; index += 1) {
      const alignedTargets = targetSets.map((targets) => targets[targets.length - comparableCount + index]);
      signalSpreads.push({
        id: comparableCount > 1 ? `${id}#${index + 1}` : id,
        clients: targetSets.length,
        spreadMs: spread(alignedTargets)
      });
    }
  });
  return {
    clientCount: snapshots.length,
    modernClients: snapshots.filter((snapshot) => snapshot.identity?.mode === "modern").length,
    legacyClients: snapshots.filter((snapshot) => snapshot.identity?.mode === "legacy").length,
    allServersAvailable: snapshots.length
      ? snapshots.every((snapshot) => snapshot.clock?.serverAvailable !== false)
      : null,
    clockMethod: "same-host wall-clock offset spread",
    clockOffsetSpreadMs: clockOffsets.length > 1 ? spread(clockOffsets) : null,
    maxReportedSyncErrorMs: syncErrors.length ? Math.max(...syncErrors) : null,
    soundMethod: "canonical server target comparison; excludes user calibration offsets",
    comparableSoundSignals: signalSpreads.length,
    maxCanonicalSoundTargetSpreadMs: signalSpreads.length
      ? Math.max(...signalSpreads.map((signal) => signal.spreadMs))
      : null,
    soundSignals: signalSpreads
  };
}

function createReport(options = {}) {
  const clients = Array.isArray(options.clients) ? options.clients : [];
  return {
    schemaVersion: 1,
    recordedAt: options.recordedAt || new Date().toISOString(),
    sourceCommit: options.sourceCommit || "",
    scenario: options.scenario || null,
    sampleDurationMs: Number(options.sampleDurationMs) || 0,
    serverLoad: options.serverLoad || null,
    serverSteady: options.serverSteady || null,
    clients,
    invariants: analyzeClientSnapshots(clients),
    fieldChecks: {
      physicalSoundSync: "not-measured",
      networkDisconnectRecovery: "not-measured",
      serverRestartRecovery: "not-measured"
    }
  };
}

module.exports = {
  scenarioDefinitions,
  createIncidents,
  createStartList,
  createScenario,
  analyzeClientSnapshots,
  createReport
};
