"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const index = fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");
const server = fs.readFileSync(path.resolve(__dirname, "..", "serve-bouldering-timer.js"), "utf8");

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
  assert.match(index, /maximumContentWidth = Math\.min\(window\.innerWidth \* 0\.5, 700\)/);
  assert.match(index, /scroll\.offsetWidth - scroll\.clientWidth/);
  assert.match(index, /const completedFinalAttempt = state\.runtimePreset === "final"[\s\S]*?state\.running && !state\.countdownOnly/);
  assert.doesNotMatch(index, /class="start-list-heading"/);
  assert.match(index, /startListEditorOpen = els\.startListToggle\.checked;[\s\S]*?safeStorageSet\("sessionStorage", startListEditorPreferenceKey[\s\S]*?updateStartListVisibility\(\);\s*renderStartList\(\);/);
  assert.match(index, /startListEditorOpen = safeStorageGet\("sessionStorage", startListEditorPreferenceKey\) === "1";\s*state\.startListEnabled = startListEditorOpen;\s*els\.startListToggle\.checked = startListEditorOpen/);
  assert.match(index, /safeStorageSet\("sessionStorage", startListEditorPreferenceKey, startListEditorOpen \? "1" : "0"\)/);
  assert.match(index, /state\.startListEnabled = Boolean\(remote\.startListEnabled\)[\s\S]*?startListEditorOpen = state\.startListEnabled[\s\S]*?els\.startListToggle\.checked = startListEditorOpen/);
  assert.match(index, /startListToggle\.addEventListener\("change", async \(\) => \{[\s\S]*?sendServerAction\("startListEnabled", \{ enabled: startListEditorOpen \}\)/);
  assert.match(index, /PROTOCOL \$\{listIndex \+ 1\}[\s\S]*?data-start-list-index="\$\{listIndex\}"/);
  assert.match(index, /loadStartListNumber: "Загрузить протокол \{number\}"/);
  assert.match(index, /function defaultStartListRouteCount\(\) \{\s*return isFinalMode\(\) \? 4 : 5;\s*\}/);
  assert.match(index, /value="\$\{list\?\.routeCount \|\| defaultStartListRouteCount\(\)\}"/);
  assert.match(index, /start-list-available clickable[\s\S]*?start-list-selected/);
  assert.match(index, /function visibleStartListEntries\(\)[\s\S]*?selectedIndexes\.has\(index\)/);
  assert.match(index, /els\.climbMinutes\.disabled = !available \|\| timerParametersLocked/);
  assert.match(index, /els\.breakSeconds\.disabled = !available \|\| timerParametersLocked/);
  assert.match(index, /accept="\.xlsx,\.csv,\.tsv,\.txt,\.mxl"/);
  assert.doesNotMatch(index, /accept="[^"]*(?:application\/|text\/)/);
  assert.match(index, /if \(\/\\\.xlsx\$\/i\.test\(file\.name\)\)[\s\S]*?loadXlsxLibrary\(\)[\s\S]*?sheet_to_json[\s\S]*?FDVStartList\.parseRows/);
  assert.match(index, /function loadXlsxLibrary\(\)[\s\S]*?FDV_XLSX_LIBRARY_SOURCE[\s\S]*?lib\/vendor\/xlsx\.mini\.min\.js/);
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
  assert.match(index, /\.cycle-chip\.cycle-rotation[\s\S]*?border-color: var\(--green\)/);
  assert.match(index, /\.cycle-chip\.cycle-break[\s\S]*?border-color: var\(--yellow\)/);
  assert.match(index, /setScheduleMarkup\(`<div class="chip current"><span>\$\{untilStart > 0 \? t\("untilStart"\) : t\("waitingManual"\)\}<\/span><\/div>`\)/);
});

