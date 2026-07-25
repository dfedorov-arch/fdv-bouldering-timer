"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const server = fs.readFileSync(path.join(root, "serve-bouldering-timer.js"), "utf8");

test("server persists and broadcasts the flashing preference", () => {
  assert.match(server, /flashing: config\.flashing/);
  assert.match(server, /if \(type === "flashing"\) \{\s*timerState\.flashing = Boolean\(body\.enabled\);/);
  assert.match(server, /"flashing",\s*"festivalAnnouncements"/);
});

test("clients apply remote flashing and keep standalone flashing locally", () => {
  assert.match(index, /state\.flashing = remote\.flashing !== false;/);
  assert.match(index, /els\.flashToggle\.checked = state\.flashing;/);
  assert.match(index, /sendServerAction\("flashing", \{\s*enabled: state\.flashing/);
  assert.match(index, /flashing: snapshot\.state\.flashing !== false/);
  assert.match(index, /if \(!state\.flashing\) return;/);
});
