const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { performance } = require("perf_hooks");
const { createTimerDomain } = require("./lib/timer-domain");
const { createTimerTransitions } = require("./lib/timer-transitions");

const root = __dirname;
const paramsPath = path.join(root, "params.txt");
const runtimeStateDir = path.join(root, "runtime-state");
const runtimeStatePath = path.join(runtimeStateDir, "timer-state.json");
const beepsPath = path.join(root, "beeps");
const fontsPath = path.join(root, "fonts");
const offlineAudioPath = path.join(root, "offline-audio.js");
const BUILD_NUMBER = 203;
const serverInstanceId = crypto.randomUUID();
const SNAPSHOT_SCHEMA_VERSION = 1;
const SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const PRIMARY_RESTORE_GRACE_MS = 10000;
const MANUAL_START_AUDIO_LEAD_MS = 300;
const COMMAND_CACHE_MAX = 256;
const DIAGNOSTICS_BROADCAST_MS = 2500;
const PRIMARY_PIN_MAX_FAILURES = 5;
const PRIMARY_PIN_BLOCK_STEPS_MS = [5000, 30000, 300000];
const AUDIO_TEST_RATE_LIMIT_MS = 3000;
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
  timerFontFile: "Roboto-Variable.ttf",
  timerFont: "Arial, sans-serif",
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

function fontFileParam(params, key, fallback) {
  const requested = String(key in params ? params[key] : fallback).trim();
  if (!requested || requested.length > 120 || /[\\/\0]/.test(requested)) return "";
  if (![".woff2", ".woff", ".ttf", ".otf"].includes(path.extname(requested).toLowerCase())) return "";
  try {
    return fs.statSync(path.join(fontsPath, requested)).isFile() ? requested : "";
  } catch (error) {
    return "";
  }
}

