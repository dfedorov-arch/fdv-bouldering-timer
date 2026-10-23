"use strict";

// Loaded only in generated Windows 7/8 packages, never in the normal server.
var crypto = require("crypto");
if (!crypto.randomUUID) {
  crypto.randomUUID = function () {
    var bytes = crypto.randomBytes(16);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    var hex = bytes.toString("hex");
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16)
      + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
  };
}
if (!Array.prototype.at) {
  Object.defineProperty(Array.prototype, "at", {
    configurable: true, writable: true,
    value: function (index) {
      if (this == null) throw new TypeError("Array.at called on null/undefined");
      var length = Math.min(Math.max(Math.trunc(Number(this.length)) || 0, 0), Number.MAX_SAFE_INTEGER);
      var position = Math.trunc(Number(index)) || 0;
      if (position < 0) position += length;
      return position >= 0 && position < length ? this[position] : undefined;
    }
  });
}
console.warn("WINDOWS LEGACY: Node.js 12 is end-of-life. Use a trusted isolated LAN; do not expose this server to the Internet.");
