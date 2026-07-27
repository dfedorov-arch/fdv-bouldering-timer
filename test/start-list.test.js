"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const startList = require("../lib/start-list");

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

  const resumed = [{ ...pending[0], resumeCycle: 18 }];
  assert.equal(startList.marker(10, 2, 14, "rotation", resumed), "ready");
  assert.equal(startList.rowStatus(10, 5, 14, "rotation", resumed), "ready");
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
    { kind: "pause", route: 2, startCycle: 3, resumeCycle: 5, participantIndex: 0 },
    { kind: "stop", route: 3, startCycle: 7 }
  ]);
});
