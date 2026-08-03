"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const startList = require("../lib/start-list");
const startListDisplay = require("../lib/start-list-display");
const XLSX = require("../lib/vendor/xlsx.mini.min.js");

test("modern and ES5-compatible display APIs use the same implementation", () => {
  for (const name of ["attemptCycle", "attemptInfo", "marker", "routeState", "rowStatus", "scrollAnchor", "prioritizedScrollAnchor", "scheduledCycle", "normalizeExcludedParticipants", "participantScheduleIndex", "participantRowIndex", "includedParticipantCount", "rebaseIncidents"]) {
    assert.equal(startList[name], startListDisplay[name]);
  }
});

test("active protocol range replaces the completed-row buffer only when space is tight", () => {
  assert.equal(startList.prioritizedScrollAnchor(10, [11, 12, 13, 14, 15, 16, 17, 18], 9), 10);
  assert.equal(startList.prioritizedScrollAnchor(10, [11, 12, 13, 14, 15, 16, 17, 18], 8), 11);
  assert.equal(startList.prioritizedScrollAnchor(10, [11, 14, 18], 9), 10);
  assert.equal(startList.prioritizedScrollAnchor(10, [11, 14, 18], 8), 11);
  assert.equal(startList.prioritizedScrollAnchor(10, [], 3), 10);
});

test("excluded participants are retained but removed from schedule calculations", () => {
  assert.deepEqual(startList.normalizeExcludedParticipants([4, 1, 4, -1, 99], 7), [1, 4]);
  assert.equal(startList.includedParticipantCount(7, [1, 4]), 5);
  assert.equal(startList.participantScheduleIndex(1, [1, 4], 7), -1);
  assert.equal(startList.participantScheduleIndex(5, [1, 4], 7), 3);
  assert.equal(startList.participantRowIndex(3, [1, 4], 7), 5);

  const excluded = [1];
  const physicalActiveRow = 5;
  const calculationIndex = startList.participantScheduleIndex(physicalActiveRow, excluded, 8);
  assert.equal(startList.marker(calculationIndex, 0, 5, "rotation"), "active");
  assert.equal(startList.marker(startList.participantScheduleIndex(4, [], 8), 0, 5, "rotation"), "active");
});

test("incident participant indexes are rebased around excluded rows", () => {
  const incidents = [
    { kind: "pause", route: 2, startCycle: 7, resumeCycle: null, participantIndex: 4 },
    { kind: "stop", route: 3, startCycle: 9 }
  ];
  assert.deepEqual(startList.rebaseIncidents(incidents, [1, 4], 7), [
    { kind: "pause", route: 2, startCycle: 7, resumeCycle: null, participantIndex: 3, resolution: undefined },
    incidents[1]
  ]);
});

test("parses CSV, TSV and quoted fields with arbitrary participant columns", () => {
  const csv = startList.parse('№;ИН;ФИО;Регион\r\n1;22;"Архипов, Вячеслав";Москва\r\n2;33;Овечкин Ярослав;СПб', 5);
  assert.deepEqual(csv, {
    headers: ["№", "ИН", "ФИО", "Регион"],
    rows: [["1", "22", "Архипов, Вячеслав", "Москва"], ["2", "33", "Овечкин Ярослав", "СПб"]],
    routeCount: 5
  });

  const tsv = startList.parse("Bib\tName\n12\tMalhasyan Artem", 3);
  assert.deepEqual(tsv.headers, ["#", "Bib", "Name"]);
  assert.deepEqual(tsv.rows[0], ["1", "12", "Malhasyan Artem"]);
});

test("adds a cycle column when no source column follows every row position", () => {
  const list = startList.parse("Start number;Name\n1;First\n3;Second\n4;Third", 5);
  assert.deepEqual(list.headers, ["#", "Start number", "Name"]);
  assert.deepEqual(list.rows, [
    ["1", "1", "First"],
    ["2", "3", "Second"],
    ["3", "4", "Third"]
  ]);

  const existingCycle = startList.parse("Name;Cycle\nFirst;1\nSecond;2", 5);
  assert.deepEqual(existingCycle.headers, ["Name", "Cycle"]);
});

