"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "..");
const NODE_VERSION = "12.22.12";

async function buildServer(destination, source = root) {
  fs.mkdirSync(destination, { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(source, "serve-bouldering-timer.js")],
    outfile: path.join(destination, "serve-bouldering-timer.js"),
    bundle: true, platform: "node", format: "cjs", target: "node12.22",
    minify: false, legalComments: "inline", charset: "utf8",
    banner: { js: fs.readFileSync(path.join(root, "compat/windows-legacy/runtime.cjs"), "utf8") },
    plugins: [{ name: "node12-builtins", setup(build) {
      build.onResolve({ filter: /^node:/ }, args => ({ path: args.path.slice(5), external: true }));
    } }]
  });
}

async function buildPackage({ version, arch, nodeRoot, launcher, output, standalone }) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(version || "") || !["x86", "x64"].includes(arch)) {
    throw new Error("Specify a safe version and --arch=x86 or --arch=x64");
  }
  for (const file of [path.join(nodeRoot || "", "node.exe"), path.join(nodeRoot || "", "LICENSE"),
    launcher, launcher && launcher + ".config", standalone]) {
    if (!file || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) throw new Error(`Required input missing: ${file}`);
  }
  const runtime = spawnSync(path.join(nodeRoot, "node.exe"), ["-p", "process.versions.node + ':' + process.arch"], { encoding: "utf8" });
  if (runtime.status !== 0 || runtime.stdout.trim() !== `${NODE_VERSION}:${arch === "x86" ? "ia32" : "x64"}`) {
    throw new Error(`Expected official Node ${NODE_VERSION} ${arch}: ${runtime.stderr || runtime.stdout}`);
  }
  const destination = path.resolve(output, `fdv-bouldering-timer-${version}-windows7-8-${arch}`);
  if (fs.existsSync(destination)) throw new Error(`Refusing to overwrite existing package: ${destination}`);
  fs.mkdirSync(destination, { recursive: true });
  for (const name of ["LICENSE", "help.html", "index.html", "legacy.html", "manifest.webmanifest", "app-icon.svg",
    "favicon.ico", "params.txt", "sw.js", "beeps", "fonts", "help-assets", "lib"]) {
    fs.cpSync(path.join(root, name), path.join(destination, name), { recursive: true });
  }
  await buildServer(destination);
  fs.copyFileSync(path.join(root, "compat/windows-legacy/start-timer-win.bat"), path.join(destination, "start-timer-win.bat"));
  fs.copyFileSync(path.join(root, "ReadMe-windows-legacy.txt"), path.join(destination, "ReadMe.txt"));
  fs.copyFileSync(launcher, path.join(destination, "fdv-bouldering-timer.exe"));
  fs.copyFileSync(launcher + ".config", path.join(destination, "fdv-bouldering-timer.exe.config"));
  fs.copyFileSync(standalone, path.join(destination, "fdv-bouldering-timer-standalone.html"));
  fs.mkdirSync(path.join(destination, "runtime/win"), { recursive: true });
  fs.copyFileSync(path.join(nodeRoot, "node.exe"), path.join(destination, "runtime/win/node.exe"));
  fs.copyFileSync(path.join(nodeRoot, "LICENSE"), path.join(destination, "runtime/win/LICENSE-Node.txt"));
  console.log(`Windows Legacy package created: ${destination}`);
  return destination;
}

if (require.main === module) {
  const options = Object.fromEntries(process.argv.slice(2).map(arg => {
    const index = arg.indexOf("=");
    if (!arg.startsWith("--") || index < 3) throw new Error(`Invalid option: ${arg}`);
    return [arg.slice(2, index), arg.slice(index + 1)];
  }));
  buildPackage({ ...options, nodeRoot: options["node-root"] }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { buildServer, buildPackage, NODE_VERSION };
