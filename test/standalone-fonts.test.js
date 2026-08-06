"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("standalone embeds the DSEG clock fonts instead of requesting relative font files", () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "fdv-standalone-fonts-"));
  const outputPath = path.join(temporaryDirectory, "standalone.html");
  try {
    const result = spawnSync(process.execPath, ["scripts/build-standalone-html.js", outputPath], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const standalone = fs.readFileSync(outputPath, "utf8");
    assert.doesNotMatch(standalone, /url\("fonts\/DSEG7Classic-/);
    assert.match(standalone, /data:font\/woff2;base64,/);
    assert.match(standalone, /data:font\/woff;base64,/);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