test("recognizes a single-cell protocol title above column headers", () => {
  const list = startList.parse("Qualification group A\nStart number;Name\n12;First\n18;Second", 5);
  assert.equal(list.title, "Qualification group A");
  assert.deepEqual(list.headers, ["#", "Start number", "Name"]);
  assert.deepEqual(list.rows, [["1", "12", "First"], ["2", "18", "Second"]]);

  const oneColumn = startList.parse("Name\nFirst\nSecond", 3);
  assert.equal(Object.prototype.hasOwnProperty.call(oneColumn, "title"), false);
  assert.deepEqual(oneColumn.headers, ["#", "Name"]);
});

test("reads XLSX worksheet rows through the mini SheetJS build", () => {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["Final — men"],
    ["Start number", "Name", "Region"],
    [12, "Malhasyan Artem", "Moscow"],
    [18, "Ivanov Ivan", "Saint Petersburg"]
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Protocol");
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const restored = XLSX.read(bytes, { type: "buffer" });
  const records = XLSX.utils.sheet_to_json(restored.Sheets.Protocol, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false
  });

  assert.deepEqual(startList.parseRows(records, 4), {
    title: "Final — men",
    headers: ["#", "Start number", "Name", "Region"],
    rows: [
      ["1", "12", "Malhasyan Artem", "Moscow"],
      ["2", "18", "Ivanov Ivan", "Saint Petersburg"]
    ],
    routeCount: 4
  });
});

test("drops worksheet columns that are completely blank", () => {
  const list = startList.parseRows([
    ["Qualification", "", "", "", ""],
    ["Bib", "Name", "Team", "", ""],
    [12, "First", "A", "", ""],
    [18, "Second", "B", "", ""]
  ], 5);

  assert.deepEqual(list, {
    title: "Qualification",
    headers: ["#", "Bib", "Name", "Team"],
    rows: [
      ["1", "12", "First", "A"],
      ["2", "18", "Second", "B"]
    ],
    routeCount: 5
  });
});

test("detects the participant table and uses only its immediately preceding title row", () => {
  const list = startList.parseRows([
    ["Competition title", "", "", "", "unrelated note"],
    ["Route 1", "", "", "", "another note"],
    ["Bib", "Name", "Team", "", "Ignore"],
    [12, "First", "A", "", "outside table"],
    [18, "Second", "B", "", "outside table"]
  ], 5);

  assert.deepEqual(list, {
    title: "Route 1",
    headers: ["#", "Bib", "Name", "Team"],
    rows: [
      ["1", "12", "First", "A"],
      ["2", "18", "Second", "B"]
    ],
    routeCount: 5
  });
});

test("XLSX content bounds ignore formatted emptiness and remote cells outside protocol columns", () => {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["Competition title", "", ""],
    ["Route 1", "", ""],
    ["Bib", "Name", "Team"],
    [12, "First", "A"],
    [18, "Second", "B"]
  ]);
  worksheet.XFD1048576 = { t: "s", v: "ignore" };
  worksheet["!ref"] = "A1:XFD1048576";

  assert.equal(startList.worksheetContentRange(worksheet, XLSX.utils), "A1:C5");
});

test("parses 1C MXL table rows and escaped quotes", () => {
  const cell = (value, style = 1) => `{16,${style},{1,1,{"#","${String(value).replace(/"/g, '""')}"}},0}`;
  const emptyCell = "{16,4,{0},0}";
  const mxlBody = `{8,1,12,{"#","",1,1,"#","Default language","Default language",0},3,0,0,3,0,${cell("Ст. №")},1,${cell("Фамилия, имя")},2,${cell("Команда")},1,0,3,0,${cell("1", 2)},1,${cell("Абалихин Михаил", 4)},2,${cell('РУС "ГЦОЛИФК"', 4)},2,0,3,0,${cell("2", 2)},1,${cell("Иванов Иван", 4)},2,${emptyCell},3,0,0,{1,1,{"#","Подвал"},0}}`;
  const prefix = Uint8Array.from([77, 79, 88, 67, 69, 76, 0, 8, 0, 1, 0, 12, 0, 0xef, 0xbb, 0xbf]);
  const body = new TextEncoder().encode(mxlBody);
  const bytes = new Uint8Array(prefix.length + body.length);
  bytes.set(prefix);
  bytes.set(body, prefix.length);

  assert.deepEqual(startList.parseMxl(bytes, 4), {
    headers: ["Ст. №", "Фамилия, имя", "Команда"],
    rows: [
      ["1", "Абалихин Михаил", 'РУС "ГЦОЛИФК"'],
      ["2", "Иванов Иван", ""]
    ],
    routeCount: 4
  });
  assert.equal(startList.parseMxl(new TextEncoder().encode("not an mxl file"), 4), null);
});

