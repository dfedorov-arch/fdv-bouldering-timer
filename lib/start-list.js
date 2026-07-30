"use strict";

(function exposeStartList(root, factory) {
  const display = typeof module === "object" && module.exports
    ? require("./start-list-display")
    : root.FDVStartListDisplay;
  const api = factory(display);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FDVStartList = api;
})(typeof window !== "undefined" ? window : globalThis, (display) => {
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
    const excludedParticipants = display.normalizeExcludedParticipants(input?.excludedParticipants, rows.length);
    const result = { headers, rows, routeCount };
    if (title) result.title = title;
    if (incidents.length) result.incidents = incidents;
    if (excludedParticipants.length) result.excludedParticipants = excludedParticipants;
    return result;
  }

  function parse(text, routeCount) {
    const records = parseDelimited(text).filter((record) => record.some((value) => String(value).trim()));
    return parseRows(records, routeCount);
  }

  function populatedRuns(row) {
    const source = Array.isArray(row) ? row : [];
    const runs = [];
    let start = -1;
    for (let column = 0; column < Math.min(source.length, MAX_SOURCE_COLUMNS); column += 1) {
      const populated = Boolean(String(source[column] ?? "").trim());
      if (populated && start < 0) start = column;
      if (!populated && start >= 0) {
        runs.push({ start, end: column - 1 });
        start = -1;
      }
    }
    if (start >= 0) runs.push({ start, end: Math.min(source.length, MAX_SOURCE_COLUMNS) - 1 });
    return runs;
  }

  function detectTable(records) {
    const sourceRows = (Array.isArray(records) ? records : []).map((record) =>
      Array.isArray(record) ? record : []);
    let best = null;
    sourceRows.forEach((headerRow, headerIndex) => {
      populatedRuns(headerRow).forEach((run) => {
        const width = run.end - run.start + 1;
        const dataRows = [];
        let populatedCells = 0;
        for (let rowIndex = headerIndex + 1; rowIndex < sourceRows.length; rowIndex += 1) {
          const values = sourceRows[rowIndex].slice(run.start, run.end + 1);
          const filled = values.filter((value) => String(value ?? "").trim()).length;
          if (!filled) break;
          populatedCells += filled;
          dataRows.push(sourceRows[rowIndex]);
          if (dataRows.length >= MAX_ROWS) break;
        }
        if (!dataRows.length) return;
        const score = dataRows.length * width * MAX_SOURCE_COLUMNS + populatedCells;
        if (!best || score > best.score || (score === best.score && headerIndex < best.headerIndex)) {
          best = { ...run, headerIndex, dataRows, score };
        }
      });
    });
    return best;
  }

  function parseRows(records, routeCount) {
    const sourceRows = Array.isArray(records) ? records : [];
    const table = detectTable(sourceRows);
    if (!table) return null;
    const titleValues = table.headerIndex > 0
      ? (Array.isArray(sourceRows[table.headerIndex - 1]) ? sourceRows[table.headerIndex - 1] : [])
        .slice(table.start, table.end + 1)
        .filter((value) => String(value ?? "").trim())
      : [];
    return sanitize({
      title: titleValues.length === 1 ? titleValues[0] : "",
      headers: sourceRows[table.headerIndex].slice(table.start, table.end + 1),
      rows: table.dataRows.map((row) => row.slice(table.start, table.end + 1)),
      routeCount
    });
  }

  function worksheetContentRange(worksheet, utils) {
    if (!worksheet || !utils?.decode_cell || !utils?.encode_range) return null;
    const positions = Object.keys(worksheet).filter((address) => {
      if (address.startsWith("!")) return false;
      const cell = worksheet[address];
      return cell && cell.v !== undefined && cell.v !== null && String(cell.v).trim();
    }).map((address) => utils.decode_cell(address));
    if (!positions.length) return null;
    const startRow = Math.min(...positions.map((position) => position.r));
    const startColumn = Math.min(...positions.map((position) => position.c));
    const relevant = positions.filter((position) =>
      position.c >= startColumn && position.c < startColumn + MAX_SOURCE_COLUMNS);
    return utils.encode_range({
      s: { r: startRow, c: startColumn },
      e: {
        r: Math.min(
          Math.max(...relevant.map((position) => position.r)),
          startRow + MAX_ROWS + 49
        ),
        c: Math.max(...relevant.map((position) => position.c))
      }
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

  return {
    MAX_COLUMNS,
    MAX_ROWS,
    MAX_ROUTES,
    detectDelimiter,
    parseDelimited,
    sanitizeIncidents,
    sanitize,
    parse,
    detectTable,
    parseRows,
    worksheetContentRange,
    parseMxl,
    ...display
  };
});
