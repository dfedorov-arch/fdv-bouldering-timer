"use strict";

const path = require("node:path");
const { defineConfig } = require("@playwright/test");

const root = path.resolve(__dirname, "..", "..");

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: "layout.spec.js",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 8_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.005
    }
  },
  use: {
    browserName: "chromium",
    colorScheme: "dark",
    locale: "ru-RU",
    serviceWorkers: "block"
  },
  outputDir: path.join(root, "test-results", "visual"),
  snapshotPathTemplate: "{testDir}/snapshots/{arg}{ext}",
  reporter: [
    ["list"],
    ["html", { outputFolder: path.join(root, "playwright-report"), open: "never" }]
  ]
});