test("cycle 12 matches the diagonal route progression in the reference table", () => {
  const status = (participant, route, phase = "rotation") => startList.marker(participant - 1, route - 1, 12, phase);
  assert.equal(status(4, 5), "active");
  assert.equal(status(5, 5), "ready");
  assert.equal(status(6, 4), "active");
  assert.equal(status(7, 4), "ready");
  assert.equal(status(8, 3), "active");
  assert.equal(status(9, 3), "ready");
  assert.equal(status(10, 2), "active");
  assert.equal(status(11, 2), "ready");
  assert.equal(status(12, 1), "active");
  assert.equal(status(13, 1), "ready");
  assert.equal(status(3, 5), "done");
  assert.equal(status(14, 1), "");
  assert.equal(status(12, 1, "break"), "done");
  assert.equal(startList.scrollAnchor(5, 12, "rotation"), 2);
});

test("old Final format completes every participant on a route before the next route", () => {
  const schedule = { finalFormat: "old", participantCount: 4 };
  assert.equal(startList.attemptCycle(0, 0, schedule), 1);
  assert.equal(startList.attemptCycle(3, 0, schedule), 4);
  assert.equal(startList.attemptCycle(0, 1, schedule), 5);
  assert.equal(startList.marker(3, 0, 4, "rotation", [], schedule), "active");
  assert.equal(startList.marker(0, 1, 4, "rotation", [], schedule), "ready");
  assert.equal(startList.marker(0, 1, 5, "rotation", [], schedule), "active");
  assert.equal(startList.marker(1, 1, 5, "rotation", [], schedule), "ready");
});

test("new Final format overlaps routes after the configured rest rotations", () => {
  const schedule = { finalFormat: "new", participantCount: 8, restRotations: 3 };
  assert.equal(startList.attemptCycle(0, 0, schedule), 1);
  assert.equal(startList.attemptCycle(0, 1, schedule), 5);
  assert.equal(startList.attemptCycle(0, 2, schedule), 9);
  assert.equal(startList.marker(3, 0, 4, "rotation", [], schedule), "active");
  assert.equal(startList.marker(0, 1, 4, "rotation", [], schedule), "ready");
  assert.equal(startList.marker(0, 1, 5, "rotation", [], schedule), "active");
  assert.equal(startList.marker(4, 0, 4, "rotation", [], schedule), "ready");
  assert.equal(startList.marker(1, 1, 5, "rotation", [], schedule), "ready");
});

test("before the first start only the first participant is marked ready", () => {
  assert.equal(startList.marker(0, 0, 0, "ready"), "ready");
  assert.equal(startList.marker(1, 0, 0, "ready"), "");
});

test("scheduled countdown reveals the first ready marker only during the last rotation window", () => {
  assert.equal(startList.scheduledCycle(1801, 300), -1);
  assert.equal(startList.marker(0, 0, startList.scheduledCycle(1801, 300), "ready"), "");
  assert.equal(startList.scheduledCycle(301, 300), -1);
  assert.equal(startList.scheduledCycle(300, 300), 0);
  assert.equal(startList.marker(0, 0, startList.scheduledCycle(300, 300), "ready"), "ready");
  assert.equal(startList.scheduledCycle(0, 300), 0);
});

