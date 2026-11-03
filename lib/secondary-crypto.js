"use strict";

const crypto = require("node:crypto");
const { performance } = require("node:perf_hooks");

const PROTOCOL = 1;
const SUITE = "X25519-HKDF-SHA256-AES-256-GCM";
const WINDOW = 1024;
const LIMIT = 64;
const IDLE_MS = 10 * 60 * 1000;

function error(message = "Invalid encrypted Secondary server message", code = "SEC_CRYPTO_INVALID") {
  return Object.assign(new Error(message), { code });
}
function hex(value, bytes) { return typeof value === "string" && new RegExp(`^[a-f0-9]{${bytes * 2}}$`).test(value); }
function hmac(key, value) { return crypto.createHmac("sha256", key).update(value).digest(); }
function equal(a, b) { return a.length === b.length && crypto.timingSafeEqual(a, b); }
// RFC 5869. Node 12 has createHmac, but not hkdf/hkdfSync.
function hkdf(input, salt, info, length) {
  const prk = hmac(salt, input);
  const blocks = [];
  let previous = Buffer.alloc(0);
  for (let n = 1; Buffer.concat(blocks).length < length; n++) {
    if (n > 255) throw error();
    previous = hmac(prk, Buffer.concat([previous, Buffer.from(info), Buffer.from([n])]));
    blocks.push(previous);
  }
  return Buffer.concat(blocks).slice(0, length);
}
function keyPair() {
  const keys = crypto.generateKeyPairSync("x25519");
  return { privateKey: keys.privateKey, publicKey: keys.publicKey.export({ type: "spki", format: "der" }).toString("base64") };
}
function shared(privateKey, encoded) {
  if (typeof encoded !== "string" || encoded.length > 128) throw error();
  const publicKey = crypto.createPublicKey({ key: Buffer.from(encoded, "base64"), type: "spki", format: "der" });
  if (publicKey.asymmetricKeyType !== "x25519") throw error();
  const value = crypto.diffieHellman({ privateKey, publicKey });
  if (equal(value, Buffer.alloc(value.length))) throw error();
  return value;
}
function nonce(prefix, counter) {
  const value = Buffer.alloc(12);
  prefix.copy(value);
  value.writeUInt32BE(Math.floor(counter / 0x100000000), 4);
  value.writeUInt32BE(counter >>> 0, 8);
  return value;
}
function aad(channel, counter, path, status) {
  return Buffer.from(JSON.stringify(["FDV-SEC", PROTOCOL, channel, counter, path, status === undefined ? "request" : status]));
}
function seal(channel, key, prefix, counter, path, body, status) {
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce(prefix, counter), { authTagLength: 16 });
  cipher.setAAD(aad(channel, counter, path, status));
  const plaintext = JSON.stringify(body);
  if (Buffer.byteLength(plaintext) > 16 * 1024 * 1024) throw error("Secondary server message too large");
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { secure: PROTOCOL, channel, counter, ciphertext: ciphertext.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}
function unseal(packet, channel, key, prefix, counter, path, status) {
  if (!packet || packet.secure !== PROTOCOL || packet.channel !== channel || packet.counter !== counter
      || !Number.isSafeInteger(counter) || counter < 1 || typeof packet.ciphertext !== "string"
      || packet.ciphertext.length > 24 * 1024 * 1024 || typeof packet.tag !== "string") throw error();
  const tag = Buffer.from(packet.tag, "base64");
  if (tag.length !== 16) throw error();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce(prefix, counter), { authTagLength: 16 });
  decipher.setAAD(aad(channel, counter, path, status));
  decipher.setAuthTag(tag);
  // Never parse or act on unauthenticated plaintext from decipher.update.
  const bytes = Buffer.concat([decipher.update(Buffer.from(packet.ciphertext, "base64")), decipher.final()]);
  return JSON.parse(bytes.toString("utf8"));
}
function channelFrom(secret, root, transcript, initiator) {
  const material = hkdf(secret, Buffer.from(root, "hex"), Buffer.from(transcript), 72);
  return { id: JSON.parse(transcript).channel, root,
    sendKey: material.slice(initiator ? 0 : 32, initiator ? 32 : 64),
    receiveKey: material.slice(initiator ? 32 : 0, initiator ? 64 : 32),
    sendPrefix: material.slice(initiator ? 64 : 68, initiator ? 68 : 72),
    receivePrefix: material.slice(initiator ? 68 : 64, initiator ? 72 : 68),
    counter: 0, highest: 0, seen: new Set(), usedAt: 0, pairPending: false };
}
function transcript(request, response) {
  return JSON.stringify({ protocol: PROTOCOL, suite: SUITE, mode: request.mode,
    nonce: request.nonce, from: request.instanceId, to: response.instanceId,
    client: request.publicKey, server: response.publicKey, channel: response.channel });
}
function proof(root, value) { return hmac(Buffer.from(root, "hex"), value).toString("hex"); }
function validProof(root, value, supplied) { return hex(supplied, 32) && equal(Buffer.from(proof(root, value)), Buffer.from(supplied)); }
function requestProof(request) {
  return JSON.stringify([PROTOCOL, SUITE, request.mode, request.instanceId, request.nonce, request.publicKey]);
}