test("start-list width uses stable intrinsic content measurements and reserves scrollbar space", () => {
  assert.match(index, /\.start-list-table \{ width: max-content; border-collapse:/);
  assert.doesNotMatch(index, /\.start-list-table \{[^}]*min-width: 100%/);
  assert.match(index, /function browserScrollbarWidth\(\)[\s\S]*?overflow:scroll[\s\S]*?probe\.offsetWidth - probe\.clientWidth/);
  assert.match(index, /function intrinsicStartListTableWidth\(table\)[\s\S]*?table\.style\.minWidth = "0"[\s\S]*?getBoundingClientRect\(\)\.width[\s\S]*?table\.style\.minWidth = previousMinWidth/);
  assert.match(index, /const nativeScrollbarWidth = browserScrollbarWidth\(\)/);
  assert.match(index, /const scrollbarRoundingAllowance = 2/);
  assert.match(index, /const maximumContentWidth = Math\.min\(window\.innerWidth \* 0\.5, 700\)/);
  assert.match(index, /Math\.max\(maximum, intrinsicStartListTableWidth\(table\)\)/);
  assert.match(index, /function intrinsicStartListControlsWidth\(controls\)[\s\S]*?controls\.style\.width = "max-content"[\s\S]*?getBoundingClientRect\(\)\.width[\s\S]*?controls\.style\.width = previousWidth/);
  assert.match(index, /Math\.max\(maximum, intrinsicStartListControlsWidth\(controls\)\)[\s\S]*?Math\.max\(tableWidth, controlsWidth\)/);
  assert.doesNotMatch(index, /Math\.max\(maximum, controls\.scrollWidth\)/);
  assert.match(index, /function synchronizeStackedStartListTableColumns\(column\)[\s\S]*?tables\.length < 2[\s\S]*?columnGroups\.some\(\(group\) => group\.length !== columnCount\)[\s\S]*?synchronizedWidths\[index\][\s\S]*?tableColumn\.style\.width = `\$\{synchronizedWidths\[index\]\}px`/);
  assert.match(index, /synchronizeStackedStartListTableColumns\(column\);[\s\S]*?intrinsicStartListTableWidth\(table\)/);
  assert.match(index, /<table class="start-list-table"><colgroup>\$\{tableColumns\}<\/colgroup>/);
  assert.match(index, /scroll\.offsetWidth - scroll\.clientWidth\), nativeScrollbarWidth\)[\s\S]*?\+ scrollbarRoundingAllowance/);
  assert.match(index, /const measuredContentWidth = Math\.max\(tableWidth, controlsWidth\)/);
  assert.match(index, /contentWidth \+ scrollbarAllowance/);
  assert.match(index, /Math\.min\(window\.innerWidth \* 0\.72, 1400\) \+ scrollbarAllowance/);
  assert.match(index, /els\.startListPanel\.style\.maxWidth = `\$\{panelLimit\}px`/);
  assert.match(index, /function scheduleStartListPanelWidthFit\(\)[\s\S]*?const overflow = fitStartListPanelWidth\(\)[\s\S]*?pass < 2 \|\| \(overflow > 0 && pass < 6\)[\s\S]*?requestAnimationFrame\(settleWidth\)/);
  assert.match(index, /scroll\.scrollWidth - scroll\.clientWidth/);
  assert.match(index, /fitStartListPanelWidth\(\);\s*scheduleStartListPanelWidthFit\(\);/);
});

test("copyright keeps a restrained visible credit and the full collaboration note in its tooltip", () => {
  assert.match(index, /class="credits" id="copyrightCredit"[^>]*>2026 <span id="authorName">Фёдоров Денис<\/span>/);
  assert.doesNotMatch(index, /id="codexCredit"/);
  assert.match(index, /authorHint: "Говорил, что делать, Codex - делал :\)"/);
  assert.match(index, /els\.copyrightCredit\.title = t\("authorHint"\)/);
});