test("temporary route incident pauses the affected wave and shifts it after resumption", () => {
  const pending = [{ kind: "pause", route: 3, startCycle: 15, resumeCycle: null, participantIndex: 10 }];
  assert.equal(startList.routeState(2, 10, pending), "paused-history");
  assert.equal(startList.routeState(2, 15, pending), "paused");
  assert.equal(startList.routeState(1, 15, pending), "paused");
  assert.equal(startList.marker(10, 2, 15, "rotation", pending), "paused");
  assert.equal(startList.marker(12, 1, 15, "rotation", pending), "active");
  assert.equal(startList.marker(14, 0, 15, "rotation", pending), "active");
  assert.equal(startList.marker(10, 2, 16, "rotation", pending), "paused");
  assert.equal(startList.marker(11, 2, 16, "rotation", pending), "paused");
  assert.equal(startList.marker(13, 1, 16, "rotation", pending), "paused");
  assert.equal(startList.marker(15, 0, 16, "rotation", pending), "paused");
  assert.equal(startList.marker(15, 1, 16, "rotation", pending), "");
  assert.equal(startList.marker(15, 2, 16, "rotation", pending), "");
  assert.equal(startList.marker(9, 3, 16, "rotation", pending), "active");
  assert.equal(startList.marker(10, 2, 12, "rotation", pending), "paused");
  assert.equal(startList.marker(11, 2, 12, "rotation", pending), "paused");
  assert.equal(startList.marker(13, 1, 12, "rotation", pending), "paused");
  assert.equal(startList.marker(15, 0, 12, "rotation", pending), "paused");
  assert.equal(startList.marker(9, 2, 12, "rotation", pending), "");

  const resumed = [{ ...pending[0], resumeCycle: 18 }];
  assert.equal(startList.marker(10, 2, 14, "rotation", resumed), "paused");
  assert.equal(startList.rowStatus(10, 5, 14, "rotation", resumed), "");
  assert.equal(startList.marker(10, 2, 17, "rotation", resumed), "paused");
  assert.equal(startList.marker(10, 2, 18, "rotation", resumed), "active");
  assert.equal(startList.marker(11, 2, 18, "rotation", resumed), "ready");
  assert.equal(startList.marker(13, 1, 18, "rotation", resumed), "ready");
  assert.equal(startList.marker(15, 0, 18, "rotation", resumed), "ready");
  assert.equal(startList.marker(11, 2, 19, "rotation", resumed), "active");
  assert.equal(startList.marker(13, 1, 19, "rotation", resumed), "active");
  assert.equal(startList.marker(15, 0, 19, "rotation", resumed), "active");
  assert.equal(startList.marker(10, 3, 20, "rotation", resumed), "active");
  assert.equal(startList.routeState(2, 10, resumed), "paused-history");
  assert.equal(startList.routeState(2, 15, resumed), "paused");
  assert.equal(startList.routeState(1, 15, resumed), "paused");
  assert.equal(startList.routeState(0, 17, resumed), "paused");
  assert.equal(startList.routeState(2, 17, resumed), "paused");
  assert.equal(startList.routeState(2, 18, resumed), "paused-history");
  assert.equal(startList.routeState(1, 18, resumed), "");
  assert.deepEqual(startList.routePauseHistory(2, 18, resumed), resumed);
});

test("a pause with a future resume cycle remains editable while it is active", () => {
  const pause = { kind: "pause", route: 2, startCycle: 17, resumeCycle: 20, participantIndex: 14, resolution: "resume" };
  assert.equal(startList.activePauseForRoute(1, [pause]), null);
  assert.equal(startList.activePauseForRoute(1, [pause], 16), null);
  assert.equal(startList.activePauseForRoute(1, [pause], 17), pause);
  assert.equal(startList.activePauseForRoute(1, [pause], 18), pause);
  assert.equal(startList.activePauseForRoute(1, [pause], 20), null);
  assert.equal(startList.editablePauseForRoute(1, [pause], 21, 18), pause);
  assert.equal(startList.editablePauseForRoute(1, [pause], 21, 20), null);
  const unresolved = { ...pause, startCycle: 11, resumeCycle: null, participantIndex: 8 };
  assert.equal(startList.editablePauseForRoute(1, [unresolved], 13, 12), unresolved);
});

