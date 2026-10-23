"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Keep these locations in sync with launcher/windows/HttpsCertificate.cs.
// Resolution is read-only: a running server never regenerates/trusts a key.
function httpsCertificatePaths(root, options = {}) {
  const platform = options.platform || process.platform;
  const environment = options.environment || process.env;
  const paths = platform === "win32" ? path.win32 : path.posix;
  const fileSystem = options.fileSystem || fs;
  const portableDirectory = paths.join(root, "https");
  const localAppData = environment.LOCALAPPDATA || paths.join(options.homeDirectory || os.homedir(), "AppData", "Local");
  const userDirectory = paths.join(localAppData, "FDV Bouldering Timer", "https");
  const installed = platform === "win32" && fileSystem.existsSync(paths.join(root, "fdv-installed.marker"));
  const directories = platform === "win32"
    ? installed ? [userDirectory] : [portableDirectory, userDirectory]
    : [portableDirectory];
  for (const directory of directories) {
    const pfxPath = paths.join(directory, "timer-cert.pfx");
    if (fileSystem.existsSync(pfxPath)) return { managed: true, directory, pfxPath,
      keyPath: paths.join(root, "timer-key.pem"), certPath: paths.join(root, "timer-cert.pem") };
  }
  return { managed: false, directory: root, keyPath: paths.join(root, "timer-key.pem"),
    certPath: paths.join(root, "timer-cert.pem"), pfxPath: paths.join(root, "timer-cert.pfx") };
}

module.exports = { httpsCertificatePaths };
