"use strict";

(function exposeStartList(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FDVStartList = api;
})(typeof window !== "undefined" ? window : globalThis, () => {
  const MAX_SOURCE_COLUMNS = 20;
  const MAX_COLUMNS = MAX_SOURCE_COLUMNS + 1;
  const MAX_ROWS = 500;
  const MAX_CELL_LENGTH = 160;
  const MAX_ROUTES = 20;
  const MAX_INCIDENTS = 100;

  function sanitizeIncidents(value, routeCount, rowCount) {
    const source = Array.isArray(value) ? value.slice(0, MAX_INCIDENTS) : [];
    const pauses = [];
    const stops = new Map();
    source.forEach((incident) => {
      const kind = incident?.kind === "pause" || incident?.kind === "stop" ? incident.kind : "";
      const route = Math.round(Number(incident?.route));
      const startCycle = Math.round(Number(incident?.startCycle));
      if (!kind || route < 1 || route > routeCount || startCycle < 1 || startCycle > 9999) return;
      if (kind === "stop") {
        stops.set(route, { kind, route, startCycle });
        return;
      }
      const derivedParticipantIndex = startCycle - 1 - (route - 1) * 2;
      const participantIndex = Number.isInteger(Number(incident?.participantIndex))
        ? Math.round(Number(incident.participantIndex))
        : derivedParticipantIndex;
      if (participantIndex < 0 || participantIndex >= rowCount) return;
      const resumeValue = incident?.resumeCycle;
      const resumeCycle = resumeValue === null || resumeValue === undefined || resumeValue === ""
        ? null
        : Math.round(Number(resumeValue));
      if (resumeCycle !== null && (resumeCycle < startCycle || resumeCycle > 9999)) return;
      const resolution = incident?.resolution === "stop" || incident?.resolution === "resume"
        ? incident.resolution
        : "";
      pauses.push({ kind, route, startCycle, resumeCycle, participantIndex, resolution });
    });
    const resolvedPauses = pauses.map((pause) => {
      const stop = stops.get(pause.route);
      const stoppedAt = stop && stop.startCycle >= pause.startCycle ? stop.startCycle : null;
      const resumeCycle = pause.resumeCycle === null && stoppedAt !== null ? stoppedAt : pause.resumeCycle;
      if (resumeCycle === null) {
        const { resolution: _resolution, ...activePause } = pause;
        return activePause;
      }
      const resolution = pause.resolution
        || (stoppedAt === resumeCycle ? "stop" : "resume");
      return { ...pause, resumeCycle, resolution };
    });
    return [...resolvedPauses, ...stops.values()].sort((left, right) =>
      left.startCycle - right.startCycle || left.route - right.route || left.kind.localeCompare(right.kind));
  }

  function detectDelimiter(text) {
    const lines = String(text || "").split(/\r?\n/).filter((candidate) => candidate.trim()).slice(0, 8);
    const candidates = ["\t", ";", ","];
    return candidates.reduce((best, candidate) => {
      const count = lines.reduce((maximum, line) => Math.max(maximum, line.split(candidate).length - 1), 0);
      return count > best.count ? { delimiter: candidate, count } : best;
    }, { delimiter: "\t", count: 0 }).delimiter;
  }

  function parseDelimited(text, delimiter = detectDelimiter(text)) {
    const records = [];
    let record = [];
    let field = "";
    let quoted = false;
    const source = String(text || "").replace(/^\uFEFF/, "");
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (quoted) {
        if (character === '"' && source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (character === '"') {
          quoted = false;
        } else {
          field += character;
        }
      } else if (character === '"' && field === "") {
        quoted = true;
      } else if (character === delimiter) {
        record.push(field);
        field = "";
      } else if (character === "\n") {
        record.push(field.replace(/\r$/, ""));
        records.push(record);
        record = [];
        field = "";
      } else {
        field += character;
      }
    }
    record.push(field.replace(/\r$/, ""));
    if (record.some((value) => value.trim()) || records.length === 0) records.push(record);
    return records;
  }

  function sanitize(input) {
    const routeCount = Math.max(1, Math.min(MAX_ROUTES, Math.round(Number(input?.routeCount) || 1)));
    const title = String(input?.title || "").trim().slice(0, MAX_CELL_LENGTH);
    const rawHeaders = Array.isArray(input?.headers) ? input.headers.slice(0, MAX_COLUMNS) : [];
    const rawRows = (Array.isArray(input?.rows) ? input.rows : []).slice(0, MAX_ROWS);
    const populatedColumns = rawHeaders.reduce((indexes, value, index) => {
      const hasHeader = String(value ?? "").trim();
      const hasData = rawRows.some((row) => String(Array.isArray(row) ? row[index] ?? "" : "").trim());
      if (hasHeader || hasData) indexes.push(index);
      return indexes;
    }, []);
    const headers = populatedColumns.map((columnIndex) =>
      String(rawHeaders[columnIndex] || "").trim().slice(0, MAX_CELL_LENGTH) || `Column ${columnIndex + 1}`);
    const rows = rawRows.map((row) =>
      populatedColumns.map((columnIndex) =>
        String(Array.isArray(row) ? row[columnIndex] ?? "" : "").trim().slice(0, MAX_CELL_LENGTH))
    ).filter((row) => row.some(Boolean));
    if (!headers.length || !rows.length) return null;
    const hasCycleColumn = headers.some((_, columnIndex) => rows.every((row, rowIndex) => {
      const value = String(row[columnIndex] || "").trim();
      return /^\d+$/.test(value) && Number(value) === rowIndex + 1;
    }));
    if (!hasCycleColumn) {
      if (headers.length >= MAX_COLUMNS) {
        headers.pop();
        rows.forEach((row) => row.pop());
      }
      headers.unshift("#");
      rows.forEach((row, rowIndex) => row.unshift(String(rowIndex + 1)));
    }
    const incidents = sanitizeIncidents(input?.incidents, routeCount, rows.length);
    const result = { headers, rows, routeCount };
    if (title) result.title = title;
    if (incidents.length) result.incidents = incidents;
    return result;
  }

  function parse(text, routeCount) {
    const records = parseDelimited(text).filter((record) => record.some((value) => String(value).trim()));
    return parseRows(records, routeCount);
  }

  function parseRows(records, routeCount) {
    const rows = (Array.isArray(records) ? records : [])
      .filter((record) => Array.isArray(record) && record.some((value) => String(value ?? "").trim()));
    if (rows.length < 2) return null;
    const firstValues = rows[0].filter((value) => String(value ?? "").trim());
    const secondValues = rows[1]?.filter((value) => String(value ?? "").trim()) || [];
    const hasTitle = rows.length >= 3 && firstValues.length === 1 && secondValues.length >= 2;
    const tableRows = hasTitle ? rows.slice(1) : rows;
    return sanitize({
      title: hasTitle ? firstValues[0] : "",
      headers: tableRows[0],
      rows: tableRows.slice(1),
      routeCount
    });
  }

  function mxlText(source) {
    const bytes = source instanceof Uint8Array
      ? source
      : source instanceof ArrayBuffer
        ? new Uint8Array(source)
        : null;
    if (!bytes || bytes.length < 10) return "";
    const signature = Array.from(bytes.slice(0, 6), (value) => String.fromCharCode(value)).join("");
    if (signature !== "MOXCEL") return "";
    let start = -1;
    for (let index = 6; index <= bytes.length - 3; index += 1) {
      if (bytes[index] === 0xef && bytes[index + 1] === 0xbb && bytes[index + 2] === 0xbf) {
        start = index + 3;
        break;
      }
    }
    if (start < 0) start = bytes.indexOf(0x7b);
    if (start < 0) return "";
    return new TextDecoder("utf-8").decode(bytes.slice(start));
  }

  function balancedBlock(source, start) {
    if (source[start] !== "{") return null;
    let depth = 0;
    let quoted = false;
    for (let index = start; index < source.length; index += 1) {
      const character = source[index];
      if (quoted) {
        if (character === '"' && source[index + 1] === '"') index += 1;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') quoted = true;
      else if (character === "{") depth += 1;
      else if (character === "}" && --depth === 0) return { text: source.slice(start, index + 1), end: index + 1 };
    }
    return null;
  }

  function mxlCellValue(block) {
    const textValue = block.match(/\{"#","((?:""|[^"])*)"\}/);
    if (textValue) return textValue[1].replace(/""/g, '"');
    const numberValue = block.match(/\{"N",([^,}\r\n]+)\}/);
    return numberValue ? numberValue[1].trim() : "";
  }

  function parseMxl(source, routeCount) {
    const text = mxlText(source);
    if (!text) return null;
    const rowPattern = /(?:^|,)(\d+),0,(\d+),0,(?=\s*\{16,)/g;
    const parsedRows = [];
    let match;
    while ((match = rowPattern.exec(text)) && parsedRows.length <= MAX_ROWS) {
      const rowNumber = Number(match[1]);
      const columnCount = Number(match[2]);
      if (!Number.isInteger(rowNumber) || columnCount < 1 || columnCount > MAX_SOURCE_COLUMNS) continue;
      const values = [];
      let cursor = rowPattern.lastIndex;
      for (let column = 0; column < columnCount; column += 1) {
        const blockStart = text.indexOf("{16,", cursor);
        const block = blockStart >= 0 ? balancedBlock(text, blockStart) : null;
        if (!block) break;
        values.push(mxlCellValue(block.text));
        cursor = block.end;
      }
      if (values.length === columnCount) parsedRows.push({ rowNumber, columnCount, values });
    }
    if (parsedRows.length < 2) return null;

    const groups = [];
    for (const row of parsedRows) {
      const current = groups[groups.length - 1];
      if (current && row.rowNumber === current[current.length - 1].rowNumber + 1 && row.columnCount === current[0].columnCount) {
        current.push(row);
      } else {
        groups.push([row]);
      }
    }
    const table = groups.filter((group) => group.length >= 2).sort((left, right) => right.length - left.length)[0];
    if (!table) return null;
    const possibleTitleRow = parsedRows.find((row) => row.rowNumber === table[0].rowNumber - 1);
    const titleValues = possibleTitleRow?.values.filter((value) => String(value || "").trim()) || [];
    return sanitize({
      title: titleValues.length === 1 ? titleValues[0] : "",
      headers: table[0].values,
      rows: table.slice(1).map((row) => row.values),
      routeCount
    });
  }

  function attemptCycle(participantIndex, routeIndex, schedule = {}) {
    if (schedule?.finalFormat === "old") {
      const participantCount = Math.max(1, Math.round(Number(schedule.participantCount) || 1));
      return routeIndex * participantCount + participantIndex + 1;
    }
    if (schedule?.finalFormat === "new") {
      const restRotations = Math.max(1, Math.min(9, Math.round(Number(schedule.restRotations) || 3)));
      return participantIndex + 1 + routeIndex * (restRotations + 1);
    }
    return participantIndex + 1 + routeIndex * 2;
  }

  function attemptInfo(participantIndex, routeIndex, incidents = [], schedule = {}) {
    const baseCycle = attemptCycle(participantIndex, routeIndex, schedule);
    let activeCycle = baseCycle;
    let waitingFromCycle = null;
    let pause = null;
    const pauses = incidents.filter((incident) => incident?.kind === "pause")
      .sort((left, right) => left.startCycle - right.startCycle || left.route - right.route);
    for (const incident of pauses) {
      const incidentRouteIndex = incident.route - 1;
      const interruptedAttempt = participantIndex === incident.participantIndex
        && routeIndex === incidentRouteIndex
        && activeCycle === incident.startCycle;
      const futureAffectedAttempt = participantIndex >= incident.participantIndex
        && activeCycle > incident.startCycle;
      if (!interruptedAttempt && !futureAffectedAttempt) continue;
      waitingFromCycle = activeCycle;
      pause = incident;
      if (incident.resumeCycle === null || incident.resumeCycle === undefined) {
        return { baseCycle, activeCycle: null, waitingFromCycle, pause: incident };
      }
      const stoppedInsteadOfResumed = pauseResolution(incident, incidents) === "stop";
      const blockedCycles = incident.resumeCycle - incident.startCycle;
      const continuesPastStoppedRoute = stoppedInsteadOfResumed && routeIndex >= incident.route;
      activeCycle += Math.max(0, blockedCycles - (continuesPastStoppedRoute ? 1 : 0));
    }
    return { baseCycle, activeCycle, waitingFromCycle, pause };
  }

  function pauseResolution(pause, incidents = []) {
    if (!pause || pause.resumeCycle === null || pause.resumeCycle === undefined) return "";
    if (pause.resolution === "stop" || pause.resolution === "resume") return pause.resolution;
    return incidents.some((incident) => incident?.kind === "stop"
      && incident.route === pause.route
      && incident.startCycle === pause.resumeCycle)
      ? "stop"
      : "resume";
  }

  function pauseMarkerRoute(participantIndex, pause, incidents = [], schedule = {}) {
    if (!pause) return -1;
    let selectedRoute = -1;
    let selectedCycle = Infinity;
    for (let routeIndex = 0; routeIndex < pause.route; routeIndex += 1) {
      const attempt = attemptInfo(participantIndex, routeIndex, incidents, schedule);
      if (attempt.pause !== pause || attempt.waitingFromCycle === null) continue;
      if (attempt.waitingFromCycle < selectedCycle) {
        selectedCycle = attempt.waitingFromCycle;
        selectedRoute = routeIndex;
      }
    }
    return selectedRoute;
  }

  function stoppedAttempt(routeIndex, attempt, incidents = []) {
    const stop = incidents.find((incident) => incident?.kind === "stop" && incident.route === routeIndex + 1);
    if (!stop) return false;
    if (attempt.activeCycle !== null && attempt.activeCycle >= stop.startCycle) return true;
    return attempt.pause?.route === routeIndex + 1
      && pauseResolution(attempt.pause, incidents) === "stop"
      && attempt.pause.resumeCycle === stop.startCycle
      && attempt.baseCycle === attempt.pause.startCycle;
  }

  function incidentsAtCycle(incidents = [], cycle = 0) {
    return incidents.filter((incident) => incident?.kind !== "pause" || cycle >= incident.startCycle);
  }

  function marker(participantIndex, routeIndex, cycle, phase, incidents = [], schedule = {}) {
    const effectiveIncidents = incidentsAtCycle(incidents, cycle);
    const attempt = attemptInfo(participantIndex, routeIndex, effectiveIncidents, schedule);
    if (stoppedAttempt(routeIndex, attempt, incidents)) return "stopped";
    const activeCycle = attempt.activeCycle;
    if (cycle === 0) return activeCycle === 1 ? "ready" : "";
    const waitingForPause = attempt.pause
      && cycle >= attempt.pause.startCycle
      && (attempt.pause.resumeCycle === null || attempt.pause.resumeCycle === undefined || cycle < attempt.pause.resumeCycle);
    if (waitingForPause && routeIndex === pauseMarkerRoute(participantIndex, attempt.pause, effectiveIncidents, schedule)) return "paused";
    if (activeCycle === null) return "";
    if (cycle === activeCycle - 1) return "ready";
    if (cycle < activeCycle) return "";
    if (cycle > activeCycle || phase === "break" || phase === "completed") return "done";
    return "active";
  }

  function participantAtCycle(routeIndex, cycle, incidents = [], rowCount = MAX_ROWS, schedule = {}) {
    const targetCycle = Math.max(1, Math.round(Number(cycle) || 1));
    const effectiveIncidents = incidentsAtCycle(incidents, targetCycle);
    for (let participantIndex = 0; participantIndex < rowCount; participantIndex += 1) {
      if (attemptInfo(participantIndex, routeIndex, effectiveIncidents, schedule).activeCycle === targetCycle) return participantIndex;
    }
    return -1;
  }

  function activePauseForRoute(routeIndex, incidents = []) {
    return incidents.find((incident) => incident?.kind === "pause"
      && incident.route === routeIndex + 1
      && (incident.resumeCycle === null || incident.resumeCycle === undefined)) || null;
  }

  function stopForRoute(routeIndex, incidents = []) {
    return incidents.find((incident) => incident?.kind === "stop" && incident.route === routeIndex + 1) || null;
  }

  function routePauseHistory(routeIndex, cycle, incidents = []) {
    return incidents.filter((incident) => incident?.kind === "pause"
      && incident.route === routeIndex + 1
      && incident.resumeCycle !== null
      && incident.resumeCycle !== undefined);
  }

  function routeState(routeIndex, cycle, incidents = []) {
    const stopped = stopForRoute(routeIndex, incidents);
    if (stopped && cycle >= stopped.startCycle) return "stopped";
    const paused = incidents.some((incident) => incident?.kind === "pause"
      && cycle >= incident.startCycle
      && (incident.resumeCycle === null || incident.resumeCycle === undefined || cycle < incident.resumeCycle)
      && routeIndex + 1 <= incident.route);
    if (paused) return "paused";
    if (stopped) return "stopped-history";
    const recordedPause = incidents.some((incident) => incident?.kind === "pause"
      && incident.route === routeIndex + 1);
    return recordedPause ? "paused-history" : "";
  }

  function scheduledCycle(secondsUntilStart, rotationSeconds) {
    const remaining = Math.max(0, Number(secondsUntilStart) || 0);
    const preparationWindow = Math.max(1, Number(rotationSeconds) || 1);
    return remaining <= preparationWindow ? 0 : -1;
  }

  function rowStatus(participantIndex, routeCount, cycle, phase, incidents = [], schedule = {}) {
    const statuses = Array.from({ length: routeCount }, (_, routeIndex) => marker(participantIndex, routeIndex, cycle, phase, incidents, schedule));
    if (statuses.includes("active")) return "active";
    if (statuses.includes("ready")) return "ready";
    return "";
  }

  function scrollAnchor(routeCount, cycle, phase, incidents = [], rowCount = 0, schedule = {}) {
    if (cycle <= 0) return 0;
    if (rowCount > 0) {
      for (let participantIndex = 0; participantIndex < rowCount; participantIndex += 1) {
        const completed = Array.from({ length: routeCount }, (_, routeIndex) =>
          marker(participantIndex, routeIndex, cycle, phase, incidents, schedule))
          .every((status) => status === "done" || status === "stopped");
        if (!completed) return Math.max(0, participantIndex - 1);
      }
      return Math.max(0, rowCount - 1);
    }
    const completedThrough = phase === "break" || phase === "completed" ? cycle : cycle - 1;
    return Math.max(0, completedThrough - (routeCount - 1) * 2 - 1);
  }

  return {
    MAX_COLUMNS,
    MAX_ROWS,
    MAX_ROUTES,
    detectDelimiter,
    parseDelimited,
    sanitizeIncidents,
    sanitize,
    parse,
    parseRows,
    parseMxl,
    attemptCycle,
    attemptInfo,
    pauseMarkerRoute,
    participantAtCycle,
    activePauseForRoute,
    stopForRoute,
    routePauseHistory,
    routeState,
    marker,
    scheduledCycle,
    rowStatus,
    scrollAnchor
  };
});
