"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const config = fs.readFileSync(path.join(root, "test", "visual", "playwright.config.js"), "utf8");
const layout = fs.readFileSync(path.join(root, "test", "visual", "layout.spec.js"), "utf8");
const helpers = fs.readFileSync(path.join(root, "test", "visual", "helpers.js"), "utf8");

test("visual regression commands use a pinned Playwright version and explicit snapshot approval", () => {
  assert.equal(packageJson.devDependencies["@playwright/test"], "1.62.1");
  assert.match(packageJson.scripts["test:visual"], /playwright test/);
  assert.match(packageJson.scripts["test:visual:update"], /--update-snapshots/);
  assert.match(config, /workers: 1/);
  assert.match(config, /maxDiffPixelRatio: 0\.005/);
  assert.match(config, /snapshotPathTemplate/);
});

test("visual layout matrix records the phone, old TV and square browser fields", () => {
  assert.match(layout, /width: 360, height: 778/);
  assert.match(layout, /width: 962, height: 541/);
  assert.match(layout, /width: 1000, height: 1000/);
  assert.match(layout, /Modern phone keeps two protocols readable/);
  assert.match(layout, /Legacy TV fallback keeps column headers visible/);
  assert.match(layout, /four protocols become two and the timer stops/);
  assert.match(layout, /visibleRows/);
  assert.match(layout, /horizontalOverflow/);
  assert.match(layout, /toHaveScreenshot/);
});

test("visual fixtures are isolated, realistic and cannot mutate the production server", () => {
  assert.match(helpers, /run-performance-baseline\.js/);
  assert.match(helpers, /four-120x5-incidents/);
  assert.match(helpers, /Александрова Александра/);
  assert.match(helpers, /Юниоры 17-25 лет - БОУЛДЕРИНГ - Квалификация/);
  assert.match(helpers, /startListDisplay/);
  assert.match(helpers, /legacyStickyFallback/);
});