function fontFileUrl(fileName) {
  return fileName ? `fonts/${encodeURIComponent(fileName)}` : "";
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

function embeddedAudioSource(source) {
  if (!source) return "";
  const parts = String(source).split("/").map((part) => decodeURIComponent(part));
  const filePath = path.resolve(root, ...parts);
  const rootPrefix = `${path.resolve(root)}${path.sep}`;
  if (!filePath.startsWith(rootPrefix) || !fs.statSync(filePath).isFile()) return "";
  const extension = path.extname(filePath).toLowerCase();
  const mimeType = extension === ".wav" ? "audio/wav" : extension === ".mp3" ? "audio/mpeg" : "";
  if (!mimeType) return "";
  return `data:${mimeType};base64,${fs.readFileSync(filePath).toString("base64")}`;
}

function generateOfflineAudioBundle(config) {
  const embeddedProfiles = config.soundProfiles.map((profile) => ({
    id: profile.id,
    sources: Object.fromEntries(Object.entries(profile.sources)
      .map(([kind, source]) => [kind, embeddedAudioSource(source)]))
  }));
  const offlineConfig = {
    ...config,
    primaryBrowser: false,
    soundInOtherBrowsers: false,
    soundProfiles: embeddedProfiles
  };
  const json = JSON.stringify({ config: offlineConfig })
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  const contents = `/* Generated automatically from params.txt and beeps. */\nwindow.FDV_OFFLINE_BUNDLE = ${json};\n`;
  const current = fs.existsSync(offlineAudioPath) ? fs.readFileSync(offlineAudioPath, "utf8") : "";
  if (current !== contents) fs.writeFileSync(offlineAudioPath, contents, "utf8");
}

function numberOrDefault(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function wallNow() {
  return Date.now();
}

function monoNow() {
  return performance.now();
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

const params = readParams();
const soundProfiles = loadSoundProfiles();
const initialSoundProfile = selectedSoundProfile(params, soundProfiles);
const initialTimerFontFile = fontFileParam(params, "timer_font_file", defaultConfig.timerFontFile);
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
  timerFontFile: initialTimerFontFile,
  timerFontUrl: fontFileUrl(initialTimerFontFile),
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

const timerDomain = createTimerDomain(config);
const { normalizeActiveSettings, normalizeDraftSettings } = timerDomain;
const timerTransitions = createTimerTransitions(timerDomain, {
  manualStartAudioLeadMs: MANUAL_START_AUDIO_LEAD_MS
});

try {
  generateOfflineAudioBundle({ ...config, buildNumber: BUILD_NUMBER });
} catch (error) {
  console.warn(`Offline audio bundle was not updated: ${error.message}`);
}

if (process.argv.includes("--generate-offline-audio")) {
  console.log(`Offline audio bundle: ${offlineAudioPath}`);
  process.exit(0);
}

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
  ".wav": "audio/wav",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf"
};

const timerState = {
  running: false,
  completed: false,
  countdownOnly: false,
  waitingForManualStart: false,
  manualStartLeadMs: 0,
  manualStartDisplayHold: false,
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
  primaryPinHash: "",
  primaryPinSalt: "",
  primaryPinClientId: "",
  primaryPinValue: "",
  version: 1
};

const clients = new Map();
const clientAudioOffsets = new Map();
const manualLegacyClients = new Set();
const oldBrowserClients = new Set();
const legacyRedirectPending = new Set();
const eventClients = new Map();
const diagnosticEventClients = new Map();
const commandResults = new Map();
const primaryPinFailures = new Map();
let lastAudioTestCommandAt = 0;
let nextClientOrder = 1;
let nextAudioTestId = 1;
let stateTransitionTimer = null;
let snapshotWriteTimer = null;
let timerStartedAtMono = 0;
let diagnosticsBroadcastTimer = null;
let lastDiagnosticsBroadcastAt = 0;

const runtimeCommandTypes = new Set(["start", "pause", "stopCountdown", "reset", "seek"]);

function actionRequiresPrimary(type) {
  return type !== "primary" && type !== "primaryPin";
}

function primaryControlAllowed(clientId) {
  if (!timerState.primaryClientId) return true;
  return Boolean(clientId && timerState.primaryClientId === clientId);
}

function primaryActionAllowed(clientId, nextPrimaryClientId) {
  if (!timerState.primaryClientId) return !nextPrimaryClientId || nextPrimaryClientId === clientId;
  if (timerState.primaryClientId === clientId) return true;
  return Boolean(nextPrimaryClientId && nextPrimaryClientId === clientId);
}

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

function hostAddressFromHeader(hostHeader = "") {
  const host = String(hostHeader).trim();
  if (!host) return "";
  if (host.startsWith("[")) {
    const bracketIndex = host.indexOf("]");
    return cleanAddress(bracketIndex >= 0 ? host.slice(0, bracketIndex + 1) : host);
  }
  return cleanAddress(host.replace(/:\d+$/, ""));
}

function setTimerStartedAt(startedAtWall) {
  const start = Number(startedAtWall);
  if (!Number.isFinite(start) || start <= 0) {
    timerState.startedAt = 0;
    timerStartedAtMono = 0;
    return;
  }
  timerState.startedAt = start;
  timerStartedAtMono = monoNow() + (start - wallNow());
}

function setTimerStartedFromElapsed(elapsed, effectiveWallNow = wallNow()) {
  const safeElapsed = Math.max(0, numberOrDefault(elapsed, 0));
  timerState.startedAt = effectiveWallNow - safeElapsed * 1000;
  timerStartedAtMono = monoNow() - safeElapsed * 1000;
}

function clearTimerStartedAt() {
  timerState.startedAt = 0;
  timerStartedAtMono = 0;
}

function elapsedSecondsAtWall(targetWallNow = wallNow()) {
  if (!timerState.running) return timerState.elapsedBeforePause;
  if (timerState.startedAt > targetWallNow) return 0;
  const currentElapsed = elapsedSeconds();
  const wallDeltaSeconds = (targetWallNow - wallNow()) / 1000;
  return Math.max(0, currentElapsed + wallDeltaSeconds);
}

function publicStartedAt(sentAtWall, elapsed) {
  if (!timerState.running || !timerState.startedAt) return timerState.startedAt;
  if (timerState.startedAt > sentAtWall) return timerState.startedAt;
  return Math.round(sentAtWall - Math.max(0, elapsed) * 1000);
}

function snapshotPayload() {
  const savedAtWall = wallNow();
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    savedAtWall,
    runningElapsedAtSave: timerState.running ? elapsedSeconds() : timerState.elapsedBeforePause,
    timerState: {
      ...timerState
    },
    audioOffsets: [...clientAudioOffsets.entries()],
    manualLegacyClients: [...manualLegacyClients]
  };
}

function writeSnapshotNow() {
  if (snapshotWriteTimer) {
    clearTimeout(snapshotWriteTimer);
    snapshotWriteTimer = null;
  }
  try {
    fs.mkdirSync(runtimeStateDir, { recursive: true });
    const tempPath = `${runtimeStatePath}.tmp`;
    const body = `${JSON.stringify(snapshotPayload(), null, 2)}\n`;
    const fd = fs.openSync(tempPath, "w");
    try {
      fs.writeFileSync(fd, body, "utf8");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tempPath, runtimeStatePath);
  } catch (error) {
    console.warn(`Timer state snapshot was not saved: ${error.message}`);
  }
}

function scheduleSnapshotWrite(immediate = false) {
  if (immediate) {
    writeSnapshotNow();
    return;
  }
  if (snapshotWriteTimer) return;
  snapshotWriteTimer = setTimeout(writeSnapshotNow, 200);
}

function assignTimerState(source = {}) {
  for (const key of [
    "running",
    "completed",
    "countdownOnly",
    "waitingForManualStart",
    "manualStartLeadMs",
    "manualStartDisplayHold",
    "elapsedBeforePause",
    "startedAt",
    "activePreset",
    "activeSettings",
    "draftSettings",
    "primaryClientId",
    "instancesSound",
    "instancesFullscreen",
    "globalSound",
    "festivalAnnouncements",
    "soundProfile",
    "language",
    "primaryPinHash",
    "primaryPinSalt",
    "primaryPinClientId",
    "primaryPinValue",
    "version"
  ]) {
    if (Object.prototype.hasOwnProperty.call(source, key)) timerState[key] = source[key];
  }
}

function restoreTimerSnapshot() {
  if (!fs.existsSync(runtimeStatePath)) return false;
  try {
    const snapshot = JSON.parse(fs.readFileSync(runtimeStatePath, "utf8"));
    if (!snapshot || snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION || !snapshot.timerState) return false;
    const savedAtWall = Number(snapshot.savedAtWall);
    const now = wallNow();
    const age = now - savedAtWall;
    if (!Number.isFinite(savedAtWall) || age < 0 || age > SNAPSHOT_MAX_AGE_MS) {
      console.warn("Timer state snapshot is too old; starting from defaults.");
      return false;
    }

    assignTimerState(snapshot.timerState);
    timerState.activeSettings = normalizeActiveSettings(timerState.activeSettings, {
      rotationSeconds: config.classicRotationMinutes * 60,
      breakSeconds: config.classicBreakSeconds,
      oneShot: false
    });
    timerState.draftSettings = normalizeDraftSettings(timerState.draftSettings, timerState.activePreset);
    clientAudioOffsets.clear();
    if (Array.isArray(snapshot.audioOffsets)) {
      snapshot.audioOffsets.forEach(([id, offset]) => {
        if (id) clientAudioOffsets.set(String(id), Math.round(numberOrDefault(offset, 0)));
      });
    }
    manualLegacyClients.clear();
    if (Array.isArray(snapshot.manualLegacyClients)) {
      snapshot.manualLegacyClients.forEach((id) => {
        if (id) manualLegacyClients.add(String(id));
      });
    }

    if (timerState.running) {
      const savedStart = Number(snapshot.timerState.startedAt || 0);
      const savedElapsed = Math.max(0, numberOrDefault(snapshot.runningElapsedAtSave, 0));
      if (savedStart > savedAtWall && now < savedStart) {
        setTimerStartedAt(savedStart);
      } else if (savedStart > savedAtWall && now >= savedStart) {
        setTimerStartedFromElapsed((now - savedStart) / 1000, now);
      } else {
        setTimerStartedFromElapsed(savedElapsed + Math.max(0, age) / 1000, now);
      }
    } else {
      timerStartedAtMono = 0;
    }

    timerState.version = Math.max(1, numberOrDefault(timerState.version, 1)) + 1;
    console.log("Timer state restored from runtime-state/timer-state.json");
    return true;
  } catch (error) {
    console.warn(`Timer state snapshot was not restored: ${error.message}`);
    return false;
  }
}

function armPrimaryRestoreGrace() {
  const restoredPrimaryClientId = timerState.primaryClientId;
  if (!restoredPrimaryClientId) return;
  setTimeout(() => {
    if (timerState.primaryClientId !== restoredPrimaryClientId) return;
    if (clients.has(restoredPrimaryClientId)) return;
    timerState.primaryClientId = null;
    timerState.version += 1;
    scheduleSnapshotWrite(true);
    broadcastState();
    broadcastDiagnostics(true);
  }, PRIMARY_RESTORE_GRACE_MS);
}

function effectiveActionWallNow(body, fallbackNow = wallNow()) {
  const intended = Number(body.intendedServerTime);
  if (!Number.isFinite(intended)) return fallbackNow;
  return clampNumber(intended, fallbackNow - 5000, fallbackNow + 1000, fallbackNow);
}

function rememberCommandResult(commandId, status, payload) {
  if (!commandId) return;
  commandResults.set(commandId, { status, payload });
  while (commandResults.size > COMMAND_CACHE_MAX) {
    const firstKey = commandResults.keys().next().value;
    commandResults.delete(firstKey);
  }
}

function cleanCommandId(value) {
  const id = String(value || "").trim();
  return id ? id.slice(0, 160) : "";
}

function cleanPrimaryPin(value) {
  const pin = String(value || "").trim();
  return /^\d{4}$/.test(pin) ? pin : "";
}

function primaryPinActive() {
  return Boolean(timerState.primaryClientId
    && timerState.primaryPinHash
    && timerState.primaryPinSalt
    && timerState.primaryPinClientId === timerState.primaryClientId);
}

function primaryPinHash(pin, salt) {
  return crypto.createHash("sha256").update(`${salt}:${pin}`).digest("hex");
}

function setPrimaryPin(clientId, pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  timerState.primaryPinSalt = salt;
  timerState.primaryPinHash = primaryPinHash(pin, salt);
  timerState.primaryPinClientId = clientId || "";
  timerState.primaryPinValue = pin;
}

function clearPrimaryPin() {
  timerState.primaryPinHash = "";
  timerState.primaryPinSalt = "";
  timerState.primaryPinClientId = "";
  timerState.primaryPinValue = "";
}

function primaryPinFailure(clientId) {
  const id = clientId || "";
  const now = wallNow();
  const entry = primaryPinFailures.get(id) || { count: 0, blockedUntil: 0, blockLevel: 0 };
  if (entry.blockedUntil > now) return entry;
  const blockLevel = Math.max(0, Number(entry.blockLevel) || 0);
  const count = (Number(entry.count) || 0) + 1;
  if (count < PRIMARY_PIN_MAX_FAILURES) {
    const next = { count, blockedUntil: 0, blockLevel };
    primaryPinFailures.set(id, next);
    return next;
  }
  const blockMs = PRIMARY_PIN_BLOCK_STEPS_MS[Math.min(blockLevel, PRIMARY_PIN_BLOCK_STEPS_MS.length - 1)];
  const next = {
    count: 0,
    blockedUntil: now + blockMs,
    blockLevel: blockLevel + 1
  };
  primaryPinFailures.set(id, next);
  return next;
}

function primaryPinAllowed(clientId) {
  const entry = primaryPinFailures.get(clientId || "");
  return !entry || !entry.blockedUntil || entry.blockedUntil <= wallNow();
}

function verifyPrimaryPin(clientId, pin) {
  if (!primaryPinActive()) return true;
  if (!primaryPinAllowed(clientId)) return false;
  const cleanPin = cleanPrimaryPin(pin);
  const ok = Boolean(cleanPin && primaryPinHash(cleanPin, timerState.primaryPinSalt) === timerState.primaryPinHash);
  if (ok) {
    primaryPinFailures.delete(clientId || "");
    return true;
  }
  primaryPinFailure(clientId);
  return false;
}

function consumeAudioTestRateLimit(now = wallNow()) {
  const retryAfterMs = AUDIO_TEST_RATE_LIMIT_MS - (now - lastAudioTestCommandAt);
  if (retryAfterMs > 0) {
    return { allowed: false, retryAfterMs: Math.ceil(retryAfterMs) };
  }
  lastAudioTestCommandAt = now;
  return { allowed: true, retryAfterMs: 0 };
}

function timerDisplayStatusLabel(language = timerState.language) {
  const text = (ru, en) => language === "en" ? en : ru;
  const now = wallNow();
  const startedAt = Number(timerState.startedAt || 0);
  const running = Boolean(timerState.running);

  if (timerState.countdownOnly) {
    return startedAt > now ? text("Ожидание старта", "Waiting for start") : text("Готов к старту", "Ready to start");
  }
  if (running && startedAt > now) return text("Ожидание старта", "Waiting for start");
  if (timerState.waitingForManualStart) return text("Готов к старту", "Ready to start");

  const activeSettings = timerState.activeSettings || {};
  const oneShotDuration = Math.max(0,
    numberOrDefault(activeSettings.rotationSeconds, 0)
    + numberOrDefault(activeSettings.breakSeconds, 0));
  const elapsed = elapsedSeconds();
  if (timerState.completed || (activeSettings.oneShot && elapsed >= oneShotDuration)) {
    return text("Завершено", "Completed");
  }
  if (!running && !timerState.completed && timerState.elapsedBeforePause === 0) return text("Готов", "Ready");
  return running ? text("Раунд идет", "Round running") : text("Пауза", "Paused");
}

function registerClient(req, source = {}) {
  const id = sourceValue(source, "clientId") || req.headers["x-client-id"];
  if (!id) return null;
  const now = wallNow();
  const userAgent = req.headers["user-agent"] || "";
  const existing = clients.get(id) || {};
  const latency = optionalNumber(sourceValue(source, "latency"), existing.latency ?? null);
  const syncError = optionalNumber(sourceValue(source, "syncError"), existing.syncError ?? null);
  const usesFallbackSync = syncError === null && Number.isFinite(latency);
  const connectionAddress = hostAddressFromHeader(req.headers.host || "");
  const reportedLegacy = sourceValue(source, "legacy");
  const legacyViewer = optionalBool(reportedLegacy, existing.legacyViewer === true);
  if (reportedLegacy !== null && reportedLegacy !== undefined && reportedLegacy !== "" && legacyViewer === false && manualLegacyClients.delete(id)) {
    scheduleSnapshotWrite();
  }
  clients.set(id, {
    id,
    firstSeen: existing.firstSeen || now,
    order: existing.order || nextClientOrder++,
    label: compactUserAgent(userAgent),
    browser: browserName(userAgent),
    legacyViewer,
    oldBrowser: optionalBool(sourceValue(source, "oldBrowser"), existing.oldBrowser === true),
    userAgent,
    address: req.socket.remoteAddress || "",
    displayAddress: displayAddressForClient(req.socket.remoteAddress || ""),
    connectionAddress: connectionAddress || existing.connectionAddress || "",
    computerKey: computerKeyForAddress(req.socket.remoteAddress || ""),
    protocol: req.socket.encrypted ? "HTTPS" : "HTTP",
    lastSeen: now,
    latency,
    offset: optionalNumber(sourceValue(source, "offset"), existing.offset ?? null),
    syncError: syncError ?? (usesFallbackSync ? latency / 2 : null),
    syncJitter: optionalNumber(sourceValue(source, "syncJitter"), usesFallbackSync ? 0 : existing.syncJitter ?? null),
    syncSamples: optionalNumber(sourceValue(source, "syncSamples"), usesFallbackSync ? 1 : existing.syncSamples ?? null),
    syncRate: optionalNumber(sourceValue(source, "syncRate"), existing.syncRate ?? null),
    syncRateConfidence: sourceValue(source, "syncRateConfidence") || existing.syncRateConfidence || "",
    syncRateGateReason: sourceValue(source, "syncRateGateReason") || existing.syncRateGateReason || "",
    syncRateCandidatePpm: optionalNumber(sourceValue(source, "syncRateCandidatePpm"), existing.syncRateCandidatePpm ?? null),
    syncRateAcceptedPpm: optionalNumber(sourceValue(source, "syncRateAcceptedPpm"), existing.syncRateAcceptedPpm ?? null),
    syncRateResidualJitter: optionalNumber(sourceValue(source, "syncRateResidualJitter"), existing.syncRateResidualJitter ?? null),
    syncRateResidualMinMax: optionalNumber(sourceValue(source, "syncRateResidualMinMax"), existing.syncRateResidualMinMax ?? null),
    syncRateHalfDiffPpm: optionalNumber(sourceValue(source, "syncRateHalfDiffPpm"), existing.syncRateHalfDiffPpm ?? null),
    syncRateOutlierShare: optionalNumber(sourceValue(source, "syncRateOutlierShare"), existing.syncRateOutlierShare ?? null),
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
    lastSseAge: optionalNumber(sourceValue(source, "lastSseAge"), existing.lastSseAge ?? null),
    sseRestarts: optionalNumber(sourceValue(source, "sseRestarts"), existing.sseRestarts ?? null),
    stateVersion: legacyViewer ? timerState.version : optionalNumber(sourceValue(source, "stateVersion"), existing.stateVersion ?? null),
    displayStatus: legacyViewer ? timerDisplayStatusLabel(timerState.language) : sourceValue(source, "displayStatus") || existing.displayStatus || ""
  });
  if (optionalBool(sourceValue(source, "oldBrowser"), false)) {
    oldBrowserClients.add(id);
  }
  return id;
}

function publicClients() {
  const now = wallNow();
  for (const [id, client] of clients) {
    if (now - client.lastSeen > 30000) {
      clients.delete(id);
      manualLegacyClients.delete(id);
      oldBrowserClients.delete(id);
    }
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
      manualLegacy: manualLegacyClients.has(client.id),
      role: client.legacyViewer ? "Упрощённый экран" : timerState.primaryClientId ? (timerState.primaryClientId === client.id ? "Основной" : "Экран") : "",
      age: now - client.lastSeen,
      connected: now - client.lastSeen < 6000
    }));
}

