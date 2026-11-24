"use strict";
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");

function createInstances({ stateDir, timerDir, origin, domain, isAddressAllowed }) {
  const children = new Map();
  const assets = ["lib", "beeps", "fonts", "help-assets", "index.html", "legacy.html", "help.html",
    "params.txt", "sw.js", "manifest.webmanifest", "favicon.ico", "app-icon.svg"];
  function address(instance, slug = instance.slug) { return origin(slug + "." + domain); }
  async function start(instance) {
    if (instance.stopped) throw new Error("Hosted timer is stopped");
    const existing = children.get(instance.slug);
    if (existing) {
      if (existing.stopping) throw new Error("Hosted timer is stopping");
      return existing.ready;
    }
    const directory = path.join(stateDir, "instances", instance.slug);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    for (const name of assets) {
      const target = path.join(directory, name);
      const source = path.join(timerDir, name);
      if (fs.statSync(source).isDirectory()) {
        if (!fs.existsSync(target)) fs.symlinkSync(source, target, "junction");
      } else if (name !== "params.txt" || !fs.existsSync(target)) fs.copyFileSync(source, target);
    }
    const program = path.join(directory, "serve-bouldering-timer.js");
    fs.copyFileSync(path.join(timerDir, "serve-bouldering-timer.js"), program);
    const launcherToken = crypto.randomBytes(32).toString("hex");
    const child = spawn(process.execPath, [program], {
      cwd: directory, stdio: ["ignore", "ignore", "inherit"],
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, HOME: directory,
        HOST: "127.0.0.1", PORT: String(instance.port), FDV_SEC_TUNNEL_TOKEN: instance.token,
        FDV_LAUNCHER_LANGUAGE_TOKEN: launcherToken }
    });
    const entry = { child, launcherToken, sockets: new Map(), active: false, stopping: null };
    children.set(instance.slug, entry);
    function ended() {
      for (const socket of entry.sockets.keys()) socket.destroy();
      if (children.get(instance.slug) === entry) children.delete(instance.slug);
    }
    child.once("error", ended);
    child.once("exit", ended);
    entry.ready = (async () => {
      for (let attempt = 0; attempt < 30 && children.get(instance.slug) === entry && !entry.stopping; attempt++) {
        try {
          const state = await fetch("http://127.0.0.1:" + instance.port + "/api/sec/identity", { signal: AbortSignal.timeout(400) });
          if (state.ok && !entry.stopping) {
            entry.build = (await state.json()).build;
            entry.active = true;
            return entry;
          }
        } catch (_) {}
        await delay(100);
      }
      if (children.get(instance.slug) === entry) await stop(instance);
      throw new Error("Hosted timer could not start");
    })();
    return entry.ready;
  }
  async function stop(instance) {
    const entry = children.get(instance.slug);
    if (!entry) return;
    if (entry.stopping) return entry.stopping;
    for (const socket of entry.sockets.keys()) socket.destroy();
    if (entry.child.exitCode !== null || entry.child.signalCode !== null) return;
    entry.stopping = new Promise(resolve => {
      const timer = setTimeout(() => entry.child.kill("SIGKILL"), 2200);
      entry.child.once("close", () => { clearTimeout(timer); resolve(); });
      entry.child.kill();
    });
    return entry.stopping;
  }
  function disconnectAddress(instance, slug) {
    const sockets = children.get(instance.slug)?.sockets;
    if (!sockets) return;
    const host = slug + "." + domain;
    for (const [connection, hostname] of sockets) {
      if (hostname === host) connection.destroy();
    }
  }
  function clearData(instance) {
    if (!instance.stopped || children.has(instance.slug) || !/^[a-z0-9][a-z0-9-]*$/.test(instance.slug)) {
      throw new Error("Cannot clear hosted timer directory");
    }
    const directory = path.resolve(stateDir, "instances", instance.slug);
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 2 });
  }
  async function state(instance) {
    const entry = children.get(instance.slug);
    if (!entry?.active || entry.stopping) throw new Error("Hosted timer is unavailable");
    const response = await fetch("http://127.0.0.1:" + instance.port + "/api/state", { signal: AbortSignal.timeout(1500) });
    if (!response.ok) throw Object.assign(new Error("Hosted timer could not report state"), { status: response.status });
    return response.json();
  }
  async function status(instance) {
    if (!instance) return { service: "new" };
    if (instance.stopped) return { service: "stopped" };
    const entry = children.get(instance.slug);
    if (!entry) return { service: "offline" };
    if (entry.stopping) return { service: "stopping" };
    if (!entry.active) return { service: "starting" };
    try {
      const current = await state(instance);
      if (instance.stopped || entry.stopping) return { service: "stopping" };
      return { service: "running", pin: current.primaryPinSet, running: current.running,
        build: entry.build, connected: Boolean(current.sec?.ready
          && (current.sec.role === "secondary" ? current.sec.sourceConnected : current.sec.available)),
        paired: Boolean(current.sec) };
    } catch (error) {
      if (error.status === 503) return { service: "running", build: entry.build, recovering: true };
      return { service: "offline" };
    }
  }
  async function pairingIssue(instance, build) {
    if (instance.stopped) return "SEC_TARGET_STOPPED";
    const entry = children.get(instance.slug);
    if (!entry?.active || entry.stopping) return "SEC_HOSTED_UNAVAILABLE";
    if (build !== undefined && build !== entry.build) return "SEC_BUILD_MISMATCH";
    try {
      const identity = await fetch("http://127.0.0.1:" + instance.port + "/api/sec/identity", { signal: AbortSignal.timeout(1500) });
      if (!identity.ok) return "SEC_HOSTED_UNAVAILABLE";
      const info = await identity.json();
      if (info.pairingIssue) return info.pairingIssue;
      const timer = await state(instance);
      if (timer.sec) return "SEC_TARGET_ALREADY_PAIRED";
      if (timer.running) return "SEC_TARGET_RUNNING";
      if (timer.completed || timer.elapsedBeforePause) return "SEC_TARGET_HAS_TIMER_STATE";
      if (Array.isArray(timer.startLists) && timer.startLists.some(Boolean)) return "SEC_TARGET_HAS_START_LISTS";
      if (timer.primaryPinSet) return "SEC_TARGET_HAS_PIN";
      return timer.primaryClientId ? "SEC_TARGET_HAS_OPERATOR" : "";
    } catch (_) { return "SEC_HOSTED_UNAVAILABLE"; }
  }
  async function setPin(instance, pin) {
    const entry = children.get(instance.slug);
    if (instance.stopped || !entry?.active || entry.stopping) throw new Error("Hosted timer is unavailable");
    const response = await fetch("http://127.0.0.1:" + instance.port + "/api/launcher/pin", {
      method: "POST", signal: AbortSignal.timeout(6500),
      headers: { "Content-Type": "application/json", "X-FDV-Launcher-Token": entry.launcherToken },
      body: JSON.stringify({ pin })
    });
    if (!response.ok) throw new Error("Hosted timer rejected PIN change");
  }
  async function spectator(instance) {
    const entry = await start(instance);
    if (instance.stopped || entry.stopping) throw new Error("Hosted timer is unavailable");
    if (entry.spectator?.until > Date.now()) return entry.spectator.result;
    const result = (async () => {
      const response = await fetch("http://127.0.0.1:" + instance.port + "/api/spectator", { signal: AbortSignal.timeout(1500) });
      if (!response.ok) throw new Error("Spectator state is unavailable");
      return response.json();
    })();
    entry.spectator = { result, until: Date.now() + 1000 };
    return result;
  }
  function upstream(instance, req, upgrade = false) {
    const headers = { ...req.headers, "x-forwarded-proto": "https" };
    delete headers.cookie;
    if (!upgrade) { delete headers.authorization; delete headers.connection; }
    return http.request({ hostname: "127.0.0.1", port: instance.port, method: req.method, path: req.url, headers });
  }
  async function proxy(instance, req, res) {
    const host = String(req.headers.host || "").toLowerCase();
    const entry = await start(instance);
    if (children.get(instance.slug) !== entry || entry.stopping || res.destroyed || !isAddressAllowed(instance, host)) return res.destroy();
    entry.sockets.set(res, host);
    res.once("close", () => { entry.sockets.delete(res); request.destroy(); });
    const request = upstream(instance, req);
    request.on("response", reply => {
      res.writeHead(reply.statusCode, reply.headers);
      reply.pipe(res);
      reply.on("error", () => res.destroy());
    });
    request.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(request);
  }
  async function upgrade(instance, req, socket, head) {
    socket.on("error", () => socket.destroy());
    const host = String(req.headers.host || "").toLowerCase();
    const entry = await start(instance);
    if (children.get(instance.slug) !== entry || entry.stopping || socket.destroyed || !isAddressAllowed(instance, host)) return socket.destroy();
    entry.sockets.set(socket, host);
    const request = upstream(instance, req, true);
    socket.once("close", () => { entry.sockets.delete(socket); request.destroy(); });
    request.on("response", reply => {
      reply.resume();
      socket.end("HTTP/1.1 " + reply.statusCode + " Rejected\r\nConnection: close\r\n\r\n");
    });
    request.on("upgrade", (reply, backend, initial) => {
      backend.on("error", () => socket.destroy());
      socket.once("close", () => backend.destroy());
      backend.once("close", () => socket.destroy());
      let response = "HTTP/1.1 101 Switching Protocols\r\n";
      for (let i = 0; i < reply.rawHeaders.length; i += 2) {
        response += reply.rawHeaders[i] + ": " + reply.rawHeaders[i + 1] + "\r\n";
      }
      socket.write(response + "\r\n");
      if (initial.length) socket.write(initial);
      if (head.length) backend.write(head);
      backend.pipe(socket).pipe(backend);
    });
    request.on("error", () => socket.destroy());
    request.end();
  }
  return { address, start, stop, disconnectAddress, clearData, status, pairingIssue, setPin, spectator, proxy, upgrade };
}

module.exports = { createInstances };
