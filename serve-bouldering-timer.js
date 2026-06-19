const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = __dirname;
const paramsPath = path.join(root, "params.txt");
const beepsPath = path.join(root, "beeps");
const BUILD_NUMBER = 135;
const defaultConfig = {
  httpPort: 8008,
  httpsPort: 8443,
  classicRotationMinutes: 4,
  classicBreakSeconds: 15,
  festivalRoundMinutes: 120,
  festivalBreakMinutes: 30,
  finalRotationMinutes: 4,
  language: "ru",
  primaryBrowser: false,
  sound: true,
  soundInOtherBrowsers: false,
  festivalAnnouncements: true,
  flashing: true,
  soundProfile: "FSR_2026",
  timerFont: "Inter, Arial, sans-serif",
  rotationTextColor: "#f4f7fb",
  rotationLastFiveTextColor: "#f4f7fb",
  breakTextColor: "#f4f7fb",
  rotationBackgroundColor: "#0e1116",
  rotationLastFiveBackgroundColor: "#0e1116",
  breakBackgroundColor: "#f05a59"
};

function readParams() {
  if (!fs.existsSync(paramsPath)) return {};
  const raw = fs.readFileSync(paramsPath, "utf8");
  return Object.fromEntries(raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      if (index === -1) return [line, ""];
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }));
}