function elapsedSeconds(now = monoNow()) {
  if (!timerState.running) return timerState.elapsedBeforePause;
  if (timerStartedAtMono) return Math.max(0, (now - timerStartedAtMono) / 1000);
  return Math.max(0, (wallNow() - timerState.startedAt) / 1000);
}

function finalizeOneShot(now = wallNow()) {
  if (!timerState.running || timerState.countdownOnly || !timerState.activeSettings.oneShot) return;
  const duration = Math.max(0,
    numberOrDefault(timerState.activeSettings.rotationSeconds, 0)
    + numberOrDefault(timerState.activeSettings.breakSeconds, 0));
  if (now < timerState.startedAt || elapsedSeconds() < duration) return;
  timerState.running = false;
  timerState.completed = true;
  timerState.elapsedBeforePause = duration;
  timerState.manualStartLeadMs = 0;
  timerState.manualStartDisplayHold = false;
  clearTimerStartedAt();
  timerState.version += 1;
  scheduleSnapshotWrite(true);
}

function finalizeScheduledCountdown(now = wallNow()) {
  if (!timerState.running || !timerState.countdownOnly || now < timerState.startedAt) return;
  timerState.running = false;
  timerState.countdownOnly = false;
  timerState.waitingForManualStart = true;
  timerState.elapsedBeforePause = 0;
  timerState.manualStartLeadMs = 0;
  timerState.manualStartDisplayHold = false;
  clearTimerStartedAt();
  timerState.draftSettings.startHours = "";
  timerState.draftSettings.startMinutes = "";
  timerState.version += 1;
  scheduleSnapshotWrite(true);
}

