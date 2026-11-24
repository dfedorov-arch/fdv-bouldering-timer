"use strict";

const crypto = require("node:crypto");
const WebSocket = require("./vendor/ws");

const PATH = "/api/sec/tunnel";
const ADDRESS = "sec-tunnel";
const MAX_PAYLOAD = 24 * 1024 * 1024 + 4096;
const ROUTES = new Set([
  "identity", "handshake", "pair", "recover-primary", "rejoin", "return-ready",
  "commands", "ping", "replicate", "unpair", "promote"
].map(name => "/api/sec/" + name));

function createSecondaryTunnel({ endpoint, token, handle }) {
  if (!/^[a-fA-F0-9]{64}$/.test(token || "")) {
    throw new Error("FDV_SEC_TUNNEL_TOKEN must contain 64 hexadecimal characters");
  }
  const url = endpoint ? new URL(endpoint) : null;
  if (url && (url.protocol !== "wss:" || url.pathname !== PATH || url.username || url.password || url.search || url.hash)) {
    throw new Error("FDV_SEC_TUNNEL_URL must be a wss:// address ending in " + PATH);
  }
  const authorization = Buffer.from("Bearer " + token);
  const options = { maxPayload: MAX_PAYLOAD, perMessageDeflate: false };
  const listener = url ? null : new WebSocket.Server({ ...options, noServer: true });
  const pending = new Map();
  let socket, reconnect, nextId = 0, closed = false, alive = false, connecting;
  function send(connection, message) {
    if (connection.readyState !== WebSocket.OPEN || connection.bufferedAmount > MAX_PAYLOAD) {
      throw new Error("Secondary server tunnel is unavailable");
    }
    connection.send(JSON.stringify(message));
  }
  function bind(connection) {
    if (socket) socket.terminate();
    socket = connection;
    alive = true;
    connection.on("pong", () => { if (socket === connection) alive = true; });
    connection.on("error", () => connection.terminate());
    connection.on("close", () => {
      if (socket === connection) socket = null;
      for (const [id, request] of pending) {
        if (request.connection !== connection) continue;
        clearTimeout(request.timer);
        pending.delete(id);
        request.reject(new Error("Secondary server tunnel disconnected"));
      }
      scheduleReconnect();
    });
    connection.on("message", async (buffer, binary) => {
      if (socket !== connection || binary) return;
      let message;
      try { message = JSON.parse(buffer.toString()); } catch (_) { connection.terminate(); return; }
      if (!message || !Number.isSafeInteger(message.id) || message.id < 1) return;
      if (message.type === "response") {
        const request = pending.get(message.id);
        if (!request || request.connection !== connection) return;
        pending.delete(message.id);
        clearTimeout(request.timer);
        request.resolve({ status: message.status, body: message.body });
        return;
      }
      if (message.type !== "request" || !ROUTES.has(message.path)) return;
      try {
        const response = await handle(message.path, message.body);
        send(connection, { type: "response", id: message.id, ...response });
      } catch (_) { connection.terminate(); }
    });
  }
  function scheduleReconnect() {
    if (!url || closed || socket || connecting || reconnect) return;
    reconnect = setTimeout(() => {
      reconnect = null;
      connect().catch(() => {});
    }, 1000);
    reconnect.unref();
  }
  function connect() {
    if (socket?.readyState === WebSocket.OPEN) return Promise.resolve(socket);
    if (!url || closed) return Promise.reject(new Error("Secondary server tunnel is unavailable"));
    if (connecting) return connecting.promise;
    const connection = new WebSocket(url, { ...options, handshakeTimeout: 3000,
      headers: { Authorization: authorization.toString() } });
    const promise = new Promise((resolve, reject) => {
      connection.once("open", () => { bind(connection); resolve(connection); });
      connection.once("error", reject);
      connection.once("close", () => reject(new Error("Secondary server tunnel disconnected")));
    }).finally(() => { connecting = null; scheduleReconnect(); });
    connecting = { connection, promise };
    return promise;
  }
  const heartbeat = setInterval(() => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (!alive) { socket.terminate(); return; }
    alive = false;
    socket.ping();
  }, 5000);
  heartbeat.unref();
  return {
    dial: Boolean(url),
    publicOrigin: url ? "https://" + url.host : "",
    start: scheduleReconnect,
    attach(server) {
      if (!listener) return;
      server.on("upgrade", (req, connection, head) => {
        const credential = Buffer.from(req.headers.authorization || "");
        const remote = req.socket.remoteAddress || "";
        const localProxy = remote === "::1" || /^(?:::ffff:)?127\./.test(remote);
        if ((!req.socket.encrypted && !localProxy) || req.url !== PATH
          || req.headers.origin || credential.length !== authorization.length
          || !crypto.timingSafeEqual(credential, authorization)) {
          connection.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
          return;
        }
        listener.handleUpgrade(req, connection, head, bind);
      });
    },
    async request(path, body, timeoutMs = 1800) {
      const connection = await connect();
      if (pending.size >= 64) throw new Error("Too many Secondary server tunnel requests");
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("Secondary server tunnel request timed out"));
        }, timeoutMs);
        pending.set(id, { connection, timer, resolve, reject });
        try { send(connection, { type: "request", id, path, body }); }
        catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
      });
    },
    close() {
      closed = true;
      clearTimeout(reconnect);
      clearInterval(heartbeat);
      if (connecting) connecting.connection.terminate();
      if (socket) socket.terminate();
      if (listener) listener.close();
    }
  };
}

module.exports = { ADDRESS, createSecondaryTunnel };