function intParam(params, key, fallback, min = 0, max = 100000) {
  const number = Number(params[key]);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function boolParam(params, key, fallback) {
  if (!(key in params)) return fallback;
  return /^(1|true|yes|on|да)$/i.test(params[key]);
}

function languageParam(params, key, fallback) {
  return String(params[key] || fallback).toLowerCase() === "en" ? "en" : "ru";
}

function textParam(params, key, fallback, maxLength = 160) {
  if (!(key in params)) return fallback;
  const value = String(params[key] || "").replace(/[\r\n\0]/g, " ").trim();
  return value ? value.slice(0, maxLength) : fallback;
}

function profileFileUrl(profileName, fileName) {
  return `beeps/${encodeURIComponent(profileName)}/${encodeURIComponent(fileName)}`;
}

function findProfileFile(entries, role) {
  const roleName = role.toLowerCase();
  for (const extension of [".wav", ".mp3"]) {
    const match = entries.find((entry) => entry.isFile()
      && path.extname(entry.name).toLowerCase() === extension
      && path.basename(entry.name, extension).toLowerCase() === roleName);
    if (match) return match.name;
  }
  return "";
}

function loadSoundProfiles() {
  if (!fs.existsSync(beepsPath)) return [];
  return fs.readdirSync(beepsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const profilePath = path.join(beepsPath, entry.name);
      const files = fs.readdirSync(profilePath, { withFileTypes: true });
      const start = findProfileFile(files, "START");
      const end = findProfileFile(files, "END") || start;
      const minute = findProfileFile(files, "MINUTE");
      const warning = findProfileFile(files, "WARNING");
      const festival60 = findProfileFile(files, "FESTIVAL_60");
      const festival30 = findProfileFile(files, "FESTIVAL_30");
      const festival10 = findProfileFile(files, "FESTIVAL_10");
      const festival5 = findProfileFile(files, "FESTIVAL_5");
      if (!start && !minute && !warning) return null;
      return {
        id: entry.name,
        sources: {
          start: start ? profileFileUrl(entry.name, start) : "",
          end: end ? profileFileUrl(entry.name, end) : "",
          minute: minute ? profileFileUrl(entry.name, minute) : "",
          warn: warning ? profileFileUrl(entry.name, warning) : "",
          festival60: festival60 ? profileFileUrl(entry.name, festival60) : "",
          festival30: festival30 ? profileFileUrl(entry.name, festival30) : "",
          festival10: festival10 ? profileFileUrl(entry.name, festival10) : "",
          festival5: festival5 ? profileFileUrl(entry.name, festival5) : ""
        }
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id, "en"));
}

function selectedSoundProfile(params, profiles) {
  const requested = String(params.sound_profile || defaultConfig.soundProfile).trim();
  const exact = profiles.find((profile) => profile.id === requested);
  if (exact) return exact.id;
  const caseInsensitive = profiles.find((profile) => profile.id.toLowerCase() === requested.toLowerCase());
  if (caseInsensitive) return caseInsensitive.id;
  if (profiles.some((profile) => profile.id === defaultConfig.soundProfile)) return defaultConfig.soundProfile;
  return profiles[0]?.id || "";
}

function numberOrDefault(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

const params = readParams();
const soundProfiles = loadSoundProfiles();
const initialSoundProfile = selectedSoundProfile(params, soundProfiles);
soundProfiles.sort((a, b) => {
  if (a.id === initialSoundProfile) return -1;
  if (b.id === initialSoundProfile) return 1;
  return a.id.localeCompare(b.id, "en");
});
const config = {
  httpPort: intParam(params, "http_port", defaultConfig.httpPort, 1, 65535),
  httpsPort: intParam(params, "https_port", defaultConfig.httpsPort, 1, 65535),
  classicRotationMinutes: intParam(params, "classic_rotation_minutes", defaultConfig.classicRotationMinutes, 1, 240),
  classicBreakSeconds: intParam(params, "classic_break_seconds", defaultConfig.classicBreakSeconds, 0, 3600),
  festivalRoundMinutes: intParam(params, "festival_round_minutes", defaultConfig.festivalRoundMinutes, 1, 240),
  festivalBreakMinutes: intParam(params, "festival_break_minutes", defaultConfig.festivalBreakMinutes, 0, 240),
  finalRotationMinutes: intParam(params, "final_rotation_minutes", defaultConfig.finalRotationMinutes, 1, 240),
  language: languageParam(params, "language", defaultConfig.language),
  primaryBrowser: boolParam(params, "primary_browser", defaultConfig.primaryBrowser),
  sound: boolParam(params, "sound", defaultConfig.sound),
  soundInOtherBrowsers: boolParam(params, "sound_in_other_browsers", defaultConfig.soundInOtherBrowsers),
  festivalAnnouncements: boolParam(params, "festival_announcements", defaultConfig.festivalAnnouncements),
  flashing: boolParam(params, "flashing", defaultConfig.flashing),
  timerFont: textParam(params, "timer_font", defaultConfig.timerFont),
  rotationTextColor: textParam(params, "rotation_text_color", defaultConfig.rotationTextColor),
  rotationLastFiveTextColor: textParam(params, "rotation_last_five_text_color", defaultConfig.rotationLastFiveTextColor),
  breakTextColor: textParam(params, "break_text_color", defaultConfig.breakTextColor),
  rotationBackgroundColor: textParam(params, "rotation_background_color", defaultConfig.rotationBackgroundColor),
  rotationLastFiveBackgroundColor: textParam(params, "rotation_last_five_background_color", defaultConfig.rotationLastFiveBackgroundColor),
  breakBackgroundColor: textParam(params, "break_background_color", defaultConfig.breakBackgroundColor),
  soundProfile: initialSoundProfile,
  soundProfiles
};

const port = Number(process.env.PORT) || config.httpPort;
const httpsPort = Number(process.env.HTTPS_PORT) || config.httpsPort;
const host = "0.0.0.0";
const keyPath = path.join(root, "timer-key.pem");
const certPath = path.join(root, "timer-cert.pem");
const pfxPath = path.join(root, "timer-cert.pfx");
const pfxPassphrase = process.env.HTTPS_PFX_PASSPHRASE || "bouldering-timer";

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav"
};

const timerState = {
  running: false,
  completed: false,
  countdownOnly: false,
  waitingForManualStart: false,
  elapsedBeforePause: 0,
  startedAt: 0,
  activePreset: "classic",
  activeSettings: {
    rotationSeconds: config.classicRotationMinutes * 60,
    breakSeconds: config.classicBreakSeconds,
    oneShot: false
  },
  draftSettings: {
    rotationMinutes: config.classicRotationMinutes,
    breakSeconds: config.classicBreakSeconds,
    oneShot: false,
    startHours: "",
    startMinutes: ""
  },
  primaryClientId: null,
  instancesSound: config.soundInOtherBrowsers,
  instancesFullscreen: false,
  globalSound: config.sound,
  festivalAnnouncements: config.festivalAnnouncements,
  soundProfile: config.soundProfile,
  language: config.language,
  version: 1
};

const clients = new Map();
const clientAudioOffsets = new Map();
const eventClients = new Map();
let nextClientOrder = 1;
let nextAudioTestId = 1;
let stateTransitionTimer = null;

function browserInfo(userAgent = "") {
  const rules = [
    ["Yandex", /YaBrowser\/(\d+)/],
    ["Edge", /EdgA?\/(\d+)/],
    ["Edge iOS", /EdgiOS\/(\d+)/],
    ["Opera", /OPR\/(\d+)/],
    ["Opera", /Opera\/(\d+)/],
    ["Samsung", /SamsungBrowser\/(\d+)/],
    ["Chrome iOS", /CriOS\/(\d+)/],
    ["Firefox iOS", /FxiOS\/(\d+)/],
    ["Firefox", /Firefox\/(\d+)/],
    ["Safari", /Version\/(\d+).*Safari\//],
    ["Chrome", /Chrome\/(\d+)/],
    ["Chrome", /Chromium\/(\d+)/]
  ];

  for (const [name, pattern] of rules) {
    const match = userAgent.match(pattern);
    if (match) return { name, version: match[1] || "" };
  }
  return { name: "Browser", version: "" };
}

function browserName(userAgent = "") {
  return browserInfo(userAgent).name;
}

function browserVersion(userAgent = "") {
  return browserInfo(userAgent).version;
}

function osShort(userAgent = "") {
  if (/Android/i.test(userAgent)) return "Android";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS";
  if (/Mac OS X|Macintosh/i.test(userAgent)) return "macOS";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "OS";
}

function compactUserAgent(userAgent = "") {
  const version = browserVersion(userAgent);
  return `${browserName(userAgent)}${version ? ` ${version}` : ""} ${osShort(userAgent)}`;
}

function sourceValue(source, key) {
  if (typeof source.get === "function") return source.get(key);
  return source[key];
}

function optionalNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function optionalBool(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  return /^(1|true|yes|on|да)$/i.test(String(value));
}

function cleanAddress(address = "") {
  return String(address)
    .replace(/^::ffff:/, "")
    .replace(/^\[|\]$/g, "");
}

function hostAddressSet() {
  const addresses = new Set(["127.0.0.1", "::1", "localhost"]);
  Object.values(os.networkInterfaces())
    .flat()
    .filter(Boolean)
    .forEach((item) => {
      if (item.address) addresses.add(cleanAddress(item.address));
    });
  return addresses;
}

function isPrivateIPv4(address = "") {
  return /^10\./.test(address)
    || /^192\.168\./.test(address)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(address);
}

function preferredHostIPv4() {
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => cleanAddress(item.address));
  return addresses.find(isPrivateIPv4) || addresses[0] || "127.0.0.1";
}

function computerKeyForAddress(address = "") {
  const clean = cleanAddress(address);
  return hostAddressSet().has(clean) ? "server-host" : clean;
}

function displayAddressForClient(address = "") {
  const clean = cleanAddress(address);
  return computerKeyForAddress(clean) === "server-host"
    ? preferredHostIPv4()
    : clean;
}

function registerClient(req, source = {}) {
  const id = sourceValue(source, "clientId") || req.headers["x-client-id"];
  if (!id) return null;
  const now = Date.now();
  const userAgent = req.headers["user-agent"] || "";
  const existing = clients.get(id) || {};
  const latency = optionalNumber(sourceValue(source, "latency"), existing.latency ?? null);
  const syncError = optionalNumber(sourceValue(source, "syncError"), existing.syncError ?? null);
  const usesFallbackSync = syncError === null && Number.isFinite(latency);
  clients.set(id, {
    id,
    firstSeen: existing.firstSeen || now,
    order: existing.order || nextClientOrder++,
    label: compactUserAgent(userAgent),
    browser: browserName(userAgent),
    userAgent,
    address: req.socket.remoteAddress || "",
    displayAddress: displayAddressForClient(req.socket.remoteAddress || ""),
    computerKey: computerKeyForAddress(req.socket.remoteAddress || ""),
    protocol: req.socket.encrypted ? "HTTPS" : "HTTP",
    lastSeen: now,
    latency,
    offset: optionalNumber(sourceValue(source, "offset"), existing.offset ?? null),
    syncError: syncError ?? (usesFallbackSync ? latency / 2 : null),
    syncJitter: optionalNumber(sourceValue(source, "syncJitter"), usesFallbackSync ? 0 : existing.syncJitter ?? null),
    syncSamples: optionalNumber(sourceValue(source, "syncSamples"), usesFallbackSync ? 1 : existing.syncSamples ?? null),
    visibility: sourceValue(source, "visibility") || existing.visibility || "",
    viewport: sourceValue(source, "viewport") || existing.viewport || "",
    screen: sourceValue(source, "screen") || existing.screen || "",
    dpr: optionalNumber(sourceValue(source, "dpr"), existing.dpr ?? null),
    audioUnlocked: optionalBool(sourceValue(source, "audioUnlocked"), existing.audioUnlocked ?? null),
    soundAllowed: optionalBool(sourceValue(source, "soundAllowed"), existing.soundAllowed ?? null),
    audioBaseLatency: optionalNumber(sourceValue(source, "audioBaseLatency"), existing.audioBaseLatency ?? null),
    audioOutputLatency: optionalNumber(sourceValue(source, "audioOutputLatency"), existing.audioOutputLatency ?? null),
    audioUserOffset: clientAudioOffsets.get(id) ?? 0,
    wakeLockSupported: optionalBool(sourceValue(source, "wakeLockSupported"), existing.wakeLockSupported ?? null),
    wakeLockActive: optionalBool(sourceValue(source, "wakeLockActive"), existing.wakeLockActive ?? null),
    eventSourceSupported: optionalBool(sourceValue(source, "eventSourceSupported"), existing.eventSourceSupported ?? null),
    eventSourceConnected: optionalBool(sourceValue(source, "eventSourceConnected"), existing.eventSourceConnected ?? null),
    stateVersion: optionalNumber(sourceValue(source, "stateVersion"), existing.stateVersion ?? null),
    displayStatus: sourceValue(source, "displayStatus") || existing.displayStatus || ""
  });
  return id;
}

function publicClients() {
  const now = Date.now();
  for (const [id, client] of clients) {
    if (now - client.lastSeen > 30000) clients.delete(id);
  }
  return [...clients.values()]
    .sort((a, b) => {
      const primaryA = timerState.primaryClientId === a.id ? 0 : 1;
      const primaryB = timerState.primaryClientId === b.id ? 0 : 1;
      if (primaryA !== primaryB) return primaryA - primaryB;
      return (a.order || 0) - (b.order || 0);
    })
    .map((client) => ({
      ...client,
      role: timerState.primaryClientId ? (timerState.primaryClientId === client.id ? "Основной" : "Экран") : "",
      age: now - client.lastSeen,
      connected: now - client.lastSeen < 6000
    }));
}

function elapsedSeconds(now = Date.now()) {
  if (!timerState.running) return timerState.elapsedBeforePause;
  return Math.max(0, (now - timerState.startedAt) / 1000);
}

function scheduledStartTime(now, hoursValue, minutesValue, restorePast = false) {
  const hasHours = hoursValue !== null && hoursValue !== undefined && hoursValue !== "";
  const hasMinutes = minutesValue !== null && minutesValue !== undefined && minutesValue !== "";
  if (!hasHours && !hasMinutes) return now;

  const hours = Math.min(23, Math.max(0, Math.round(numberOrDefault(hoursValue, 0))));
  const minutes = Math.min(59, Math.max(0, Math.round(numberOrDefault(minutesValue, 0))));
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);
  if (!restorePast && target.getTime() <= now) target.setDate(target.getDate() + 1);
  return target.getTime();
}

