"use strict";

const http = require("node:http");
const https = require("node:https");
const crypto = require("node:crypto");
const net = require("node:net");
const { performance } = require("node:perf_hooks");

const FAILOVER_MS = 20000;
const HEARTBEAT_MS = 1000;

function secondaryError(code, message, clients) {
  return Object.assign(new Error(message), { code }, clients ? { clients } : {});
}

function localOnlyAddress(value) {
  const host = new URL(value).hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  return host === "localhost" || host.endsWith(".localhost") || host === "::1"
    || host === "::" || host === "0.0.0.0" || /^127\./.test(host)
    || /^::ffff:(?:127\.|7f[0-9a-f]{2}:)/.test(host);
}

function primaryNetworkAddress(primaryUrl, secondaryUrl, localAddress) {
  const primary = new URL(serverAddress(primaryUrl));
  if (!localOnlyAddress(primary.href) || localOnlyAddress(secondaryUrl)) return primary.origin;
  const address = String(localAddress || "").replace(/^::ffff:/i, "");
  if (primary.protocol !== "http:" || !net.isIP(address) || address.includes("%")
      || /^fe[89ab]/i.test(address) || localOnlyAddress(`http://${net.isIP(address) === 6 ? `[${address}]` : address}`)) {
    throw secondaryError("PRIMARY_NETWORK_ADDRESS_REQUIRED", "Open the primary server through its reachable network HTTP/HTTPS address, not localhost");
  }
  primary.hostname = net.isIP(address) === 6 ? `[${address}]` : address;
  return primary.origin;
}

function blockingClients(clients) {
  return clients.filter(client => client.connected && client.age < 6000).map(client => ({
    id: client.id, displayNumber: client.displayNumber, label: client.label || client.browser || "",
    address: client.displayAddress || client.address || ""
  }));
}

function serverAddress(value) {
  const address = new URL(String(value || "").trim());
  if (!/^https?:$/.test(address.protocol) || address.username || address.password
    || address.pathname !== "/" || address.search || address.hash) {
    throw new Error("Use an HTTP/HTTPS server address without a path or credentials");
  }
  return address.origin;
}

function requestJson(address, pathname, body, token = "", timeoutMs = 1800) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, address);
    const data = body === undefined ? null : JSON.stringify(body);
    const request = (url.protocol === "https:" ? https : http).request(url, {
      method: data === null ? "GET" : "POST",
      headers: {
        ...(data === null ? {} : { "content-type": "application/json", "content-length": Buffer.byteLength(data) }),
        ...(token ? { "x-fdv-secondary-key": token } : {})
      },
      timeout: timeoutMs
    }, response => {
      let text = "";
      response.on("data", chunk => {
        text += chunk;
        if (text.length > 4 * 1024 * 1024) response.destroy(new Error("Secondary server response too large"));
      });
      response.on("error", reject);
      response.on("end", () => {
        try { resolve({ status: response.statusCode, body: JSON.parse(text), localAddress: request.socket?.localAddress }); }
        catch (error) { reject(new Error("The address is not a compatible FDV timer server")); }
      });
    });
    request.on("timeout", () => request.destroy(new Error("Secondary server request timed out")));
    request.on("error", reject);
    request.end(data);
  });
}

