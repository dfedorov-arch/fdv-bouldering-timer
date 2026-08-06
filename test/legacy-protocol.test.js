"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const legacy = fs.readFileSync(path.join(root, "legacy.html"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const displayCore = fs.readFileSync(path.join(root, "lib", "start-list-display.js"), "utf8");

test("Legacy start-list display core remains parseable by ES5-era browsers", () => {
  const buildNumber = index.match(/const pageBuildNumber = (\d+);/)?.[1];
  assert.doesNotMatch(displayCore, /\b(?:const|let|class)\b|=>|\?\.|\.\.\.|`/);
  assert.match(displayCore, /root\.FDVStartListDisplay = api/);
  assert.ok(buildNumber, "Modern page must expose its build number");
  assert.match(legacy, new RegExp(`src="lib/start-list-display\\.js\\?v=${buildNumber}"`));
});

test("Legacy requests protocol data conditionally and stores it separately from timer snapshots", () => {
  assert.match(legacy, /protocolRevision=" \+ encodeURIComponent\(protocolRevision\)/);
  assert.match(legacy, /legacyProtocolSnapshotKey = "fdvBoulderingTimerLegacyProtocols"/);
  assert.match(legacy, /if \(key === "legacyProtocols" \|\| key === "startLists"\) continue/);
  assert.match(legacy, /Object\.prototype\.hasOwnProperty\.call\(remote, "legacyProtocols"\)/);
});

test("Legacy tables retain static DOM and use transition candidates for ordinary cycles", () => {
  assert.match(legacy, /function buildTransitionIndex\(view, schedule, scheduleKey\)/);
  assert.match(legacy, /if \(position\.cycle === view\.lastCycle \+ 1\)/);
  assert.match(legacy, /evaluateProtocolCells\(view, position, schedule, candidates\)/);
  assert.match(legacy, /if \(cell\.status === status\) return false/);
  assert.match(legacy, /function cachedProtocolAnchor\(view, cycle\)/);
});

test("Legacy keeps excluded rows visible and calculates markers with effective participant indexes", () => {
  assert.match(legacy, /excludedParticipants: entry\.list\.excludedParticipants \|\| \[\]/);
  assert.match(legacy, /participantScheduleIndex\(i, excludedParticipants, list\.rows\.length\)/);
  assert.match(legacy, /cell\.calculationParticipantIndex < 0 \? "" : window\.FDVStartListDisplay\.marker/);
  assert.match(legacy, /tr\.protocol-excluded td:after[\s\S]*?height: 1px;[\s\S]*?background: #ff4b50/);
});

test("Legacy derives protocol progress from its locally extrapolated timer", () => {
  assert.match(legacy, /function currentProtocolPosition\(view\)/);
  assert.match(legacy, /var elapsed = elapsedSeconds\(\)/);
  assert.match(legacy, /window\.FDVStartListDisplay\.scheduledCycle/);
  assert.match(legacy, /renderProtocols\(view\)/);
});

test("Legacy protocol tables fit their pane and use dark themed scrollbars", () => {
  assert.match(legacy, /list\.routeCount === 1 \? \(english \? "R" : "T"\) : String\(i \+ 1\)/);
  assert.match(legacy, /-webkit-text-size-adjust: none;/);
  assert.match(legacy, /\.protocol-scroll \{[\s\S]*?overflow-x: hidden;[\s\S]*?overflow-y: auto;/);
  assert.match(legacy, /\.protocol-scroll\.protocol-horizontal-overflow \{\s*overflow-x: auto;/);
  assert.match(legacy, /\.protocol-table \{[\s\S]*?width: auto;[\s\S]*?table-layout: auto;/);
  assert.doesNotMatch(legacy, /\.protocol-table \{[\s\S]*?min-width: 100%;/);
  assert.match(legacy, /\.protocol-table\.protocol-columns-synchronized \{[\s\S]*?width: auto;[\s\S]*?table-layout: fixed;/);
  assert.match(legacy, /body\.protocol-portrait \.protocol-table \{[\s\S]*?width: 100% !important;[\s\S]*?table-layout: fixed;/);
  assert.match(legacy, /\.protocol-table th\.protocol-data-cell \{[\s\S]*?text-overflow: ellipsis;/);
  assert.match(legacy, /\.protocol-table td\.protocol-data-cell \{[\s\S]*?overflow: visible;[\s\S]*?text-overflow: clip;/);
  assert.match(legacy, /scrollbar-color: #687384 #202630;/);
  assert.match(legacy, /\.protocol-scroll::\-webkit-scrollbar-thumb/);
  assert.match(legacy, /\.protocol-title \{[\s\S]*?font-size: 13px;[\s\S]*?text-align: center;/);
  assert.match(legacy, /\.protocol-table \{[\s\S]*?font-size: 12px;[\s\S]*?line-height: 16px;/);
  assert.match(legacy, /\.protocol-table \.protocol-route-cell \{[\s\S]*?width: 30px;[\s\S]*?min-width: 30px;[\s\S]*?max-width: 30px;[\s\S]*?height: 30px;/);
  assert.match(legacy, /\.route-marker\.done \{[\s\S]*?-webkit-transform: rotate\(45deg\);/);
  assert.match(legacy, /\.route-marker\.stopped:after \{[\s\S]*?-webkit-transform: rotate\(-45deg\);/);
});

test("Legacy timer text cannot be selected or opened through the touch callout", () => {
  assert.match(legacy, /#time \{[\s\S]*?-webkit-user-select: none;[\s\S]*?user-select: none;[\s\S]*?-webkit-touch-callout: none;/);
});

test("Legacy excluded participant strike stays below sticky headers", () => {
  assert.match(legacy, /\.protocol-table th \{[\s\S]*?z-index: 2;/);
  assert.match(legacy, /\.protocol-table tr\.protocol-excluded td:after \{[\s\S]*?z-index: 1;/);
});

test("Legacy keeps protocol headers visible when the TV browser lacks sticky positioning", () => {
  assert.match(legacy, /function supportsProtocolStickyHeaders\(\)/);
  assert.match(legacy, /scroll\.scrollTop = 8/);
  assert.match(legacy, /th\.getBoundingClientRect\(\)\.top - scroll\.getBoundingClientRect\(\)\.top/);
  assert.match(legacy, /protocolStickyHeaderFallback = !supportsProtocolStickyHeaders\(\)/);
  assert.match(legacy, /legacyStickyFallback=1/);
  assert.match(legacy, /body\.protocol-sticky-fallback \.protocol-table thead \{[\s\S]*?position: relative;[\s\S]*?z-index: 20;/);
  assert.match(legacy, /body\.protocol-sticky-fallback \.protocol-table tbody \{[\s\S]*?position: relative;[\s\S]*?z-index: 1;/);
  assert.match(legacy, /body\.protocol-sticky-fallback \.protocol-table th \{[\s\S]*?position: relative;[\s\S]*?z-index: 21;[\s\S]*?background: #242a33;/);
  assert.match(legacy, /function positionProtocolFallbackHeader\(scroll, table\)[\s\S]*?translateY\(" \+ offset \+ "px\)/);
  assert.match(legacy, /scroll\.onscroll = function \(\) \{[\s\S]*?positionProtocolFallbackHeader\(scroll, table\)/);
  assert.match(legacy, /view\.scroll\.scrollLeft = left;[\s\S]*?positionProtocolFallbackHeader\(view\.scroll, view\.table\)/);
});

test("Legacy sizes landscape protocol pane to compact intrinsic table widths", () => {
  assert.match(legacy, /function sizeProtocolPane\(portrait, fullWidth\)/);
  assert.match(legacy, /function measureProtocolColumns\(columns, scrollbar\)/);
  assert.match(legacy, /function setProtocolDensity\(level\)/);
  assert.match(legacy, /var density = verticalDensity;[\s\S]*?setProtocolDensity\(density\);[\s\S]*?if \(density < 1 && measurement\.total > maximum\)[\s\S]*?setProtocolDensity\(density\)/);
  assert.match(legacy, /widths = measurement\.widths;[\s\S]*?total = measurement\.total/);
  assert.match(legacy, /body\.protocol-compact \.protocol-table \{[\s\S]*?font-size: 11px;/);
  assert.match(legacy, /body\.protocol-dense \.protocol-table \{[\s\S]*?font-size: 10px;/);
  assert.match(legacy, /var minimumContextRows = 12;/);
  assert.match(legacy, /span = Math\.max\(span, Math\.min\(minimumContextRows, view\.rows\.length\)\)/);
  assert.match(legacy, /Math\.max\(width, tables\[j\]\.offsetWidth, tables\[j\]\.scrollWidth\)/);
  assert.doesNotMatch(legacy, /width = Math\.max\(width, titles\[j\]\.scrollWidth\)/);
  assert.match(legacy, /\.protocol-title \{[\s\S]*?overflow: hidden;[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;/);
  assert.match(legacy, /protocolPaneEl\.style\.width = total \+ "px"/);
  assert.match(legacy, /timerPaneEl\.style\.right = total \+ "px"/);
  assert.match(legacy, /fullWidth - Math\.max\(240, Math\.min\(320, Math\.floor\(fullWidth \* 0\.28\)\)\)/);
  assert.match(legacy, /body\.protocol-portrait #protocolPane \{[\s\S]*?width: auto !important;/);
  assert.match(legacy, /body\.protocol-portrait #protocolLayout \{[\s\S]*?width: 100% !important;/);
  assert.match(legacy, /if \(sizeKey === protocolSizeKey\) return;/);
  assert.match(legacy, /protocolSizeKey = "";[\s\S]*?scheduleViewportFit\(\)/);
});

test("Legacy aligns matching columns in protocols stacked inside one column", () => {
  assert.match(legacy, /function clearSynchronizedProtocolColumnWidths\(columns\)/);
  assert.match(legacy, /function synchronizeStackedProtocolColumnWidths\(columns\)/);
  assert.match(legacy, /tables\.length < 2/);
  assert.match(legacy, /_fdvDataColumnCount/);
  assert.match(legacy, /_fdvRouteColumnCount/);
  assert.match(legacy, /width = Math\.max\(width, cells\[k\]\.offsetWidth\)/);
  assert.match(legacy, /width = Math\.max\(width, cells\[k\]\.scrollWidth \+ 1\)/);
  assert.match(legacy, /tableColumns\[k\]\.style\.width = widths\[k\] \+ "px"/);
  assert.match(legacy, /tables\[j\]\.style\.width = Math\.ceil\(tableWidth\) \+ "px"/);
  assert.match(legacy, /protocol-table protocol-columns-synchronized/);
  assert.doesNotMatch(legacy, /targetFlexibleWidth|assignedFlexibleWidth/);
});

test("Legacy restores percentage slot heights after leaving a narrow stacked layout", () => {
  assert.match(legacy, /function updateProtocolSlotHeights\(\)[\s\S]*?if \(!portrait\) \{[\s\S]*?slots\[j\]\.style\.height = String\(100 \/ Math\.max\(1, slots\.length\)\) \+ "%"/);
  assert.match(legacy, /rowCount = Math\.max\(6, Math\.min\(12, span \+ 4\)\)/);
  assert.match(legacy, /Math\.max\(220, Math\.min\(maximumHeight, titleHeight \+ rowHeight \* \(rowCount \+ 1\) \+ 2\)\)/);
  assert.match(legacy, /view\.slot\._fdvDesiredHeight = height/);
  assert.match(legacy, /extra = Math\.max\(0, available - desiredTotal\)/);
  assert.match(legacy, /addition = remaining > 0 \? Math\.floor\(extra \/ remaining\) : 0/);
});

test("Legacy uses two protocol columns in a sufficiently wide tall window", () => {
  assert.match(legacy, /function useParallelProtocolColumns\(\)[\s\S]*?fullWidth >= 1100 && fullHeight > fullWidth/);
  assert.match(legacy, /if \(useParallelProtocolColumns\(\)\) \{\s*return \[\[legacyProtocols\[0\]\], \[legacyProtocols\[1\]\]\];/);
  assert.match(legacy, /scheduleViewportFit\(\) \{\s*if \(protocolIsVisible\(\)\) ensureProtocolStructure\(\);/);
});

test("Legacy exposes horizontal scrolling only for measured landscape overflow", () => {
  assert.match(legacy, /function updateProtocolHorizontalOverflow\(\)[\s\S]*?overflow = !portrait && view\.table\.scrollWidth > view\.scroll\.clientWidth \+ 2;[\s\S]*?protocol-horizontal-overflow/);
});

test("Legacy prioritizes the highlighted range and raises density when its full span does not fit", () => {
  assert.match(legacy, /function minimumProtocolVerticalDensity\(\)/);
  assert.match(legacy, /Math\.floor\(\(scrollHeight - rowHeight\) \/ rowHeight\) - 1/);
  assert.match(legacy, /span >= protocolRowCapacity\(view, 0\)[\s\S]*?span >= protocolRowCapacity\(view, 1\)[\s\S]*?span >= protocolRowCapacity\(view, 2\)/);
  assert.match(legacy, /lastHighlightedRect\.bottom > visibleBottom \+ 1[\s\S]*?firstHighlightedRect\.top - visibleTop/);
  assert.match(legacy, /highlighted\[highlighted\.length - 1\] - highlighted\[0\] \+ 1 >= capacity[\s\S]*?prioritizedAnchor = highlighted\[0\]/);
  assert.match(legacy, /previousDensity !== protocolAppliedDensity[\s\S]*?reanchorProtocolViews\(\);[\s\S]*?setTimeout\(reanchorProtocolViews, 100\)/);
  assert.match(legacy, /&viewport=[\s\S]*?viewportWidth\(\)[\s\S]*?&screen=[\s\S]*?reportedScreen[\s\S]*?&dpr=/);
  assert.match(legacy, /protocol-ultra-dense[\s\S]*?font-size: 9px[\s\S]*?height: 18px/);
  assert.match(legacy, /setBodyFlag\("protocol-ultra-dense", level >= 3\)/);
  assert.match(legacy, /&clientBuild=[\s\S]*?legacyBuildNumber/);
  assert.match(legacy, /var verticalDensity = minimumProtocolVerticalDensity\(\)/);
  assert.match(legacy, /prioritizedScrollAnchor\(anchor, highlighted, capacity\)/);
  assert.match(legacy, /view\.scroll\.scrollTop \+ rowRect\.top - scrollRect\.top - headerHeight/);
  assert.match(legacy, /minimumProtocolVerticalDensity\(\) !== lastProtocolVerticalDensity[\s\S]*?syncViewportSize\(\)/);
  assert.match(legacy, /protocolAppliedDensity = density;[\s\S]*?previousDensity !== protocolAppliedDensity[\s\S]*?reanchorProtocolViews/);
  assert.match(legacy, /function reanchorProtocolViews\(\)[\s\S]*?cachedProtocolAnchor\(view, position\.cycle\)[\s\S]*?scrollProtocolToAnchor/);
});

test("Legacy avoids repeated synchronous storage and class writes during timer ticks", () => {
  assert.match(legacy, /legacySnapshotSaveIntervalMs = 5000/);
  assert.match(legacy, /remoteVersion === lastLegacySnapshotVersion[\s\S]*?savedAtWall - lastLegacySnapshotSavedAt < legacySnapshotSaveIntervalMs/);
  assert.match(legacy, /if \(document\.body\.className !== nextClassName\) document\.body\.className = nextClassName/);
});

test("Legacy fits timer text only when its width class or viewport changes", () => {
  assert.match(legacy, /var timerFitCanvas = null;[\s\S]*?var timerFitContextResolved = false;/);
  assert.match(legacy, /function timerFitMeasureContext\(\) \{[\s\S]*?if \(timerFitContextResolved\) return timerFitContext;[\s\S]*?document\.createElement\("canvas"\)/);
  assert.match(legacy, /function rememberFitText\(value\) \{[\s\S]*?if \(next === storedFitText\) return false;[\s\S]*?return true;/);
  assert.match(legacy, /fitTextChanged = rememberFitText\(label\);[\s\S]*?timeEl\.innerHTML = label;[\s\S]*?if \(fitTextChanged\) fitTimerText\(\);/);
  assert.match(legacy, /if \(fitKey === lastFitKey\) \{\s*performanceCount\("timerFitSkips"\);\s*return;/);
  assert.match(legacy, /function invalidateTimerFit\(\) \{\s*lastFitKey = "";\s*\}/);
  assert.match(legacy, /ff\.load\(\)\.then\(function \(\) \{ invalidateTimerFit\(\); fitTimerText\(\); \}\)/);
  assert.doesNotMatch(legacy, /fitTimerText\(true\)/);
});

test("diagnostics keep protocol selectors available after a client enters Legacy mode", () => {
  const selectorCondition = index.match(/const startListSelectorHtml = ([\s\S]*?)\? `<div class="diag-row start-list-diag-row">/);
  assert.ok(selectorCondition);
  assert.doesNotMatch(selectorCondition[1], /!isLegacyViewer|!isOldBrowserClient/);
  assert.match(index, /start-list-diag-row">\$\{Array\.from\(\{ length: 4 \}, \(_, listIndex\) => \{/);
});

test("Legacy shows the server-assigned browser number with a solid color fallback", () => {
  assert.match(legacy, /<div id="timerPane">\s*<div id="browserNumberBadge"><\/div>/);
  assert.match(legacy, /#browserNumberBadge \{[\s\S]*?background: #5e6876;[\s\S]*?background: rgba\(94, 104, 118, \.42\);/);
  assert.match(legacy, /state && state\.showBrowserNumbers && browserDisplayNumber > 0/);
});

test("Legacy renders the optional synchronized server clock below an otherwise unchanged timer", () => {
  assert.match(legacy, /font-family: "FDV LCD"/);
  assert.match(legacy, /DSEG7Classic-Bold\.woff2/);
  assert.match(legacy, /#serverClock \{[\s\S]*?font-weight: bold;/);
  assert.match(legacy, /<div id="serverClock"><span id="serverClockText">00:00:00<\/span><\/div>/);
  assert.match(legacy, /#serverClock \{[\s\S]*?position: absolute;[\s\S]*?bottom: 0;/);
  assert.match(legacy, /serverClockEl\.offsetHeight \+ "px"/);
  assert.match(legacy, /timerClockTransform = "translateY\(-" \+ serverClockEl\.offsetHeight \+ "px\)"/);
  assert.match(legacy, /setBodyFlag\("server-clock-visible", showServerClock\);/);
  assert.match(legacy, /formatServerClockTime\(serverNow\(\)\)/);
  assert.match(legacy, /state && state\.showServerTime/);
});

test("Legacy uses the configured countdown colors while waiting for a scheduled start", () => {
  assert.match(legacy, /countdownText: colorValue\(config\.countdownTextColor, timerColors\.countdownText\)/);
  assert.match(legacy, /countdownBg: colorValue\(config\.countdownBackgroundColor, timerColors\.countdownBg\)/);
  assert.match(legacy, /var countdownPhase = view\.phase === "start" \|\| Boolean\(state && state\.waitingForManualStart\);/);
  assert.match(legacy, /timerPaneEl\.style\.backgroundColor = countdownPhase \? timerColors\.countdownBg/);
  assert.match(legacy, /timeEl\.style\.color = countdownPhase \? timerColors\.countdownText/);
});

test("Legacy measures signed render timing and keeps an ordinary scheduled run autonomous offline", () => {
  assert.match(legacy, /renderTargetServerTime = boundaryDelay === null \? 0 : serverNow\(\) \+ boundaryDelay/);
  assert.match(legacy, /lastRenderDelayMs = Math\.round\(\(callbackServerTime - targetServerTime\) \* 10\) \/ 10/);
  assert.match(legacy, /&renderDelay=[\s\S]*?&renderDelayAge=/);
  assert.match(legacy, /if \(state\.countdownOnly \|\| \(state\.running && Number\(state\.startedAt \|\| 0\) > serverNow\(\)\)\)/);
  assert.match(legacy, /return Math\.max\(0, \(serverNow\(\) - Number\(state\.startedAt \|\| 0\)\) \/ 1000\)/);
});