function finalizeOneShot(now = Date.now()) {
  if (!timerState.running || timerState.countdownOnly || !timerState.activeSettings.oneShot) return;
  const duration = Math.max(0,
    numberOrDefault(timerState.activeSettings.rotationSeconds, 0)
    + numberOrDefault(timerState.activeSettings.breakSeconds, 0));
  if (now < timerState.startedAt || elapsedSeconds(now) < duration) return;
  timerState.running = false;
  timerState.completed = true;
  timerState.elapsedBeforePause = duration;
  timerState.startedAt = 0;
  timerState.version += 1;
}

function finalizeScheduledCountdown(now = Date.now()) {
  if (!timerState.running || !timerState.countdownOnly || now < timerState.startedAt) return;
  timerState.running = false;
  timerState.countdownOnly = false;
  timerState.waitingForManualStart = true;
  timerState.elapsedBeforePause = 0;
  timerState.startedAt = 0;
  timerState.draftSettings.startHours = "";
  timerState.draftSettings.startMinutes = "";
  timerState.version += 1;
}

function armStateTransition(targetTime) {
  if (stateTransitionTimer) clearTimeout(stateTransitionTimer);
  stateTransitionTimer = null;
  if (!targetTime) return;
  stateTransitionTimer = setTimeout(() => {
    stateTransitionTimer = null;
    publicState();
    broadcastState();
  }, Math.max(0, targetTime - Date.now() + 5));
}

