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
  assert.doesNotMatch(displayCore, /\b(?:const|let|class)\b|=>|\?\.|\.\.\.|`/);
  assert.match(displayCore, /root\.FDVStartListDisplay = api/);
  assert.match(legacy, /src="lib\/start-list-display\.js\?v=355"/);
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
  assert.match(legacy, /overflow-x: hidden;[\s\S]*?overflow-y: auto;/);
  assert.match(legacy, /\.protocol-table \{[\s\S]*?width: auto;[\s\S]*?table-layout: auto;/);
  assert.match(legacy, /body\.protocol-portrait \.protocol-table \{[\s\S]*?width: 100%;[\s\S]*?table-layout: fixed;/);
  assert.match(legacy, /\.protocol-table \.protocol-data-cell \{[\s\S]*?text-overflow: ellipsis;/);
  assert.match(legacy, /scrollbar-color: #687384 #202630;/);
  assert.match(legacy, /\.protocol-scroll::\-webkit-scrollbar-thumb/);
  assert.match(legacy, /\.protocol-title \{[\s\S]*?font-size: 13px;[\s\S]*?text-align: center;/);
  assert.match(legacy, /\.protocol-table \{[\s\S]*?font-size: 12px;[\s\S]*?line-height: 16px;/);
  assert.match(legacy, /\.protocol-table \.protocol-route-cell \{[\s\S]*?width: 30px;[\s\S]*?min-width: 30px;[\s\S]*?max-width: 30px;[\s\S]*?height: 30px;/);
  assert.match(legacy, /\.route-marker\.done \{[\s\S]*?-webkit-transform: rotate\(45deg\);/);
  assert.match(legacy, /\.route-marker\.stopped:after \{[\s\S]*?-webkit-transform: rotate\(-45deg\);/);
});

test("Legacy sizes landscape protocol pane to compact intrinsic table widths", () => {
  assert.match(legacy, /function sizeProtocolPane\(portrait, fullWidth\)/);
  assert.match(legacy, /function measureProtocolColumns\(columns, scrollbar\)/);
  assert.match(legacy, /function setProtocolDensity\(level\)/);
  assert.match(legacy, /if \(density < 1 && measurement\.total > maximum\)[\s\S]*?setProtocolDensity\(density\)/);
  assert.match(legacy, /body\.protocol-compact \.protocol-table \{[\s\S]*?font-size: 11px;/);
  assert.match(legacy, /body\.protocol-dense \.protocol-table \{[\s\S]*?font-size: 10px;/);
  assert.match(legacy, /Math\.max\(width, tables\[j\]\.offsetWidth, tables\[j\]\.scrollWidth\)/);
  assert.match(legacy, /protocolPaneEl\.style\.width = total \+ "px"/);
  assert.match(legacy, /timerPaneEl\.style\.right = total \+ "px"/);
  assert.match(legacy, /if \(sizeKey === protocolSizeKey\) return;/);
  assert.match(legacy, /protocolSizeKey = "";[\s\S]*?scheduleViewportFit\(\)/);
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
  assert.match(legacy, /var density = minimumProtocolVerticalDensity\(\)/);
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

test("diagnostics keep protocol selectors available after a client enters Legacy mode", () => {
  const selectorCondition = index.match(/const startListSelectorHtml = ([\s\S]*?)\? `<div class="diag-row start-list-diag-row">/);
  assert.ok(selectorCondition);
  assert.doesNotMatch(selectorCondition[1], /!isLegacyViewer|!isOldBrowserClient/);
  assert.match(index, /start-list-diag-row">\$\{state\.startLists\.map\(\(_, listIndex\) => \{/);
  assert.doesNotMatch(index, /start-list-diag-row">\$\{Array\.from\(\{ length: 4 \}/);
});
