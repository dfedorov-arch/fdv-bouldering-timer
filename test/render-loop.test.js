"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const index = fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");
const server = fs.readFileSync(path.resolve(__dirname, "..", "serve-bouldering-timer.js"), "utf8");
const standaloneBuilder = fs.readFileSync(path.resolve(__dirname, "..", "scripts", "build-standalone-html.js"), "utf8");

function inlineFunction(name) {
  const match = index.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}`));
  assert.ok(match, `${name} must exist in index.html`);
  return vm.runInNewContext(`(${match[0]})`);
}

test("display rendering targets synchronized second boundaries without an animation-frame loop", () => {
  assert.doesNotMatch(index, /requestAnimationFrame\(tick\)/);
  assert.doesNotMatch(index, /requestAnimationFrame\(criticalTick\)/);
  assert.match(index, /const renderIdleIntervalMs = 1000;/);
  assert.match(index, /const renderRunningIntervalMs = 250;/);
  assert.match(index, /const displayBoundaryGuardMs = 8;/);
  assert.match(index, /function nextSecondBoundaryServerTime\(currentServerTime, endServerTime\)/);
  assert.match(index, /const displayedSeconds = Math\.ceil\(remainingMs \/ 1000\);/);
  assert.match(index, /\(targetServerTime - serverNow\(\)\) \/ clockRate/);
  assert.match(index, /scheduleDisplayBoundary\(true\);/);
  assert.match(index, /window\.setTimeout\(tick, interval\);/);
});

test("modern timer text cannot be selected or opened through the touch callout", () => {
  assert.match(index, /\.time \{[\s\S]*?-webkit-user-select: none;[\s\S]*?user-select: none;[\s\S]*?-webkit-touch-callout: none;/);
});

test("second-boundary calculation targets the exact next displayed value", () => {
  const nextBoundary = inlineFunction("nextSecondBoundaryServerTime");
  assert.equal(nextBoundary(100000, 153742), 100742);
  assert.equal(nextBoundary(100000, 153000), 101000);
  assert.equal(nextBoundary(152999.5, 153000), 153000);
  assert.equal(nextBoundary(153001, 153000), null);
});

test("schedule markup is replaced only when its content changes", () => {
  assert.match(index, /if \(scheduleStateKey === lastScheduleStateKey\) return;/);
  assert.match(index, /if \(markup === lastScheduleMarkup\) return;/);
  assert.match(index, /lastScheduleMarkup = markup;\s*els\.schedule\.innerHTML = markup;/);
});

test("start-list switch follows the primary switch and supports four dynamic protocol areas", () => {
  assert.match(index, /\[hidden\] \{ display: none !important; \}/);
  assert.match(index, /\.route-marker\.done \{[^}]*background: #c83d3d;/);
  assert.match(index, /id="primaryToggle"[\s\S]*?id="startListToggleRow"[\s\S]*?id="startListToggle" type="checkbox"/);
  assert.match(index, /<section id="startListPanel"[\s\S]*?id="startListLayout"/);
  assert.match(index, /data-start-list-add[\s\S]*?data-start-list-file[\s\S]*?data-start-list-routes[\s\S]*?data-start-list-clear/);
  assert.doesNotMatch(index, /data-start-list-cycle/);
  assert.match(index, /\.start-list-panel-controls \{\s*display: grid;\s*grid-template-columns: 34px minmax\(0, 1fr\) auto 34px;/);
  assert.match(index, /\.start-list-panel-controls\.has-layout-toggle \{\s*grid-template-columns: 34px 34px minmax\(0, 1fr\) auto 34px;/);
  assert.match(index, /data-start-list-add[\s\S]*?\$\{layoutToggle\}[\s\S]*?data-start-list-file/);
  assert.match(index, /entries\.length === 2 && state\.startListParallel[\s\S]*?\[\[entries\[0\]\], \[entries\[1\]\]\]/);
  assert.match(index, /function commitStartListLayout\(parallel\)[\s\S]*?sendServerAction\("startListLayout", \{ parallel: nextParallel \}\)/);
  assert.match(index, /value\.slice\(0, 4\)/);
  assert.match(index, /entries\.length > 2 \? \[entries\.slice\(0, 2\), entries\.slice\(2, 4\)\] : \[entries\]/);
  assert.match(index, /if \(index === 0\) \{\s*nextLists\[0\] = null;\s*startListIncidentSelections\[0\] = null;\s*\} else \{\s*nextLists\.splice\(index, 1\);\s*startListIncidentSelections\.splice\(index, 1\);/);
  assert.match(index, /\.start-list-panel \{[\s\S]*?width: 280px;[\s\S]*?min-width: 280px;/);
  assert.match(index, /\.start-list-add \{[^}]*color: var\(--green\); background: transparent;/);
  assert.match(index, /function fitStartListPanelWidth\(\)[\s\S]*?intrinsicStartListTableWidth\(table\)[\s\S]*?els\.startListPanel\.style\.width/);
  assert.match(index, /maximumContentWidth = Math\.min\(stageWidth \* 0\.55, 700\)/);
  assert.match(index, /scroll\.offsetWidth - scroll\.clientWidth/);
  assert.match(index, /const completedFinalAttempt = state\.runtimePreset === "final"[\s\S]*?state\.running && !state\.countdownOnly/);
  assert.doesNotMatch(index, /class="start-list-heading"/);
  assert.match(index, /startListEditorOpen = els\.startListToggle\.checked;[\s\S]*?safeStorageSet\("sessionStorage", startListEditorPreferenceKey[\s\S]*?updateStartListVisibility\(\);\s*scheduleStartListRender\(\);/);
  assert.match(index, /startListEditorOpen = safeStorageGet\("sessionStorage", startListEditorPreferenceKey\) === "1";\s*state\.startListEnabled = startListEditorOpen;\s*els\.startListToggle\.checked = startListEditorOpen/);
  assert.match(index, /safeStorageSet\("sessionStorage", startListEditorPreferenceKey, startListEditorOpen \? "1" : "0"\)/);
  assert.match(index, /state\.startListEnabled = Boolean\(remote\.startListEnabled\)[\s\S]*?startListEditorOpen = state\.startListEnabled[\s\S]*?els\.startListToggle\.checked = startListEditorOpen/);
  assert.match(index, /startListToggle\.addEventListener\("change", async \(\) => \{[\s\S]*?sendServerAction\("startListEnabled", \{ enabled: startListEditorOpen \}\)/);
  assert.match(index, /LIST \$\{listIndex \+ 1\}[\s\S]*?data-start-list-index="\$\{listIndex\}"/);
  assert.match(index, /\.diag-row \{[\s\S]*?margin-top: 2px;[\s\S]*?margin-left: -4px;/);
  assert.match(index, /\.start-list-diag-row \{ margin-top: 4px; \}/);
  assert.match(index, /loadStartListNumber: "Загрузить список \{number\}"/);
  assert.match(index, /loadStartListCompact: "Загрузить…"/);
  assert.match(index, /class="start-list-file-button" title="\$\{escapeHtml\(formatStartListText\("loadStartListNumber"[\s\S]*?<span>\$\{escapeHtml\(formatStartListText\("loadStartListNumber", \{ number: index \+ 1 \}\)\)\}<\/span>/);
  assert.match(index, /function defaultStartListRouteCount\(\) \{\s*return isFinalMode\(\) \? 4 : 5;\s*\}/);
  assert.match(index, /value="\$\{list\?\.routeCount \|\| defaultStartListRouteCount\(\)\}"/);
  assert.match(index, /start-list-available clickable[\s\S]*?start-list-selected/);
  assert.match(index, /\.diag-chip\.start-list-selected \{[\s\S]*?background: var\(--cyan\);\s*\}/);
  assert.doesNotMatch(index, /\.diag-chip\.start-list-selected \{[^}]*box-shadow/);
  assert.match(index, /function visibleStartListEntries\(\)[\s\S]*?selectedIndexes\.has\(index\)/);
  assert.match(index, /els\.climbMinutes\.disabled = !available \|\| timerParametersLocked/);
  assert.match(index, /els\.breakSeconds\.disabled = !available \|\| timerParametersLocked/);
  assert.match(index, /accept="\.xlsx,\.csv,\.tsv,\.txt,\.mxl"/);
  assert.doesNotMatch(index, /accept="[^"]*(?:application\/|text\/)/);
  assert.match(index, /if \(\/\\\.xlsx\$\/i\.test\(file\.name\)\)[\s\S]*?loadXlsxLibrary\(\)[\s\S]*?sheet_to_json[\s\S]*?FDVStartList\.parseRows/);
  assert.match(index, /function loadXlsxLibrary\(\)[\s\S]*?FDV_XLSX_LIBRARY_SOURCE[\s\S]*?lib\/vendor\/xlsx\.mini\.min\.js/);
});

test("modern start-list rendering trusts canonical data and uses a revision key", () => {
  assert.match(index, /let startListDataRevision = 0;/);
  assert.match(index, /function replaceCanonicalStartLists\(nextLists, options = \{\}\)[\s\S]*?startListDataRevision \+= 1;/);
  assert.match(index, /function applyRemoteStartListPayload\(remote\)[\s\S]*?replaceCanonicalStartLists\(normalizeStartLists\(remote\.startLists\)\);/);
  assert.equal((index.match(/applyRemoteStartListPayload\(remote\);/g) || []).length, 2);
  assert.match(index, /function visibleStartListEntries\(\) \{\s*const lists = state\.startLists;/);
  assert.match(index, /const renderKey = `[^`]*\$\{startListDataRevision\}`;/);
  assert.match(index, /renderKey === lastStartListRenderKey[\s\S]*?performanceCount\("startListRenderSkips"\)/);
  assert.doesNotMatch(index, /function visibleStartListEntries\(\)[\s\S]*?normalizeStartLists\(state\.startLists\)[\s\S]*?function startListColumns/);
  assert.doesNotMatch(index, /const renderKey = `[^`]*JSON\.stringify\(state\.startLists\)/);
});

