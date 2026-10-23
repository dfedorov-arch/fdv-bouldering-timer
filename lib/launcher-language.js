"use strict";

const crypto = require("node:crypto");

// A per-child-process capability, not browser identity or a PIN bypass.
// Never accept Origin-bearing browser requests, even from loopback.
function launcherLanguageAllowed(request, token) {
  const headers = request.headers || {};
  const address = request.socket && request.socket.remoteAddress;
  const supplied = headers["x-fdv-launcher-token"];
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address)
    && !headers.origin && !headers.referer && !headers["sec-fetch-site"]
    && typeof token === "string" && /^[a-f0-9]{64}$/.test(token)
    && typeof supplied === "string" && /^[a-f0-9]{64}$/.test(supplied)
    && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(supplied));
}

function validLauncherLanguage(body) {
  return body && !Array.isArray(body) && Object.keys(body).length === 1
    && (body.language === "ru" || body.language === "en");
}

module.exports = { launcherLanguageAllowed, validLauncherLanguage };