test("start-list route incident controls render pause, stop, resume and cancellation states", () => {
  assert.match(index, /class="start-list-route-button"[\s\S]*?data-start-list-route/);
  assert.match(index, /data-start-list-incident-menu[\s\S]*?data-start-list-incident-cycle/);
  assert.match(index, /class="start-list-incident-controls"[\s\S]*?class="start-list-incident-cycle"[\s\S]*?class="start-list-incident-actions"/);
  assert.match(index, /routeIncidentStartCycleHint[\s\S]*?routeIncidentResumeCycleHint/);
  assert.match(index, /const cycleHint = activePause \? t\("routeIncidentResumeCycleHint"\) : t\("routeIncidentStartCycleHint"\)/);
  assert.match(index, /data-start-list-incident-cycle title="\$\{escapeHtml\(cycleHint\)\}"/);
  assert.match(index, /button\.classList\.toggle\("is-selected", Number\(button\.dataset\.startListRoute\) === routeIndex\)/);
  assert.match(index, /\.start-list-route-button\.is-selected \{[\s\S]*?border: 2px solid var\(--yellow\)/);
  assert.match(index, /data-start-list-incident-action="pause"[\s\S]*?data-start-list-incident-action="stop"/);
  assert.match(index, /data-start-list-incident-action="resume"/);
  assert.match(index, /data-start-list-incident-action="cancel-stop"/);
  assert.match(index, /FDVStartList\.participantAtCycle[\s\S]*?kind: "pause"[\s\S]*?resumeCycle: null/);
  assert.match(index, /kind: "stop"[\s\S]*?startCycle: cycle/);
  assert.match(index, /action === "resume"[\s\S]*?resolution: "resume"[\s\S]*?action === "stop"[\s\S]*?resolution: "stop"/);
  assert.match(index, /action === "cancel-stop"[\s\S]*?resolution !== "stop"[\s\S]*?resumeCycle: null/);
  assert.match(index, /route-marker\.paused::before[\s\S]*?route-marker\.stopped::before/);
  assert.match(index, /th\.route-paused \.start-list-route-button[\s\S]*?border: 2px solid var\(--yellow\)[\s\S]*?box-shadow:/);
  assert.match(index, /th\.route-stopped \.start-list-route-button[\s\S]*?border: 2px solid var\(--red\)[\s\S]*?box-shadow:/);
  assert.match(index, /th\.route-paused-history \.start-list-route-button[\s\S]*?border: 2px solid rgba\(255, 200, 87, \.86\)/);
  assert.match(index, /th\.route-stopped-history \.start-list-route-button[\s\S]*?border: 2px solid rgba\(240, 90, 89, \.9\)/);
  assert.match(index, /function formatRoutePauseState\(incident, cycle\)[\s\S]*?routeIncidentPausedUntilStop[\s\S]*?routeIncidentPausedRange[\s\S]*?const routePauses = incidents\.filter[\s\S]*?title="\$\{escapeHtml\(routeTitle\)\}"/);
  assert.match(index, /data-start-list-incident-action="clear-pause"[\s\S]*?action === "clear-pause"/);
  assert.match(index, /\.start-list-incident-action\.resume \{ color: var\(--green\)/);
  assert.match(index, /data-start-list-incident-action="pause" title="\$\{escapeHtml\(t\("routeIncidentPause"\)\)\}" aria-label="\$\{escapeHtml\(t\("routeIncidentPause"\)\)\}"><\/button>/);
  assert.match(index, /data-start-list-incident-action="resume" title="\$\{escapeHtml\(t\("routeIncidentResume"\)\)\}" aria-label="\$\{escapeHtml\(t\("routeIncidentResume"\)\)\}"><\/button>/);
  assert.match(index, /\.start-list-incident-action\.pause::before,[\s\S]*?\.start-list-incident-action\.resume::before[\s\S]*?border-left: 11px solid currentColor[\s\S]*?\.start-list-incident-action\.stop::before/);
  assert.match(index, /\.start-list-file-button \{[^}]*color: #041217;[^}]*background: var\(--cyan\);/);
  assert.match(index, /\.start-list-file-button:hover,[\s\S]*?\.start-list-incident-action:not\(:disabled\):hover[\s\S]*?border-color: currentColor;[\s\S]*?box-shadow: 0 0 0 1px currentColor;/);
  assert.match(index, /\.start-list-file-button:hover \{\s*border-color: #b9f2ff;\s*box-shadow: 0 0 0 1px rgba\(185, 242, 255, \.9\);/);
  assert.match(index, /let startListRouteClickGuard = \{ key: "", until: 0 \};/);
  assert.match(index, /const clickKey = `\$\{index\}:\$\{routeIndex\}`;[\s\S]*?clickNow < startListRouteClickGuard\.until\) return;[\s\S]*?clickNow \+ 320[\s\S]*?startListIncidentSelections\[index\] === routeIndex \? null : routeIndex/);
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
  assert.match(index, /function rememberStartListScrollPositions\(nextLists\)[\s\S]*?querySelectorAll\("\[data-start-list-index\]"\)[\s\S]*?const pending = pendingStartListScrollRestores\[index\][\s\S]*?listKey: JSON\.stringify\(normalized\[index\]\)[\s\S]*?top: pending\?\.top \?\? scroll\.scrollTop[\s\S]*?left: pending\?\.left \?\? scroll\.scrollLeft/);
  assert.match(index, /JSON\.stringify\(nextStartLists\) !== JSON\.stringify\(state\.startLists\)[\s\S]*?rememberStartListScrollPositions\(nextStartLists\);[\s\S]*?lastStartListRenderKey = "";/);
  assert.match(index, /pendingScroll\?\.listKey === JSON\.stringify\(list\)[\s\S]*?pendingStartListScrollRestores\[index\] !== pendingScroll\) return;[\s\S]*?scroll\.scrollTop = pendingScroll\.top;[\s\S]*?scroll\.scrollLeft = pendingScroll\.left;/);
  assert.match(index, /function ensureStartListStructure\(\)[\s\S]*?rememberStartListScrollPositions\(state\.startLists\);[\s\S]*?existingIndexes\.has\(index\)[\s\S]*?lastStartListScrollAnchors\[index\] = null/);
  assert.match(index, /const previousScroll = \{ top: scroll\.scrollTop, left: scroll\.scrollLeft \};[\s\S]*?else \{[\s\S]*?scroll\.scrollTop = previousScroll\.top;[\s\S]*?scroll\.scrollLeft = previousScroll\.left;/);
  assert.match(index, /const autoScrollKey = `\$\{position\.cycle\}:\$\{position\.phase\}:\$\{anchor\}`;[\s\S]*?autoScrollKey !== lastStartListScrollAnchors\[index\]/);
  assert.match(index, /visible && !wasVisible[\s\S]*?startListInitialAutoScrollPending = true;[\s\S]*?lastStartListScrollAnchors\[index\] = null;[\s\S]*?pendingStartListScrollRestores\[index\] = null;/);
  assert.match(index, /function scheduleStartListAnchorScroll\(scroll, anchor, left, settleLayout = false\)[\s\S]*?scroll\.isConnected[\s\S]*?scroll\.scrollTop = Math\.max\(0, row\.offsetTop - headerHeight\)[\s\S]*?settleLayout && pass < 6[\s\S]*?requestAnimationFrame\(applyAnchor\)/);
  assert.match(index, /const titleBar = `<div class="start-list-title-bar" data-start-list-title hidden><\/div>`;[\s\S]*?\$\{controls\}\$\{titleBar\}\$\{incidentMenu\}<div class="start-list-scroll"/);
  assert.match(index, /titleBar\.textContent = list\.title \|\| "";[\s\S]*?titleBar\.hidden = !list\.title/);
  assert.match(index, /const settleInitialAutoScroll = startListInitialAutoScrollPending;[\s\S]*?startListInitialAutoScrollPending = false;[\s\S]*?scheduleStartListAnchorScroll\(scroll, anchor, previousScroll\.left, settleInitialAutoScroll\)/);
  assert.match(index, /function formatRoutePauseState\(incident, cycle\)[\s\S]*?activeInDisplayedCycle[\s\S]*?routeIncidentPausedFrom/);
  assert.match(index, /stoppedIncident[\s\S]*?routeIncidentStoppedFrom[\s\S]*?title="\$\{escapeHtml\(routeTitle\)\}"/);
  assert.match(index, /function clearStartListIncidentsForNewRound\(\)[\s\S]*?incidents: _incidents[\s\S]*?lastStartListRenderKey = ""/);
  assert.match(index, /function resetStandaloneTimer\([\s\S]*?clearStartListIncidentsForNewRound\(\)/);
  assert.match(index, /function startTimerByTime\([\s\S]*?if \(standaloneMode\)[\s\S]*?clearStartListIncidentsForNewRound\(\)/);
  assert.match(server, /const clearIncidentsForNewRound = type === "reset"[\s\S]*?type === "start"[\s\S]*?body\.startMode === "scheduled"[\s\S]*?clearStartListIncidents\(\)/);
  assert.match(index, /FDVStartList\.marker\(participantIndex, routeIndex, position\.cycle, position\.phase, incidents, schedule\)/);
});

test("timer phase background is confined to the timer column", () => {
  assert.match(index, /body \{[\s\S]*?background: #0e1116;/);
  assert.match(index, /\.controls \{[\s\S]*?background: #171b22;/);
  assert.match(index, /\.timer-column \{[\s\S]*?background: var\(--timer-rotation-bg\);/);
  assert.match(index, /body\.warning-active \.timer-column[\s\S]*?body\.countdown-active \.timer-column[\s\S]*?body\.break-active \.timer-column/);
  assert.doesNotMatch(index, /body\.(?:warning|countdown|break)-active\s*\{/);
  assert.doesNotMatch(index, /body\.break-active \.controls/);
});

test("mobile controls keep compact multi-column grids", () => {
  assert.match(index, /\.preset-grid \{\s*display: grid;\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(index, /\.field-grid \{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(index, /\.actions \{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.doesNotMatch(index, /@media \(max-width: 560px\) \{\s*\.(?:field-grid|preset-grid|actions)/);
});

test("enabled format buttons get a yellow hover outline", () => {
  assert.match(index, /\.preset:not\(:disabled\):hover \{[\s\S]*?border-color: var\(--yellow\);[\s\S]*?box-shadow: 0 0 0 2px rgba\(255, 200, 87, \.4\);/);
});

test("portrait phones stack the timer above compact protocol windows", () => {
  assert.match(index, /@media \(max-width: 560px\) and \(orientation: portrait\) \{[\s\S]*?body\.start-list-visible \.stage-main \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?grid-template-rows: minmax\(210px, 36dvh\) auto;/);
  assert.match(index, /body\.start-list-visible \.start-list-panel \{[\s\S]*?width: 100% !important;[\s\S]*?max-width: 100% !important;/);
  assert.match(index, /body\.start-list-visible \.timer-wrap \{\s*min-height: 0;\s*height: 100%;/);
  assert.match(index, /body\.start-list-visible \.start-list-layout \{[\s\S]*?flex-direction: column;/);
  assert.match(index, /body\.start-list-visible \.start-list-scroll \{[\s\S]*?max-height: calc\(33px \+ var\(--start-list-mobile-row-count, 6\) \* 32px\)/);
  assert.match(index, /const highlightedRows = \[\.\.\.scroll\.querySelectorAll\("tbody tr\.is-active, tbody tr\.is-ready"\)\][\s\S]*?const highlightedSpan = highlightedIndexes\.length[\s\S]*?Math\.max\(5, highlightedSpan \+ 4\)[\s\S]*?--start-list-mobile-row-count/);
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
  assert.match(index, /render\(\);\s*renderBrowserList\(lastKnownClients\);\s*refreshStandaloneBrowserList\(\);/);
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
  assert.match(index, /\.build-separator \{\s*margin-left: 10px;\s*\}/);
  assert.match(index, /\.build-info \{[\s\S]*?margin-left: 0;/);
  assert.match(index, /\.build-info:not\(\.armed\):hover \{\s*color: var\(--text\);\s*\}/);
  assert.match(index, /\.build-info\.armed:hover,[\s\S]*?border-color: var\(--cyan\);[\s\S]*?color: var\(--text\);/);
  const buildHoverRule = index.match(/\.build-info\.armed:hover,[\s\S]*?\n    \}/)?.[0] || "";
  assert.doesNotMatch(buildHoverRule, /font-weight:/);
  assert.match(index, /if \(event\.target\.closest\("#buildInfo"\)\) return;\s*deactivateBuildProjectLink\(\);/);
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

test("desktop audio calibration scrolls its editor into view", () => {
  assert.match(index, /const interactive = \/\\sdata-\(\?:audio-client\|legacy-mode-client\)=\//);
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
  assert.match(index, /checkClockContinuity\(\);\s*render\(\);/);
  assert.match(index, /function render\(\) \{\s*lastRenderAt = performance\.now\(\);\s*scheduleDisplayBoundary\(\);/);
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
  assert.match(index, /if \(resetStaleSignals && !synchronized && state\.running && !state\.countdownOnly\)/);
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
  assert.match(index, /if \(standaloneMode && iosAudioWorkaroundEnabled\) return false;\s*if \(scheduledByBuffer/);
  assert.match(index, /scheduleServerTimeoutAt\(targetServerTime, \(\) => beep\(kind\)/);
});

test("a short mobile sleep cannot leave rendering permanently frozen", () => {
  assert.match(index, /function markResumeDisplayStale\(\) \{[\s\S]*?beginResumeSnapPending\(\);/);
  assert.match(index, /if \(!resetStaleSignals && resumeSnapPending\) clearResumeSnapPending\(false\);/);
  assert.doesNotMatch(index, /!resetStaleSignals && \(resumeSyncInProgress \|\| resumeSnapPending\)/);
});