function armStateTransition(targetTime) {
  if (stateTransitionTimer) clearTimeout(stateTransitionTimer);
  stateTransitionTimer = null;
  if (!targetTime) return;
  stateTransitionTimer = setTimeout(() => {
    stateTransitionTimer = null;
    publicState();
    broadcastState();
  }, Math.max(0, targetTime - wallNow() + 5));
}

function armCurrentStateTransition() {
  if (!timerState.running) {
    armStateTransition(0);
    return;
  }
  if (timerState.countdownOnly) {
    armStateTransition(timerState.startedAt);
    return;
  }
  if (timerState.activeSettings.oneShot) {
    const duration = Math.max(0,
      numberOrDefault(timerState.activeSettings.rotationSeconds, 0)
      + numberOrDefault(timerState.activeSettings.breakSeconds, 0));
    const remainingMs = Math.max(0, (duration - elapsedSeconds()) * 1000);
    armStateTransition(wallNow() + remainingMs);
  }
}

function shouldIncludeDiagnostics(clientId, requestedDiagnostics = false) {
  if (requestedDiagnostics) return true;
  if (!timerState.primaryClientId) return true;
  return Boolean(clientId && timerState.primaryClientId === clientId);
}

function publicState(options = {}) {
  finalizeScheduledCountdown();
  finalizeOneShot();
  const sentAt = wallNow();
  const receivedAt = Number(options.receivedAt);
  const clientId = options.clientId || "";
  const includeClients = options.includeClients !== false;
  const elapsed = elapsedSeconds();
  const ownAudioOffset = clientId ? clientAudioOffsets.get(clientId) ?? clients.get(clientId)?.audioUserOffset ?? 0 : 0;
  const ownManualLegacy = clientId ? manualLegacyClients.has(clientId) : false;
  const ownLegacyRedirect = clientId ? legacyRedirectPending.has(clientId) : false;
  const {
    primaryPinHash: _primaryPinHash,
    primaryPinSalt: _primaryPinSalt,
    primaryPinClientId: _primaryPinClientId,
    primaryPinValue: _primaryPinValue,
    ...publicTimerState
  } = timerState;
  return {
    ...publicTimerState,
    serverInstanceId,
    startedAt: publicStartedAt(sentAt, elapsed),
    config: {
      ...config,
      buildNumber: BUILD_NUMBER,
      httpPort: port,
      httpsPort
    },
    primaryPinSet: primaryPinActive(),
    ownPrimaryPinSaved: Boolean(clientId
      && timerState.primaryPinHash
      && timerState.primaryPinClientId === clientId),
    ownPrimaryPinValue: clientId
      && timerState.primaryPinHash
      && timerState.primaryPinClientId === clientId
      ? timerState.primaryPinValue || ""
      : "",
    clients: includeClients ? publicClients() : [],
    diagnosticsIncluded: includeClients,
    manualLegacy: ownManualLegacy,
    legacyRedirect: ownLegacyRedirect,
    audioUserOffset: ownAudioOffset,
    elapsed,
    serverReceivedAt: Number.isFinite(receivedAt) ? receivedAt : null,
    serverSentAt: sentAt,
    now: sentAt
  };
}