// Only the standby uses this affine clock. The normal server clock and browser
// estimator are untouched. Samples have four measured timestamps, not push age.
function createReplicaClock(now = () => performance.now()) {
  let anchor = 0;
  let at = 0;
  let rate = 1;
  let samples = [];
  let pendingRate = null;
  let confirmations = 0;
  let errorMs = 0;
  function current() { return anchor + (now() - at) * rate; }
  function measure(sample) {
    if (!sample || ![sample.local, sample.remote, sample.rtt].every(Number.isFinite)
      || sample.rtt < 0 || sample.rtt > 500) return false;
    const local = now();
    if (Math.abs(local - sample.local) > 5000) return false;
    samples.push({ ...sample, at: local });
    samples = samples.filter(item => local - item.at < 120000).slice(-120);
    const best = Math.min(...samples.map(item => item.rtt));
    const accepted = samples.filter(item => item.rtt <= best + 20);
    if (accepted.length >= 20 && accepted.at(-1).local - accepted[0].local >= 60000) {
      const origin = accepted[0];
      const meanX = accepted.reduce((sum, item) => sum + item.local - origin.local, 0) / accepted.length;
      const meanY = accepted.reduce((sum, item) => sum + item.remote - origin.remote, 0) / accepted.length;
      let xx = 0;
      let xy = 0;
      for (const item of accepted) {
        const x = item.local - origin.local - meanX;
        xx += x * x;
        xy += x * (item.remote - origin.remote - meanY);
      }
      const candidate = xx ? xy / xx : 1;
      if (candidate >= 0.98 && candidate <= 1.02) {
        const residuals = accepted.map(item => (item.remote - origin.remote)
          - candidate * (item.local - origin.local));
        if (Math.max(...residuals) - Math.min(...residuals) < 20) {
          if (pendingRate !== null && Math.abs(candidate - pendingRate) < 0.00005) confirmations += 1;
          else { pendingRate = candidate; confirmations = 1; }
          if (confirmations >= 3) rate = candidate;
        } else { pendingRate = null; confirmations = 0; }
      }
    }
    const offsets = accepted.slice(-8).map(item => item.remote - (item.local - local) * rate).sort((a, b) => a - b);
    const target = offsets[Math.floor(offsets.length / 2)];
    const before = anchor ? current() : target;
    // Small fits cannot abruptly move an already serving standby clock.
    anchor = anchor ? before + Math.max(-20, Math.min(20, target - before)) : target;
    at = local;
    errorMs = best / 2 + Math.abs(target - anchor) + offsets.at(-1) - offsets[0];
    return true;
  }
  return {
    now: current, measure,
    reset() { anchor = 0; at = 0; rate = 1; samples = []; pendingRate = null; confirmations = 0; errorMs = 0; },
    advance(milliseconds) { anchor = current() + milliseconds * rate; at = now(); samples = []; },
    get ready() { return anchor > 0; },
    get rate() { return rate; },
    get errorMs() { return errorMs; },
    restore(value, advanceMs = 0) {
      if (!value || !Number.isFinite(value.now) || !Number.isFinite(value.rate)) return;
      anchor = value.now + advanceMs;
      at = now();
      rate = Math.max(0.98, Math.min(1.02, value.rate));
      errorMs = Number.isFinite(value.errorMs) ? Math.max(0, value.errorMs) : 0;
      samples = [];
    },
    snapshot() { return anchor ? { now: current(), rate, errorMs } : null; }
  };
}