test("a future pause keeps its marker after a future resume is scheduled", () => {
  const pause = { kind: "pause", route: 2, startCycle: 14, resumeCycle: 16, participantIndex: 11, resolution: "resume" };
  assert.equal(startList.marker(11, 1, 11, "rotation", [pause]), "paused");
  assert.equal(startList.marker(11, 1, 13, "rotation", [pause]), "paused");
  assert.equal(startList.marker(11, 1, 14, "rotation", [pause]), "paused");
  assert.equal(startList.marker(11, 1, 16, "rotation", [pause]), "active");
});

test("an incident in an empty cycle targets the next participant on that route", () => {
  const history = [{ kind: "pause", route: 2, startCycle: 15, resumeCycle: 18, participantIndex: 12 }];
  assert.equal(startList.participantAtCycle(2, 18, history, 30), -1);
  assert.equal(startList.participantAtOrAfterCycle(2, 18, history, 30), 12);
  assert.equal(startList.participantAtOrAfterCycle(2, 20, history, 30), 12);
  assert.equal(startList.participantAtOrAfterCycle(2, 99, history, 30), -1);
});

test("pause markers move past a permanently stopped earlier route", () => {
  const pause = { kind: "pause", route: 3, startCycle: 47, resumeCycle: null, participantIndex: 42 };
  const incidents = [
    { kind: "stop", route: 1, startCycle: 36 },
    pause
  ];
  assert.equal(startList.pauseMarkerRoute(47, pause, incidents), 1);
  for (let participantIndex = 42; participantIndex < 60; participantIndex += 1) {
    const markers = [0, 1, 2].map((routeIndex) =>
      startList.marker(participantIndex, routeIndex, 47, "rotation", incidents));
    assert.equal(markers.filter((marker) => marker === "paused").length, 1);
    assert.equal(markers[0], "stopped");
  }
});

test("scroll anchor remains defined when every participant is finished or paused", () => {
  const paused = [{ kind: "pause", route: 3, startCycle: 15, resumeCycle: null, participantIndex: 10 }];
  assert.equal(startList.scrollAnchor(5, 18, "rotation", paused, 16), 8);
  assert.equal(startList.scrollAnchor(1, 99, "rotation", [], 5), 4);
  assert.equal(startList.scrollAnchor(5, 99, "completed", [], 16), 15);
});

test("permanent route stop crosses this and all subsequent attempts without shifting other routes", () => {
  const incidents = [{ kind: "stop", route: 4, startCycle: 19 }];
  assert.equal(startList.routeState(3, 10, incidents), "stopped-history");
  assert.equal(startList.routeState(3, 15, incidents), "stopped-history");
  assert.equal(startList.routeState(3, 19, incidents), "stopped");
  assert.equal(startList.marker(11, 3, 19, "rotation", incidents), "done");
  assert.equal(startList.marker(12, 3, 18, "rotation", incidents), "stopped");
  assert.equal(startList.marker(12, 3, 19, "rotation", incidents), "stopped");
  assert.equal(startList.marker(13, 3, 20, "rotation", incidents), "stopped");
  assert.equal(startList.marker(18, 0, 19, "rotation", incidents), "active");
});

test("a later pause on another route does not remove permanent stop markers", () => {
  const stopped = [{ kind: "stop", route: 4, startCycle: 18 }];
  const stoppedAndPaused = [
    ...stopped,
    { kind: "pause", route: 2, startCycle: 18, resumeCycle: null, participantIndex: 15 }
  ];

  assert.equal(startList.marker(11, 3, 18, "rotation", stopped), "stopped");
  assert.equal(startList.marker(14, 3, 18, "rotation", stopped), "stopped");
  assert.equal(startList.marker(39, 3, 18, "rotation", stopped), "stopped");
  assert.equal(startList.marker(11, 3, 18, "rotation", stoppedAndPaused), "stopped");
  assert.equal(startList.marker(14, 3, 18, "rotation", stoppedAndPaused), "stopped");
  assert.equal(startList.marker(39, 3, 18, "rotation", stoppedAndPaused), "stopped");
  assert.equal(startList.marker(15, 1, 18, "rotation", stoppedAndPaused), "paused");
  const stoppedCount = (incidentList) => Array.from({ length: 120 }, (_, participantIndex) =>
    startList.marker(participantIndex, 3, 18, "rotation", incidentList)
  ).filter((status) => status === "stopped").length;
  assert.equal(stoppedCount(stopped), 109);
  assert.equal(stoppedCount(stoppedAndPaused), 109);
});

