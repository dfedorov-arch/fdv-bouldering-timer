"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const INSTALL_MARKER = "fdv-installed.marker";
const PERMISSION_ERRORS = new Set(["EACCES", "EPERM", "EROFS"]);

function runtimeStateStoragePlan(root, options = {}) {
  const platform = options.platform || process.platform;
  const environment = options.environment || process.env;
  const homeDirectory = options.homeDirectory || os.homedir();
  const fileSystem = options.fileSystem || fs;
  const paths = platform === "win32" ? path.win32 : path.posix;
  let userDirectory;
  if (platform === "win32") {
    userDirectory = paths.join(environment.LOCALAPPDATA || paths.join(homeDirectory, "AppData", "Local"),
      "FDV Bouldering Timer", "runtime-state");
  } else if (platform === "darwin") {
    userDirectory = paths.join(homeDirectory, "Library", "Application Support", "FDV Bouldering Timer", "runtime-state");
  } else {
    const stateHome = environment.XDG_STATE_HOME && paths.isAbsolute(environment.XDG_STATE_HOME)
      ? environment.XDG_STATE_HOME : paths.join(homeDirectory, ".local", "state");
    userDirectory = paths.join(stateHome, "fdv-bouldering-timer", "runtime-state");
  }
  const portableDirectory = paths.join(root, "runtime-state");
  const installed = fileSystem.existsSync(paths.join(root, INSTALL_MARKER));
  return { installed, directory: installed ? userDirectory : portableDirectory,
    userDirectory, portableDirectory, usedFallback: false };
}

function probeWritableDirectory(directory, fileSystem = fs) {
  fileSystem.mkdirSync(directory, { recursive: true });
  const probe = path.join(directory, `.write-probe-${crypto.randomUUID()}`);
  const descriptor = fileSystem.openSync(probe, "wx");
  try {
    fileSystem.closeSync(descriptor);
  } finally {
    fileSystem.unlinkSync(probe);
  }
}

function prepareRuntimeStateStorage(plan, fileSystem = fs) {
  try {
    probeWritableDirectory(plan.directory, fileSystem);
    return plan;
  } catch (error) {
    if (plan.installed || !PERMISSION_ERRORS.has(error.code)) throw error;
    probeWritableDirectory(plan.userDirectory, fileSystem);
    return { ...plan, directory: plan.userDirectory, usedFallback: true };
  }
}

module.exports = { INSTALL_MARKER, runtimeStateStoragePlan, prepareRuntimeStateStorage };