function broadcastState() {
  const state = publicState({ includeClients: false });
  const payload = `event: state\ndata: ${JSON.stringify(state)}\n\n`;
  for (const [res, eventClient] of eventClients) {
    try {
      res.write(payload);
    } catch (error) {
      clearInterval(eventClient.keepAlive);
      eventClients.delete(res);
    }
  }
}

function diagnosticsPayload() {
  return {
    serverInstanceId,
    primaryClientId: timerState.primaryClientId,
    clients: publicClients(),
    version: timerState.version,
    now: wallNow()
  };
}

function broadcastDiagnostics(force = false) {
  if (!diagnosticEventClients.size) return;
  const now = wallNow();
  if (!force && now - lastDiagnosticsBroadcastAt < DIAGNOSTICS_BROADCAST_MS) {
    if (!diagnosticsBroadcastTimer) {
      diagnosticsBroadcastTimer = setTimeout(() => {
        diagnosticsBroadcastTimer = null;
        broadcastDiagnostics(true);
      }, DIAGNOSTICS_BROADCAST_MS - (now - lastDiagnosticsBroadcastAt));
    }
    return;
  }
  lastDiagnosticsBroadcastAt = now;
  const payload = `event: diagnostics\ndata: ${JSON.stringify(diagnosticsPayload())}\n\n`;
  for (const [res, eventClient] of diagnosticEventClients) {
    if (!shouldIncludeDiagnostics(eventClient.clientId)) continue;
    try {
      res.write(payload);
    } catch (error) {
      clearInterval(eventClient.keepAlive);
      diagnosticEventClients.delete(res);
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

function browserMajor(userAgent, pattern) {
  const match = String(userAgent || "").match(pattern);
  if (!match) return 0;
  const major = Number(match[1]);
  return Number.isFinite(major) ? major : 0;
}

function shouldServeLegacyViewer(req, requestUrl) {
  const pathname = requestUrl.pathname;
  if (pathname !== "/" && pathname !== "/index.html") return false;
  if (requestUrl.searchParams.get("modern") === "1") return false;
  if (requestUrl.searchParams.get("legacy") === "1") return true;

  const userAgent = String(req.headers["user-agent"] || "");
  const chromeMajor = browserMajor(userAgent, /(?:Chrome|CriOS)\/(\d+)/);
  const firefoxMajor = browserMajor(userAgent, /Firefox\/(\d+)/);
  const edgeLegacyMajor = browserMajor(userAgent, /Edge\/(\d+)/);
  const safariMajor = browserMajor(userAgent, /Version\/(\d+)/);
  const isChrome = chromeMajor > 0 || /Chrome\//i.test(userAgent) || /CriOS\//i.test(userAgent);
  const isAndroidBrowser = /Android/i.test(userAgent) && /Version\/\d/i.test(userAgent) && !isChrome;
  const isOldAndroid = /Android [1-4]\./i.test(userAgent);
  const isSafari = !isChrome && safariMajor > 0 && /Safari\//i.test(userAgent);

  if (chromeMajor && chromeMajor < 80) return true;
  if (firefoxMajor && firefoxMajor < 74) return true;
  if (edgeLegacyMajor) return true;
  if (isSafari && safariMajor < 13) return true;
  if (isAndroidBrowser || isOldAndroid) return true;
  if (/MSIE |Trident\//i.test(userAgent)) return true;
  return false;
}

function handleRequest(req, res) {
  const requestUrl = new URL(req.url, `http://localhost:${port}`);

  if (requestUrl.pathname === "/api/state" && req.method === "GET") {
    const receivedAt = wallNow();
    const clientId = registerClient(req, requestUrl.searchParams);
    const includeClients = shouldIncludeDiagnostics(clientId, requestUrl.searchParams.get("diagnostics") === "1");
    sendJson(res, 200, publicState({ receivedAt, clientId, includeClients }));
    if (clientId) legacyRedirectPending.delete(clientId);
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
    res.write(`event: state\ndata: ${JSON.stringify(publicState({ clientId: eventClientId, includeClients: false }))}\n\n`);
    const keepAlive = setInterval(() => {
      try {
        if (eventClientId && clients.has(eventClientId)) {
          clients.get(eventClientId).lastSeen = wallNow();
        }
        res.write(`event: ping\ndata: ${wallNow()}\n\n`);
      } catch (error) {}
    }, 15000);
    eventClients.set(res, { keepAlive, clientId: eventClientId });
    req.on("close", () => {
      clearInterval(keepAlive);
      eventClients.delete(res);
    });
    return;
  }

  if (requestUrl.pathname === "/api/diagnostics/events" && req.method === "GET") {
    const eventClientId = registerClient(req, requestUrl.searchParams);
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "connection": "keep-alive",
      "x-accel-buffering": "no"
    });
    res.write("retry: 2000\n\n");
    if (shouldIncludeDiagnostics(eventClientId)) {
      res.write(`event: diagnostics\ndata: ${JSON.stringify(diagnosticsPayload())}\n\n`);
    }
    const keepAlive = setInterval(() => {
      try {
        if (eventClientId && clients.has(eventClientId)) {
          clients.get(eventClientId).lastSeen = wallNow();
        }
        res.write(`event: ping\ndata: ${wallNow()}\n\n`);
      } catch (error) {}
    }, 15000);
    diagnosticEventClients.set(res, { keepAlive, clientId: eventClientId });
    req.on("close", () => {
      clearInterval(keepAlive);
      diagnosticEventClients.delete(res);
    });
    return;
  }

  if (requestUrl.pathname === "/api/action" && req.method === "POST") {
    readJson(req).then((body) => {
      const clientId = registerClient(req, body);
      const now = wallNow();
      const type = body.type;
      const isRuntimeCommand = runtimeCommandTypes.has(type);
      const commandId = cleanCommandId(body.commandId);
      if (actionRequiresPrimary(type) && !primaryControlAllowed(clientId)) {
        sendJson(res, 403, {
          ...publicState({ receivedAt: now, clientId, includeClients: shouldIncludeDiagnostics(clientId) }),
          actionDenied: true
        });
        return;
      }
      const cachedCommand = commandId ? commandResults.get(commandId) : null;
      if (cachedCommand) {
        sendJson(res, cachedCommand.status, {
          ...cachedCommand.payload,
          commandDuplicate: true
        });
        return;
      }
      const baseVersion = Number(body.baseVersion);
      const baseServerInstanceId = String(body.baseServerInstanceId || "");
      const instanceConflict = Boolean(baseServerInstanceId && baseServerInstanceId !== serverInstanceId);
      if (isRuntimeCommand && (instanceConflict || (Number.isFinite(baseVersion) && baseVersion !== timerState.version))) {
        const conflictState = {
          ...publicState({ receivedAt: now, clientId, includeClients: shouldIncludeDiagnostics(clientId) }),
          commandConflict: true,
          instanceConflict,
          expectedVersion: timerState.version,
          expectedServerInstanceId: serverInstanceId
        };
        rememberCommandResult(commandId, 409, conflictState);
        sendJson(res, 409, conflictState);
        return;
      }
      const actionNow = effectiveActionWallNow(body, now);
      const previousVersion = timerState.version;
      let audioTestCommand = null;
      let audioWakeCommand = null;
      let legacyModeCommand = null;

      const timerAction = timerTransitions.applyTimerAction(timerState, body, {
        now,
        actionNow,
        elapsedAtAction: elapsedSecondsAtWall(actionNow)
      });
      if (timerAction.changed) {
        assignTimerState(timerAction.state);
        if (timerAction.effects.clock === "set") setTimerStartedAt(timerAction.state.startedAt);
        if (timerAction.effects.clock === "clear") clearTimerStartedAt();
        if (timerAction.effects.transitionAt !== null) {
          armStateTransition(timerAction.effects.transitionAt);
        }
        audioWakeCommand = timerAction.effects.audioWakeCommand;
      }

      if (type === "primary") {
        const nextPrimaryClientId = Object.prototype.hasOwnProperty.call(body, "primaryClientId")
          ? body.primaryClientId || null
          : body.clientId || null;
        if (!primaryActionAllowed(clientId, nextPrimaryClientId)) {
          sendJson(res, 403, {
            ...publicState({ receivedAt: now, clientId, includeClients: shouldIncludeDiagnostics(clientId) }),
            actionDenied: true
          });
          return;
        }
        const shortcutTakeover = body.source === "shortcut"
          && nextPrimaryClientId
          && timerState.primaryClientId
          && timerState.primaryClientId !== nextPrimaryClientId;
        let verifiedTakeoverPin = "";
        if (shortcutTakeover && primaryPinActive()) {
          const cleanPin = cleanPrimaryPin(body.pin);
          if (!verifyPrimaryPin(clientId, cleanPin)) {
            const entry = primaryPinFailures.get(clientId || "") || {};
            sendJson(res, 403, {
              ...publicState({ receivedAt: now, clientId, includeClients: shouldIncludeDiagnostics(clientId) }),
              primaryPinRequired: true,
              primaryPinBlockedUntil: entry.blockedUntil || 0
            });
            return;
          }
          verifiedTakeoverPin = cleanPin;
        }
        timerState.primaryClientId = nextPrimaryClientId;
        if (verifiedTakeoverPin) setPrimaryPin(nextPrimaryClientId, verifiedTakeoverPin);
        timerState.version += 1;
      }

      if (type === "primaryPin") {
        const currentPrimary = timerState.primaryClientId === clientId;
        if (!currentPrimary) {
          sendJson(res, 403, {
            ...publicState({ receivedAt: now, clientId, includeClients: shouldIncludeDiagnostics(clientId) }),
            primaryPinDenied: true
          });
          return;
        }
        const pin = String(body.pin || "").trim();
        if (!pin) {
          clearPrimaryPin();
          timerState.version += 1;
        } else {
          const cleanPin = cleanPrimaryPin(pin);
          if (!cleanPin) {
            sendJson(res, 400, {
              ...publicState({ receivedAt: now, clientId, includeClients: shouldIncludeDiagnostics(clientId) }),
              primaryPinInvalidFormat: true
            });
            return;
          }
          setPrimaryPin(clientId, cleanPin);
          timerState.version += 1;
        }
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

      if (type === "legacyMode") {
        const targetClientId = String(body.targetClientId || "");
        const enabled = Boolean(body.enabled);
        if (targetClientId && targetClientId !== timerState.primaryClientId) {
          if (enabled) {
            manualLegacyClients.add(targetClientId);
          } else {
            manualLegacyClients.delete(targetClientId);
          }
          if (enabled || !oldBrowserClients.has(targetClientId)) {
            legacyModeCommand = {
              targetClientId,
              enabled,
              manual: true,
              serverTime: now
            };
            if (!enabled) {
              legacyRedirectPending.add(targetClientId);
            }
          }
          timerState.version += 1;
        }
      }

      if (type === "audioTest") {
        const rateLimit = consumeAudioTestRateLimit(now);
        if (!rateLimit.allowed) {
          sendJson(res, 429, {
            ...publicState({ receivedAt: now, clientId, includeClients: shouldIncludeDiagnostics(clientId) }),
            audioTestRateLimited: true,
            audioTestRetryAfterMs: rateLimit.retryAfterMs
          });
          return;
        }
        const kind = ["start", "end", "minute", "warn"].includes(body.kind) ? body.kind : "start";
        const targetClientId = String(body.targetClientId || "");
        const everywhere = Boolean(body.everywhere && timerState.primaryClientId);
        const timerActivelyRunning = timerState.running && timerState.startedAt <= now;
        if (!timerActivelyRunning && (everywhere || targetClientId)) {
          audioTestCommand = {
            id: `${now}-${nextAudioTestId++}`,
            kind,
            everywhere,
            targetClientId: everywhere ? "" : targetClientId,
            serverTime: now + 1800
          };
        }
      }

      if (timerState.version !== previousVersion) {
        scheduleSnapshotWrite(isRuntimeCommand);
      }
      const state = publicState({
        receivedAt: now,
        clientId,
        includeClients: shouldIncludeDiagnostics(clientId)
      });
      rememberCommandResult(commandId, 200, state);
      sendJson(res, 200, state);
      broadcastState();
      broadcastDiagnostics();
      if (audioTestCommand) {
        sendEvent(
          "audio-test",
          audioTestCommand,
          (eventClient) => audioTestCommand.everywhere
            || eventClient.clientId === audioTestCommand.targetClientId
        );
      }
      if (audioWakeCommand) {
        sendEvent("audio-wake", audioWakeCommand);
      }
      if (legacyModeCommand) {
        sendEvent(
          "legacy-mode",
          legacyModeCommand,
          (eventClient) => eventClient.clientId === legacyModeCommand.targetClientId
        );
      }
    }).catch(() => sendJson(res, 400, { error: "Invalid JSON" }));
    return;
  }

  let relativePath = requestUrl.pathname === "/" ? "index.html" : decodeURIComponent(requestUrl.pathname.slice(1));
  if (shouldServeLegacyViewer(req, requestUrl)) {
    relativePath = "legacy.html";
  }
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
      "content-type": types[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(body);
  });
}

const restoredFromSnapshot = restoreTimerSnapshot();
if (restoredFromSnapshot) {
  finalizeScheduledCountdown();
  finalizeOneShot();
  armCurrentStateTransition();
  armPrimaryRestoreGrace();
  scheduleSnapshotWrite(true);
}
setInterval(() => broadcastDiagnostics(true), DIAGNOSTICS_BROADCAST_MS);

function flushSnapshotAndExit(exitCode = 0) {
  try {
    writeSnapshotNow();
  } finally {
    process.exit(exitCode);
  }
}

process.on("SIGINT", () => flushSnapshotAndExit(0));
process.on("SIGTERM", () => flushSnapshotAndExit(0));

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
