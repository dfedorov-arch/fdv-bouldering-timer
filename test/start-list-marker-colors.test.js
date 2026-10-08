"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { markerColors } = require("../lib/start-list-display");

test("list-marker defaults use the agreed purple-blue diamond and distinct status colors", () => {
  assert.deepEqual(markerColors(), { listReadyColor: "#ffc857", listActiveColor: "#26d07c",
    listDoneColor: "#48488c", listPausedColor: "#8d97a5", listStoppedColor: "#f05a59" });
});
test("list-marker colors normalize uppercase, whitespace and short hex without mutating input", () => {
  const config = { listReadyColor: " #ABC ", listActiveColor: "#012345", listDoneColor: "#48488C",
    listPausedColor: "#DEF", listStoppedColor: "#654321" };
  const before = { ...config };
  assert.deepEqual(markerColors(config), { listReadyColor: "#aabbcc", listActiveColor: "#012345",
    listDoneColor: "#48488c", listPausedColor: "#ddeeff", listStoppedColor: "#654321" });
  assert.deepEqual(config, before);
});
test("invalid marker colors and CSS injection fall back independently to safe defaults", () => {
  for (const bad of [null, "", "oops", "red", "#1234", "#12345678", "#GGGGGG", "#123456;}body{display:none}", "var(--red)"]) {
    assert.deepEqual(markerColors({ listDoneColor: bad }), markerColors());
  }
  const colors = markerColors({ listDoneColor: "bad", listPausedColor: "#123" });
  assert.equal(colors.listDoneColor, "#48488c");
  assert.equal(colors.listPausedColor, "#112233");
});
test("returned palette objects are independent and cannot corrupt later defaults", () => {
  markerColors().listDoneColor = "#000000";
  assert.equal(markerColors().listDoneColor, "#48488c");
});
