"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Keep these locations in sync with both launchers' HttpsCertificate.cs.
// Resolution is read-only: a running server never regenerates/trusts a key.
function httpsCertificatePaths(root, options = {}) {
  const platform = options.platform || process.platform;
  const environment = options.environment || process.env;
  const paths = platform === "win32" ? path.win32 : path.posix;
  const fileSystem = options.fileSystem || fs;
  const portableDirectory = paths.join(root, "https");
  const home = options.homeDirectory || os.homedir();
  let userDirectory;
  if (platform === "win32") {
    userDirectory = paths.join(environment.LOCALAPPDATA || paths.join(home, "AppData", "Local"), "FDV Bouldering Timer", "https");
  } else if (platform === "darwin") {
    userDirectory = paths.join(home, "Library", "Application Support", "FDV Bouldering Timer", "https");
  } else {
    const stateHome = environment.XDG_STATE_HOME && paths.isAbsolute(environment.XDG_STATE_HOME)
      ? environment.XDG_STATE_HOME : paths.join(home, ".local", "state");
    userDirectory = paths.join(stateHome, "fdv-bouldering-timer", "https");
  }
  const installed = fileSystem.existsSync(paths.join(root, "fdv-installed.marker"));
  const directories = installed ? [userDirectory] : [portableDirectory, userDirectory];
  for (const directory of directories) {
    const pfxPath = paths.join(directory, "timer-cert.pfx");
    if (fileSystem.existsSync(pfxPath)) return { managed: true, directory, pfxPath,
      keyPath: paths.join(root, "timer-key.pem"), certPath: paths.join(root, "timer-cert.pem") };
  }
  return { managed: false, directory: root, keyPath: paths.join(root, "timer-key.pem"),
    certPath: paths.join(root, "timer-cert.pem"), pfxPath: paths.join(root, "timer-cert.pfx") };
}

module.exports = { httpsCertificatePaths };
