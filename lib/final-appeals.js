"use strict";

// Shared by the authoritative server, standalone Modern and read-only Legacy.
// This module chooses attempts; it never owns a clock or plays audio.
(function (root, factory) {
  var api = factory(typeof module === "object" && module.exports ? require("./rotation-slots") : root.FDVRotationSlots);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FDVFinalAppeals = api;
})(typeof window !== "undefined" ? window : null, function (rotationSlots) {
  function copy(value) {
    var result = {}, key;
    for (key in value) if (Object.prototype.hasOwnProperty.call(value, key)) result[key] = value[key];
    return result;
  }
  function integer(value) { return typeof value === "number" && isFinite(value) && Math.floor(value) === value; }
  function plans(state) { return Array.isArray(state.finalAppealRotations) ? state.finalAppealRotations : []; }
  function active(state) {
    var all = plans(state), i;
    for (i = 0; i < all.length; i++) if (all[i].id === state.finalAppealActiveId) return all[i];
    return null;
  }
  function isNewFinal(state) {
    var inAttempt = state.running || state.completed || state.elapsedBeforePause > 0 || active(state);
    var settings = inAttempt ? state.activeSettings : (state.draftSettings || state.activeSettings);
    return (inAttempt ? state.runtimePreset : state.activePreset) === "final"
      && settings && settings.finalRoundFormat === "new";
  }
  function isFinal(state) {
    var inAttempt = state.running || state.completed || state.elapsedBeforePause > 0 || active(state);
    return (inAttempt ? state.runtimePreset : state.activePreset) === "final";
  }
  function isClassic(state) {
    var inAttempt = state.running || state.completed || state.elapsedBeforePause > 0 || active(state);
    return (inAttempt ? state.runtimePreset : state.activePreset) === "classic";
  }
  function supported(state) { return isFinal(state) || isClassic(state); }
  function exclusive(state, plan) { return isFinal(state) || plan.solo && plan.kind !== "empty"; }
  function regularSpan(state) {
    var settings = state.finalAppealRegularSettings || state.activeSettings || {};
    return Math.max(1, Number(settings.rotationSeconds) + Number(settings.breakSeconds || 0));
  }
  function oneAthlete(state, plan) {
    return isFinal(state) && !isNewFinal(state) || Boolean(plan && plan.solo);
  }
  function anchor(state, elapsed) {
    if (isClassic(state)) {
      if (active(state)) return Math.round((state.finalAppealClassicElapsed || 0) / regularSpan(state));
      var coordinate = Math.max(0, Number(elapsed === undefined ? state.elapsedBeforePause : elapsed) || 0);
      return state.running && !state.countdownOnly ? Math.floor(coordinate / regularSpan(state)) + 1
        : Math.ceil(coordinate / regularSpan(state));
    }
    return Math.max(0, Math.round(Number(state.startListFinalCycle) || 0))
      + (!active(state) && (state.running && !state.countdownOnly || state.completed || state.elapsedBeforePause > 0) ? 1 : 0);
  }
  function duration(plan) {
    if (plan.kind === "empty") return plan.timeSeconds;
    return Math.max.apply(Math, plan.entries.map(function (entry) { return entry.timeSeconds; }));
  }
  function maximumTime(state) {
    var minutes = Number((state.draftSettings || {}).rotationMinutes);
    var regular = state.finalAppealRegularSettings || state.activeSettings || {};
    var seconds = minutes > 0 && isFinite(minutes) ? Math.round(minutes * 60) : Number(regular.rotationSeconds);
    return seconds > 0 && isFinite(seconds) ? Math.max(1, Math.round(seconds)) : 240;
  }
  function upcoming(state, elapsed) {
    if (!supported(state)) return null;
    var current = active(state), all = plans(state), cycle = anchor(state, elapsed), foundCurrent = !current, i;
    for (i = 0; i < all.length; i++) {
      if (current && all[i].id === current.id) { foundCurrent = true; continue; }
      if (foundCurrent && exclusive(state, all[i]) && !all[i].completed && all[i].afterCycle === cycle) return all[i];
    }
    return null;
  }
  function startOffsets(plan) {
    if (!plan) return [];
    var total = duration(plan), result = [];
    plan.entries.forEach(function (entry) {
      var offset = total - entry.timeSeconds;
      if (entry.startSignal && result.indexOf(offset) < 0) result.push(offset);
    });
    return result.sort(function (a, b) { return a - b; });
  }
  function initialStartAllowed(state) {
    var plan = active(state);
    return !plan || !(state.finalAppealSignalFloor > 0) && startOffsets(plan).indexOf(0) >= 0;
  }
  function readyTime(state, li, pi, route, elapsed) {
    var candidates = [active(state), upcoming(state, elapsed)], i, j, plan;
    for (j = 0; j < candidates.length; j++) {
      plan = candidates[j]; if (!plan) continue;
      for (i = 0; i < plan.entries.length; i++) {
        var entry = plan.entries[i];
        if (entry.listIndex === li && entry.participantIndex === pi && entry.route === route) return entry.timeSeconds;
      }
    }
    return 0;
  }
  function locked(state, plan) {
    return plan.id === state.finalAppealActiveId && state.running;
  }
  function progress(state, elapsed) {
    var plan = active(state), next = upcoming(state, elapsed);
    var emptyRows = plans(state).filter(function (item) { return item.kind === "empty"; });
    var preview = (next ? ":next:" + JSON.stringify(next) : "") + (emptyRows.length ? ":empty:" + JSON.stringify(emptyRows) : "");
    var flowPlans = isClassic(state) ? plans(state).filter(function (item) { return !item.solo || item.kind === "empty"; }) : [];
    var phaseElapsed = Math.max(0, Number(elapsed) || 0) % regularSpan(state);
    var regular = state.finalAppealRegularSettings || state.activeSettings || {};
    var flowProgress = flowPlans.length ? ":flow:" + JSON.stringify(flowPlans) + ":" + flowPlans.map(function (item) {
      return item.entries.map(function (entry) { return phaseElapsed >= Number(regular.rotationSeconds) - entry.timeSeconds ? "1" : "0"; }).join("");
    }).join(":") : "";
    return plan ? plan.id + ":" + JSON.stringify(plan.entries) + ":" + Boolean(state.completed) + ":" + Boolean(state.running)
      + ":" + Boolean(state.countdownOnly || state.waitingForManualStart)
      + ":" + plan.entries.map(function (entry) { return elapsed >= duration(plan) - entry.timeSeconds ? "1" : "0"; }).join("") + preview : preview + flowProgress;
  }
  function replaceQueue(state, raw) {
    var normalized = normalize(raw, state), next = copy(state), plan = active(state);
    var replacement = plan && normalized.filter(function (item) { return item.id === plan.id; })[0];
    if (plan && !locked(state, plan) && JSON.stringify(replacement) !== JSON.stringify(plan)) {
      next.activeSettings = copy(state.finalAppealRegularSettings || state.activeSettings);
      next.finalAppealActiveId = "";
      next.finalAppealRegularSettings = null;
      next.finalAppealSignalFloor = 0;
      next.running = false;
      next.completed = false;
      next.countdownOnly = false;
      next.waitingForManualStart = false;
      next.elapsedBeforePause = isClassic(state) ? Number(state.finalAppealClassicElapsed) || 0 : 0;
      next.startedAt = 0;
      next.manualStartLeadMs = 0;
      next.manualStartDisplayHold = false;
    }
    next.finalAppealRotations = normalized;
    return stage(next);
  }
  function reposition(state, cycle) {
    var next = copy(state), current = active(state);
    if (current) {
      next.activeSettings = copy(state.finalAppealRegularSettings || state.activeSettings);
      next.finalAppealActiveId = "";
      next.finalAppealRegularSettings = null;
      next.finalAppealSignalFloor = 0;
    }
    next.finalAppealRotations = plans(state).map(function (item) {
      if (isClassic(state) && exclusive(state, item)) {
        var positioned = copy(item); positioned.completed = item.afterCycle < cycle; return positioned;
      }
      if (item.afterCycle >= cycle && item.completed || current && item.id === current.id) {
        var changed = copy(item); changed.completed = item.afterCycle < cycle; return changed;
      }
      return item;
    });
    return next;
  }
  function restoreTimeline(state) {
    // Older builds retained completion flags after seeking backwards. Restore
    // future queue entries without changing an active attempt or any clock.
    if (!isFinal(state) || active(state)) return state;
    return reposition(state, Math.max(1, Math.round(Number(state.startListFinalCycle) || 0) + 1));
  }
  function listUpdateError(state, nextLists) {
    var unfinished = plans(state).filter(function (plan) { return !plan.completed; });
    var structure = function (lists) { return lists.map(function (list) { return list && [list.rows, list.routeCount]; }); };
    if (unfinished.length && JSON.stringify(structure(state.startLists)) !== JSON.stringify(structure(nextLists))) return "rotation-list-locked";
    var error = "";
    unfinished.forEach(function (plan) {
      plan.entries.forEach(function (entry) {
        var list = nextLists[entry.listIndex];
        if (!list || (list.excludedParticipants || []).indexOf(entry.participantIndex) >= 0) error = "rotation-athlete-locked";
      });
    });
    if (isFinal(state)) nextLists.forEach(function (list, li) {
      if (!list) return;
      var previous = state.startLists[li];
      (list.incidents || []).forEach(function (incident) {
        if (incident.kind !== "pause") return;
        var old = (previous && previous.incidents || []).filter(function (p) {
          return p.kind === "pause" && p.route === incident.route && p.startCycle === incident.startCycle && p.participantIndex === incident.participantIndex;
        })[0];
        if (!old || incident.resolution === "resume" && (old.resolution !== "resume" || old.resumeCycle !== incident.resumeCycle)) error = "route-pause-unavailable";
      });
    });
    return error;
  }
  function retainedIncidents(state, list) {
    return isFinal(state) ? (list.incidents || []).filter(function (incident) { return incident.kind === "stop"; }) : [];
  }
  function clear(state) {
    var next = copy(state);
    if (next.finalAppealRegularSettings) next.activeSettings = copy(next.finalAppealRegularSettings);
    next.finalAppealRotations = [];
    next.finalAppealActiveId = "";
    next.finalAppealRegularSettings = null;
    next.finalAppealSignalFloor = 0;
    next.finalAppealClassicElapsed = 0;
    next.classicCueFloor = 0;
    return next;
  }
  function stage(state) {
    if (!supported(state) || active(state) || state.running || state.completed) return state;
    if (isFinal(state) && state.elapsedBeforePause > 0) return state;
    var all = plans(state), cycle = isClassic(state) ? (Number(state.elapsedBeforePause) || 0) / regularSpan(state)
      : Math.max(0, Number(state.startListFinalCycle) || 0), i;
    for (i = 0; i < all.length; i++) {
      if (exclusive(state, all[i]) && !all[i].completed && all[i].afterCycle === cycle) {
        var next = copy(state);
        next.finalAppealActiveId = all[i].id;
        next.finalAppealRegularSettings = copy(state.activeSettings);
        next.finalAppealClassicElapsed = isClassic(state) ? state.elapsedBeforePause : 0;
        next.elapsedBeforePause = 0;
        next.finalAppealSignalFloor = 0;
        next.activeSettings = copy(state.activeSettings);
        next.activeSettings.rotationSeconds = all[i].kind === "empty" ? maximumTime(state) : duration(all[i]);
        next.activeSettings.breakSeconds = 0;
        next.activeSettings.oneShot = true;
        next.runtimePreset = isClassic(state) ? "classic" : "final";
        return next;
      }
    }
    return state;
  }
  // Called before the existing timer transition. Exclusive attempts retain the
  // ordinary coordinate; shared Classic slots leave its clock continuous.
  function prepare(state, action, context) {
    var next = state, request = action, plan = active(state), managedCycle = false;
    if (action.type === "settings" && !state.running && !state.completed && !state.elapsedBeforePause
      && (action.activePreset !== state.activePreset
        || isFinal(state) && ((action.settings || {}).finalRoundFormat === "new") !== isNewFinal(state))) {
      next = clear(state);
    }
    if (supported(next) && plans(next).length && (action.type === "start" || action.type === "reset")) {
      managedCycle = true;
      next = copy(next);
      var finished = action.type === "start" ? state.completed
        : (state.running && !state.countdownOnly || state.completed || state.elapsedBeforePause > 0);
      if (finished) {
        if (plan) {
          next.finalAppealRotations = plans(next).map(function (item) {
            if (item.id !== plan.id) return item;
            var done = copy(item); done.completed = true; return done;
          });
          next.finalAppealActiveId = "";
          next.activeSettings = copy(next.finalAppealRegularSettings || next.activeSettings);
          next.finalAppealRegularSettings = null;
        } else if (isFinal(state)) next.startListFinalCycle = Math.max(0, Number(next.startListFinalCycle) || 0) + 1;
        next.running = false;
        next.completed = false;
        next.countdownOnly = false;
        next.waitingForManualStart = false;
        next.elapsedBeforePause = plan && isClassic(state) ? Number(state.finalAppealClassicElapsed) || 0 : 0;
        if (!plan && isClassic(state) && action.type === "reset") next = reposition(next, 0);
      }
      next = stage(next);
      request = copy(action);
      if (active(next)) {
        if (action.type === "start" && next.elapsedBeforePause > 0) {
          next.finalAppealSignalFloor = Math.max(Number(next.finalAppealSignalFloor) || 0, next.elapsedBeforePause);
        }
        request.activePreset = isClassic(next) ? "classic" : "final";
        request.settings = copy(next.activeSettings);
        if (action.type === "start") {
          request.elapsedBeforePause = next.elapsedBeforePause;
        }
      } else if (plan) {
        request.settings = isClassic(next) ? copy(next.activeSettings) : action.settings || copy(next.activeSettings);
        request.elapsedBeforePause = next.elapsedBeforePause;
      }
    }
    if (isClassic(next) && !active(next) && action.type === "start") {
      next = copy(next);
      next.classicCueFloor = Math.max(0, Number(request.elapsedBeforePause === undefined ? next.elapsedBeforePause : request.elapsedBeforePause) || 0);
    }
    return { state: next, action: request, managedCycle: managedCycle,
      resetElapsed: plan && isClassic(state) ? next.elapsedBeforePause : null };
  }
  function interruption(state) {
    if (!isClassic(state) || active(state) || state.countdownOnly) return null;
    var candidates = plans(state).filter(function (plan) { return plan.solo && !plan.completed && plan.kind !== "empty"; });
    if (!candidates.length) return null;
    return Math.min.apply(Math, candidates.map(function (plan) { return plan.afterCycle * regularSpan(state); }));
  }
  function interrupt(state, elapsed) {
    var boundary = interruption(state);
    if (!state.running || boundary === null || elapsed < boundary) return state;
    var next = copy(state);
    next.running = false; next.completed = false; next.countdownOnly = false; next.waitingForManualStart = false;
    next.elapsedBeforePause = boundary; next.startedAt = 0; next.manualStartLeadMs = 0; next.manualStartDisplayHold = false;
    return stage(next);
  }
  function normalize(raw, state) {
    if (!supported(state)) throw new Error("final-required");
    if (!Array.isArray(raw) || raw.length > 50) throw new Error("rotation-limit");
    var ids = {}, old = plans(state), result;
    result = raw.map(function (item) {
      if (!item || !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id) || ids[item.id]) throw new Error("rotation-id");
      ids[item.id] = true;
      var previous = old.filter(function (p) { return p.id === item.id; })[0];
      if (previous && JSON.stringify(item) === JSON.stringify(previous)) return previous;
      if (previous && locked(state, previous)) {
        if (JSON.stringify(item) !== JSON.stringify(previous)) throw new Error("rotation-locked");
        return previous;
      }
      var after = Number(item.afterCycle), usedAthletes = {}, usedRoutes = {};
      if (!integer(after) || after < (previous ? 0 : anchor(state, state.elapsed)) || after > 9999) throw new Error("rotation-after");
      var empty = item.kind === "empty";
      if (!Array.isArray(item.entries) || !empty && !item.entries.length || item.entries.length > 20) throw new Error("rotation-empty");
      if (empty && (item.entries.length || !integer(item.listIndex) || !state.startLists[item.listIndex])) throw new Error("rotation-list");
      if (!empty && oneAthlete(state, item) && item.entries.length !== 1) throw new Error("rotation-one-athlete");
      var entries = item.entries.map(function (entry) {
        var li = Number(entry.listIndex), pi = Number(entry.participantIndex), route = Number(entry.route), seconds = Number(entry.timeSeconds);
        var list = state.startLists[li];
        if (!integer(li) || !list || !integer(pi) || !list.rows[pi]
          || (list.excludedParticipants || []).indexOf(pi) >= 0) throw new Error("rotation-athlete");
        if (!integer(route) || route < 0 || route >= list.routeCount) throw new Error("rotation-route");
        if (usedAthletes[li + ":" + pi] || usedRoutes[li + ":" + route]) throw new Error("rotation-duplicate");
        if (!integer(seconds) || seconds < 1 || seconds > maximumTime(state)) throw new Error("rotation-time");
        usedAthletes[li + ":" + pi] = true; usedRoutes[li + ":" + route] = true;
        return { listIndex: li, participantIndex: pi, route: route, timeSeconds: seconds, startSignal: entry.startSignal === true };
      });
      var normalized = { id: item.id, afterCycle: after, entries: entries,
        completed: Boolean(previous && (previous.completed || isClassic(state) && !active(state)
          && after * regularSpan(state) < Number(state.elapsed === undefined ? state.elapsedBeforePause : state.elapsed)) && after < anchor(state, state.elapsed)) };
      if (empty) { normalized.kind = "empty"; normalized.listIndex = item.listIndex; normalized.timeSeconds = maximumTime(state); }
      if (isClassic(state) && !empty) { normalized.solo = item.solo === true; normalized.placement = item.placement === "immediate" ? "immediate" : "flow"; }
      return normalized;
    });
    old.forEach(function (item) {
      if (locked(state, item) && !ids[item.id]) throw new Error("rotation-locked");
    });
    if (isClassic(state)) {
      var candidate = copy(state); candidate.finalAppealRotations = result;
      (state.startLists || []).forEach(function (list, li) {
        if (list && rotationSlots.build(candidate, li, list).conflicts.length) throw new Error("rotation-conflict");
      });
    }
    return result;
  }
  // During A/R ordinary cells retain the state after the preceding rotation.
  // Only assigned athletes receive ready/active markers, all finishing together.
  function marker(state, li, pi, route, elapsed, fallback) {
    var plan = active(state), next = upcoming(state, elapsed), i;
    if (!plan) {
      if (!next || fallback === "active") return fallback;
      for (i = 0; i < next.entries.length; i++) {
        var prepared = next.entries[i];
        if (prepared.listIndex === li && prepared.participantIndex === pi && prepared.route === route) return "ready";
      }
      return fallback === "ready" ? "" : fallback;
    }
    for (i = 0; i < plan.entries.length; i++) {
      var entry = plan.entries[i];
      if (entry.listIndex === li && entry.participantIndex === pi && entry.route === route) {
        return state.completed ? "done"
          : !state.countdownOnly && !state.waitingForManualStart && (state.running || state.elapsedBeforePause > 0)
            && elapsed >= duration(plan) - entry.timeSeconds ? "active" : "ready";
      }
    }
    if (next) for (i = 0; i < next.entries.length; i++) {
      var following = next.entries[i];
      if (following.listIndex === li && following.participantIndex === pi && following.route === route) return "ready";
    }
    var attemptBegan = state.running && !state.countdownOnly || state.elapsedBeforePause > 0 || state.completed;
    if (fallback === "ready" && !next && attemptBegan) return fallback;
    return fallback === "active" || fallback === "ready" ? "" : fallback;
  }
  return { plans: plans, active: active, isNewFinal: isNewFinal, anchor: anchor, duration: duration,
    startOffsets: startOffsets, initialStartAllowed: initialStartAllowed, clear: clear, stage: stage,
    prepare: prepare, normalize: normalize, marker: marker, locked: locked, progress: progress, replaceQueue: replaceQueue,
    listUpdateError: listUpdateError, retainedIncidents: retainedIncidents, maximumTime: maximumTime,
    upcoming: upcoming, reposition: reposition, restoreTimeline: restoreTimeline,
    isFinal: isFinal, oneAthlete: oneAthlete, isClassic: isClassic, supported: supported,
    interruption: interruption, interrupt: interrupt, regularSpan: regularSpan, readyTime: readyTime };
});