test("stopping a paused route releases the delayed wave without a resume cycle", () => {
  const incidents = [
    { kind: "pause", route: 3, startCycle: 36, resumeCycle: 38, participantIndex: 31 },
    { kind: "stop", route: 3, startCycle: 38 }
  ];
  assert.equal(startList.marker(31, 2, 38, "rotation", incidents), "stopped");
  assert.equal(startList.marker(31, 3, 38, "rotation", incidents), "ready");
  assert.equal(startList.marker(32, 3, 38, "rotation", incidents), "");
  assert.equal(startList.marker(33, 3, 38, "rotation", incidents), "");
  assert.equal(startList.marker(34, 1, 38, "rotation", incidents), "ready");
  assert.equal(startList.marker(35, 1, 38, "rotation", incidents), "");
  assert.equal(startList.marker(36, 0, 38, "rotation", incidents), "ready");
  assert.equal(startList.marker(37, 0, 38, "rotation", incidents), "");
  assert.equal(startList.marker(31, 3, 39, "rotation", incidents), "active");
  assert.equal(startList.marker(32, 3, 39, "rotation", incidents), "ready");
  assert.equal(startList.marker(34, 1, 39, "rotation", incidents), "active");
  assert.equal(startList.marker(36, 0, 39, "rotation", incidents), "active");

  const migrated = startList.sanitize({
    headers: ["#", "Name"],
    rows: Array.from({ length: 40 }, (_, index) => [String(index + 1), `Participant ${index + 1}`]),
    routeCount: 5,
    incidents
  });
  assert.equal(migrated.incidents[0].resolution, "stop");
  assert.equal(startList.marker(31, 3, 38, "rotation", migrated.incidents), "ready");
});

test("stopping a future pause in an empty cycle does not delay the following routes", () => {
  const incidents = [
    { kind: "pause", route: 3, startCycle: 27, resumeCycle: 36, participantIndex: 22, resolution: "resume" },
    { kind: "pause", route: 1, startCycle: 40, resumeCycle: 45, participantIndex: 35, resolution: "stop" },
    { kind: "stop", route: 1, startCycle: 45 }
  ];
  assert.equal(startList.marker(35, 1, 48, "rotation", incidents), "done");
  assert.equal(startList.marker(36, 1, 48, "rotation", incidents), "active");
  assert.equal(startList.marker(37, 1, 48, "rotation", incidents), "ready");
  assert.equal(startList.marker(35, 2, 48, "rotation", incidents), "ready");
});

test("incident settings are sanitized with each start list", () => {
  const list = startList.sanitize({
    headers: ["#", "Name"],
    rows: [["1", "First"], ["2", "Second"], ["3", "Third"]],
    routeCount: 3,
    incidents: [
      { kind: "pause", route: 2, startCycle: 3, resumeCycle: 5, participantIndex: 0 },
      { kind: "stop", route: 3, startCycle: 7 },
      { kind: "stop", route: 8, startCycle: 1 }
    ]
  });
  assert.deepEqual(list.incidents, [
    { kind: "pause", route: 2, startCycle: 3, resumeCycle: 5, participantIndex: 0, resolution: "resume" },
    { kind: "stop", route: 3, startCycle: 7 }
  ]);
});

test("excluded participant indexes are sanitized with each start list", () => {
  const list = startList.sanitize({
    headers: ["#", "Name"],
    rows: [["1", "First"], ["2", "Second"], ["3", "Third"]],
    routeCount: 3,
    excludedParticipants: [2, 1, 2, -1, 3]
  });
  assert.deepEqual(list.excludedParticipants, [1, 2]);
});