function publicState() {
  finalizeScheduledCountdown();
  finalizeOneShot();
  return {
    ...timerState,
    config: {
      ...config,
      buildNumber: BUILD_NUMBER,
      httpPort: port,
      httpsPort
    },
    clients: publicClients(),
    elapsed: elapsedSeconds(),
    now: Date.now()
  };
}

function broadcastState() {
  const payload = `event: state\ndata: ${JSON.stringify(publicState())}\n\n`;
  for (const [res, eventClient] of eventClients) {
    try {
      res.write(payload);
    } catch (error) {
      clearInterval(eventClient.keepAlive);
      eventClients.delete(res);
    }
  }
}

function sendEvent(eventName, data, predicate = () => true) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [res, eventClient] of eventClients) {
    if (!predicate(eventClient)) continue;
    try {
      res.write(payload);
    } catch (error) {
      clearInterval(eventClient.keepAlive);
      eventClients.delete(res);
    }
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function handleRequest(req, res) {
  const requestUrl = new URL(req.url, `http://localhost:${port}`);

  if (requestUrl.pathname === "/api/state" && req.method === "GET") {
    registerClient(req, requestUrl.searchParams);
    sendJson(res, 200, publicState());
    return;
  }

  if (requestUrl.pathname === "/api/events" && req.method === "GET") {
    const eventClientId = registerClient(req, requestUrl.searchParams);
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "connection": "keep-alive",
      "x-accel-buffering": "no"
    });
    res.write("retry: 1000\n\n");
    res.write(`event: state\ndata: ${JSON.stringify(publicState())}\n\n`);
    const keepAlive = setInterval(() => {
      try {
        if (eventClientId && clients.has(eventClientId)) {
          clients.get(eventClientId).lastSeen = Date.now();
        }
        res.write(`event: ping\ndata: ${Date.now()}\n\n`);
      } catch (error) {}
    }, 15000);
    eventClients.set(res, { keepAlive, clientId: eventClientId });
    req.on("close", () => {
      clearInterval(keepAlive);
      eventClients.delete(res);
    });
    return;
  }

  if (requestUrl.pathname === "/api/action" && req.method === "POST") {
    readJson(req).then((body) => {
      registerClient(req, body);
      const now = Date.now();
      const type = body.type;
      let audioTestCommand = null;

      if (type === "start") {
        const settings = body.settings || timerState.activeSettings;
        const wasCompleted = timerState.completed;
        const elapsed = wasCompleted ? 0 : timerState.running ? elapsedSeconds(now) : timerState.elapsedBeforePause;
        const hasScheduledStart = body.startHours !== "" || body.startMinutes !== "";
        const manualStart = Boolean(body.manualStart || timerState.waitingForManualStart);
        timerState.activeSettings = {
          rotationSeconds: numberOrDefault(settings.rotationSeconds, config.classicRotationMinutes * 60),
          breakSeconds: numberOrDefault(settings.breakSeconds, config.classicBreakSeconds),
          oneShot: Boolean(settings.oneShot)
        };
        timerState.running = true;
        timerState.completed = false;
        timerState.elapsedBeforePause = 0;
        timerState.countdownOnly = Boolean(settings.oneShot && hasScheduledStart && !manualStart && elapsed === 0);
        timerState.waitingForManualStart = false;
        const scheduledTime = scheduledStartTime(
          now,
          body.startHours,
          body.startMinutes,
          hasScheduledStart && !timerState.activeSettings.oneShot
        );
        timerState.startedAt = elapsed > 0 || manualStart
          ? now - Math.max(0, elapsed) * 1000
          : scheduledTime;
        if (manualStart) {
          timerState.draftSettings.startHours = "";
          timerState.draftSettings.startMinutes = "";
        }
        const oneShotDuration = timerState.activeSettings.rotationSeconds + timerState.activeSettings.breakSeconds;
        armStateTransition(timerState.countdownOnly
          ? timerState.startedAt
          : timerState.activeSettings.oneShot ? timerState.startedAt + oneShotDuration * 1000 : 0);
        timerState.version += 1;
      }

      if (type === "pause" && timerState.running && timerState.startedAt <= now) {
        timerState.elapsedBeforePause = elapsedSeconds(now);
        timerState.running = false;
        timerState.countdownOnly = false;
        timerState.startedAt = 0;
        armStateTransition(0);
        timerState.version += 1;
      }

      if (type === "stopCountdown" && timerState.running && timerState.startedAt > now) {
        timerState.running = false;
        timerState.countdownOnly = false;
        timerState.waitingForManualStart = false;
        timerState.elapsedBeforePause = 0;
        timerState.startedAt = 0;
        armStateTransition(0);
        timerState.version += 1;
      }

      if (type === "reset") {
        const settings = body.settings || timerState.draftSettings;
        timerState.running = false;
        timerState.completed = false;
        timerState.countdownOnly = false;
        timerState.waitingForManualStart = false;
        timerState.elapsedBeforePause = 0;
        timerState.startedAt = 0;
        armStateTransition(0);
        timerState.activeSettings = {
          rotationSeconds: numberOrDefault(settings.rotationSeconds, config.classicRotationMinutes * 60),
          breakSeconds: numberOrDefault(settings.breakSeconds, config.classicBreakSeconds),
          oneShot: Boolean(settings.oneShot)
        };
        timerState.version += 1;
      }

      if (type === "seek" && !timerState.running) {
        const elapsed = Number(body.elapsed);
        if (Number.isFinite(elapsed)) {
          timerState.elapsedBeforePause = Math.max(0, elapsed);
          timerState.startedAt = 0;
          timerState.version += 1;
        }
      }

      if (type === "settings") {
        const settings = body.settings || {};
        timerState.draftSettings = {
          rotationMinutes: numberOrDefault(settings.rotationMinutes, config.classicRotationMinutes),
          breakSeconds: settings.oneShot && settings.breakSeconds === ""
            ? ""
            : numberOrDefault(settings.breakSeconds, config.classicBreakSeconds),
          oneShot: Boolean(settings.oneShot),
          startHours: settings.startHours ?? "",
          startMinutes: settings.startMinutes ?? ""
        };
        timerState.activePreset = body.activePreset || "";
        if (!timerState.running && timerState.elapsedBeforePause === 0) {
          timerState.activeSettings = {
            rotationSeconds: timerState.draftSettings.rotationMinutes * 60,
            breakSeconds: timerState.draftSettings.breakSeconds,
            oneShot: timerState.draftSettings.oneShot
          };
        }
        timerState.version += 1;
      }

      if (type === "primary") {
        timerState.primaryClientId = body.clientId || null;
        timerState.version += 1;
      }

      if (type === "instancesSound") {
        timerState.instancesSound = Boolean(body.enabled);
        timerState.version += 1;
      }

      if (type === "instancesFullscreen") {
        timerState.instancesFullscreen = Boolean(body.enabled);
        timerState.version += 1;
      }

      if (type === "sound") {
        timerState.globalSound = Boolean(body.enabled);
        timerState.version += 1;
      }

      if (type === "festivalAnnouncements") {
        timerState.festivalAnnouncements = Boolean(body.enabled);
        timerState.version += 1;
      }

      const soundProfileCanChange = timerState.elapsedBeforePause === 0
        && (!timerState.running || timerState.startedAt > now);
      if (type === "soundProfile" && soundProfileCanChange) {
        const requestedProfile = String(body.soundProfile || "");
        if (soundProfiles.some((profile) => profile.id === requestedProfile)) {
          timerState.soundProfile = requestedProfile;
          timerState.version += 1;
        }
      }

      if (type === "language") {
        timerState.language = body.language === "en" ? "en" : "ru";
        timerState.version += 1;
      }

      if (type === "audioOffset") {
        const targetClientId = String(body.targetClientId || "");
        const offset = Math.max(-5000, Math.min(5000, numberOrDefault(body.offset, 0)));
        if (targetClientId) {
          clientAudioOffsets.set(targetClientId, Math.round(offset));
          if (clients.has(targetClientId)) {
            clients.get(targetClientId).audioUserOffset = Math.round(offset);
          }
          timerState.version += 1;
        }
      }

      if (type === "audioTest") {
        const kind = ["start", "end", "minute", "warn"].includes(body.kind) ? body.kind : "start";
        const targetClientId = String(body.targetClientId || "");
        const everywhere = Boolean(body.everywhere && timerState.primaryClientId);
        if (everywhere || targetClientId) {
          audioTestCommand = {
            id: `${now}-${nextAudioTestId++}`,
            kind,
            everywhere,
            targetClientId: everywhere ? "" : targetClientId,
            serverTime: now + 1800
          };
        }
      }

      const state = publicState();
      sendJson(res, 200, state);
      broadcastState();
      if (audioTestCommand) {
        sendEvent(
          "audio-test",
          audioTestCommand,
          (eventClient) => audioTestCommand.everywhere
            || eventClient.clientId === audioTestCommand.targetClientId
        );
      }
    }).catch(() => sendJson(res, 400, { error: "Invalid JSON" }));
    return;
  }

  const relativePath = requestUrl.pathname === "/" ? "index.html" : decodeURIComponent(requestUrl.pathname.slice(1));
  const filePath = path.resolve(root, relativePath);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, body) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "content-type": types[path.extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(body);
  });
}

