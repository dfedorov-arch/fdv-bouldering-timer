"use strict";
const fs = require("node:fs");
const path = require("node:path");

function guestScreenAssets(timerDir) {
  const main = fs.readFileSync(path.join(timerDir, "index.html"), "utf8");
  const css = main.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  if (!css) throw new Error("The FDV screen stylesheet is missing");
  const names = ["fitTimerText", "timeParts", "getCurrentSegment", "displayedCycleNumber", "protectTimerDisplayFrame"];
  const functions = names.map(name => {
    const source = main.match(new RegExp("^    function " + name + "\\([^\\n]*\\) \\{[\\s\\S]*?^    \\}", "m"));
    if (!source) throw new Error("The FDV screen function is missing: " + name);
    return source[0];
  }).join("\n");
  const displayConstants = main.match(/^    const displayRollback(?:Threshold|Hold)Ms = \d+;/gm);
  if (displayConstants?.length !== 2) throw new Error("The FDV screen clock constants are missing");
  const js = `(function () {
    "use strict";
    const els = { time: document.getElementById("time") };
    const state = { timeline: [true], showServerTime: false };
    let timerFitQueued, lastTimerFitContainerWidth, lastTimerFitContainerHeight;
    let timerDisplayCheckpoint = null;
    ${displayConstants.join("\n")}
    const performanceCount = () => {};
    const performanceStart = () => {};
    const performanceEnd = () => {};
    const activeSettings = () => state.settings;
    const elapsedSeconds = () => state.elapsed;
    const timerStretchMaxPercent = () => window.FDVTimerStretch.percent(state.stretchPercent);
    const t = key => key;
    ${functions}
    window.FDVGuestScreen = {
      config(settings, stretch, stretchPercent) {
        state.settings = settings;
        state.timerVerticalStretch = stretch;
        state.stretchPercent = stretchPercent;
      },
      fit: fitTimerText, parts: timeParts, segment: getCurrentSegment, protect: protectTimerDisplayFrame,
      rotationNumber(segment, snapshot, elapsed) {
        state.elapsed = elapsed;
        state.startListFinalCycle = snapshot.startListFinalCycle;
        state.running = snapshot.status === "roundRunning" || snapshot.status === "waitingStart";
        state.completed = snapshot.status === "completed";
        state.elapsedBeforePause = snapshot.status === "pause" ? elapsed : 0;
        const number = snapshot.appealAfterCycle || displayedCycleNumber(segment);
        return Math.max(1, Math.min(9999, number));
      }
    };
  })();`;
  return { css: css + `
#guest-notice{position:fixed;left:1rem;right:1rem;bottom:1rem;margin:0;z-index:4;text-align:center}
.guest-rotation{
  position:fixed;left:50%;bottom:1rem;bottom:max(1rem,env(safe-area-inset-bottom));
  z-index:3;transform:translateX(-50%);min-width:1.9em;padding:.16em .35em;
  border:1px solid rgba(244,247,251,.28);border-radius:.45em;
  color:rgba(244,247,251,.68);background:rgba(14,17,22,.28);
  font:600 clamp(1rem,2.8vmin,1.75rem)/1.2 Arial,sans-serif;
  font-variant-numeric:tabular-nums;text-align:center;pointer-events:none
}
#guest-notice:not([hidden]) + .guest-rotation{bottom:4rem}
`, js };
}

module.exports = { guestScreenAssets };