test("primary role changes invalidate protocol geometry and restore the current rows", () => {
  assert.match(index, /const nextIsViewer = Boolean\(primaryClientId && !isPrimary\);[\s\S]*?const primaryRoleChanged = isPrimaryClient !== isPrimary \|\| isViewerClient !== nextIsViewer/);
  assert.match(index, /isPrimaryClient = isPrimary;[\s\S]*?isViewerClient = nextIsViewer;[\s\S]*?document\.body\.classList\.toggle\("primary-active", isPrimary\);[\s\S]*?document\.body\.classList\.toggle\("viewer-mode", isViewerClient\);/);
  assert.match(index, /if \(primaryRoleChanged\) \{[\s\S]*?lastStartListStructureKey = "";[\s\S]*?lastStartListRenderKey = "";[\s\S]*?startListWidthFitLastKey = "";[\s\S]*?startListInitialAutoScrollPending = true;[\s\S]*?lastStartListScrollAnchors = \[\];[\s\S]*?pendingStartListScrollRestores = \[\];/);
  assert.match(index, /updateStartListControls\(\);\s*updateStartListVisibility\(\);\s*if \(primaryRoleChanged\) scheduleStartListPanelWidthFit\(\{ settle: true, force: true \}\);/);
});

test("modern start-list payload is reused only for an exact non-empty server revision", () => {
  const payloadStatus = inlineFunction("remoteStartListPayloadStatus");
  assert.equal(payloadStatus({ startLists: [], startListRevision: "instance:2" }, "instance:1"), "replace");
  assert.equal(payloadStatus({ startLists: null, startListRevision: "instance:2" }, "instance:2"), "recover");
  assert.equal(payloadStatus({ startListRevision: "instance:2" }, "instance:2"), "preserve");
  assert.equal(payloadStatus({ startListRevision: "instance:2" }, "instance:1"), "recover");
  assert.equal(payloadStatus({ startListRevision: "" }, ""), "recover");
  assert.equal(payloadStatus(null, "instance:2"), "recover");
  assert.match(index, /startListRevision: options\.forceStartLists \? "" : lastStartListServerRevision/);
  assert.match(index, /new EventSource\(`\/api\/events\?\$\{params\}`\)/);
  assert.match(index, /lastStartListServerRevision = "";\s*performanceCount\("startListPayloadRecoveryRequests"\);\s*scheduleStartListPayloadRecovery\(\);/);
});

test("protocol rendering yields to timer paint and sound scheduling", () => {
  assert.match(index, /const startListCriticalReserveMs = 750;/);
  assert.match(index, /function startListRenderHasSafeWindow\(\)[\s\S]*?nextDisplayBoundaryServerTime\(\)[\s\S]*?targetServerTime - serverNow\(\) >= startListCriticalReserveMs/);
  assert.match(index, /function queueStartListRenderAfterPaint\(\)[\s\S]*?requestAnimationFrame\(\(\) => \{[\s\S]*?window\.setTimeout\(\(\) => \{[\s\S]*?startListRenderHasSafeWindow\(\)/);
  assert.match(index, /performanceCount\("startListCriticalWindowDeferrals"\)/);
  assert.match(index, /function scheduleStartListRender\(\)[\s\S]*?startListRenderQueued[\s\S]*?performanceCount\("startListRenderCoalesced"\)[\s\S]*?queueStartListRenderAfterPaint\(\)/);
  assert.doesNotMatch(index, /function render\([^)]*\) \{[\s\S]*?const isReady[^;]*;\s*renderStartList\(\);/);
  assert.match(index, /function render\([^)]*\)[\s\S]*?scheduleSegmentSignals\(segment, remaining, duration, true\);[\s\S]*?finally \{\s*performanceEnd\("render", performanceStartedAt\);\s*scheduleStartListRender\(\);/);
});

test("phase changes update protocol nodes without rebuilding table structure", () => {
  assert.match(index, /const tableKey = `\$\{language\}:\$\{index\}:\$\{startListDataRevision\}:\$\{canManageIncidents\}`/);
  assert.match(index, /const rebuildTable = !table \|\| scroll\.dataset\.startListTableKey !== tableKey/);
  assert.match(index, /if \(rebuildTable\) \{[\s\S]*?performanceCount\("startListTableRebuilds"\)[\s\S]*?scroll\.dataset\.startListTableKey = tableKey;[\s\S]*?\} else \{\s*performanceCount\("startListDynamicUpdates"\)/);
  assert.match(index, /data-start-list-route-header="\$\{routeIndex\}"/);
  assert.match(index, /data-start-list-marker="\$\{marker\}"/);
  assert.match(index, /cell\.dataset\.startListMarker = marker;[\s\S]*?performanceCount\("startListMarkersChanged"\)/);
  assert.match(index, /if \(rebuiltTables\) \{\s*scheduleStartListPanelWidthFit\(\{ settle: true, force: true \}\);/);
});

test("cycle plaque becomes an editable synchronized cycle selector while stopped", () => {
  assert.match(index, /function drawSchedule\(segment\)[\s\S]*?state\.runtimePreset === "final"[\s\S]*?id="cycleInput" class="cycle-input" type="number" min="1" max="9999"/);
  assert.match(index, /\.cycle-chip\.cycle-editable[\s\S]*?border-color: #68dcff/);
  assert.match(index, /function cycleInputEditable\(\) \{[\s\S]*?!state\.running[\s\S]*?!isViewerClient/);
  assert.match(index, /async function seekToCycle\(value\)[\s\S]*?sendServerAction\("seekCycle", \{ cycle \}\)/);
  assert.match(index, /setCycleMeta\(settings\.oneShot \? displayedCycleNumber\(segment\) : segment\.cycle\)/);
  assert.doesNotMatch(index, /\.cycle-input::-(?:webkit-inner|webkit-outer)-spin-button/);
  assert.match(index, /const phaseClass = editableCycle \? "cycle-editable" : \(segment\?\.type === "break" \? "cycle-break" : "cycle-rotation"\)/);
  assert.match(index, /const cycleTitle = editableCycle \? t\("cycleNumber"\) : phaseName/);
  assert.match(index, /setScheduleMarkup\(cycleChip, true, false, scheduleStateKey\)/);
  assert.match(index, /\.schedule\.with-cycle \{\s*grid-template-columns: auto;\s*justify-content: center;/);
  assert.match(index, /const cycleDigits = String\(cycleNumber\)\.length;[\s\S]*?style="--cycle-digits:\$\{cycleDigits\}"/);
  assert.match(index, /\.cycle-input \{[\s\S]*?width: calc\(var\(--cycle-digits, 1\) \* 1ch \+ var\(--cycle-spinner-space, 20px\)\)/);
  assert.match(index, /\.chip\.cycle-chip::before \{[\s\S]*?width: calc\(var\(--cycle-spinner-space\) - var\(--cycle-item-gap\)\);[\s\S]*?flex: 0 0 calc\(var\(--cycle-spinner-space\) - var\(--cycle-item-gap\)\)/);
  assert.match(index, /\.cycle-chip\.cycle-rotation[\s\S]*?border-color: var\(--green\)/);
  assert.match(index, /\.cycle-chip\.cycle-break[\s\S]*?border-color: var\(--yellow\)/);
  assert.match(index, /const waitingForStart = state\.waitingForManualStart \|\| isBeforeScheduledStart\(\)/);
  assert.match(index, /class="chip cycle-chip cycle-waiting"><span>\$\{t\("waitingStart"\)\}<\/span>/);
  assert.match(index, /\.cycle-chip\.cycle-break,[\s\S]*?\.cycle-chip\.cycle-waiting \{[\s\S]*?border-color: var\(--yellow\)/);
  assert.match(index, /\.chip\.cycle-chip\.cycle-waiting::before \{\s*display: none;/);
  assert.match(index, /setElementClass\(document\.body, "countdown-active", state\.countdownOnly[\s\S]*?state\.waitingForManualStart/);
  assert.match(index, /if \(state\.waitingForManualStart\) \{[\s\S]*?setElementClass\(document\.body, "countdown-active", true\);/);
  assert.match(index, /setScheduleMarkup\(`<div class="chip current"><span>\$\{untilStart > 0 \? t\("untilStart"\) : t\("waitingManual"\)\}<\/span><\/div>`\)/);
});

test("start-list width uses stable intrinsic content measurements and reserves scrollbar space", () => {
  assert.match(index, /\.start-list-table \{ width: max-content; border-collapse:/);
  assert.match(index, /\.start-list-table \{[^}]*font-size: 12px;[^}]*line-height: 16px;/);
  assert.match(index, /\.start-list-title-bar \{[\s\S]*?font-size: 13px;[\s\S]*?text-align: center;/);
  assert.match(index, /\.start-list-table \.route-cell \{[^}]*width: 30px;[^}]*min-width: 30px;[^}]*max-width: 30px;[^}]*height: 30px;/);
  assert.doesNotMatch(index, /\.start-list-table \{[^}]*min-width: 100%/);
  assert.match(index, /function browserScrollbarWidth\(\)[\s\S]*?overflow:scroll[\s\S]*?probe\.offsetWidth - probe\.clientWidth/);
  assert.match(index, /function intrinsicStartListTableWidth\(table\)[\s\S]*?table\.style\.minWidth = "0"[\s\S]*?getBoundingClientRect\(\)\.width[\s\S]*?table\.style\.minWidth = previousMinWidth/);
  assert.match(index, /const nativeScrollbarWidth = browserScrollbarWidth\(\)/);
  assert.match(index, /const scrollbarRoundingAllowance = 2/);
  assert.match(index, /const stageWidth = Math\.max\(1, els\.stageMain\?\.clientWidth \|\| window\.innerWidth\)/);
  assert.match(index, /const maximumContentWidth = Math\.min\(stageWidth \* 0\.55, 700\)/);
  assert.match(index, /Math\.max\(maximum, intrinsicStartListTableWidth\(table\)\)/);
  assert.match(index, /\.start-list-panel-controls \{[\s\S]*?min-width: 0;/);
  assert.match(index, /\.start-list-file-button span \{[^}]*display: block;[^}]*width: 100%;[^}]*max-width: 100%;[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/);
  assert.match(index, /const contentWidth = Math\.min\(maximumContentWidth \+ scrollbarAllowance, tableContentWidth\)/);
  assert.doesNotMatch(index, /Math\.max\(tableContentWidth, controlsWidth\)/);
  assert.doesNotMatch(index, /Math\.max\(maximum, controls\.scrollWidth\)/);
  assert.match(index, /function synchronizeStackedStartListTableColumns\(column\)[\s\S]*?tables\.length < 2[\s\S]*?columnGroups\.some\(\(group\) => group\.length !== columnCount\)[\s\S]*?synchronizedWidths\[index\][\s\S]*?tableColumn\.style\.width = `\$\{synchronizedWidths\[index\]\}px`/);
  assert.match(index, /function fitMobileStackedStartListTableColumns\(column\)[\s\S]*?scroll\.clientWidth[\s\S]*?firstRouteIndex[\s\S]*?desiredWidths\[index\][\s\S]*?availableWidth - routeWidth[\s\S]*?table\.style\.tableLayout = "fixed"/);
  assert.match(index, /if \(mobileScreenMode\) columns\.forEach\(\(column\) => fitMobileStackedStartListTableColumns\(column\)\)/);
  assert.match(index, /synchronizeStackedStartListTableColumns\(column\);[\s\S]*?intrinsicStartListTableWidth\(table\)/);
  assert.match(index, /<table class="start-list-table"><colgroup>\$\{tableColumns\}<\/colgroup>/);
  assert.match(index, /scroll\.offsetWidth - scroll\.clientWidth\), nativeScrollbarWidth\)[\s\S]*?\+ scrollbarRoundingAllowance/);
  assert.match(index, /const tableContentWidth = tableWidth \+ scrollbarAllowance;[\s\S]*?const contentWidth = Math\.min\(maximumContentWidth \+ scrollbarAllowance, tableContentWidth\)/);
  assert.match(index, /width: tableContentWidth \? Math\.max\(minimumColumnWidth, contentWidth\) : minimumColumnWidth/);
  assert.match(index, /Math\.min\(stageWidth \* 0\.72, 1400, stageWidth - minimumTimerWidth\)/);
  assert.match(index, /els\.startListPanel\.style\.maxWidth = `\$\{panelLimit\}px`/);
  assert.match(index, /function startListWidthFitInputKey\(\)[\s\S]*?window\.innerWidth[\s\S]*?lastStartListStructureKey[\s\S]*?startListDataRevision[\s\S]*?currentStartListDensity\(\)/);
  assert.match(index, /function scheduleStartListPanelWidthFit\(\{ settle = false, force = false \} = \{\}\)[\s\S]*?startListWidthFitCoalesced[\s\S]*?requestedKey === startListWidthFitLastKey[\s\S]*?const result = fitStartListPanelWidth\(\)[\s\S]*?result\.layoutKey !== startListWidthFitPreviousLayoutKey[\s\S]*?startListWidthFitPass < 3/);
  assert.match(index, /return \{ overflow, layoutKey, densityChanged: density !== previousDensity \}/);
  assert.match(index, /scroll\.scrollWidth - scroll\.clientWidth/);
  assert.equal((index.match(/fitStartListPanelWidth\(\)/g) || []).length, 2);
  assert.match(index, /window\.addEventListener\("resize", \(\) => \{[\s\S]*?scheduleStartListPanelWidthFit\(\{ settle: true \}\);[\s\S]*?scheduleFitTimer\(\)/);
  assert.match(index, /function scheduleOrientationFits\(\)[\s\S]*?scheduleStartListPanelWidthFit\(\{ settle: true \}\);[\s\S]*?\[120, 360, 800\][\s\S]*?scheduleStartListPanelWidthFit\(\{ settle: true \}\)/);
});

test("modern start lists raise density for highlighted rows and constrained horizontal space", () => {
  assert.match(index, /body\.start-list-compact \.start-list-table \{ font-size: 11px; line-height: 15px; \}/);
  assert.match(index, /body\.start-list-dense \.start-list-table \{ font-size: 10px; line-height: 14px; \}/);
  assert.match(index, /body\.start-list-ultra-dense \.start-list-table \{ font-size: 9px; line-height: 12px; \}/);
  assert.match(index, /const rowHeights = \[30, 27, 24, 18\];[\s\S]*?const titleHeights = \[30, 27, 25, 20\]/);
  assert.match(index, /function minimumStartListVerticalDensity\(\)[\s\S]*?span > startListRowCapacity\(scroll, 0, currentDensity\)[\s\S]*?span > startListRowCapacity\(scroll, 1, currentDensity\)[\s\S]*?span > startListRowCapacity\(scroll, 2, currentDensity\)/);
  assert.match(index, /Math\.floor\(\(availableHeight - rowHeights\[density\]\) \/ rowHeights\[density\]\) - 1/);
  assert.match(index, /function setStartListDensity\(density\)[\s\S]*?classList\.toggle\("start-list-compact", density >= 1\)[\s\S]*?classList\.toggle\("start-list-dense", density >= 2\)[\s\S]*?classList\.toggle\("start-list-ultra-dense", density >= 3\)/);
  assert.match(index, /const maximumDensity = mobileScreenMode \? 2 : 3;[\s\S]*?intrinsicTableTotal <= panelLimit \|\| density >= maximumDensity[\s\S]*?density \+= 1/);
  assert.match(index, /Math\.max\(minimumStartListVerticalDensity\(\), startListHorizontalDensity\)/);
  assert.match(index, /function startListScreenMode\(\)[\s\S]*?viewer-mode[\s\S]*?fullscreen[\s\S]*?document\.fullscreenElement/);
  assert.match(index, /function applyStartListVerticalDensity\(\)[\s\S]*?startListScreenMode\(\)[\s\S]*?density = Math\.min\(2, density\)/);
  assert.match(index, /const stackedColumns = mobilePortrait;[\s\S]*?const borderWidth = stackedColumns \? 0 : Math\.max\(0, columns\.length - 1\)/);
  assert.match(index, /intrinsicTableTotal = stackedColumns[\s\S]*?measurements\.reduce\(\(maximum, measurement\) =>[\s\S]*?Math\.max\(maximum, measurement\.tableContentWidth\)/);
  assert.match(index, /if \(stackedColumns\) \{\s*widths = widths\.map\(\(\) => panelLimit\);/);
  assert.match(index, /function reanchorStartListScrolls\(settleLayout = true\)[\s\S]*?scroll\.dataset\.startListAnchor[\s\S]*?scheduleStartListAnchorScroll\(scroll, anchor, scroll\.scrollLeft, settleLayout\)/);
  assert.match(index, /scroll\.dataset\.startListAnchor = String\(anchor\)/);
  assert.match(index, /window\.addEventListener\("resize"[\s\S]*?applyStartListVerticalDensity\(\)[\s\S]*?reanchorStartListScrolls\(\)/);
});

test("copyright keeps a restrained visible credit and the full collaboration note in its tooltip", () => {
  assert.match(index, /class="credits" id="copyrightCredit"[^>]*>2026 <a id="authorName" class="author-link" href="mailto:DFedorov@gmail\.com" aria-describedby="buildProjectHint" aria-expanded="false">Фёдоров Денис<\/a>/);
  assert.match(index, /\.author-link\.armed:hover,[\s\S]*?border-color: var\(--cyan\)/);
  assert.match(index, /authorEmailHint: "Если хотите написать мне — нажмите ещё раз"/);
  assert.match(index, /function activateAuthorEmailLink\(event\)[\s\S]*?if \(!authorLinkArmed\)[\s\S]*?event\.preventDefault\(\)[\s\S]*?authorLinkArmed = true[\s\S]*?now - authorLinkArmedAt < buildLinkConfirmDelayMs/);
  assert.match(index, /els\.authorName\.addEventListener\("click", activateAuthorEmailLink\)/);
  assert.doesNotMatch(index, /id="codexCredit"/);
  assert.match(index, /authorHint: "Говорил, что делать, Codex - делал :\)"/);
  assert.match(index, /els\.copyrightCredit\.title = t\("authorHint"\)/);
});

test("control panel sections are compact, collapsible and use consistent hover outlines", () => {
  assert.match(index, /\.brand \{[\s\S]*?margin-bottom: 0;/);
  assert.match(index, /\.section \{\s*padding: 12px 0;[\s\S]*?border-top: 1px solid var\(--line\)/);
  assert.match(index, /\.connections \{[\s\S]*?padding-top: 12px;/);
  assert.match(index, /\.section-heading,[\s\S]*?margin: 0 0 8px;/);
  assert.match(index, /\.connections-heading \{\s*margin-bottom: 7px;\s*\}/);
  assert.match(index, /\.start-time-fields \{[\s\S]*?margin-top: 0;[\s\S]*?margin-bottom: 10px;/);
  assert.match(index, /data-section-toggle aria-controls="formatContent"[\s\S]*?data-section-toggle aria-controls="parametersContent"[\s\S]*?data-section-toggle aria-controls="controlsContent"[\s\S]*?data-section-toggle aria-controls="browserList"/);
  assert.match(index, /function toggleControlSection\(button\)[\s\S]*?setControlSectionExpanded\(content, content\.hidden\)/);
  assert.match(index, /function setControlSectionExpanded\(content, expanded\)[\s\S]*?content\.hidden = !expanded[\s\S]*?updateSectionToggle\(button\)/);
  assert.match(index, /function updateSectionToggle\(button\)[\s\S]*?const label = t\(expanded \? "sectionHide" : "sectionShow"\)[\s\S]*?button\.setAttribute\("aria-label", label\)[\s\S]*?button\.title = label[\s\S]*?button\.textContent = ""/);
  assert.match(index, /\.section-toggle::before \{[\s\S]*?border: 1px solid currentColor/);
  assert.match(index, /\.section-toggle::after \{[\s\S]*?top: 7px;[\s\S]*?background: currentColor/);
  assert.match(index, /\.section-toggle\[aria-expanded="false"\]::after \{\s*top: 14px;/);
  assert.match(index, /\.section-toggle:hover \{\s*color: #a9b2c1;\s*\}/);
  assert.doesNotMatch(index, /\.section-toggle:hover \{[^}]*border-color:/);
  assert.match(index, /els\.controls\.addEventListener\("click"[\s\S]*?event\.target\.closest\("\[data-section-toggle\]"\)[\s\S]*?toggleControlSection\(button\)/);
  assert.match(index, /\.action:not\(:disabled\):hover,[\s\S]*?border-color: #f4f7fb;[\s\S]*?box-shadow: 0 0 0 1px/);
  assert.match(index, /\.reset:not\(:disabled\):hover \{\s*background: var\(--red\);\s*\}/);
  assert.match(index, /@media \(min-width: 901px\) and \(max-width: 1499px\),[\s\S]*?grid-template-columns: 320px minmax\(0, 1fr\)[\s\S]*?--controls-base-padding: 16px[\s\S]*?\.section \{ padding: 8px 0 10px; \}[\s\S]*?\.connections \{ margin-top: 10px; padding-top: 8px; \}[\s\S]*?\.diag-row \{ flex-wrap: wrap; \}[\s\S]*?\.diag-chip \{ padding: 1px 4px; font-size: 9px; \}/);
  assert.match(index, /@media \(min-width: 901px\) and \(max-width: 1499px\),[\s\S]*?\.start-list-diag-row \{ flex-wrap: nowrap; gap: 2px; margin-left: -3px; \}[\s\S]*?\.start-list-diag-row \.diag-chip \{ padding-inline: 3px; letter-spacing: 0; \}/);
  assert.match(index, /@media \(min-width: 901px\) and \(max-width: 1199px\),[\s\S]*?grid-template-columns: 280px minmax\(0, 1fr\)[\s\S]*?--controls-base-padding: 12px[\s\S]*?\.section \{ padding: 6px 0 8px; \}[\s\S]*?\.preset \{ font-size: 13px; \}/);
  assert.match(index, /@media \(min-width: 901px\) and \(max-width: 1199px\),[\s\S]*?\.connections \{ margin-top: 8px; padding-top: 6px; \}/);
  assert.match(index, /@media \(min-width: 901px\) and \(max-width: 1199px\),[\s\S]*?\.action \{ min-height: 38px; border-radius: 6px; font-size: 14px; \}/);
  assert.match(index, /\.diag-row:not\(\.start-list-diag-row\) \{ flex-wrap: nowrap; gap: 2px; margin-left: -3px; \}[\s\S]*?\.diag-row:not\(\.start-list-diag-row\) \.diag-chip \{ padding-inline: 3px; letter-spacing: 0; \}/);
  assert.match(index, /@media \(min-width: 901px\) and \(max-width: 1199px\),[\s\S]*?\.start-list-diag-row \{ flex-wrap: wrap; \}/);
  assert.match(index, /\.final-new-short \{\s*display: none;\s*\}/);
  assert.match(index, /@media \(min-width: 901px\) and \(max-width: 1199px\),[\s\S]*?\.final-new-full \{ display: none; \}[\s\S]*?\.final-new-short \{ display: inline; \}/);
  assert.match(index, /finalNewShort: "Нов\."[\s\S]*?finalNewShort: "New"/);
  assert.match(index, /const basePadding = parseFloat\(getComputedStyle\(els\.controls\)\.getPropertyValue\("--controls-base-padding"\)\) \|\| 20;[\s\S]*?basePadding - scrollbarWidth/);
});

test("start-list route incident controls render pause, stop, resume and cancellation states", () => {
  assert.match(index, /class="start-list-route-button"[\s\S]*?data-start-list-route/);
  assert.match(index, /const routeLabel = list\.routeCount === 1 \? \(language === "en" \? "R" : "T"\) : routeIndex \+ 1/);
  assert.match(index, /const singleRoute = list\.routeCount === 1;/);
  assert.match(index, /class="start-list-incident-title">\$\{singleRoute \? "" : escapeHtml\(formatStartListText\("startListRoute"/);
  assert.match(index, /data-start-list-incident-menu[\s\S]*?data-start-list-incident-cycle/);
  assert.match(index, /class="start-list-incident-controls"[\s\S]*?class="start-list-incident-cycle"[\s\S]*?class="start-list-incident-actions"/);
  assert.match(index, /routeIncidentStartCycleHint[\s\S]*?routeIncidentResumeCycleHint/);
  assert.match(index, /const cycleHint = activePause \? t\("routeIncidentResumeCycleHint"\) : t\("routeIncidentStartCycleHint"\)/);
  assert.match(index, /data-start-list-incident-cycle title="\$\{escapeHtml\(cycleHint\)\}"/);
  assert.match(index, /button\.classList\.toggle\("is-selected", Number\(button\.dataset\.startListRoute\) === routeIndex\)/);
  assert.match(index, /\.start-list-route-button\.is-selected \{[\s\S]*?border: 2px solid var\(--yellow\)/);
  assert.match(index, /data-start-list-incident-action="pause"[\s\S]*?data-start-list-incident-action="stop"/);
  assert.match(index, /data-start-list-incident-action="resume"/);
  assert.match(index, /editablePauseForRoute\([\s\S]*?cycleValue,[\s\S]*?position\.cycle/);
  assert.match(index, /editablePauseForRoute\([\s\S]*?cycle,[\s\S]*?currentStartListPosition\(\)\.cycle/);
  assert.match(index, /function updateStartListIncidentActions\(slot\)[\s\S]*?editablePauseForRoute\([\s\S]*?currentStartListPosition\(\)\.cycle[\s\S]*?startListIncidentActions\(activePause, stop\)/);
  assert.match(index, /data-start-list-incident-action="cancel-stop"/);
  assert.match(index, /FDVStartList\.participantAtOrAfterCycle[\s\S]*?kind: "pause"[\s\S]*?resumeCycle: null/);
  assert.match(index, /kind: "stop"[\s\S]*?startCycle: cycle/);
  assert.match(index, /action === "resume"[\s\S]*?resolution: "resume"[\s\S]*?action === "stop"[\s\S]*?resolution: "stop"/);
  assert.match(index, /action === "cancel-stop"[\s\S]*?resolution !== "stop"[\s\S]*?resumeCycle: null/);
  assert.match(index, /route-marker\.paused::before[\s\S]*?route-marker\.stopped::before/);
  assert.match(index, /th\.route-paused \.start-list-route-button[\s\S]*?border: 2px solid var\(--yellow\)[\s\S]*?box-shadow:/);
  assert.match(index, /th\.route-stopped \.start-list-route-button[\s\S]*?border: 2px solid var\(--red\)[\s\S]*?box-shadow:/);
  assert.match(index, /th\.route-paused-history \.start-list-route-button[\s\S]*?border: 2px solid rgba\(255, 200, 87, \.86\)/);
  assert.match(index, /th\.route-stopped-history \.start-list-route-button[\s\S]*?border: 2px solid rgba\(240, 90, 89, \.9\)/);
  assert.match(index, /startListRouteMenu: "Меню трассы"[\s\S]*?startListRouteMenu: "Route menu"/);
  assert.match(index, /const routeTitle = t\("startListRouteMenu"\);[\s\S]*?const routeAriaLabel = `\$\{routeTitle\}: \$\{routeIndex \+ 1\}`;[\s\S]*?title="\$\{escapeHtml\(routeTitle\)\}"[\s\S]*?aria-label="\$\{escapeHtml\(routeAriaLabel\)\}"/);
  assert.match(index, /data-start-list-incident-action="clear-pause"[\s\S]*?action === "clear-pause"/);
  assert.match(index, /\.start-list-incident-action\.resume \{ color: var\(--green\)/);
  assert.match(index, /data-start-list-incident-action="pause" title="\$\{escapeHtml\(t\("routeIncidentPause"\)\)\}" aria-label="\$\{escapeHtml\(t\("routeIncidentPause"\)\)\}"><\/button>/);
  assert.match(index, /data-start-list-incident-action="resume" title="\$\{escapeHtml\(t\("routeIncidentResume"\)\)\}" aria-label="\$\{escapeHtml\(t\("routeIncidentResume"\)\)\}"><\/button>/);
  assert.match(index, /\.start-list-incident-action\.pause::before,[\s\S]*?\.start-list-incident-action\.resume::before[\s\S]*?border-left: 11px solid currentColor[\s\S]*?\.start-list-incident-action\.stop::before/);
  assert.match(index, /\.start-list-file-button \{[^}]*color: #041217;[^}]*background: var\(--cyan\);/);
  assert.match(index, /\.start-list-file-button:hover,[\s\S]*?\.start-list-incident-action:not\(:disabled\):hover[\s\S]*?border-color: currentColor;[\s\S]*?box-shadow: 0 0 0 1px currentColor;/);
  assert.match(index, /\.start-list-file-button:hover \{\s*border-color: #b9f2ff;\s*box-shadow: 0 0 0 1px rgba\(185, 242, 255, \.9\);/);
  assert.match(index, /let startListRouteClickGuard = \{ key: "", until: 0 \};/);
  assert.match(index, /const clickKey = `\$\{index\}:\$\{routeIndex\}`;[\s\S]*?clickNow < startListRouteClickGuard\.until\) return;[\s\S]*?clickNow \+ 320/);
  assert.match(index, /let startListIncidentActionGuard = \{ key: "", until: 0 \};/);
  assert.match(index, /const openingIncidentMenu = startListIncidentSelections\[index\] !== routeIndex;[\s\S]*?startListIncidentActionGuard = \{ key: clickKey, until: clickNow \+ 500 \}/);
  assert.match(index, /const incidentAction = event\.target\.closest\("\[data-start-list-incident-action\]"\);[\s\S]*?event\.detail > 1[\s\S]*?performance\.now\(\) < startListIncidentActionGuard\.until\)\) return;/);
  assert.match(index, /class="start-list-incident-remove"[\s\S]*?data-start-list-incident-action="clear-pause"/);
  assert.match(index, /class="start-list-incident-remove"[\s\S]*?data-start-list-incident-action="cancel-stop"/);
  assert.match(index, /const pauseNotes = routePauses\.map[\s\S]*?data-start-list-incident-index="\$\{incidentIndex\}"[\s\S]*?<span>\$\{escapeHtml\(pauseNote\)\}<\/span>/);
  assert.match(index, /action === "clear-pause"[\s\S]*?incidents\[targetIndex\][\s\S]*?incidents\.splice\(targetIndex, 1\)/);
  assert.match(index, /start-list-add::before,[\s\S]*?start-list-add::after[\s\S]*?width: 18px;[\s\S]*?height: 4px;/);
  assert.match(index, /start-list-add \{ position: relative;/);
  assert.match(index, /position: absolute;[\s\S]*?top: 50%;[\s\S]*?left: 50%;/);
  assert.match(index, /start-list-add::after \{ transform: translate\(-50%, -50%\) rotate\(90deg\); \}/);
  assert.match(index, /start-list-clear::before \{ transform: translate\(-50%, -50%\) rotate\(45deg\); \}[\s\S]*?start-list-clear::after \{ transform: translate\(-50%, -50%\) rotate\(-45deg\); \}/);
  assert.match(index, /start-list-incident-close::before[\s\S]*?content: "×";[\s\S]*?transform: translateY\(1px\);/);
  assert.match(index, /start-list-incident-remove::before,[\s\S]*?start-list-incident-remove::after[\s\S]*?width: 13px;[\s\S]*?height: 3px;/);
  assert.match(index, /start-list-incident-remove::before \{ transform: translate\(-50%, -50%\) rotate\(45deg\); \}[\s\S]*?start-list-incident-remove::after \{ transform: translate\(-50%, -50%\) rotate\(-45deg\); \}/);
  assert.match(index, /function rememberStartListScrollPositions\(nextLists\)[\s\S]*?querySelectorAll\("\[data-start-list-index\]"\)[\s\S]*?const pending = pendingStartListScrollRestores\[index\][\s\S]*?listKey: JSON\.stringify\(lists\[index\]\)[\s\S]*?top: pending\?\.top \?\? scroll\.scrollTop[\s\S]*?left: pending\?\.left \?\? scroll\.scrollLeft/);
  assert.match(index, /function replaceCanonicalStartLists\(nextLists, options = \{\}\)[\s\S]*?JSON\.stringify\(nextLists\) !== JSON\.stringify\(state\.startLists\)[\s\S]*?rememberStartListScrollPositions\(nextLists\)[\s\S]*?state\.startLists = nextLists;[\s\S]*?startListDataRevision \+= 1;[\s\S]*?lastStartListRenderKey = "";/);
  assert.match(index, /pendingScroll\?\.listKey === JSON\.stringify\(list\)[\s\S]*?pendingStartListScrollRestores\[index\] !== pendingScroll\) return;[\s\S]*?scroll\.scrollTop = pendingScroll\.top;[\s\S]*?scroll\.scrollLeft = pendingScroll\.left;/);
  assert.match(index, /function ensureStartListStructure\(\)[\s\S]*?rememberStartListScrollPositions\(state\.startLists\);[\s\S]*?existingIndexes\.has\(index\)[\s\S]*?lastStartListScrollAnchors\[index\] = null/);
  assert.match(index, /const previousScroll = \{ top: scroll\.scrollTop, left: scroll\.scrollLeft \};[\s\S]*?else \{[\s\S]*?scroll\.scrollTop = previousScroll\.top;[\s\S]*?scroll\.scrollLeft = previousScroll\.left;/);
  assert.match(index, /const autoScrollKey = `\$\{position\.cycle\}:\$\{position\.phase\}:\$\{anchor\}`;[\s\S]*?autoScrollKey !== lastStartListScrollAnchors\[index\]/);
  assert.match(index, /visible && !wasVisible[\s\S]*?startListInitialAutoScrollPending = true;[\s\S]*?lastStartListScrollAnchors\[index\] = null;[\s\S]*?pendingStartListScrollRestores\[index\]\?\.listKey !== JSON\.stringify\(list\)[\s\S]*?pendingStartListScrollRestores\[index\] = null;/);
  assert.match(index, /function persistStartListScrollPositions\(\)[\s\S]*?clearTimeout\(startListScrollPersistTimer\)[\s\S]*?listKey: JSON\.stringify\(list\)[\s\S]*?top: scroll\.scrollTop[\s\S]*?left: scroll\.scrollLeft[\s\S]*?safeStorageSet\("sessionStorage", startListScrollPreferenceKey, JSON\.stringify\(positions\)\)/);
  assert.match(index, /function scheduleStartListScrollPersistence\(\)[\s\S]*?clearTimeout\(startListScrollPersistTimer\)[\s\S]*?window\.setTimeout\([\s\S]*?persistStartListScrollPositions\(\)[\s\S]*?150\)/);
  assert.match(index, /function loadStoredStartListScrollPositions\(\)[\s\S]*?standaloneMode \|\| isPrimaryClient[\s\S]*?position\?\.listKey !== JSON\.stringify\(list\)[\s\S]*?pendingStartListScrollRestores\[index\]/);
  assert.match(index, /function renderStartList\(\) \{\s*loadStoredStartListScrollPositions\(\);\s*updateStartListVisibility\(\);/);
  assert.match(index, /els\.startListLayout\.addEventListener\("scroll", scheduleStartListScrollPersistence, true\)/);
  assert.match(index, /window\.addEventListener\("pagehide", \(\) => \{\s*invalidateSignalsForPageSuspension\("pagehide"\);\s*persistStartListScrollPositions\(\);/);
  assert.match(index, /function scheduleStartListAnchorScroll\(scroll, anchor, left, settleLayout = false\)[\s\S]*?Math\.floor\(\(scroll\.clientHeight - headerHeight\) \/ sampleRowHeight\) - 1[\s\S]*?prioritizedScrollAnchor\(anchor, highlightedIndexes, visibleRowCount\)[\s\S]*?scroll\.scrollTop = Math\.max\(0, scroll\.scrollTop \+ rowRect\.top - scrollRect\.top - headerHeight\)[\s\S]*?settleLayout && pass < 6[\s\S]*?requestAnimationFrame\(applyAnchor\)/);
  assert.match(index, /const titleBar = `<div class="start-list-title-bar" data-start-list-title hidden><\/div>`;[\s\S]*?\$\{controls\}\$\{titleBar\}\$\{incidentMenu\}<div class="start-list-scroll"/);
  assert.match(index, /titleBar\.textContent = list\.title \|\| "";[\s\S]*?titleBar\.hidden = !list\.title/);
  assert.match(index, /const settleInitialAutoScroll = startListInitialAutoScrollPending;[\s\S]*?startListInitialAutoScrollPending = false;[\s\S]*?scheduleStartListAnchorScroll\(scroll, anchor, previousScroll\.left, settleInitialAutoScroll\)/);
  assert.match(index, /function formatRoutePauseState\(incident, cycle\)[\s\S]*?incident\.resumeCycle === null[\s\S]*?routeIncidentPausedFrom[\s\S]*?routeIncidentPausedRange/);
  assert.match(index, /function startListIncidentActionState\(activePause, stop\)[\s\S]*?return activePause \? "resume" : "pause"/);
  assert.match(index, /data-start-list-incident-action-state="\$\{actionState\}"/);
  assert.match(index, /actions\.dataset\.startListIncidentActionState !== actionState[\s\S]*?actions\.innerHTML = startListIncidentActions\(activePause, stop\)/);
  assert.match(index, /FDVStartList\.editablePauseForRoute\([\s\S]*?currentStartListPosition\(\)\.cycle/);
  assert.match(index, /function clearStartListIncidentsForNewRound\(\)[\s\S]*?incidents: _incidents[\s\S]*?replaceCanonicalStartLists\(nextStartLists/);
  assert.match(index, /function resetStandaloneTimer\([\s\S]*?clearStartListIncidentsForNewRound\(\)/);
  assert.match(index, /function startTimerByTime\([\s\S]*?if \(standaloneMode\)[\s\S]*?clearStartListIncidentsForNewRound\(\)/);
  assert.match(server, /const clearIncidentsForNewRound = type === "reset"[\s\S]*?type === "start"[\s\S]*?body\.startMode === "scheduled"[\s\S]*?clearStartListIncidents\(\)/);
  assert.match(index, /FDVStartList\.marker\(calculationParticipantIndex, routeIndex, position\.cycle, position\.phase, incidents, schedule\)/);
});

test("the leftmost row cell toggles a participant's protocol exclusion", () => {
  assert.match(index, /startListExcludeParticipant: "Исключить участника из списка\?"/);
  assert.match(index, /const exclusionControl = canManageIncidents && columnIndex === 0;[\s\S]*?data-start-list-participant-exclusion="\$\{participantIndex\}"[\s\S]*?title="\$\{escapeHtml\(exclusionTitle\)\}"/);
  assert.match(index, /td\[data-start-list-participant-exclusion\]:hover,[\s\S]*?outline: 2px solid #ff4b50;[\s\S]*?background-color: rgba\(240, 90, 89, \.18\) !important/);
  assert.match(index, /tr\.is-excluded td\[data-start-list-participant-exclusion\]:hover,[\s\S]*?outline-color: var\(--green\);[\s\S]*?background-color: rgba\(38, 208, 124, \.18\) !important/);
  assert.doesNotMatch(index, /routeIndex === list\.routeCount - 1/);
  assert.match(index, /tr\.is-excluded td::after[\s\S]*?height: 1px;[\s\S]*?background: #ff4b50/);
  assert.match(index, /const marker = excluded \? "" : window\.FDVStartList\.marker/);
  assert.match(index, /function toggleStartListParticipantExclusion[\s\S]*?excludedParticipants\.includes\(participantIndex\)[\s\S]*?commitStartLists/);
  assert.match(index, /addEventListener\("keydown"[\s\S]*?event\.key !== "Enter" && event\.key !== " "/);
  assert.match(index, /participantScheduleIndex\(participantIndex, excludedParticipants, list\.rows\.length\)/);
  assert.match(index, /rebaseIncidents\(list\?\.incidents, list\?\.excludedParticipants, list\?\.rows\?\.length\)/);
  assert.match(index, /function startListExclusionsChanged\(currentList, nextList\)[\s\S]*?normalizeExcludedParticipants[\s\S]*?currentExcluded[\s\S]*?nextExcluded/);
  assert.match(index, /startListExclusionsChanged\(state\.startLists\[index\], lists\[index\]\)[\s\S]*?pendingStartListScrollRestores\[index\] = null;[\s\S]*?lastStartListScrollAnchors\[index\] = null/);
});

test("incident cycle hover and focus outline the matching route cell", () => {
  assert.match(index, /data-start-list-incident-cycle-control/);
  assert.match(index, /data-start-list-route-cell="\$\{routeIndex\}"/);
  assert.match(index, /function updateStartListIncidentCyclePreview\(control\)/);
  assert.match(index, /FDVStartList\.participantAtOrAfterCycle\([\s\S]*?data-start-list-route-cell/);
  assert.match(index, /action === "pause"[\s\S]*?FDVStartList\.participantAtOrAfterCycle\([\s\S]*?incidents\.push\(\{ kind: "pause"/);
  assert.match(index, /addEventListener\("pointerover"[\s\S]*?updateStartListIncidentCyclePreview/);
  assert.match(index, /addEventListener\("focusin"[\s\S]*?updateStartListIncidentCyclePreview/);
  assert.match(index, /addEventListener\("input"[\s\S]*?updateStartListIncidentCyclePreview/);
  assert.match(index, /td\.route-cell\.is-incident-cycle-preview[\s\S]*?box-shadow: inset 0 0 0 2px var\(--cyan\)/);
  assert.match(index, /startListIncidentPreviewTriggerSelector[\s\S]*?data-start-list-incident-action=\\"pause\\"[\s\S]*?data-start-list-incident-action=\\"resume\\"[\s\S]*?data-start-list-incident-action=\\"stop\\"/);
  assert.match(index, /function startListIncidentCycleControlForTrigger\(trigger\)[\s\S]*?data-start-list-incident-cycle-control/);
});

test("timer phase background is confined to the timer column", () => {
  assert.match(index, /body \{[\s\S]*?background: #0e1116;/);
  assert.match(index, /\.controls \{[\s\S]*?background: #171b22;/);
  assert.match(index, /\.timer-column \{[\s\S]*?background: var\(--timer-rotation-bg\);/);
  assert.match(index, /body\.warning-active \.timer-column[\s\S]*?body\.countdown-active \.timer-column[\s\S]*?body\.break-active \.timer-column/);
  assert.doesNotMatch(index, /body\.(?:warning|countdown|break)-active\s*\{/);
  assert.doesNotMatch(index, /body\.break-active \.controls/);
});

test("viewer timer uses the Legacy-like narrow gutter beside visible protocols", () => {
  assert.match(index, /body\.start-list-visible\.viewer-mode \.timer-column,[\s\S]*?body\.start-list-visible\.fullscreen \.timer-column \{ padding: clamp\(8px, 1vw, 14px\); \}/);
});

test("mobile controls keep compact multi-column grids", () => {
  assert.match(index, /\.preset-grid \{\s*display: grid;\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(index, /\.field-grid \{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(index, /\.actions \{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.doesNotMatch(index, /@media \(max-width: 560px\) \{\s*\.(?:field-grid|preset-grid|actions)/);
});

test("enabled format buttons get a yellow hover outline", () => {
  assert.match(index, /\.preset:not\(\.active\):not\(\.format-locked\):not\(:disabled\):hover \{[\s\S]*?border-color: var\(--yellow\);[\s\S]*?box-shadow: 0 0 0 2px rgba\(255, 200, 87, \.4\);/);
});

test("portrait phones stack the timer above compact protocol windows", () => {
  assert.match(index, /@media \(max-width: 560px\) and \(orientation: portrait\) \{[\s\S]*?body\.start-list-visible \.stage-main \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?grid-template-rows: minmax\(300px, 42dvh\) auto auto;/);
  assert.match(index, /body\.start-list-visible \.timer-column \{[\s\S]*?min-height: 300px;[\s\S]*?padding: 12px;/);
  assert.match(index, /body\.start-list-visible \.start-list-panel \{[\s\S]*?width: 100% !important;[\s\S]*?max-width: 100% !important;/);
  assert.match(index, /body\.start-list-visible \.timer-wrap \{\s*min-height: 0;\s*height: 100%;/);
  assert.match(index, /body\.start-list-visible \.start-list-layout \{[\s\S]*?flex-direction: column;/);
  assert.match(index, /body\.start-list-visible \.start-list-scroll \{[\s\S]*?max-height: var\(--start-list-mobile-table-height/);
  assert.match(index, /const highlightedRows = \[\.\.\.scroll\.querySelectorAll\("tbody tr\.is-active, tbody tr\.is-ready"\)\][\s\S]*?const highlightedSpan = highlightedIndexes\.length[\s\S]*?Math\.max\(6, Math\.min\(12, highlightedSpan \+ 4\)\)[\s\S]*?--start-list-mobile-row-count/);
  assert.match(index, /const tableHead = scroll\.querySelector\("thead"\);[\s\S]*?measuredHeaderHeight[\s\S]*?measuredRowHeight[\s\S]*?--start-list-mobile-table-height/);
});

test("mobile standalone controls collapse without reserving a viewport-height gap", () => {
  assert.match(index, /@media \(max-width: 900px\) \{[\s\S]*?\.controls \{[\s\S]*?min-height: 0;[\s\S]*?\.control-footer \{\s*margin-top: 0;/);
  assert.match(index, /window\.matchMedia\?\.\("\(max-width: 560px\)"\)\?\.matches[\s\S]*?els\.browserList\.hidden = true;/);
});

test("single-file standalone variants expose only applicable controls and notices", () => {
  assert.match(index, /body\.web-standalone \.server-connection-warning\[data-state="standalone"\][\s\S]*?align-content: center;[\s\S]*?justify-items: center;[\s\S]*?margin-top: 8px;[\s\S]*?text-align: center/);
  assert.match(index, /body\.web-standalone \.server-connection-warning\[data-state="standalone"\] \.server-connection-actions,[\s\S]*?\.install-hint \{\s*display: none;/);
  assert.match(index, /body\.web-standalone[\s\S]*?#serverConnectionWarningText,[\s\S]*?body\.file-mode #primaryRow,[\s\S]*?body\.file-mode #primaryPinPanel[\s\S]*?display: none/);
  assert.match(standaloneBuilder, /path\.normalize\(outputPath\) === path\.normalize\(path\.join\(root, "docs", "standalone\.html"\)\)/);
  assert.match(standaloneBuilder, /window\.FDV_WEB_STANDALONE = \$\{webStandalone\}/);
});

test("mobile timer footer keeps cycle controls clear of neutral compact actions", () => {
  assert.match(index, /\.compact-actions \{[\s\S]*?margin: 0;[\s\S]*?border-top: 1px solid var\(--line\);[\s\S]*?background: #171b22;/);
  assert.match(index, /<\/footer>\s*<\/div>\s*<div class="compact-actions">/);
  assert.match(index, /id="compactStart"[\s\S]*?id="compactPause"[\s\S]*?id="compactReset"[\s\S]*?id="compactFull"/);
  assert.match(index, /\[els\.fullBtn, els\.compactFull\]\.forEach\(\(button\) => button\.addEventListener\("click", toggleFullscreen\)\)/);
  assert.match(index, /window\.matchMedia\?\.\("\(max-width: 560px\) and \(orientation: portrait\)"\)\?\.matches[\s\S]*?setControlSectionExpanded\(els\.controlsContent, false\)/);
  assert.match(index, /body\.start-list-visible\.fullscreen \.stage-main,[\s\S]*?body\.start-list-visible\.viewer-mode \.stage-main \{[\s\S]*?grid-template-rows: clamp\(150px, 26dvh, 190px\) minmax\(0, 1fr\)/);
});

test("phone orientation opens controls and preserves a timer-focused scroll", () => {
  assert.match(index, /function rememberPhoneTimerScrollPosition\(\)[\s\S]*?phonePortraitWasAtTimer = window\.scrollY \+ window\.innerHeight >= documentHeight - 24/);
  assert.match(index, /function applyPhoneOrientationLayout\(\)[\s\S]*?changedFromPortraitToLandscape[\s\S]*?setControlSectionExpanded\(els\.controlsContent, true\)[\s\S]*?requestAnimationFrame\(scrollPhoneToTimer\)/);
  assert.match(index, /window\.addEventListener\("scroll", rememberPhoneTimerScrollPosition, \{ passive: true \}\)/);
});

test("one portrait protocol fills the ordinary phone viewport", () => {
  assert.match(index, /body\.start-list-visible\.start-list-single:not\(\.fullscreen\):not\(\.viewer-mode\) \.stage-main \{[\s\S]*?grid-template-rows: minmax\(300px, 42dvh\) auto minmax\(0, 1fr\);[\s\S]*?overflow: hidden;/);
  assert.match(index, /body\.start-list-visible\.start-list-single:not\(\.fullscreen\):not\(\.viewer-mode\) \.start-list-scroll \{[\s\S]*?max-height: none;[\s\S]*?flex: 1 1 auto;/);
  assert.match(index, /document\.body\.classList\.toggle\("start-list-single", visible && visibleEntries\.length === 1\)/);
});

test("screen modes remove protocol management and fill the remaining phone height", () => {
  assert.match(index, /body\.fullscreen \.start-list-panel-controls,[\s\S]*?body\.viewer-mode \.start-list-incident-menu,[\s\S]*?:fullscreen \.start-list-panel-controls[\s\S]*?display: none !important/);
  assert.match(index, /function startListManagementVisible\(\)[\s\S]*?!document\.body\.classList\.contains\("fullscreen"\)[\s\S]*?!document\.fullscreenElement/);
  assert.match(index, /const controlsVisible = startListManagementVisible\(\)/);
  assert.match(index, /document\.body\.classList\.add\("fullscreen"\);\s*refreshStartListScreenMode\(\)/);
  assert.match(index, /body\.start-list-visible\.fullscreen \.start-list-panel,[\s\S]*?body\.start-list-visible\.viewer-mode \.start-list-panel \{[\s\S]*?overflow-y: auto/);
  assert.match(index, /body\.start-list-visible\.fullscreen \.start-list-scroll,[\s\S]*?body\.start-list-visible\.viewer-mode \.start-list-scroll \{[\s\S]*?max-height: none;[\s\S]*?flex: 1 1 auto/);
  assert.match(index, /body\.start-list-visible\.fullscreen \.start-list-slot,[\s\S]*?body\.start-list-visible\.viewer-mode \.start-list-slot \{[\s\S]*?min-height: 220px;[\s\S]*?flex: 1 1 var\(--start-list-mobile-slot-height, 220px\) !important/);
  assert.match(index, /body\.start-list-visible\.fullscreen \.start-list-table,[\s\S]*?body\.start-list-visible\.viewer-mode \.start-list-table \{[\s\S]*?width: 100%;[\s\S]*?table-layout: auto/);
  assert.match(index, /const mobileRowCount = Math\.min\(list\.rows\.length, Math\.max\(6, Math\.min\(12, highlightedSpan \+ 4\)\)\)/);
  assert.match(index, /const mobileTitleHeight = titleBar && !titleBar\.hidden[\s\S]*?--start-list-mobile-slot-height/);
});

test("excluded participant strike stays below sticky protocol headers", () => {
  assert.match(index, /\.start-list-table th \{[\s\S]*?z-index: 2;/);
  assert.match(index, /\.start-list-table tr\.is-excluded td::after \{[\s\S]*?z-index: 1;/);
});

test("landscape phones use their actual viewport height for the timer stage", () => {
  assert.match(index, /@media \(max-width: 900px\) and \(orientation: landscape\) \{[\s\S]*?\.stage \{[\s\S]*?min-height: 100dvh;[\s\S]*?grid-template-rows: 1fr;[\s\S]*?\.timer-column \{[\s\S]*?padding: clamp\(8px, 2dvh, 14px\)/);
});

test("primary PIN button highlights its outline on hover", () => {
  assert.match(index, /\.primary-pin-button:not\(:disabled\):hover,[\s\S]*?border-color: var\(--cyan\);[\s\S]*?box-shadow: 0 0 0 1px rgba\(73, 198, 229, \.65\)/);
});

test("Final controls expose old and new start-list schedules without a break field", () => {
  assert.match(index, /id="finalRoundFormatField"[\s\S]*?name="finalRoundFormat" value="old"[\s\S]*?name="finalRoundFormat" value="new"/);
  assert.match(index, /id="finalRestRotations" type="number" min="1" max="9"[\s\S]*?value="3"/);
  assert.match(index, /els\.breakParameterField\.hidden = finalMode;[\s\S]*?els\.finalRoundFormatField\.hidden = !finalMode;[\s\S]*?finalRoundFormat !== "new"/);
  assert.match(index, /function startListSchedule\(list\)[\s\S]*?finalFormat:[\s\S]*?restRotations:[\s\S]*?participantCount:/);
  assert.match(index, /const breakSeconds = finalMode \? 0/);
  assert.match(index, /const timerParametersLocked = \(state\.running && !beforeScheduledStart\)[\s\S]*?finalRoundProgressLocked\(\);[\s\S]*?climbMinutes\.disabled = !available \|\| timerParametersLocked[\s\S]*?finalRoundFormatInputs/);
  assert.match(index, /function finalRoundProgressLocked\(\)[\s\S]*?startListFinalCycle[\s\S]*?completedCycles > 0/);
  assert.match(index, /function formatSelectionLocked\(\)[\s\S]*?waitingForManualStart[\s\S]*?finalRoundProgressLocked\(\)/);
  assert.match(index, /finalPresetLockedHint: 'Чтобы выбрать другой формат, сначала остановите таймер кнопкой "Стоп" и перейдите на Цикл 1'/);
  assert.match(index, /finalRoundFormatField\.title = t\("finalRoundFormatHint"\)[\s\S]*?finalRestField\.title = t\("finalRestRotationsHint"\)[\s\S]*?finalRestRotations\.title/);
  assert.match(index, /applyLanguage\(language\);\s*\n\s*const fileMode = isLocalStandalonePage\(\);/);
  assert.match(index, /\.final-round-option input:checked \{[\s\S]*?background-image: linear-gradient\(var\(--text\), var\(--text\)\)/);
  assert.match(index, /\.final-round-format-field \{\s*display: grid;\s*gap: 5px;\s*align-content: start;/);
  assert.match(index, /async function hardReset\(shouldSignal = true\) \{[\s\S]*?if \(isBeforeScheduledStart\(\)\) \{\s*await toggleScheduledCountdown\(\);\s*return;/);
  assert.match(index, /const completedFinalAttempt = state\.runtimePreset === "final"[\s\S]*?state\.running && !state\.countdownOnly/);
  assert.match(server, /const advanceCompletedFinalList = Boolean\([\s\S]*?timerState\.running && !timerState\.countdownOnly/);
});

test("diagnostic roles and statuses are translated from stable keys", () => {
  assert.match(index, /diagnosticPrimary: "Основной", diagnosticScreen: "Экран"/);
  assert.match(index, /diagnosticPrimary: "Primary", diagnosticScreen: "Screen"/);
  assert.match(index, /displayStatus: diagnosticDisplayStatusKey\(\)/);
  assert.match(index, /diagnosticStatusLabel\(client\.displayStatus\)/);
  assert.match(index, /diagnosticRoleLabel\(client\.role\)/);
  assert.match(index, /render\("language"\);\s*renderBrowserList\(lastKnownClients\);\s*refreshStandaloneBrowserList\(\);/);
  assert.match(server, /return running \? "roundRunning" : "pause";/);
  assert.match(server, /role: client\.legacyViewer \? "screen"[\s\S]*?\? "primary" : "screen"/);
  assert.doesNotMatch(server, /role: client\.legacyViewer \? "Экран"/);
});

test("rotation metadata is visually quieter than the other metadata panels", () => {
  assert.match(index, /#rotationMeta \{\s*background: rgba\(23, 27, 34, \.42\);\s*\}/);
});

test("build number uses a guarded two-click GitHub link", () => {
  assert.match(index, /const projectUrl = "https:\/\/github\.com\/dfedorov-arch\/fdv-bouldering-timer";/);
  assert.match(index, /const buildLinkConfirmDelayMs = 550;/);
  assert.match(index, /if \(!buildLinkArmed\) \{[\s\S]*?buildLinkArmed = true;[\s\S]*?renderBuildInfo\(\);/);
  assert.match(index, /if \(now - buildLinkArmedAt < buildLinkConfirmDelayMs\) \{\s*event\.preventDefault\(\);\s*return;\s*\}/);
  assert.match(index, /id="buildInfo"[\s\S]*?target="_blank" rel="noopener"/);
  assert.match(index, /if \(!buildLinkArmed\) \{\s*event\.preventDefault\(\);/);
  assert.doesNotMatch(index, /window\.open\(projectUrl/);
  assert.match(index, /\.build-info\.armed \{[\s\S]*?border-color: var\(--line\);/);
  assert.match(index, /\.build-separator \{\s*margin-left: 2px;\s*\}/);
  assert.match(index, /\.build-info \{[\s\S]*?margin-left: 0;/);
  assert.match(index, /\.build-info \{[\s\S]*?min-height: 22px;[\s\S]*?padding: 1px 4px;/);
  assert.match(index, /\.author-link \{[\s\S]*?min-height: 22px;[\s\S]*?padding: 1px 4px;/);
  assert.match(index, /\.build-info:not\(\.armed\):hover \{\s*color: var\(--text\);\s*\}/);
  assert.match(index, /\.build-info\.armed:hover,[\s\S]*?border-color: var\(--cyan\);[\s\S]*?color: var\(--text\);/);
  const buildHoverRule = index.match(/\.build-info\.armed:hover,[\s\S]*?\n    \}/)?.[0] || "";
  assert.doesNotMatch(buildHoverRule, /font-weight:/);
  assert.match(index, /if \(event\.target\.closest\("#buildInfo, #authorName"\)\) return;\s*deactivateBuildProjectLink\(\);\s*deactivateAuthorEmailLink\(\);/);
});

test("progress animation stays on the compositor and is updated at a lower rate", () => {
  assert.match(index, /const progressUpdateIntervalMs = 250;/);
  assert.match(index, /transform: scaleX\(0\);/);
  assert.match(index, /transition: transform \.25s linear;/);
  assert.match(index, /els\.progressBar\.style\.transform = `scaleX\(\$\{scale\}\)`;/);
  assert.doesNotMatch(index, /els\.progressBar\.style\.width =/);
});

test("static runtime metadata is cached separately from timer digits", () => {
  assert.match(index, /if \(runtimeMetaKey !== lastRuntimeMetaKey\)/);
  assert.match(index, /setDisplayTime\(remaining\);\s*const runtimeMetaKey/);
  assert.match(index, /setProgressWidth\(donePercent, progressSegmentChanged \|\| isScrubbing\);/);
});

test("server synchronization preserves a held progress scrub preview", () => {
  assert.match(index, /function preserveActiveScrubPreview\(remote\)/);
  assert.match(index, /if \(!isScrubbing \|\| !Number\.isFinite\(pendingSeekElapsed\)\) return;/);
  assert.match(index, /state\.elapsedBeforePause = pendingSeekElapsed;/);
  assert.equal((index.match(/preserveActiveScrubPreview\(remote\);/g) || []).length, 2);
  assert.equal((index.match(/if \(!isScrubbing\) saveOfflineSnapshot\(\);/g) || []).length, 2);
});

test("desktop audio calibration scrolls its editor into view", () => {
  assert.match(index, /const interactive = \/\\sdata-\(\?:audio-client\|legacy-mode-client\|server-time-client\)=\//);
  assert.match(index, /const tagName = interactive \? "button" : "span";/);
  assert.match(index, /toggleNow - lastAudioChipToggleAt < 300/);
  assert.match(index, /function revealAudioOffsetEditor\(\)/);
  assert.match(index, /editor\.scrollIntoView\(\{ block: "nearest", inline: "nearest" \}\);/);
  assert.match(index, /renderBrowserList\(lastKnownClients\);\s*revealAudioOffsetEditor\(\);/);
});

test("audio unlock does not replace a diagnostic button during pointerdown", () => {
  assert.match(index, /async function unlockAudio\(refreshDiagnostics = true\)/);
  assert.match(index, /unlockAudio\(eventName === "click"\);/);
});

test("timer fitting avoids a resize feedback loop and repeated binary-search layouts", () => {
  assert.doesNotMatch(index, /for \(let i = 0; i < 13; i \+= 1\)/);
  assert.match(index, /const scale = Math\.min\(maxWidth \/ timeRect\.width, maxHeight \/ timeRect\.height\);/);
  assert.match(index, /if \(minuteDigitsChanged\) scheduleFitTimer\(\);/);
  assert.match(index, /Math\.abs\(entry\.contentRect\.width - lastTimerFitContainerWidth\) > 2/);
  assert.match(index, /window\.addEventListener\("orientationchange", scheduleOrientationFits\);/);
});

test("a delayed boundary callback renders current server time and rearms itself", () => {
  assert.match(index, /displayBoundaryTimer = window\.setTimeout\(\(\) => \{/);
  assert.match(index, /checkClockContinuity\(\);[\s\S]*?lastRenderDelayMs =[\s\S]*?render\("boundary"\);/);
  assert.match(index, /function render\(renderSource = "direct"\)[\s\S]*?lastRenderAt = performance\.now\(\);\s*scheduleDisplayBoundary\(\);/);
});

test("diagnostics report signed render-boundary error and apply the requested thresholds", () => {
  assert.match(index, /clientBuild: pageBuildNumber,[\s\S]*?renderDelay: Number\.isFinite\(lastRenderDelayMs\)/);
  assert.match(index, /lastRenderDelayMs = Number\(\(callbackServerTime - targetServerTime\)\.toFixed\(1\)\)/);
  assert.match(index, /function renderDelayStatus\(value\)[\s\S]*?Math\.abs\(number\)[\s\S]*?absoluteDelay > 250[\s\S]*?absoluteDelay >= 100/);
  assert.match(index, /const syncStatus = worstDiagnosticStatus\([\s\S]*?worstDiagnosticStatus\(baseSyncStatus, currentRenderStatus\),[\s\S]*?serverClockStatus/);
  assert.match(server, /renderDelay: optionalNumber\(sourceValue\(source, "renderDelay"\)/);
  assert.match(server, /renderDelayAge: optionalNumber\(sourceValue\(source, "renderDelayAge"\)/);
});

test("timer time remains derived from the synchronized server clock", () => {
  assert.match(index, /return Math\.max\(0, \(serverNow\(\) - state\.serverStartedAt\) \/ 1000\);/);
  assert.match(index, /source\.start\(start\);/);
});

test("a suspended performance clock is repaired without replacing the server clock", () => {
  assert.match(index, /const clockContinuityMismatchMs = 100;/);
  assert.match(index, /const trustedClockAnchorIntervalMs = 60000;/);
  assert.match(index, /perfNow - trustedServerClockAnchor\.perfAt/);
  assert.match(index, /trustedServerClockAnchor\.serverAt \+ trustedWallDelta/);
  assert.match(index, /applyServerClockModel\(estimatedServerTime, serverClockRate, true\);/);
  assert.match(index, /\(Number\.isFinite\(savedServerNow\) \? savedServerNow : savedAtWall\)\s*\+ age;/);
  assert.doesNotMatch(index, /age \* restoredRate/);
  assert.match(index, /syncSamples = \[\];\s*resetServerClockRateConfirmation\(\);/);
  assert.match(index, /const refreshAudioSchedule = resetStaleSignals \|\| invalidatedWhileHidden/);
  assert.match(index, /rescheduleStandaloneSignals\(\{[\s\S]*?forceStopAudio:\s*true,[\s\S]*?includeRecentPhaseSignal/);
  assert.match(index, /await syncFromServer\(\{[\s\S]*?replaceAudioSchedule:\s*refreshAudioSchedule/);
});

test("iOS audio falls back when its decoded-buffer context is not running", () => {
  assert.match(index, /if \(audioContext\.state !== "running" && audioContext\.state !== "closed"\)/);
  assert.match(index, /if \(!canPlaySound\(\) \|\| !audioContext \|\| audioContext\.state !== "running"\) return false;/);
  assert.doesNotMatch(index, /if \(audioUnlocked\) return;/);
});

test("standalone iOS reuses gesture-authorized HTML audio for every manual start", () => {
  assert.match(index, /const iosAudioWorkaroundEnabled = \/iPad\|iPhone\|iPod\/i/);
  assert.match(index, /function playImmediateGestureAudio\(kind\)/);
  assert.match(index, /standaloneMode && iosAudioWorkaroundEnabled && playImmediateGestureAudio\("start"\)/);
  assert.match(index, /unlockSource\.buffer = audioContext\.createBuffer\(1, 1, 22050\);/);
});

test("all standalone iOS signals keep the authorized media element and server scheduler", () => {
  assert.match(index, /immediateGestureAudio\.src = source;\s*immediateGestureAudioSource = source;/);
  assert.match(index, /standaloneMode && iosAudioWorkaroundEnabled && audioKinds\.includes\(kind\) && delaySeconds === 0/);
  assert.match(index, /if \(standaloneMode && iosAudioWorkaroundEnabled\) \{\s*bufferLastFailure = "ios-html-audio";\s*updatePerformancePendingAudioPlan\(signalKey, \{ bufferLastFailure \}\);\s*return false;\s*\}[\s\S]*?if \(scheduledByBuffer\)/);
  assert.match(index, /scheduleServerTimeoutAt\(targetServerTime, \(\) => \{[\s\S]*?scheduleGeneration === audioScheduleGeneration[\s\S]*?beep\(kind\)/);
});

test("a short mobile sleep cannot leave rendering permanently frozen", () => {
  assert.match(index, /function markResumeDisplayStale\(\) \{[\s\S]*?beginResumeSnapPending\(\);/);
  assert.match(index, /if \(!resetStaleSignals && resumeSnapPending\) clearResumeSnapPending\(false\);/);
  assert.doesNotMatch(index, /!resetStaleSignals && \(resumeSyncInProgress \|\| resumeSnapPending\)/);
});

test("page suspension invalidates stale audio and rebuilds only semantically current signals", () => {
  assert.match(index, /let audioScheduleGeneration = 0;/);
  assert.match(index, /let signalsInvalidatedWhileHidden = false;/);
  assert.match(index, /function stopActiveHtmlAudio\(\)[\s\S]*?audio\.pause\(\)[\s\S]*?audio\.currentTime = 0[\s\S]*?activeHtmlAudio = \[\]/);
  assert.match(index, /function clearSignalTimers\([^)]*\) \{[\s\S]*?if \(forceStopAudio\) \{\s*audioScheduleGeneration \+= 1;\s*stopActiveHtmlAudio\(\)/);
  assert.match(index, /function beepSynthetic\([^)]*\)[\s\S]*?scheduledAudioNodes\.push\(item\);\s*osc\.onended/);
  assert.match(index, /scheduleGeneration !== audioScheduleGeneration[\s\S]*?bufferLastFailure = "schedule-invalidated"/);
  assert.match(index, /document\.addEventListener\("visibilitychange"[\s\S]*?invalidateSignalsForPageSuspension\("visibility-hidden"\)/);
  assert.match(index, /window\.addEventListener\("pagehide"[\s\S]*?invalidateSignalsForPageSuspension\("pagehide"\)/);
  assert.match(index, /document\.addEventListener\("freeze"[\s\S]*?invalidateSignalsForPageSuspension\("freeze"\)/);
  assert.match(index, /function resumeClientSync\([^)]*\)[\s\S]*?const invalidatedWhileHidden = signalsInvalidatedWhileHidden[\s\S]*?rescheduleStandaloneSignals\([\s\S]*?await syncFromServer/);
  assert.match(index, /function scheduleRecentPhaseSignalAfterResume\([^)]*\)[\s\S]*?shouldScheduleServerSignal\(targetServerTime, lateGraceMs\)[\s\S]*?rotationBoundary:/);
  assert.match(index, /if \(includePhase\s*&& Date\.now\(\) >= suppressPhaseSignalsUntil/);
  assert.match(index, /if \(document\.hidden\) \{\s*if \(state\.running\) signalsInvalidatedWhileHidden = true;\s*clearSignalTimers\(false, true\);\s*return;/);
  assert.match(index, /function scheduleFinalWarnings\(segment\) \{\s*if \(document\.hidden\) \{\s*if \(state\.running\) signalsInvalidatedWhileHidden = true;\s*return;/);
  assert.match(index, /if \(state\.running && !document\.hidden && remaining <= 6\) \{\s*scheduleFinalWarnings\(segment\);/);
});

test("server response application errors stay separate from network availability", () => {
  assert.match(index, /function reportStateApplyError\(error, source, requestRecovery = false\)/);
  assert.match(index, /reportApplyError: \(error, context\) => reportStateApplyError\([\s\S]*?`action:\$\{context\?\.phase \|\| "response"\}`[\s\S]*?true/);
  assert.match(index, /let remote = null;[\s\S]*?remote = await response\.json\(\);[\s\S]*?if \(remote\) reportStateApplyError\(error, "sync"\);[\s\S]*?else markServerFailure\(\);/);
  assert.match(index, /eventSource\.addEventListener\("state"[\s\S]*?reportStateApplyError\(error, "sse"\);/);
});

test("the adaptive Final-format label repairs missing nested spans", () => {
  assert.match(index, /function updateFinalNewLabels\(\)[\s\S]*?querySelector\("\.final-new-full"\)[\s\S]*?document\.createElement\("span"\)[\s\S]*?appendChild\(fullLabel\)[\s\S]*?appendChild\(shortLabel\)/);
  assert.match(index, /function applyLanguage\(nextLanguage\)[\s\S]*?updateFinalNewLabels\(\);/);
  assert.doesNotMatch(index, /finalNewLabel\.querySelector\("\.final-new-(?:full|short)"\)\.textContent/);
});

test("XLSX import limits conversion to meaningful cells before detecting the protocol table", () => {
  assert.match(index, /sheetRows: window\.FDVStartList\.MAX_ROWS \+ 50/);
  assert.match(index, /FDVStartList\.worksheetContentRange\(workbook\.Sheets\[sheetName\], xlsx\.utils\)/);
  assert.match(index, /sheet_to_json\(workbook\.Sheets\[sheetName\], \{[\s\S]*?blankrows: true,[\s\S]*?range/);
});

test("browser ordering controls pin positions and share display numbers with every screen", () => {
  assert.match(server, /browserOrder: \[\],[\s\S]*?browserPinnedClientIds: \[\],[\s\S]*?showBrowserNumbers: false/);
  assert.match(server, /function moveBrowserClient\(targetClientId, direction\)[\s\S]*?pinnedIds\.add\(id\)/);
  assert.match(server, /displayNumber: index \+ 1,[\s\S]*?browserPinned: pinnedIds\.has\(client\.id\)/);
  assert.match(server, /browserDisplayNumber: ownDisplayIndex >= 0 \? ownDisplayIndex \+ 1 : 0/);
  assert.match(index, /id="browserNumbersToggle"[\s\S]*?<div id="browserList" class="browser-list"><\/div>[\s\S]*?<div class="timer-column">\s*<div id="browserNumberBadge"/);
  assert.match(index, /\.browser-numbers-toggle \{[\s\S]*?position: absolute;[\s\S]*?top: 4px;[\s\S]*?right: 3px;/);
  assert.match(index, /\.browser-number-badge \{[\s\S]*?position: absolute;[\s\S]*?top: 12px;[\s\S]*?right: 12px;/);
  assert.match(index, /data-browser-pin=[\s\S]*?data-browser-move="up"[\s\S]*?data-browser-move="down"/);
  assert.match(index, /\.browser-order-controls \{[\s\S]*?right: 1px;[\s\S]*?grid-template-columns: 16px;[\s\S]*?grid-template-rows: repeat\(3, 16px\)/);
  assert.match(index, /\.browser-item\.has-order-controls > strong,[\s\S]*?> strong \+ span,[\s\S]*?> \.diag-row:not\(\.start-list-diag-row\) \{\s*padding-right: 18px;/);
  assert.match(index, /\.browser-order-button \{[\s\S]*?width: 16px;[\s\S]*?border: 0;[\s\S]*?background: transparent;/);
  assert.doesNotMatch(index, /\.browser-item\.has-order-controls \{\s*padding-right:/);
  assert.match(index, /id="browserNumbersToggle"[^>]*hidden/);
  assert.match(index, /els\.browserNumbersToggle\.hidden = clients\.length < 3/);
  assert.match(index, /const primaryBrowserCard = els\.browserList\.querySelector\("\.primary-browser"\);[\s\S]*?primaryBrowserCard\.appendChild\(els\.browserNumbersToggle\)/);
  assert.match(index, /if \(isPrimary\) classes\.push\("primary-browser"\)/);
  assert.match(index, /\.browser-item\.primary-browser \{\s*border-color: #667181;/);
  assert.doesNotMatch(index, /const clientPrefix =/);
  assert.match(index, /const heading = standaloneSelf\s*\? escapeHtml\(client\.label\)\s*:\s*`\$\{escapeHtml\(client\.label\)\}\$\{displayIpHtml \? ` \(\$\{displayIpHtml\}\)` : ""\}`/);
  assert.match(index, /\.browser-copy-feedback:empty \{ display: none; \}/);
  assert.match(index, /\.browser-card-number \{[\s\S]*?left: -9px;/);
  assert.match(index, /const cardNumberHtml = state\.showBrowserNumbers/);
  assert.match(index, /client\.browserPinned \? "" : ' transform="rotate\(45 8 8\)"'/);
  assert.match(index, /M6\.9 13\.1c\.35\.9 1\.85\.9 2\.2 0/);
});

test("diagnostics use compact list labels and control two-list layout per screen", () => {
  assert.match(index, /loadStartListNumber: "Загрузить список \{number\}"/);
  assert.match(index, /loadStartListNumber: "Upload list \{number\}"/);
  assert.match(index, /`LIST \$\{listIndex \+ 1\}`/);
  assert.match(index, /Array\.from\(\{ length: 4 \}, \(_, listIndex\) => \{/);
  assert.match(index, /listAreaAdded \? `Список \$\{listIndex \+ 1\} не загружен` : `Список \$\{listIndex \+ 1\} не добавлен`/);
  assert.match(index, /const clientLayoutOverridden = selectedListIndexes\.size === 2[\s\S]*?clientListsParallel !== Boolean\(state\.startListParallel\)/);
  assert.match(index, /selectedListIndexes\.size === 2[\s\S]*?start-list-layout-overridden[\s\S]*?data-start-list-layout-client/);
  assert.match(index, /clientListsParallel \? "\|\|" : "\|"/);
  assert.match(index, /sendServerAction\("startListClientLayout",[\s\S]*?parallel: clientLayoutButton\.dataset\.startListParallel !== "1"/);
  assert.match(index, /state\.startListParallel = Boolean\(remote\.startListParallel\);/);
  assert.match(index, /\.start-list-diag-row \.diag-chip \{[\s\S]*?flex: 0 0 38px;[\s\S]*?width: 38px;/);
  assert.match(index, /class="diag-chip start-list-available clickable start-list-client-layout-button\$\{clientLayoutOverridden/);
  assert.match(index, /\.start-list-client-layout-button \{[\s\S]*?margin-left: 3px;/);
  assert.match(index, /\.start-list-client-layout-button::before,[\s\S]*?width: 2px;[\s\S]*?height: 11px;/);
  assert.match(index, /data-start-list-parallel="1"[\s\S]*?left: calc\(50% - 3px\)[\s\S]*?left: calc\(50% \+ 3px\)/);
  assert.match(index, /\.diag-chip\.start-list-layout-overridden,[\s\S]*?\.start-list-client-layout-button:active[\s\S]*?box-shadow: 0 0 0 2px #ff9f43/);
  assert.match(server, /startListLayoutOverrides: \{\}/);
  assert.match(server, /function startListParallelForClient\(clientId\)[\s\S]*?indexes\.length === 2[\s\S]*?timerState\.primaryClientId === clientId[\s\S]*?indexes\.length !== 2/);
  assert.match(server, /type === "startListClientLayout"[\s\S]*?startListIndexesForClient\(targetClientId\)\.length === 2/);
  assert.doesNotMatch(server, /type === "startListClientLayout"[\s\S]{0,250}?targetClientId !== timerState\.primaryClientId/);
});

test("diagnostics use consistent inactive colors and omit unavailable Legacy Wake Lock details", () => {
  assert.match(index, /\.server-clock-display \{[\s\S]*?min-width: 6\.4em;/);
  assert.doesNotMatch(index, /diagChip\("WAKE"/);
  assert.match(index, /const tabTitleRu = `[^`]*\$\{wakeTitleRu\}/);
  assert.match(index, /const tabTitleEn = `[^`]*\$\{wakeTitleEn\}/);
  assert.match(index, /\.diag-chip\.inactive \{[\s\S]*?background: #163626;/);
  assert.match(index, /"TIME",\s*`\$\{serverTimeEnabled \? "good" : "inactive"\} clickable`/);
  assert.match(index, /legacyControlAllowed[\s\S]*?\? "inactive"[\s\S]*?: "neutral"/);
  assert.match(index, /function clientRequiresLegacyInterface\(userAgent = "", oldBrowser = false\)[\s\S]*?chromeMajor < 80[\s\S]*?firefoxMajor < 74[\s\S]*?safariMajor < 13/);
  assert.match(index, /const capableLegacyViewer = isLegacyViewer && !legacyRequired;[\s\S]*?manualLegacy \|\| capableLegacyViewer[\s\S]*?\? "manual-legacy"/);
  assert.match(index, /function sampleAudioNodeTiming\(item\)[\s\S]*?lastAudioTimingErrorMs = Number\(audioContextProgressErrorMs\.toFixed\(3\)\)[\s\S]*?lastAudioTimingAt = Date\.now\(\)/);
  assert.match(index, /audioTimingError: Number\.isFinite\(lastAudioTimingErrorMs\)[\s\S]*?audioTimingAge: lastAudioTimingAt > 0[\s\S]*?audioTimingKind: lastAudioTimingKind/);
  assert.match(server, /const hasAudioTimingError = sourceHas[\s\S]*?const hasAudioTimingAge = sourceHas[\s\S]*?const hasAudioTimingKind = sourceHas/);
  assert.match(server, /audioTimingError: hasAudioTimingError[\s\S]*?audioTimingAge: hasAudioTimingAge[\s\S]*?audioTimingKind: hasAudioTimingKind/);
  assert.match(index, /const audioTimingFresh = hasAudioTimingError[\s\S]*?audioTimingAge <= 60000/);
  assert.match(index, /audioTimingMagnitude > 250[\s\S]*?audioTimingMagnitude >= 100[\s\S]*?"warn"/);
  assert.match(index, /const audioStatus = !audioAvailable[\s\S]*?\? "neutral"[\s\S]*?!audioEnabled[\s\S]*?\? "inactive"[\s\S]*?audioOk[\s\S]*?\? audioTimingStatus[\s\S]*?: "bad"/);
  assert.match(index, /const legacyTabTitleRu = `Видимость вкладки:[^`]*`/);
  assert.doesNotMatch(index, /const legacyTabTitleRu = `[^`]*Wake Lock/);
  assert.match(index, /const ruModernChips = \[legacyChip, audioChipRu, serverTimeChip, netChipRu, syncChipRu, sseChipRu, tabChipRu\]/);
  assert.match(index, /data-server-time-client=/);
  assert.match(index, /sendServerAction\("clientServerTime", \{ targetClientId, enabled \}\);/);
  assert.match(index, /id="serverClockDisplay" class="server-clock-display"/);
  assert.match(index, /font-family: "FDV LCD"/);
  assert.match(index, /DSEG7Classic-Bold\.woff2/);
  assert.match(index, /\.server-clock-display \{[\s\S]*?font-weight: 700;/);
  assert.match(index, /function formatServerClockTime\(timestamp\)/);
  assert.match(index, /clockBottomValue -= Math\.max\(0, timerColumnRect\.bottom - timerWrapRect\.bottom\)/);
  assert.match(index, /state\.showServerTime = Boolean\(remote\.showServerTime\);/);
});
