(function initClientActionTransport(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FDVClientActionTransport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function buildClientActionTransport() {
  "use strict";

  function createActionTransport(dependencies) {
    const deps = dependencies || {};
    const requiredFunctions = [
      "applyRemote",
      "clientDiagnostics",
      "fetch",
      "getBaseVersion",
      "isAvailable",
      "isRuntimeCommand",
      "isStandalone",
      "markFailure",
      "nextCommandId",
      "serverNow",
      "updateTiming"
    ];
    requiredFunctions.forEach((name) => {
      if (typeof deps[name] !== "function") throw new TypeError(`Missing action transport dependency: ${name}`);
    });

    const now = typeof deps.now === "function" ? deps.now : Date.now;
    const perfNow = typeof deps.perfNow === "function" ? deps.perfNow : () => performance.now();
    const setTimer = typeof deps.setTimeout === "function" ? deps.setTimeout : setTimeout;
    const clearTimer = typeof deps.clearTimeout === "function" ? deps.clearTimeout : clearTimeout;
    const delay = typeof deps.delay === "function"
      ? deps.delay
      : (milliseconds) => new Promise((resolve) => setTimer(resolve, milliseconds));
    const requestTimeoutMs = Math.max(1, Number(deps.requestTimeoutMs) || 2000);

    async function send(type, payload = {}, options = {}) {
      if (!deps.isAvailable() || deps.isStandalone()) return false;
      const isRuntimeCommand = deps.isRuntimeCommand(type);
      const commandId = isRuntimeCommand ? deps.nextCommandId() : "";
      const baseVersion = isRuntimeCommand ? deps.getBaseVersion() : undefined;
      const intendedServerTime = isRuntimeCommand ? deps.serverNow() : undefined;
      const attempts = isRuntimeCommand ? 3 : 1;

      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimer(() => controller.abort(), requestTimeoutMs);
        try {
          const timing = { date0: now(), perf0: perfNow() };
          const response = await deps.fetch("/api/action", {
            method: "POST",
            headers: { "content-type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              type,
              commandId,
              baseVersion,
              intendedServerTime,
              ...deps.clientDiagnostics(),
              ...payload
            })
          });
          timing.date1 = now();
          timing.perf1 = perfNow();
          const remote = await response.json().catch(() => null);
          if (response.status === 409 && remote) {
            deps.applyRemote(remote, { ...options, timing, includePhaseSignal: false });
            if (isRuntimeCommand && !options.conflictRetried && deps.isAvailable() && !deps.isStandalone()) {
              return send(type, payload, { ...options, conflictRetried: true });
            }
            return "conflict";
          }
          if ((response.status === 400 || response.status === 403 || response.status === 429) && remote) {
            deps.applyRemote(remote, { ...options, timing, includePhaseSignal: false });
            if (remote.primaryPinBlockedUntil) return "pin-blocked";
            if (remote.primaryPinRequired) return "pin-required";
            if (remote.primaryPinInvalidFormat) return "pin-invalid";
            if (remote.primaryPinDenied) return "pin-denied";
            return false;
          }
          if (!response.ok || !remote) throw new Error("Server action failed");
          if (options.applyResponse !== false) deps.applyRemote(remote, { ...options, timing });
          else deps.updateTiming(remote, timing);
          return true;
        } catch (error) {
          if (attempt >= attempts - 1) {
            deps.markFailure(true);
            return false;
          }
          await delay(160 * (attempt + 1));
        } finally {
          clearTimer(timeout);
        }
      }
      return false;
    }

    return Object.freeze({ send });
  }

  return Object.freeze({ createActionTransport });
});