const server = http.createServer(handleRequest);

function localNetworkUrls(protocol, currentPort) {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => `${protocol}://${item.address}:${currentPort}/`);
}

server.listen(port, host, () => {
  console.log(`Bouldering timer on this computer: http://127.0.0.1:${port}/`);
  localNetworkUrls("http", port).forEach((url) => console.log(`Bouldering timer on local network: ${url}`));
});

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  const httpsServer = https.createServer({
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  }, handleRequest);

  httpsServer.listen(httpsPort, host, () => {
    console.log(`Bouldering timer HTTPS on this computer: https://127.0.0.1:${httpsPort}/`);
    localNetworkUrls("https", httpsPort).forEach((url) => console.log(`Bouldering timer HTTPS on local network: ${url}`));
  });
} else if (fs.existsSync(pfxPath)) {
  const httpsServer = https.createServer({
    pfx: fs.readFileSync(pfxPath),
    passphrase: pfxPassphrase
  }, handleRequest);

  httpsServer.listen(httpsPort, host, () => {
    console.log(`Bouldering timer HTTPS on this computer: https://127.0.0.1:${httpsPort}/`);
    localNetworkUrls("https", httpsPort).forEach((url) => console.log(`Bouldering timer HTTPS on local network: ${url}`));
  });
} else {
  console.log("HTTPS disabled: certificate files were not found. Run create-https-certificate to enable it.");
}