function createSecureTransport(deps) {
  const now = deps.now || (() => performance.now());
  const incoming = new Map(), outgoing = new Map(), handshakes = new Map();
  function prune(map) {
    for (const [id, item] of map) if (now() - item.usedAt > IDLE_MS) map.delete(id);
    while (map.size >= LIMIT) map.delete(map.keys().next().value);
  }
  function send(channel, address, path, body) {
    const counter = ++channel.counter;
    if (!Number.isSafeInteger(counter)) throw error();
    channel.usedAt = now();
    const packet = seal(channel.id, channel.sendKey, channel.sendPrefix, counter, path, body);
    const sent = deps.sample ? deps.sample() : null;
    return deps.request(address, path, packet, "", path === "/api/sec/replicate" ? 3000 : 1800).then(result => {
      const received = deps.sample ? deps.sample() : null;
      if (result.body && result.body.code === "SEC_CRYPTO_CHANNEL" && result.status === 409) {
        throw error("Secondary server encrypted channel must reconnect", "SEC_CRYPTO_CHANNEL");
      }
      return { ...result, transportTiming: sent && received ? {sent,received} : null,
        body: unseal(result.body, channel.id, channel.receiveKey, channel.receivePrefix, counter, path, result.status) };
    });
  }
  async function establish(address, root, mode, metadata = {}) {
    const keys = keyPair();
    const request = { protocol: PROTOCOL, suite: SUITE, mode, instanceId: deps.instanceId,
      nonce: crypto.randomBytes(32).toString("hex"), publicKey: keys.publicKey, ...metadata };
    if (root) request.proof = proof(root, requestProof(request));
    const result = await deps.request(address, "/api/sec/handshake", request);
    const response = result.body;
    if (result.status !== 200 || !response || response.protocol !== PROTOCOL || response.suite !== SUITE
        || !hex(response.channel, 32) || typeof response.instanceId !== "string" || response.instanceId.length > 160) {
      throw error("Secondary server does not support the encrypted protocol or rejected pairing", response?.code || "SEC_CRYPTO_UNSUPPORTED");
    }
    const context = transcript(request, response);
    if (root && !validProof(root, context, response.proof)) throw error();
    const secret = shared(keys.privateKey, response.publicKey);
    if (!root) root = hkdf(secret, Buffer.from(request.nonce, "hex"), Buffer.from("FDV-SEC pairing:" + context), 32).toString("hex");
    const channel = channelFrom(secret, root, context, true);
    channel.usedAt = now();
    return channel;
  }
  async function request(address, path, body, root) {
    if (!hex(root, 32)) throw error();
    const cacheKey = address + ":" + root;
    for (let attempt = 0; attempt < 2; attempt++) {
      let channel = outgoing.get(cacheKey);
      if (!channel || now() - channel.usedAt > IDLE_MS) {
        let pending = handshakes.get(cacheKey);
        if (!pending) {
          pending = establish(address, root, "resume"); handshakes.set(cacheKey, pending);
        }
        try { channel = await pending; prune(outgoing); outgoing.set(cacheKey, channel); }
        finally { if (handshakes.get(cacheKey) === pending) handshakes.delete(cacheKey); }
      }
      try { return await send(channel, address, path, body); }
      catch (failure) {
        if (failure.code !== "SEC_CRYPTO_CHANNEL" || attempt) throw failure;
        if (outgoing.get(cacheKey) === channel) outgoing.delete(cacheKey);
      }
    }
  }
  async function pair(address, body, metadata) {
    const channel = await establish(address, "", "pair", metadata);
    const result = await send(channel, address, "/api/sec/pair", body);
    if (result.status === 200) { prune(outgoing); outgoing.set(address + ":" + channel.root, channel); }
    return { ...result, key: channel.root };
  }
  function handshake(req, body) {
    if (req.headers.origin || !body || body.protocol !== PROTOCOL || body.suite !== SUITE
        || !hex(body.nonce, 32) || typeof body.instanceId !== "string" || body.instanceId.length > 160
        || body.instanceId === deps.instanceId || !["pair", "resume"].includes(body.mode)) throw error();
    const pairedKey = deps.key();
    if (body.mode === "pair") {
      if (!deps.canPair(body)) throw error("Secondary server is not empty or not compatible", "SECONDARY_PAIR_FAILED");
    } else if (!hex(pairedKey, 32) || !validProof(pairedKey, requestProof(body), body.proof)) throw error();
    const keys = keyPair();
    const response = { protocol: PROTOCOL, suite: SUITE, instanceId: deps.instanceId,
      publicKey: keys.publicKey, channel: crypto.randomBytes(32).toString("hex") };
    const context = transcript(body, response);
    const secret = shared(keys.privateKey, body.publicKey);
    const root = body.mode === "pair" ? hkdf(secret, Buffer.from(body.nonce, "hex"),
      Buffer.from("FDV-SEC pairing:" + context), 32).toString("hex") : pairedKey;
    const channel = channelFrom(secret, root, context, false);
    channel.usedAt = now();
    channel.pairPending = body.mode === "pair";
    prune(incoming); incoming.set(channel.id, channel);
    if (body.mode === "resume") response.proof = proof(root, context);
    return response;
  }
  function open(path, packet) {
    const channel = packet && incoming.get(packet.channel);
    if (!channel || now() - channel.usedAt > IDLE_MS) throw error("Unknown encrypted channel", "SEC_CRYPTO_CHANNEL");
    const root = deps.key();
    if (channel.root !== root && !(path === "/api/sec/pair" && channel.pairPending && !root)) throw error();
    const counter = packet.counter;
    if (!Number.isSafeInteger(counter) || counter < 1 || counter <= channel.highest - WINDOW || channel.seen.has(counter)) throw error();
    let body;
    try { body = unseal(packet, channel.id, channel.receiveKey, channel.receivePrefix, counter, path); }
    catch (_) { throw error(); }
    channel.highest = Math.max(channel.highest, counter);
    channel.seen.add(counter);
    for (const value of channel.seen) if (value <= channel.highest - WINDOW) channel.seen.delete(value);
    channel.usedAt = now();
    let replied = false;
    return { body, key: channel.root, reply(status, value) {
      if (replied) throw error(); replied = true;
      return seal(channel.id, channel.sendKey, channel.sendPrefix, counter, path, value, status);
    } };
  }
  return { request, pair, handshake, open,
    close() { incoming.clear(); outgoing.clear(); handshakes.clear(); } };
}

module.exports = { createSecureTransport, hkdf, PROTOCOL, SUITE };
