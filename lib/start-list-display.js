"use strict";

(function exposeStartListDisplay(root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FDVStartListDisplay = api;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this), function createStartListDisplay() {
  var MAX_ROWS = 500;

  function safeArray(value) {
    return Object.prototype.toString.call(value) === "[object Array]" ? value : [];
  }

  function incidentKind(incident, kind) {
    return incident && incident.kind === kind;
  }

  function normalizeExcludedParticipants(value, rowCount) {
    var source = safeArray(value);
    var count = Math.max(0, Math.min(MAX_ROWS, Math.round(Number(rowCount) || 0)));
    var seen = {};
    var result = [];
    var index;
    var participantIndex;
    for (index = 0; index < source.length; index += 1) {
      participantIndex = Math.round(Number(source[index]));
      if (!isFinite(participantIndex) || participantIndex < 0 || participantIndex >= count || seen[String(participantIndex)]) continue;
      seen[String(participantIndex)] = true;
      result.push(participantIndex);
    }
    result.sort(function sortParticipantIndexes(left, right) { return left - right; });
    return result;
  }

  function participantScheduleIndex(participantIndex, excludedParticipants, rowCount) {
    var physicalIndex = Math.round(Number(participantIndex));
    var excluded = normalizeExcludedParticipants(excludedParticipants, rowCount);
    var scheduleIndex = physicalIndex;
    var index;
    if (!isFinite(physicalIndex) || physicalIndex < 0 || physicalIndex >= rowCount) return -1;
    for (index = 0; index < excluded.length; index += 1) {
      if (excluded[index] === physicalIndex) return -1;
      if (excluded[index] < physicalIndex) scheduleIndex -= 1;
    }
    return scheduleIndex;
  }

  function participantRowIndex(scheduleIndex, excludedParticipants, rowCount) {
    var target = Math.round(Number(scheduleIndex));
    var count = Math.max(0, Math.min(MAX_ROWS, Math.round(Number(rowCount) || 0)));
    var excluded = normalizeExcludedParticipants(excludedParticipants, count);
    var physicalIndex;
    var current = 0;
    if (!isFinite(target) || target < 0) return -1;
    for (physicalIndex = 0; physicalIndex < count; physicalIndex += 1) {
      if (excluded.indexOf(physicalIndex) !== -1) continue;
      if (current === target) return physicalIndex;
      current += 1;
    }
    return -1;
  }

  function includedParticipantCount(rowCount, excludedParticipants) {
    var count = Math.max(0, Math.min(MAX_ROWS, Math.round(Number(rowCount) || 0)));
    return Math.max(0, count - normalizeExcludedParticipants(excludedParticipants, count).length);
  }

  function rebaseIncidents(incidents, excludedParticipants, rowCount) {
    var source = safeArray(incidents);
    var excluded = normalizeExcludedParticipants(excludedParticipants, rowCount);
    var participantCount = includedParticipantCount(rowCount, excluded);
    var result = [];
    var index;
    var incident;
    var participantIndex;
    var originalParticipantIndex;
    var excludedIndex;
    if (!excluded.length) return source;
    for (index = 0; index < source.length; index += 1) {
      incident = source[index];
      if (!incidentKind(incident, "pause")) {
        result.push(incident);
        continue;
      }
      if (!participantCount) continue;
      originalParticipantIndex = Math.max(0, Math.round(Number(incident.participantIndex) || 0));
      participantIndex = originalParticipantIndex;
      for (excludedIndex = 0; excludedIndex < excluded.length; excludedIndex += 1) {
        if (excluded[excludedIndex] < originalParticipantIndex) participantIndex -= 1;
      }
      participantIndex = Math.min(participantCount - 1, participantIndex);
      result.push({
        kind: incident.kind,
        route: incident.route,
        startCycle: incident.startCycle,
        resumeCycle: incident.resumeCycle,
        participantIndex: participantIndex,
        resolution: incident.resolution
      });
    }
    return result;
  }

  function attemptCycle(participantIndex, routeIndex, schedule) {
    schedule = schedule || {};
    if (schedule.finalFormat === "old") {
      var participantCount = Math.max(1, Math.round(Number(schedule.participantCount) || 1));
      return routeIndex * participantCount + participantIndex + 1;
    }
    if (schedule.finalFormat === "new") {
      var restRotations = Math.max(1, Math.min(9, Math.round(Number(schedule.restRotations) || 3)));
      return participantIndex + 1 + routeIndex * (restRotations + 1);
    }
    return participantIndex + 1 + routeIndex * 2;
  }

  function pauseResolution(pause, incidents) {
    var source = safeArray(incidents);
    var index;
    var incident;
    if (!pause || pause.resumeCycle === null || pause.resumeCycle === undefined) return "";
    if (pause.resolution === "stop" || pause.resolution === "resume") return pause.resolution;
    for (index = 0; index < source.length; index += 1) {
      incident = source[index];
      if (incidentKind(incident, "stop")
          && incident.route === pause.route
          && incident.startCycle === pause.resumeCycle) return "stop";
    }
    return "resume";
  }

  function sortedPauses(incidents) {
    var pauses = [];
    var source = safeArray(incidents);
    var index;
    for (index = 0; index < source.length; index += 1) {
      if (incidentKind(source[index], "pause")) pauses.push(source[index]);
    }
    pauses.sort(function comparePauses(left, right) {
      return left.startCycle - right.startCycle || left.route - right.route;
    });
    return pauses;
  }

  function attemptInfo(participantIndex, routeIndex, incidents, schedule) {
    var source = safeArray(incidents);
    var baseCycle = attemptCycle(participantIndex, routeIndex, schedule);
    var activeCycle = baseCycle;
    var waitingFromCycle = null;
    var pause = null;
    var pauses = sortedPauses(source);
    var index;
    var incident;
    var incidentRouteIndex;
    var interruptedAttempt;
    var futureAffectedAttempt;
    var stoppedInsteadOfResumed;
    var incidentInterruptedAttempt;
    var priorIncidents;
    var blockedCycles;
    var continuesPastStoppedRoute;
    var sourceIndex;

    for (index = 0; index < pauses.length; index += 1) {
      incident = pauses[index];
      incidentRouteIndex = incident.route - 1;
      interruptedAttempt = participantIndex === incident.participantIndex
        && routeIndex === incidentRouteIndex
        && activeCycle === incident.startCycle;
      futureAffectedAttempt = participantIndex >= incident.participantIndex
        && activeCycle > incident.startCycle;
      if (!interruptedAttempt && !futureAffectedAttempt) continue;
      waitingFromCycle = activeCycle;
      pause = incident;
      if (incident.resumeCycle === null || incident.resumeCycle === undefined) {
        return { baseCycle: baseCycle, activeCycle: null, waitingFromCycle: waitingFromCycle, pause: incident };
      }
      stoppedInsteadOfResumed = pauseResolution(incident, source) === "stop";
      blockedCycles = incident.resumeCycle - incident.startCycle;
      if (stoppedInsteadOfResumed) {
        priorIncidents = [];
        for (sourceIndex = 0; sourceIndex < source.length; sourceIndex += 1) {
          if (!incidentKind(source[sourceIndex], "pause")) priorIncidents.push(source[sourceIndex]);
        }
        for (sourceIndex = 0; sourceIndex < index; sourceIndex += 1) priorIncidents.push(pauses[sourceIndex]);
        incidentInterruptedAttempt = attemptInfo(
          incident.participantIndex,
          incidentRouteIndex,
          priorIncidents,
          schedule
        ).activeCycle === incident.startCycle;
        if (!incidentInterruptedAttempt) blockedCycles = 0;
      }
      continuesPastStoppedRoute = stoppedInsteadOfResumed && routeIndex >= incident.route;
      activeCycle += Math.max(0, blockedCycles - (continuesPastStoppedRoute ? 1 : 0));
    }
    return { baseCycle: baseCycle, activeCycle: activeCycle, waitingFromCycle: waitingFromCycle, pause: pause };
  }

  function pauseMarkerRoute(participantIndex, pause, incidents, schedule) {
    var selectedRoute = -1;
    var selectedCycle = Infinity;
    var routeIndex;
    var attempt;
    if (!pause) return -1;
    for (routeIndex = 0; routeIndex < pause.route; routeIndex += 1) {
      attempt = attemptInfo(participantIndex, routeIndex, incidents, schedule);
      if (attempt.pause !== pause || attempt.waitingFromCycle === null) continue;
      if (stoppedAttempt(routeIndex, attempt, incidents)) continue;
      if (attempt.waitingFromCycle < selectedCycle) {
        selectedCycle = attempt.waitingFromCycle;
        selectedRoute = routeIndex;
      }
    }
    return selectedRoute;
  }

  function stoppedAttempt(routeIndex, attempt, incidents) {
    var source = safeArray(incidents);
    var stop = null;
    var index;
    for (index = 0; index < source.length; index += 1) {
      if (incidentKind(source[index], "stop") && source[index].route === routeIndex + 1) {
        stop = source[index];
        break;
      }
    }
    if (!stop) return false;
    if (attempt.activeCycle !== null && attempt.activeCycle >= stop.startCycle) return true;
    if (attempt.activeCycle === null && attempt.pause) return true;
    return attempt.pause && attempt.pause.route === routeIndex + 1
      && pauseResolution(attempt.pause, source) === "stop"
      && attempt.pause.resumeCycle === stop.startCycle
      && attempt.baseCycle === attempt.pause.startCycle;
  }

  function incidentsAtCycle(incidents, cycle) {
    var source = safeArray(incidents);
    var result = [];
    var index;
    var incident;
    for (index = 0; index < source.length; index += 1) {
      incident = source[index];
      if (!incidentKind(incident, "pause") || cycle >= incident.startCycle) result.push(incident);
    }
    return result;
  }

  function futurePauseMarker(participantIndex, routeIndex, cycle, incidents, schedule) {
    var source = safeArray(incidents);
    var index;
    var pause;
    var projectedIncidents;
    var attempt;
    for (index = 0; index < source.length; index += 1) {
      pause = source[index];
      if (!incidentKind(pause, "pause")
          || pause.startCycle <= cycle
          || (pause.resumeCycle !== null && pause.resumeCycle !== undefined)) continue;
      projectedIncidents = incidentsAtCycle(source, pause.startCycle);
      attempt = attemptInfo(participantIndex, routeIndex, projectedIncidents, schedule);
      if (attempt.pause === pause
          && routeIndex === pauseMarkerRoute(participantIndex, pause, projectedIncidents, schedule)) return true;
    }
    return false;
  }

  function marker(participantIndex, routeIndex, cycle, phase, incidents, schedule) {
    var source = safeArray(incidents);
    var effectiveIncidents = incidentsAtCycle(source, cycle);
    var attempt = attemptInfo(participantIndex, routeIndex, effectiveIncidents, schedule);
    var activeCycle;
    var waitingForPause;
    if (stoppedAttempt(routeIndex, attempt, source)) return "stopped";
    if (futurePauseMarker(participantIndex, routeIndex, cycle, source, schedule)) return "paused";
    activeCycle = attempt.activeCycle;
    if (cycle === 0) return activeCycle === 1 ? "ready" : "";
    waitingForPause = attempt.pause
      && cycle >= attempt.pause.startCycle
      && (attempt.pause.resumeCycle === null || attempt.pause.resumeCycle === undefined || cycle < attempt.pause.resumeCycle);
    if (waitingForPause
        && routeIndex === pauseMarkerRoute(participantIndex, attempt.pause, effectiveIncidents, schedule)) return "paused";
    if (activeCycle === null) return "";
    if (cycle === activeCycle - 1) return "ready";
    if (cycle < activeCycle) return "";
    if (cycle > activeCycle || phase === "break" || phase === "completed") return "done";
    return "active";
  }

  function participantAtCycle(routeIndex, cycle, incidents, rowCount, schedule) {
    var targetCycle = Math.max(1, Math.round(Number(cycle) || 1));
    var effectiveIncidents = incidentsAtCycle(incidents, targetCycle);
    var count = Number(rowCount);
    var participantIndex;
    if (!isFinite(count)) count = MAX_ROWS;
    count = Math.max(0, Math.min(MAX_ROWS, Math.round(count)));
    for (participantIndex = 0; participantIndex < count; participantIndex += 1) {
      if (attemptInfo(participantIndex, routeIndex, effectiveIncidents, schedule).activeCycle === targetCycle) {
        return participantIndex;
      }
    }
    return -1;
  }

  function participantAtOrAfterCycle(routeIndex, cycle, incidents, rowCount, schedule) {
    var targetCycle = Math.max(1, Math.round(Number(cycle) || 1));
    var effectiveIncidents = incidentsAtCycle(incidents, targetCycle);
    var count = Number(rowCount);
    var selectedParticipantIndex = -1;
    var selectedCycle = Infinity;
    var participantIndex;
    var attempt;
    if (!isFinite(count)) count = MAX_ROWS;
    count = Math.max(0, Math.min(MAX_ROWS, Math.round(count)));
    for (participantIndex = 0; participantIndex < count; participantIndex += 1) {
      attempt = attemptInfo(participantIndex, routeIndex, effectiveIncidents, schedule);
      if (attempt.activeCycle === null || attempt.activeCycle < targetCycle || attempt.activeCycle >= selectedCycle) continue;
      selectedParticipantIndex = participantIndex;
      selectedCycle = attempt.activeCycle;
    }
    return selectedParticipantIndex;
  }

  function activePauseForRoute(routeIndex, incidents, cycle) {
    var source = safeArray(incidents);
    var selectedCycle = Number(cycle);
    var index;
    var incident;
    for (index = 0; index < source.length; index += 1) {
      incident = source[index];
      if (!incidentKind(incident, "pause") || incident.route !== routeIndex + 1) continue;
      if (incident.resumeCycle === null || incident.resumeCycle === undefined) return incident;
      if (isFinite(selectedCycle)
          && selectedCycle >= incident.startCycle
          && selectedCycle < incident.resumeCycle
          && incident.resolution !== "stop") return incident;
    }
    return null;
  }

  function stopForRoute(routeIndex, incidents) {
    var source = safeArray(incidents);
    var index;
    for (index = 0; index < source.length; index += 1) {
      if (incidentKind(source[index], "stop") && source[index].route === routeIndex + 1) return source[index];
    }
    return null;
  }

  function routePauseHistory(routeIndex, cycle, incidents) {
    var source = safeArray(incidents);
    var result = [];
    var index;
    var incident;
    for (index = 0; index < source.length; index += 1) {
      incident = source[index];
      if (incidentKind(incident, "pause")
          && incident.route === routeIndex + 1
          && incident.resumeCycle !== null
          && incident.resumeCycle !== undefined) result.push(incident);
    }
    return result;
  }

  function routeState(routeIndex, cycle, incidents) {
    var source = safeArray(incidents);
    var stopped = stopForRoute(routeIndex, source);
    var recordedPause = false;
    var index;
    var incident;
    if (stopped && cycle >= stopped.startCycle) return "stopped";
    for (index = 0; index < source.length; index += 1) {
      incident = source[index];
      if (!incidentKind(incident, "pause")) continue;
      if (incident.route === routeIndex + 1) recordedPause = true;
      if (cycle >= incident.startCycle
          && (incident.resumeCycle === null || incident.resumeCycle === undefined || cycle < incident.resumeCycle)
          && routeIndex + 1 <= incident.route) return "paused";
    }
    if (stopped) return "stopped-history";
    return recordedPause ? "paused-history" : "";
  }

  function scheduledCycle(secondsUntilStart, rotationSeconds) {
    var remaining = Math.max(0, Number(secondsUntilStart) || 0);
    var preparationWindow = Math.max(1, Number(rotationSeconds) || 1);
    return remaining <= preparationWindow ? 0 : -1;
  }

  function rowStatus(participantIndex, routeCount, cycle, phase, incidents, schedule) {
    var hasReady = false;
    var routeIndex;
    var status;
    for (routeIndex = 0; routeIndex < routeCount; routeIndex += 1) {
      status = marker(participantIndex, routeIndex, cycle, phase, incidents, schedule);
      if (status === "active") return "active";
      if (status === "ready") hasReady = true;
    }
    return hasReady ? "ready" : "";
  }

  function scrollAnchor(routeCount, cycle, phase, incidents, rowCount, schedule) {
    var count = Math.max(0, Math.round(Number(rowCount) || 0));
    var participantIndex;
    var routeIndex;
    var completed;
    var status;
    var completedThrough;
    if (cycle <= 0) return 0;
    if (count > 0) {
      for (participantIndex = 0; participantIndex < count; participantIndex += 1) {
        completed = true;
        for (routeIndex = 0; routeIndex < routeCount; routeIndex += 1) {
          status = marker(participantIndex, routeIndex, cycle, phase, incidents, schedule);
          if (status !== "done" && status !== "stopped") {
            completed = false;
            break;
          }
        }
        if (!completed) return Math.max(0, participantIndex - 1);
      }
      return Math.max(0, count - 1);
    }
    completedThrough = phase === "break" || phase === "completed" ? cycle : cycle - 1;
    return Math.max(0, completedThrough - (routeCount - 1) * 2 - 1);
  }

  function prioritizedScrollAnchor(anchor, highlightedIndexes, visibleRowCount) {
    var base = Math.max(0, Math.round(Number(anchor) || 0));
    var source = Object.prototype.toString.call(highlightedIndexes) === "[object Array]" ? highlightedIndexes : [];
    var capacity = Math.max(1, Math.round(Number(visibleRowCount) || 1));
    var first = -1;
    var last = -1;
    var value;
    var i;
    for (i = 0; i < source.length; i += 1) {
      value = Math.round(Number(source[i]));
      if (!isFinite(value) || value < 0) continue;
      if (first < 0 || value < first) first = value;
      if (value > last) last = value;
    }
    if (first < 0 || last < 0) return base;
    return last - base + 1 > capacity ? first : base;
  }

  return {
    normalizeExcludedParticipants: normalizeExcludedParticipants,
    participantScheduleIndex: participantScheduleIndex,
    participantRowIndex: participantRowIndex,
    includedParticipantCount: includedParticipantCount,
    rebaseIncidents: rebaseIncidents,
    attemptCycle: attemptCycle,
    attemptInfo: attemptInfo,
    pauseMarkerRoute: pauseMarkerRoute,
    participantAtCycle: participantAtCycle,
    participantAtOrAfterCycle: participantAtOrAfterCycle,
    activePauseForRoute: activePauseForRoute,
    stopForRoute: stopForRoute,
    routePauseHistory: routePauseHistory,
    routeState: routeState,
    marker: marker,
    scheduledCycle: scheduledCycle,
    rowStatus: rowStatus,
    scrollAnchor: scrollAnchor,
    prioritizedScrollAnchor: prioritizedScrollAnchor
  };
});