function createSecondaryServer(deps) {
  const now = deps.now || (() => performance.now());
  const clock = createReplicaClock(now);
  let pair = null;
  let timer = null;
  let busy = false;
  let dirty = false;
  let lastContact = -Infinity;
  let ackVersion = null;
  let sequence = 0;
  let acceptedSequence = 0;
  let measurement = null;
  let peerClients = [];
  let peerClientsAt = 0;
  let switchRequests = new Map();
  let switchSequence = 0;
  let appliedCommands = new Set();
  let queuedEvents = [];
  let queuedResults = [];
  let queuedCommands = [];
  let commandPollTimer = null;
  let pollingCommands = false;
  let commandReceiver = null;
  const waitingCommands = new Map();
  let configuring = false;
  let acceptingPair = false;
  let reversing = false;
  let returnAddressIndex = 0;
  let resumed = false;
  let sourceListRevision = "";
  const receivedEvents = new Set();

  function authenticated(req) {
    const supplied = String(req.headers["x-fdv-secondary-key"] || "");
    return Boolean(pair && /^[a-f0-9]{64}$/.test(supplied) && supplied.length === pair.key.length
      && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(pair.key)));
  }
  function origins() { return pair ? [...new Set([pair.primaryUrl, pair.secondaryUrl, ...pair.origins])] : []; }
  function rememberPeerOrigins(value) {
    if (!pair || !Array.isArray(value)) return;
    const merged = [...new Set([...pair.origins, ...value.slice(0, 100).map(serverAddress)])].slice(-100);
    if (JSON.stringify(merged) !== JSON.stringify(pair.origins)) { pair.origins = merged; save(); }
  }
  function cors(req, res) {
    const origin = req.headers.origin;
    if (!origin || !origins().includes(origin)) return false;
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type, x-client-id");
    res.setHeader("Access-Control-Max-Age", "600");
    return true;
  }
  function publicInfo() {
    if (!pair) return null;
    return {
      protocol: 1, session: pair.session, primaryUrl: pair.primaryUrl, secondaryUrl: pair.secondaryUrl,
      epoch: pair.epoch || 0,
      secondaryInstanceId: pair.role === "primary" ? pair.returnedInstanceId || "" : deps.instanceId,
      primaryInstanceId: pair.role === "primary" ? deps.instanceId : pair.sourceInstanceId || "",
      role: pair.role, available: pair.role === "primary" ? now() - lastContact < 5000 : clock.ready,
      sourceConnected: now() - lastContact < FAILOVER_MS,
      ready: pair.role === "primary" ? ackVersion !== null : clock.ready && !pair.handoffPending,
      clockErrorMs: pair.role === "secondary" ? clock.errorMs : null,
      activeUrl: pair.promoted || pair.fenced ? pair.secondaryUrl : pair.primaryUrl,
      switchAll: Boolean(pair.promoted || pair.fenced), switchRequests:[...switchRequests.values()]
    };
  }
  function save() { deps.changed(); }
  function wake(delay = 0) {
    if (!pair || pair.role !== "primary") return;
    if (timer && delay !== 0) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; if (pair?.fenced) rejoin(); else beat(); }, delay);
    timer.unref?.();
  }
  function resetTransport() {
    clearTimeout(timer); timer = null;
    clearTimeout(commandPollTimer); commandPollTimer = null;
    if (commandReceiver) commandReceiver(409);
    measurement = null;
    ackVersion = null;
    sequence = 0;
    acceptedSequence = 0;
    resumed = false;
    switchRequests.clear();
    switchSequence = 0;
    queuedCommands = [];
    queuedEvents = [];
    queuedResults = [];
    for (const pending of waitingCommands.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Secondary server roles changed; retry against the current primary"));
    }
    waitingCommands.clear();
  }
  function returnCandidates() {
    const addresses = [...new Set([pair.primaryUrl, ...pair.origins, ...deps.origins()])];
    // Prefer addresses actually used by LAN/public clients over localhost.
    return addresses.sort((a,b) => Number(/\/\/(?:localhost|127\.|\[::1\])/i.test(a))
      - Number(/\/\/(?:localhost|127\.|\[::1\])/i.test(b))).slice(0,100);
  }
  async function rejoin() {
    if (!pair?.fenced || pair.role !== "primary" || busy) return;
    const previous = pair;
    busy = true;
    try {
      const addresses = returnCandidates();
      const response = await requestJson(pair.secondaryUrl,"/api/sec/rejoin",{
        session:pair.session, epoch:pair.epoch || 0, serverInstanceId:deps.instanceId,
        returnUrl:addresses[returnAddressIndex++ % addresses.length], origins:addresses,
        build:deps.build, resources:deps.resources()
      },pair.key);
      if (pair !== previous || response.status !== 200) return;
      const next = response.body.sec;
      if (!next || next.session !== pair.session || next.epoch !== (pair.epoch || 0)+1
        || next.primaryUrl !== pair.secondaryUrl || response.body.returnedInstanceId !== deps.instanceId) return;
      pair = {...pair,role:"secondary",epoch:next.epoch,primaryUrl:next.primaryUrl,
        secondaryUrl:serverAddress(next.secondaryUrl),sourceInstanceId:response.body.serverInstanceId,
        retiredInstances:[],promoted:false,fenced:false,handoffPending:true};
      resetTransport();
      clock.reset();
      sourceListRevision = "";
      appliedCommands.clear();
      deps.clearCommandResults?.();
      receivedEvents.clear();
      lastContact = now();
      save(); deps.broadcast();
    } catch (_) {
      // The active server remains authoritative; try another known return URL.
    } finally { busy = false; if (pair === previous) wake(HEARTBEAT_MS); }
  }
  function receiveCommands() {
    const commands = queuedCommands.splice(0);
    return commands.filter(command => waitingCommands.has(command.id));
  }
  async function executeCommands(commands) {
    for (const command of commands) {
      const result = await deps.forwardAction(command.body, command.client, command.pathname);
      queuedResults.push({ id: command.id, ...result });
    }
    if (commands.length) wake(0);
  }
  // A separate primary-initiated long poll wakes immediately for operator
  // commands without increasing the frequency of state/clock replication.
  async function pollCommands() {
    if (!pair || pair.role !== "primary" || pair.fenced || pollingCommands) return;
    pollingCommands = true;
    const currentPair = pair;
    let delay = 500;
    try {
      const response = await requestJson(pair.secondaryUrl, "/api/sec/commands", {}, pair.key);
      if (pair !== currentPair || pair.fenced) return;
      if (response.status !== 200) throw new Error("Secondary server command channel unavailable");
      await executeCommands(response.body.commands || []);
      delay = 0;
    } catch (_) {
      // Canonical heartbeats and the original command retry path remain live.
    } finally {
      pollingCommands = false;
      if (pair === currentPair && !pair.fenced) {
        clearTimeout(commandPollTimer);
        commandPollTimer = setTimeout(() => { commandPollTimer = null; pollCommands(); }, delay);
        commandPollTimer.unref?.();
      }
    }
  }
  async function beat() {
    if (!pair || pair.role !== "primary" || pair.fenced || busy) return;
    busy = true;
    dirty = false;
    const currentPair = pair;
    const results = queuedResults.splice(0);
    const events = queuedEvents.splice(0);
    try {
      if (!measurement || now() - lastContact > 3000) {
        const pingSentAt = deps.timerNow();
        const pingLocalAt = now();
        const ping = await requestJson(pair.secondaryUrl, "/api/sec/ping", {}, pair.key);
        if (ping.status !== 200) throw new Error("Secondary server ping failed");
        measurement = { local: (ping.body.receivedAt + ping.body.sentAt) / 2,
          remote: (pingSentAt + deps.timerNow()) / 2,
          rtt: Math.max(0, now() - pingLocalAt - (ping.body.sentAt - ping.body.receivedAt)) };
      }
      const state = deps.exportState(ackVersion);
      const packetClients = deps.clients();
      const packetOrigins = deps.origins();
      const packetSentAt = deps.timerNow();
      const packetLocalAt = now();
      const response = await requestJson(pair.secondaryUrl, "/api/sec/replicate", {
        session: pair.session, epoch:pair.epoch || 0, sequence: ++sequence, sourceInstanceId: deps.instanceId, measurement, ...state,
        sampleTime: packetSentAt, origins: packetOrigins, events, results,
        clients: packetClients, switchRequests:[...switchRequests.values()]
      }, pair.key);
      if (pair !== currentPair) return;
      const receivedAt = deps.timerNow();
      const data = response.body;
      if (data.promoted) {
        pair.fenced = true;
        peerClients = data.clients || [];
        peerClientsAt = now();
        lastContact = now();
        save();
        deps.broadcast();
        return;
      }
      if (response.status !== 200 || data.session !== pair.session) throw new Error(data.error || "Secondary server rejected the snapshot");
      rememberPeerOrigins(data.origins);
      lastContact = now();
      resumed = false;
      ackVersion = data.version;
      measurement = {
        local: (data.receivedAt + data.sentAt) / 2,
        remote: (packetSentAt + receivedAt) / 2,
        rtt: Math.max(0, (now() - packetLocalAt) - (data.sentAt - data.receivedAt))
      };
      peerClients = data.clients || [];
      peerClientsAt = now();
      if (data.serverInstanceId && pair.returnedInstanceId !== data.serverInstanceId) {
        pair.returnedInstanceId = data.serverInstanceId; save();
      }
      await executeCommands(data.commands || []);
      if (!pollingCommands && !commandPollTimer) pollCommands();
      if (data.commands?.length || !data.ready) wake(0);
      deps.diagnostics();
    } catch (error) {
      if (pair === currentPair) {
        measurement = null;
        queuedResults.unshift(...results);
        queuedEvents.unshift(...events);
      }
    } finally {
      busy = false;
      wake(dirty || queuedResults.length || (measurement && ackVersion === null) ? 0 : HEARTBEAT_MS);
    }
  }
  async function configure(address, primaryUrl) {
    if (configuring || pair) throw new Error("Remove the existing Secondary server connection before configuring another server");
    configuring = true;
    let candidate = null;
    let paired = false;
    try {
      const secondaryUrl = serverAddress(address);
      candidate = { role: "primary", session: crypto.randomUUID(), key: crypto.randomBytes(32).toString("hex"),
        primaryUrl: serverAddress(primaryUrl), secondaryUrl, origins: deps.origins(), promoted: false, fenced: false };
      if (secondaryUrl === candidate.primaryUrl) throw new Error("The secondary server must be a different server");
      if (localOnlyAddress(candidate.primaryUrl) && !localOnlyAddress(secondaryUrl)) {
        // Only at setup: use the actual outbound route, not the first NIC/VPN.
        const route = await requestJson(secondaryUrl, "/api/sec/status");
        candidate.primaryUrl = primaryNetworkAddress(candidate.primaryUrl, secondaryUrl, route.localAddress);
      }
      const resources = deps.resources();
      const sentAt = deps.timerNow();
      const at = now();
      const response = await requestJson(secondaryUrl, "/api/sec/pair", {
        ...candidate, serverInstanceId: deps.instanceId, build: deps.build, resources
      });
      if (response.status !== 200 || response.body.serverInstanceId === deps.instanceId) {
        throw secondaryError(response.body.code || "SECONDARY_PAIR_FAILED", response.body.error || "The secondary server is not empty or not compatible");
      }
      paired = true;
      candidate.returnedInstanceId = response.body.serverInstanceId;
      candidate.origins = [...new Set([...candidate.origins, ...(response.body.origins || []).slice(0, 100).map(serverAddress)])].slice(-100);
      const receivedAt = deps.timerNow();
      if (now() - at > 500) throw new Error("Secondary server round-trip time exceeds 500 ms; try again");
      pair = candidate;
      measurement = { local: (response.body.receivedAt + response.body.sentAt) / 2,
        remote: (sentAt + receivedAt) / 2,
        rtt: Math.max(0, now() - at - (response.body.sentAt - response.body.receivedAt)) };
      ackVersion = null;
      await beat();
      if (ackVersion === null) throw new Error("The secondary server did not acknowledge the initial state");
      save();
      deps.broadcast();
    } catch (error) {
      if (paired) {
        try { await requestJson(candidate.secondaryUrl, "/api/sec/unpair", {}, candidate.key); } catch (_) {}
      }
      pair = null;
      throw error;
    } finally { configuring = false; }
  }
  async function remove() {
    if (!pair) return;
    if (pair.role !== "primary") throw new Error("Secondary server must be removed on the current primary server");
    if (pair.promoted || pair.fenced) throw new Error("The secondary server has taken control; it cannot be unpaired here");
    const old = pair;
    // Check the reserve's current local registry atomically with unpairing,
    // rather than rejecting on a potentially stale replicated client list.
    const response = await requestJson(old.secondaryUrl, "/api/sec/unpair", { requireNoClients: true }, old.key);
    if (response.status !== 200) throw secondaryError(response.body.code || "SECONDARY_REMOVE_FAILED",
      response.body.error || "Secondary server could not be removed", response.body.clients);
    pair = null;
    clearTimeout(timer); timer = null;
    clearTimeout(commandPollTimer); commandPollTimer = null;
    peerClients = [];
    switchRequests.clear();
    switchSequence = 0;
    save(); deps.broadcast();
  }
  function promote() {
    if (!pair || pair.role !== "secondary" || !clock.ready || pair.handoffPending) throw new Error("Secondary server is not calibrated");
    pair.promoted = true;
    if (commandReceiver) commandReceiver(409);
    save(); deps.broadcast();
  }
  async function switchClient(targetClientId, primaryClientId, destination = "secondary") {
    if (!pair || !targetClientId) throw new Error("Secondary server is not configured");
    if (!["primary","secondary"].includes(destination)) throw new Error("Invalid Secondary server destination");
    if (destination === "primary" && (pair.promoted || pair.fenced)) {
      throw new Error("Secondary server is the active authority; wait for the former server to return as standby");
    }
    if (targetClientId === primaryClientId && destination === "secondary") {
      if (pair.role === "primary") {
        const response = await requestJson(pair.secondaryUrl, "/api/sec/promote", {}, pair.key);
        if (response.status !== 200) throw new Error(response.body.error || "Secondary server is unavailable");
        pair.fenced = true;
      } else { promote(); }
    } else {
      const targets = targetClientId === primaryClientId
        ? [...new Set([...deps.clients(),...peerClients].map(client=>client.id).concat(targetClientId))] : [targetClientId];
      for (const id of targets) switchRequests.set(id,{clientId:id,destination,sequence:++switchSequence});
    }
    save(); deps.broadcast(); wake(0);
  }
  async function handle(req, res, pathname, readJson, sendJson) {
    const allowedOrigin = cors(req, res);
    if (req.method === "OPTIONS" && pathname.startsWith("/api/")) {
      res.writeHead(allowedOrigin ? 204 : 403); res.end(); return true;
    }
    if (!pathname.startsWith("/api/sec/")) return false;
    const receivedAt = now();
    if (pathname === "/api/sec/status" && req.method === "GET") {
      const session = new URL(req.url, "http://localhost").searchParams.get("session");
      sendJson(res, pair && pair.session === session ? 200 : 404,
        pair && pair.session === session ? { sec: publicInfo(), build: deps.build } : { error: "Secondary server is not paired" });
      return true;
    }
    if (req.method !== "POST") { sendJson(res, 405, { error: "Method not allowed" }); return true; }
    try {
      const data = await readJson(req, pathname === "/api/sec/replicate" ? 16 * 1024 * 1024 : 1024 * 1024);
      if (pathname === "/api/sec/pair") {
        if (req.headers.origin || pair || configuring || acceptingPair || !deps.canPair() || data.build !== deps.build
          || data.resources !== deps.resources()
          || !/^[a-f0-9]{64}$/.test(data.key || "") || !data.session || data.serverInstanceId === deps.instanceId) {
          sendJson(res, 409, { error: "Secondary server requires an empty server of the same build and identical beeps/fonts, without a primary browser" }); return true;
        }
        const primaryUrl = serverAddress(data.primaryUrl), secondaryUrl = serverAddress(data.secondaryUrl);
        acceptingPair = true;
        try {
          // Local multi-process pairs may use loopback. Across machines the
          // advertised origin must resolve to the actual source process.
          if (!localOnlyAddress(primaryUrl) || !localOnlyAddress(secondaryUrl)) {
            let identity;
            try { identity = await requestJson(primaryUrl, "/api/state?diagnostics=0", undefined, "", 1000); } catch (_) {}
            if (!identity || identity.status !== 200 || identity.body.serverInstanceId !== data.serverInstanceId
                || identity.body.config?.buildNumber !== deps.build) {
              throw secondaryError("PRIMARY_ADDRESS_UNREACHABLE", "The primary network address is unreachable from Secondary server or identifies a different server");
            }
          }
          if (pair || !deps.canPair()) throw secondaryError("SECONDARY_PAIR_FAILED", "Secondary server is no longer empty");
          pair = { role: "secondary", session: String(data.session), key: data.key,
            primaryUrl, secondaryUrl,
            sourceInstanceId: data.serverInstanceId, retiredInstances: [],
            origins: [...new Set([...(data.origins || []).map(serverAddress), ...deps.origins()])].slice(-100), promoted: false, fenced: false };
        } finally { acceptingPair = false; }
        clock.reset();
        acceptedSequence = 0;
        ackVersion = null;
        sourceListRevision = "";
        switchRequests.clear();
        switchSequence = 0;
        appliedCommands.clear();
        receivedEvents.clear();
        lastContact = now();
        save();
        sendJson(res, 200, { serverInstanceId: deps.instanceId, receivedAt, sentAt: now(), origins: deps.origins() }); return true;
      }
      if (pathname === "/api/sec/takeover" && pair && data.session === pair.session && allowedOrigin) {
        if (data.clientId !== deps.primaryClientId() && now() - lastContact < FAILOVER_MS && !pair.promoted) {
          sendJson(res, 409, { error: "The primary server is still updating Secondary server" }); return true;
        }
        promote(); sendJson(res, 200, { sec: publicInfo() }); return true;
      }
      if (!authenticated(req)) { sendJson(res, 403, { error: "Invalid Secondary server key" }); return true; }
      if (pathname === "/api/sec/ping") {
        sendJson(res, 200, { receivedAt, sentAt: now() }); return true;
      }
      if (pathname === "/api/sec/return-ready") {
        const accepted = pair.role === "primary" && pair.fenced && data.session === pair.session
          && data.epoch === (pair.epoch || 0) && data.serverInstanceId === deps.instanceId;
        sendJson(res,accepted ? 200 : 409,{serverInstanceId:deps.instanceId}); return true;
      }
      if (pathname === "/api/sec/rejoin") {
        if (data.session !== pair.session || data.build !== deps.build || data.resources !== deps.resources()) {
          sendJson(res,409,{error:"Secondary server return requires the same session, build and assets"}); return true;
        }
        // Idempotent acknowledgement if the first reply was lost after saving.
        if (pair.role === "primary" && pair.previousEpoch === data.epoch
          && pair.returnedInstanceId === data.serverInstanceId) {
          sendJson(res,200,{sec:publicInfo(),serverInstanceId:deps.instanceId,returnedInstanceId:data.serverInstanceId}); return true;
        }
        const resume = pair.role === "primary" && pair.previousEpoch === data.epoch;
        if ((!resume && (pair.role !== "secondary" || !pair.promoted || data.epoch !== (pair.epoch || 0))) || reversing) {
          sendJson(res,409,{error:"Secondary server has not taken control or a role change is already in progress"}); return true;
        }
        const previous = pair;
        reversing = true;
        try {
          const returnUrl = resume ? pair.secondaryUrl : serverAddress(data.returnUrl);
          if (returnUrl === (resume ? pair.primaryUrl : pair.secondaryUrl)) throw new Error("The return address points to the current primary");
          const ready = await requestJson(returnUrl,"/api/sec/return-ready",{
            session:pair.session,epoch:data.epoch,serverInstanceId:data.serverInstanceId
          },pair.key);
          if (pair !== previous || ready.status !== 200 || ready.body.serverInstanceId !== data.serverInstanceId) {
            throw new Error("The former primary is not reachable at its return address");
          }
          if (resume) {
            pair.returnedInstanceId = data.serverInstanceId; save();
            sendJson(res,200,{sec:publicInfo(),serverInstanceId:deps.instanceId,returnedInstanceId:data.serverInstanceId});
            return true;
          }
          pair = {...pair,role:"primary",epoch:(pair.epoch || 0)+1,previousEpoch:pair.epoch || 0,
            primaryUrl:pair.secondaryUrl,secondaryUrl:returnUrl,returnedInstanceId:data.serverInstanceId,
            promoted:false,fenced:false,handoffPending:false,
            origins:[...new Set([...pair.origins,...(data.origins || []).map(serverAddress)])].slice(-100)};
          resetTransport();
          lastContact = -Infinity;
          save(); deps.broadcast(); wake(HEARTBEAT_MS);
          sendJson(res,200,{sec:publicInfo(),serverInstanceId:deps.instanceId,returnedInstanceId:data.serverInstanceId});
        } finally { reversing = false; }
        return true;
      }
      if (pathname === "/api/sec/unpair") {
        if (pair.promoted) { sendJson(res, 409, { error: "Secondary server has taken control" }); return true; }
        const clients = data.requireNoClients ? blockingClients(deps.clients()) : [];
        if (clients.length) {
          sendJson(res, 409, { code: "SECONDARY_HAS_CLIENTS", error: "Move these browsers to the primary server or close them before disconnecting Secondary server", clients }); return true;
        }
        if (commandReceiver) commandReceiver(409);
        pair = null; peerClients = []; save(); sendJson(res, 200, { ok: true }); return true;
      }
      if (pathname === "/api/sec/promote") {
        promote(); sendJson(res, 200, { sec: publicInfo() }); return true;
      }
      if (pathname === "/api/sec/commands" && pair.role === "secondary") {
        if (pair.promoted) { sendJson(res,409,{promoted:true}); return true; }
        if (commandReceiver) commandReceiver(409);
        let timeout;
        const finish = status => {
          if (commandReceiver !== finish) return;
          commandReceiver = null;
          clearTimeout(timeout);
          sendJson(res,status,{commands:status === 200 ? receiveCommands() : []});
        };
        commandReceiver = finish;
        timeout = setTimeout(()=>finish(200),1200);
        res.on?.("close",()=>{
          if (commandReceiver === finish) { commandReceiver = null; clearTimeout(timeout); }
        });
        if (queuedCommands.length) finish(200);
        return true;
      }
      if (pathname === "/api/sec/replicate" && pair.role === "secondary") {
        if (pair.promoted) {
          sendJson(res, 409, { promoted: true, clients: deps.clients() }); return true;
        }
        if (data.session !== pair.session || (data.epoch || 0) !== (pair.epoch || 0)) {
          sendJson(res,409,{error:"Retired Secondary server authority epoch"}); return true;
        }
        if (data.sourceInstanceId !== pair.sourceInstanceId) {
          if ((pair.retiredInstances || []).includes(data.sourceInstanceId)) {
            sendJson(res, 409, { error: "Retired Secondary server source instance" }); return true;
          }
          pair.retiredInstances = [...(pair.retiredInstances || []), pair.sourceInstanceId].slice(-8);
          pair.sourceInstanceId = data.sourceInstanceId;
          acceptedSequence = 0;
          clock.reset();
        }
        if (data.session !== pair.session || !Number.isSafeInteger(data.sequence) || data.sequence <= acceptedSequence) {
          sendJson(res, 409, { error: "Stale Secondary server packet" }); return true;
        }
        // A browser keeps its original document origin after moving to Secondary server.
        // Retain aliases even after that browser leaves the primary registry.
        if (Array.isArray(data.origins)) pair.origins = [...new Set([
          ...pair.origins, ...data.origins.slice(0, 100).map(serverAddress)
        ])].slice(-100);
        if (!clock.measure(data.measurement)) {
          sendJson(res, 409, { error: "Secondary server clock measurement is invalid" }); return true;
        }
        acceptedSequence = data.sequence;
        lastContact = now();
        peerClients = data.clients || []; peerClientsAt = now();
        switchRequests = new Map((data.switchRequests || []).map(item=>[item.clientId,item]));
        switchSequence = Math.max(0,...[...switchRequests.values()].map(item=>Number(item.sequence) || 0));
        if (data.state) {
          deps.importState(data);
          sourceListRevision = String(data.startListRevision || "");
          appliedCommands = new Set(data.appliedCommands || []);
          ackVersion = data.state.version;
          if (pair.handoffPending) { pair.handoffPending = false; save(); }
        }
        for (const result of data.results || []) {
          const pending = waitingCommands.get(result.id);
          if (pending) { waitingCommands.delete(result.id); clearTimeout(pending.timer); pending.resolve(result); }
        }
        for (const event of data.events || []) {
          if (receivedEvents.has(event.id)) continue;
          receivedEvents.add(event.id);
          if (receivedEvents.size > 256) receivedEvents.delete(receivedEvents.values().next().value);
          if (Number.isFinite(event.expiresAt) && deps.timerNow() > event.expiresAt) continue;
          deps.event(event);
        }
        const commands = commandReceiver ? [] : receiveCommands();
        sendJson(res, 200, { session: pair.session, version: ackVersion, ready: clock.ready,
          serverInstanceId:deps.instanceId, receivedAt, sentAt: now(), clients: deps.clients(), origins: deps.origins(), commands });
        deps.diagnostics();
        return true;
      }
      sendJson(res, 404, { error: "Unknown Secondary server endpoint" });
    } catch (error) { sendJson(res, 400, { error: error.message, code: error.code }); }
    return true;
  }
  function forward(body, client, pathname = "/api/action") {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        waitingCommands.delete(id);
        queuedCommands = queuedCommands.filter(command=>command.id !== id);
        reject(new Error("Secondary server primary command timed out"));
      }, 5000);
      waitingCommands.set(id, { resolve, reject, timer });
      queuedCommands.push({ id, body, client, pathname });
      if (commandReceiver) commandReceiver(200);
    });
  }
  return {
    clock, cors, handle, configure, remove, switchClient, publicInfo, forward,
    get configured() { return Boolean(pair); },
    get following() { return pair?.role === "secondary" && !pair.promoted; },
    get fenced() { return Boolean(pair?.fenced); },
    get rejoining() { return resumed; },
    get secondary() { return pair?.role === "secondary"; },
    get receivingBaseline() { return Boolean(pair?.handoffPending); },
    get sourceListRevision() { return sourceListRevision; },
    peerClient(id) {
      return peerClients.find(client => client.id === id);
    },
    peerConnected(id) {
      return peerClients.some(client => client.id === id && client.age + Math.max(0, now() - peerClientsAt) < 6000);
    },
    hasAppliedCommand(id) { return appliedCommands.has(id); },
    appliedCommandIds() { return [...new Set([...appliedCommands,...deps.appliedCommands()])].slice(-256); },
    notify() { if (!pair || pair.role !== "primary" || pair.fenced) return; dirty = true; if (!busy) wake(0); },
    event(value) {
      if (pair?.role !== "primary" || pair.fenced) return;
      queuedEvents.push({ ...value, id: crypto.randomUUID(), expiresAt: deps.timerNow() + 5000 });
      queuedEvents = queuedEvents.slice(-256);
      dirty = true;
      if (!busy) wake(0);
    },
    mergeClients(local) {
      if (!pair) return local;
      const merged = new Map();
      for (const client of peerClients) {
        const age = Math.max(0, Number(client.age) || 0) + Math.max(0, now() - peerClientsAt);
        merged.set(client.id, { ...client, age, connected: age < 6000, onSecondary: pair.role === "primary" });
      }
      for (const client of local) {
        const peer = merged.get(client.id);
        if (!peer || !peer.connected || client.age <= peer.age) {
          merged.set(client.id, { ...client, onSecondary: pair.role === "secondary" || Boolean(client.viaSecondary) });
        }
      }
      return [...merged.values()];
    },
    snapshot() { return pair ? { pair, clock: clock.snapshot(), acceptedSequence,
      switchRequests:[...switchRequests.values()],switchSequence,
      config: pair.role === "secondary" || clock.ready ? deps.config() : undefined,
      appliedCommands: [...new Set([...appliedCommands, ...deps.appliedCommands()])].slice(-256) } : null; },
    restore(saved, advanceMs) {
      if (!saved?.pair) return;
      pair = saved.pair;
      pair.origins ||= [];
      switchRequests = new Map((saved.switchRequests || []).map(item=>[item.clientId,item]));
      switchSequence = Math.max(Number(saved.switchSequence) || 0,...[...switchRequests.values()].map(item=>Number(item.sequence) || 0));
      appliedCommands = new Set((saved.appliedCommands || []).filter(id => typeof id === "string" && id.length <= 200).slice(-256));
      if (saved.config) deps.restoreConfig(saved.config);
      clock.restore(saved.clock, advanceMs);
      acceptedSequence = Number(saved.acceptedSequence) || 0;
      sequence = acceptedSequence;
      resumed = pair.role === "primary";
      if (pair.role === "secondary") lastContact = now();
      wake(0);
    },
    close() {
      clearTimeout(timer); timer = null;
      clearTimeout(commandPollTimer); commandPollTimer = null;
      if (commandReceiver) commandReceiver(503);
      for (const pending of waitingCommands.values()) { clearTimeout(pending.timer); pending.reject(new Error("Secondary server closed")); }
      waitingCommands.clear();
    }
  };
}

module.exports = { createSecondaryServer, createReplicaClock, serverAddress, requestJson, FAILOVER_MS, primaryNetworkAddress };
