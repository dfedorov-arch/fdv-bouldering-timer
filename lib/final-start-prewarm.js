(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FDVFinalStartPrewarm = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";
  var INTERVAL = 10000;
  function create() {
    var active = false, stopped = false, epoch = "", target = null, nextAt = 0, token = 0;
    function reset() { active = false; stopped = false; target = null; nextAt = 0; token += 1; }
    return {
      tick: function (phase, now, allowed) {
        if (!phase || !phase.eligible) { if (active) reset(); return null; }
        if (!isFinite(now)) return null;
        var nextEpoch = String(phase.epoch || "");
        if (!active || epoch !== nextEpoch) { reset(); active = true; epoch = nextEpoch; nextAt = now; }
        if (phase.countdown) {
          var nextTarget = Number(phase.startedAt);
          if (!(nextTarget > 0) || !isFinite(nextTarget)) return null;
          if (target === null || Math.abs(target - nextTarget) > 10) {
            target = nextTarget; nextAt = target - INTERVAL; stopped = false; token += 1;
          }
        }
        if (stopped || !allowed || now < nextAt) return null;
        // A delayed callback produces one pulse, never a catch-up burst.
        nextAt = now + INTERVAL;
        token += 1; // Only the newest pulse may finish an asynchronous resume.
        return { at: now, token: token };
      },
      stop: function () { stopped = true; token += 1; },
      isCurrent: function (value) { return active && !stopped && token === value; }
    };
  }
  return { create: create, intervalMs: INTERVAL, leadMs: INTERVAL };
});
