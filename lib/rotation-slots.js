"use strict";

// Display/scheduling projection only: canonical athletes and timer clocks stay intact.
(function (root, factory) {
  var api = factory(function () { return typeof module === "object" && module.exports ? require("./start-list-display") : root.FDVStartListDisplay; });
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FDVRotationSlots = api;
})(typeof window !== "undefined" ? window : null, function (displayCore) {
  var cache = [];
  function classic(state) {
    return (state.running || state.completed || state.elapsedBeforePause > 0 || state.finalAppealActiveId
      ? state.runtimePreset : state.activePreset) === "classic";
  }
  function flow(plan, state) {
    return classic(state) && (plan.kind === "empty" || !plan.solo);
  }
  function build(state, listIndex, list) {
    if (!list) return { slots: [], normalCycles: null, key: "", conflicts: [], rowNumbers: [] };
    var all = state.finalAppealRotations || [], isClassic = classic(state);
    var relevant = all.filter(function (plan) {
      return plan.kind === "empty" ? plan.listIndex === listIndex
        : isClassic && !plan.solo && plan.entries.some(function (entry) { return entry.listIndex === listIndex; });
    });
    if (!relevant.length) return { slots: [], normalCycles: null, key: "", conflicts: [], rowNumbers: [] };
    var key = JSON.stringify([isClassic, listIndex, list.rows, list.excludedParticipants || [], list.routeCount, list.incidents || [], relevant]);
    var i, j, r, prior;
    for (i = 0; i < cache.length; i++) if (cache[i].key === key) return cache[i].value;
    var slots = [], fronts = [], immediate = [], normal = [], stream = [], excluded = list.excludedParticipants || [], conflicts = [];
    var routeCount = list.routeCount, rank = 0, usedFronts = {};
    for (i = 0; i < list.rows.length; i++) {
      if (excluded.indexOf(i) >= 0) continue;
      normal.push({ kind: "normal", participantIndex: i, rank: rank++, cycles: [] });
    }
    function resolvedSchedule() {
      var api = displayCore(), schedule = { attemptCycles: normal.map(function (row) { return row.cycles; }), slotKey: JSON.stringify(normal.map(function (row) { return row.cycles; })) };
      return { api: api, schedule: schedule, incidents: api.calculationIncidents(list.incidents, excluded, list.rows.length, schedule) };
    }
    function actualCycle(row, route, context) {
      return row.kind === "normal" ? context.api.attemptInfo(row.rank, route, context.incidents, context.schedule).activeCycle : row.cycles[route];
    }
    relevant.forEach(function (plan) {
      if (plan.kind === "empty") {
        var blank = { id: plan.id, planId: plan.id, kind: "empty", afterCycle: plan.afterCycle, listIndex: listIndex,
          participantIndex: -1, route: -1, timeSeconds: 0, startSignal: false, cycles: [], beforeIndex: Math.min(list.rows.length, plan.afterCycle) };
        blank.ordinal = slots.length; slots.push(blank);
        if (isClassic) fronts.push(blank);
      } else plan.entries.forEach(function (entry, entryIndex) {
        if (entry.listIndex !== listIndex) return;
        var slot = { id: plan.id + "_" + entryIndex, planId: plan.id, kind: "attempt", afterCycle: plan.afterCycle,
          listIndex: listIndex, participantIndex: entry.participantIndex, route: entry.route, timeSeconds: entry.timeSeconds,
          startSignal: entry.startSignal, cycles: [], beforeIndex: list.rows.length };
        slot.ordinal = slots.length; slots.push(slot);
        if (plan.placement === "immediate") immediate.push(slot); else fronts.push(slot);
      });
    });
    if (isClassic) {
      fronts.sort(function (a, b) { return a.afterCycle - b.afterCycle || a.ordinal - b.ordinal; });
      fronts.forEach(function (slot) {
        var cycle = slot.afterCycle + 1;
        while (usedFronts[cycle]) cycle++;
        usedFronts[cycle] = true; slot.frontCycle = cycle;
        for (var route = 0; route < routeCount; route++) slot.cycles[route] = cycle + 2 * route;
      });
      fronts.sort(function (a, b) { return a.frontCycle - b.frontCycle || (a.ordinal || 0) - (b.ordinal || 0); });
      normal.forEach(function (row) {
        var cycle = row.rank + 1;
        fronts.forEach(function (slot) { if (slot.frontCycle <= cycle) cycle++; });
        row.frontCycle = cycle;
        for (var route = 0; route < routeCount; route++) row.cycles[route] = cycle + 2 * route;
      });
      stream = normal.concat(fronts).sort(function (a, b) { return a.frontCycle - b.frontCycle; });
      immediate.sort(function (a, b) { return a.afterCycle - b.afterCycle || b.route - a.route || a.ordinal - b.ordinal; });
      immediate.forEach(function (slot) {
        var target = slot.afterCycle + 1, found = -1, row, route, k, context = resolvedSchedule();
        for (var n = 0; n < stream.length; n++) if (actualCycle(stream[n], slot.route, context) === target) { found = n; break; }
        if (found >= 0) {
          row = stream[found];
          slot.beforeIndex = list.rows.length;
          for (k = found; k < stream.length; k++) if (stream[k].kind === "normal") { slot.beforeIndex = stream[k].participantIndex; break; }
          if (row.kind === "normal") {
            for (k = found; k < stream.length; k++) for (route = slot.route; route < routeCount; route++) {
              if (actualCycle(stream[k], route, context) !== null && actualCycle(stream[k], route, context) >= target) stream[k].cycles[route]++;
            }
          } else if (row.kind === "attempt" && row.route === slot.route) conflicts.push(slot.id);
        } else {
          for (k = 0; k < stream.length; k++) if (stream[k].kind === "normal" && actualCycle(stream[k], slot.route, context) > target) {
            slot.beforeIndex = stream[k].participantIndex; break;
          }
        }
        for (route = 0; route < routeCount; route++) slot.cycles[route] = null;
        slot.cycles[slot.route] = target;
      });
      for (i = 0; i < stream.length; i++) if (stream[i].kind !== "normal") {
        for (j = i + 1; j < stream.length; j++) if (stream[j].kind === "normal") { stream[i].beforeIndex = stream[j].participantIndex; break; }
        if (j === stream.length) stream[i].beforeIndex = list.rows.length;
      }
      // Reserve against the resolved incident timeline, including flow slots.
      // A pause may otherwise move an ordinary athlete into an existing gap.
      slots.filter(function (slot) { return slot.kind === "attempt"; }).sort(function (a,b) {
        return a.cycles[a.route]-b.cycles[b.route] || b.route-a.route || a.ordinal-b.ordinal;
      }).forEach(function (slot) {
        var target=slot.cycles[slot.route], context=resolvedSchedule(), occupant=-1, n, k, route;
        for(n=0;n<normal.length;n++) if(actualCycle(normal[n],slot.route,context)===target){occupant=n;break;}
        if(occupant<0)return;
        for(k=occupant;k<normal.length;k++)for(route=slot.route;route<routeCount;route++) {
          var actual=actualCycle(normal[k],route,context);
          if(actual!==null && actual>=target)normal[k].cycles[route]++;
        }
      });
      var reserved = {};
      slots.forEach(function (slot) {
        if (slot.kind !== "attempt") return;
        var targetKey = slot.route + ":" + slot.cycles[slot.route];
        if (reserved[targetKey]) conflicts.push(slot.id);
        reserved[targetKey] = true;
      });
      var finalContext=resolvedSchedule();
      normal.forEach(function (row) { for(var route=0;route<routeCount;route++) {
        var cycle=actualCycle(row,route,finalContext), occupancy=route+":"+cycle;
        if(cycle===null)continue;
        if(reserved[occupancy])conflicts.push("normal_"+row.participantIndex+"_"+route);
        reserved[occupancy]=true;
      }});
    }
    slots.sort(function (a, b) { return a.beforeIndex - b.beforeIndex || a.afterCycle - b.afterCycle || a.ordinal - b.ordinal; });
    var numbers = [], displayIndex = 0, slotIndex = 0;
    for (i = 0; i <= list.rows.length; i++) {
      while (slotIndex < slots.length && slots[slotIndex].beforeIndex <= i) slots[slotIndex++].displayNumber = ++displayIndex;
      if (i < list.rows.length) numbers[i] = ++displayIndex;
    }
    var value = { slots: slots, normalCycles: isClassic ? normal.map(function (row) { return row.cycles; }) : null,
      key: key, conflicts: conflicts, rowNumbers: numbers };
    cache.push({ key: key, value: value }); if (cache.length > 8) cache.shift();
    return value;
  }
  function decorateSchedule(state, listIndex, list, schedule, elapsed) {
    var projection = build(state, listIndex, list);
    if (!projection.normalCycles) return schedule;
    var result = {}, name;
    for (name in schedule) if (Object.prototype.hasOwnProperty.call(schedule, name)) result[name] = schedule[name];
    result.attemptCycles = projection.normalCycles; result.slotKey = projection.key;
    var regular = state.finalAppealRegularSettings || state.activeSettings || {};
    result.rotationElapsed = Math.max(0, Number(elapsed) || 0) % Math.max(1, Number(regular.rotationSeconds) + Number(regular.breakSeconds || 0));
    result.pendingRepeatStarts = projection.slots.filter(function (slot) { return slot.kind === "attempt"; }).map(function (slot) {
      return { route: slot.route, cycle: slot.cycles[slot.route], offset: Math.max(0, Number(regular.rotationSeconds) - slot.timeSeconds) };
    });
    return result;
  }
  function marker(slot, route, cycle, phase, phaseElapsed, rotationSeconds) {
    if (slot.kind === "empty" || slot.route !== route) return "empty";
    var target = slot.cycles[route];
    if (cycle === target - 1) return "ready";
    if (cycle < target) return "";
    if (cycle > target || phase === "break" || phase === "completed") return "done";
    return phaseElapsed >= Math.max(0, rotationSeconds - slot.timeSeconds) ? "active" : "ready";
  }
  function orderColumn(header) { return /^(?:№|#|order|порядок|порядковый\s*номер)$/i.test(String(header || "").trim()); }
  function text(slot, column, list) {
    if (column === 0) return String(slot.displayNumber);
    return slot.kind === "empty" ? "-" : String((list.rows[slot.participantIndex] || [])[column] || "");
  }
  function cues(state) {
    if (!classic(state) || state.finalAppealActiveId) return [];
    var result = [], lists = state.startLists || [];
    lists.forEach(function (list, li) {
      if (!list) return;
      build(state, li, list).slots.forEach(function (slot) {
        if (slot.kind === "attempt" && slot.startSignal) result.push({ id: slot.id, cycle: slot.cycles[slot.route], timeSeconds: slot.timeSeconds });
      });
    });
    return result;
  }
  return { classic: classic, flow: flow, build: build, decorateSchedule: decorateSchedule, marker: marker,
    orderColumn: orderColumn, text: text, cues: cues };
});
