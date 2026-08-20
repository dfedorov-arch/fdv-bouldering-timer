"use strict";

const { test, expect } = require("@playwright/test");
const {
  action,
  openLegacy,
  openModern,
  selectProtocols,
  stabilizeTimer,
  startLayoutServer,
  wait
} = require("./helpers");

let server;

test.beforeAll(async () => {
  server = await startLayoutServer();
});

test.afterAll(async () => {
  await server.stop();
});

test.beforeEach(async () => {
  await stabilizeTimer(server.baseUrl);
});

test("Festival hides the unavailable start-list switch", async ({ browser }) => {
  await action(server.baseUrl, "reset");
  await action(server.baseUrl, "settings", {
    activePreset: "festival",
    settings: {
      rotationMinutes: 5,
      breakSeconds: 0,
      oneShot: false,
      finalRoundFormat: "old",
      finalRestRotations: 3
    }
  });

  const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  await context.addInitScript(() => {
    window.sessionStorage.setItem("boulderingTimerClientId", "performance-baseline");
  });
  const page = await context.newPage();
  try {
    await page.goto(`${server.baseUrl}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.classList.contains("controls-ready"));
    const toggleRow = page.locator("#startListToggleRow");
    await expect(toggleRow).toHaveJSProperty("hidden", true);
    await expect(toggleRow).toBeHidden();
    expect(await toggleRow.evaluate((element) => getComputedStyle(element).display)).toBe("none");
  } finally {
    await context.close().catch(() => {});
  }
});

test("Disabling remote fullscreen exits viewers once without overriding later manual fullscreen", async ({ browser }) => {
  const screenId = "visual-fullscreen-screen";
  const screenContext = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  await screenContext.addInitScript((id) => {
    window.sessionStorage.setItem("boulderingTimerClientId", id);
  }, screenId);
  const screen = await screenContext.newPage();
  try {
    await screen.goto(`${server.baseUrl}/`, { waitUntil: "domcontentloaded" });
    await screen.waitForFunction(() => document.body.classList.contains("viewer-mode"));
    await screen.evaluate(() => {
      let fullscreenElement = null;
      let requests = 0;
      let exits = 0;
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        get: () => fullscreenElement
      });
      Object.defineProperty(document.documentElement, "requestFullscreen", {
        configurable: true,
        value: async () => {
          requests += 1;
          fullscreenElement = document.documentElement;
        }
      });
      Object.defineProperty(document, "exitFullscreen", {
        configurable: true,
        value: async () => {
          exits += 1;
          fullscreenElement = null;
        }
      });
      window.fullscreenTestState = () => ({ requests, exits, active: Boolean(fullscreenElement) });
    });
    await action(server.baseUrl, "instancesFullscreen", { enabled: true });
    await screen.waitForFunction(() => window.fullscreenTestState().requests === 1);
    await action(server.baseUrl, "instancesFullscreen", { enabled: false });
    await screen.waitForFunction(() => window.fullscreenTestState().exits === 1);
    await screen.evaluate(() => document.documentElement.requestFullscreen());
    await action(server.baseUrl, "instancesSound", { enabled: true });
    await wait(350);
    expect(await screen.evaluate(() => window.fullscreenTestState())).toEqual({ requests: 2, exits: 1, active: true });
  } finally {
    await screenContext.close();
  }
});

test("Large phone fullscreen keeps the server clock inside a timer-only screen", async ({ browser }) => {
  const clientId = "visual-phone-fullscreen-clock";
  const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
  await context.addInitScript((id) => {
    window.sessionStorage.setItem("boulderingTimerClientId", id);
  }, clientId);
  const page = await context.newPage();
  try {
    await page.goto(`${server.baseUrl}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.classList.contains("viewer-mode"));
    await action(server.baseUrl, "startListEnabled", { enabled: false });
    await action(server.baseUrl, "clientServerTime", { targetClientId: clientId, enabled: true });
    await page.locator("#serverClockDisplay").waitFor();
    await page.evaluate(() => document.body.classList.add("fullscreen"));
    const geometry = await page.evaluate(() => {
      const stage = document.querySelector(".stage").getBoundingClientRect();
      const timerColumn = document.querySelector(".timer-column").getBoundingClientRect();
      const clock = document.getElementById("serverClockDisplay").getBoundingClientRect();
      return {
        viewportHeight: window.innerHeight,
        stageHeight: stage.height,
        timerBottom: timerColumn.bottom,
        clockTop: clock.top,
        clockBottom: clock.bottom
      };
    });
    expect(geometry.stageHeight).toBeCloseTo(geometry.viewportHeight, 0);
    expect(geometry.timerBottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
    expect(geometry.clockTop).toBeGreaterThanOrEqual(0);
    expect(geometry.clockBottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  } finally {
    await action(server.baseUrl, "clientServerTime", { targetClientId: clientId, enabled: false }).catch(() => {});
    await action(server.baseUrl, "startListEnabled", { enabled: true }).catch(() => {});
    await context.close();
  }
});

test("Paused festival progress stays under a motionless held pointer during server sync", async ({ browser }) => {
  await action(server.baseUrl, "reset");
  await action(server.baseUrl, "settings", {
    activePreset: "festival",
    settings: {
      rotationMinutes: 5,
      breakSeconds: 0,
      oneShot: false,
      finalRoundFormat: "old",
      finalRestRotations: 3
    }
  });
  await action(server.baseUrl, "seek", { elapsed: 60 });

  const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  await context.addInitScript(() => {
    window.sessionStorage.setItem("boulderingTimerClientId", "performance-baseline");
  });
  const page = await context.newPage();
  let pointerHeld = false;
  try {
    await page.goto(`${server.baseUrl}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.classList.contains("controls-ready"));
    const track = page.locator("#progressTrack");
    const box = await track.boundingBox();
    expect(box).not.toBeNull();
    const pointerY = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.2, pointerY);
    await page.mouse.down();
    pointerHeld = true;
    await page.mouse.move(box.x + box.width * 0.72, pointerY);
    const heldTransform = await page.locator("#progressBar").evaluate((element) => element.style.transform);
    await wait(2_500);
    const transformAfterSync = await page.locator("#progressBar").evaluate((element) => element.style.transform);
    expect(transformAfterSync).toBe(heldTransform);
    await page.mouse.up();
    pointerHeld = false;
  } finally {
    if (pointerHeld) await page.mouse.up().catch(() => {});
    await context.close();
  }
});

test("Manual restart after a completed scheduled start shows cycle 1 immediately", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  await context.addInitScript(() => {
    window.sessionStorage.setItem("boulderingTimerClientId", "performance-baseline");
  });
  const page = await context.newPage();
  try {
    await page.goto(`${server.baseUrl}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.classList.contains("controls-ready"));
    const settings = {
      rotationSeconds: 240,
      breakSeconds: 15,
      oneShot: false,
      finalRoundFormat: "old",
      finalRestRotations: 3
    };
    const now = new Date();
    await action(server.baseUrl, "reset", { settings });
    await action(server.baseUrl, "start", {
      activePreset: "classic",
      settings,
      startMode: "scheduled",
      startHours: now.getHours(),
      startMinutes: now.getMinutes(),
      elapsedBeforePause: 0
    });
    await page.waitForFunction(() => document.getElementById("startBtn").disabled);
    await action(server.baseUrl, "reset", { settings });
    await page.waitForFunction(() => !document.getElementById("startBtn").disabled);
    const manualStart = await action(server.baseUrl, "start", {
      activePreset: "classic",
      settings,
      startMode: "manual",
      startHours: "",
      startMinutes: "",
      elapsedBeforePause: 0,
      startAudioLead: true
    });
    await page.waitForFunction(() => document.getElementById("startBtn").disabled);
    const cycleState = await page.evaluate(() => {
      const chip = document.querySelector(".cycle-chip");
      const input = document.getElementById("cycleInput");
      return {
        classes: chip ? chip.className : "",
        value: input ? input.value : "",
        text: chip ? chip.textContent.trim() : ""
      };
    });
    expect(manualStart.startedAt - Date.now()).toBeGreaterThan(0);
    expect(cycleState.classes).toContain("cycle-rotation");
    expect(cycleState.classes).not.toContain("cycle-waiting");
    expect(cycleState.value).toBe("1");
    expect(cycleState.text).not.toContain("Отложенный старт");
  } finally {
    await action(server.baseUrl, "reset").catch(() => {});
    await context.close();
  }
});

test("Diagnostics outlines Legacy only when the browser can use the normal interface", async ({ browser }) => {
  const primaryContext = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const capableContext = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const requiredContext = await browser.newContext({
    viewport: { width: 800, height: 600 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/79.0.3945.130 Safari/537.36"
  });
  await primaryContext.addInitScript(() => {
    window.sessionStorage.setItem("boulderingTimerClientId", "performance-baseline");
  });
  try {
    const primaryPage = await primaryContext.newPage();
    await primaryPage.goto(`${server.baseUrl}/`, { waitUntil: "domcontentloaded" });
    await primaryPage.waitForFunction(() => document.body.classList.contains("controls-ready"));
    const capablePage = await capableContext.newPage();
    await capablePage.goto(`${server.baseUrl}/legacy.html?clientId=visual-capable-legacy`, { waitUntil: "domcontentloaded" });
    const requiredPage = await requiredContext.newPage();
    await requiredPage.goto(`${server.baseUrl}/?clientId=visual-required-legacy`, { waitUntil: "domcontentloaded" });

    const capableCard = primaryPage.locator(`[data-server-time-client="visual-capable-legacy"]`)
      .locator("xpath=ancestor::*[contains(@class, 'browser-item')]");
    const requiredCard = primaryPage.locator(`[data-server-time-client="visual-required-legacy"]`)
      .locator("xpath=ancestor::*[contains(@class, 'browser-item')]");
    await expect(capableCard.locator(".diag-chip", { hasText: "LEGACY" })).toHaveClass(/manual-legacy/);
    await expect(requiredCard.locator(".diag-chip", { hasText: "LEGACY" })).not.toHaveClass(/manual-legacy/);
  } finally {
    await requiredContext.close();
    await capableContext.close();
    await primaryContext.close();
  }
});

test("Modern phone keeps two protocols readable and fills the remaining screen", async ({ browser }) => {
  const { context, page } = await openModern(
    browser,
    server.baseUrl,
    "visual-modern-phone",
    { width: 360, height: 778 },
    [1, 2]
  );
  try {
    const metrics = await page.evaluate(() => {
      const panel = document.querySelector(".start-list-panel");
      const slots = [...document.querySelectorAll(".start-list-slot")];
      const scrolls = [...document.querySelectorAll(".start-list-scroll")];
      const tables = [...document.querySelectorAll(".start-list-table")];
      const rows = tables.map((table) => table.querySelector("tbody tr"));
      return {
        bodyClass: document.body.className,
        panel: panel && panel.getBoundingClientRect().toJSON(),
        panelScroll: panel && [panel.clientWidth, panel.scrollWidth, panel.clientHeight, panel.scrollHeight],
        slotHeights: slots.map((slot) => slot.getBoundingClientRect().height),
        horizontalOverflow: scrolls.map((scroll) => scroll.scrollWidth - scroll.clientWidth),
        fontSizes: rows.map((row) => Number.parseFloat(getComputedStyle(row).fontSize)),
        rowHeights: rows.map((row) => row.getBoundingClientRect().height),
        visibleRows: scrolls.map((scroll, index) => scroll.clientHeight / rows[index].getBoundingClientRect().height),
        routeRightEdges: tables.map((table) => {
          const cells = table.querySelectorAll("thead th");
          return cells[cells.length - 1].getBoundingClientRect().right;
        })
      };
    });

    expect(metrics.bodyClass).toContain("start-list-dense");
    expect(metrics.bodyClass).not.toContain("start-list-ultra-dense");
    expect(metrics.panel.bottom).toBeGreaterThanOrEqual(777);
    expect(metrics.panel.bottom).toBeLessThanOrEqual(779);
    expect(Math.abs(metrics.slotHeights[0] - metrics.slotHeights[1])).toBeLessThanOrEqual(2);
    expect(metrics.panelScroll[1] - metrics.panelScroll[0]).toBeLessThanOrEqual(1);
    expect(metrics.panelScroll[3] - metrics.panelScroll[2]).toBeLessThanOrEqual(1);
    for (const overflow of metrics.horizontalOverflow) expect(overflow).toBeLessThanOrEqual(1);
    for (const fontSize of metrics.fontSizes) expect(fontSize).toBeGreaterThanOrEqual(10);
    for (const rowHeight of metrics.rowHeights) expect(rowHeight).toBeGreaterThanOrEqual(24);
    for (const visibleRows of metrics.visibleRows) {
      expect(visibleRows).toBeGreaterThanOrEqual(11);
      expect(visibleRows).toBeLessThanOrEqual(12.5);
    }
    for (const right of metrics.routeRightEdges) expect(right).toBeLessThanOrEqual(346);
    await expect(page).toHaveScreenshot("modern-phone-two-protocols.png", { fullPage: false });
  } finally {
    await context.close();
  }
});

test("Modern parallel protocols size columns by their tables instead of the wider controls", async ({ browser }) => {
  const originalState = await (await fetch(`${server.baseUrl}/api/state?clientId=visual-parallel-fixture&startListRevision=`)).json();
  const originalLists = originalState.startLists;
  const clientId = "visual-modern-parallel";
  let opened = null;
  await action(server.baseUrl, "startLists", { startLists: originalLists.slice(0, 2) });
  try {
    opened = await openModern(browser, server.baseUrl, clientId, { width: 1200, height: 800 }, [0, 1]);
    await action(server.baseUrl, "startListLayout", { parallel: true });
    await action(server.baseUrl, "primary", { primaryClientId: clientId });
    await opened.page.waitForFunction(() => document.body.classList.contains("primary-active")
      && document.querySelectorAll(".start-list-column").length === 2
      && document.querySelectorAll("[data-start-list-layout-toggle]").length === 1);
    await wait(350);
    const metrics = await opened.page.evaluate(() => [...document.querySelectorAll(".start-list-column")].map((column) => {
      const controls = column.querySelector(".start-list-panel-controls");
      const scroll = column.querySelector(".start-list-scroll");
      const table = column.querySelector(".start-list-table");
      const fileButton = column.querySelector(".start-list-file-button");
      const fileLabel = fileButton.querySelector("span");
      const buttonRect = fileButton.getBoundingClientRect();
      const labelRect = fileLabel.getBoundingClientRect();
      return {
        controlsOverflow: controls.scrollWidth - controls.clientWidth,
        emptyTableSpace: scroll.clientWidth - table.getBoundingClientRect().width,
        hasLayoutToggle: Boolean(controls.querySelector("[data-start-list-layout-toggle]")),
        labelLeftOverflow: buttonRect.left - labelRect.left,
        labelRightOverflow: labelRect.right - buttonRect.right,
        labelTextOverflow: getComputedStyle(fileLabel).textOverflow,
        labelOverflow: fileLabel.scrollWidth - fileLabel.clientWidth
      };
    }));
    expect(metrics).toHaveLength(2);
    expect(metrics[1].hasLayoutToggle).toBe(true);
    for (const metric of metrics) {
      expect(metric.controlsOverflow).toBeLessThanOrEqual(1);
      expect(metric.emptyTableSpace).toBeLessThanOrEqual(3);
      expect(metric.labelLeftOverflow).toBeLessThanOrEqual(1);
      expect(metric.labelRightOverflow).toBeLessThanOrEqual(1);
      expect(metric.labelTextOverflow).toBe("ellipsis");
    }
    expect(metrics.some((metric) => metric.labelOverflow > 1)).toBe(true);
  } finally {
    if (opened) await opened.context.close();
    await fetch(`${server.baseUrl}/api/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "primary", clientId, primaryClientId: "performance-baseline" })
    });
    await action(server.baseUrl, "startListLayout", { parallel: false });
    await action(server.baseUrl, "startLists", { startLists: originalLists });
  }
});

test("Diagnostics switches the layout of exactly two lists on one screen", async ({ browser }) => {
  const screenId = "visual-layout-screen";
  const primaryId = "visual-layout-controller";
  let screen = null;
  let primary = null;
  let extraScreen = null;
  try {
    screen = await openModern(browser, server.baseUrl, screenId, { width: 1000, height: 800 }, [0, 1]);
    await action(server.baseUrl, "primary", { primaryClientId: null });
    const primaryContext = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    await primaryContext.addInitScript((id) => {
      window.sessionStorage.setItem("boulderingTimerClientId", id);
    }, primaryId);
    const primaryPage = await primaryContext.newPage();
    primary = { context: primaryContext, page: primaryPage };
    await primaryPage.goto(`${server.baseUrl}/`, { waitUntil: "domcontentloaded" });
    extraScreen = await openModern(browser, server.baseUrl, "visual-layout-extra-screen", { width: 800, height: 600 }, [0]);
    await action(server.baseUrl, "primary", { clientId: primaryId, primaryClientId: primaryId });
    await primary.page.waitForFunction(() => document.body.classList.contains("controls-ready")
      && !document.body.classList.contains("viewer-mode"), null, { timeout: 5_000 });
    await screen.page.waitForFunction(() => document.body.classList.contains("viewer-mode"), null, { timeout: 5_000 });
    const browserNumbersToggle = primary.page.locator("#browserNumbersToggle");
    await expect(browserNumbersToggle).toBeVisible();
    const togglePlacement = await browserNumbersToggle.evaluate((button) => {
      const card = button.closest(".browser-item");
      const cardRect = card.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      return {
        isPrimary: card.classList.contains("primary-browser"),
        top: buttonRect.top - cardRect.top,
        right: cardRect.right - buttonRect.right,
        insideHeading: Boolean(button.closest(".connections-heading"))
      };
    });
    expect(togglePlacement.isPrimary).toBe(true);
    expect(togglePlacement.insideHeading).toBe(false);
    expect(Math.abs(togglePlacement.top - 4)).toBeLessThanOrEqual(1);
    expect(Math.abs(togglePlacement.right - 3)).toBeLessThanOrEqual(1);
    const layoutButton = primary.page.locator(`[data-start-list-layout-client="${screenId}"]`);
    await expect(layoutButton).toHaveCount(1);
    await expect(layoutButton).toBeVisible();
    await expect(layoutButton).toHaveText("|");
    const screenCard = layoutButton.locator("xpath=ancestor::*[contains(@class, 'browser-item')]");
    await expect(screenCard.locator(".start-list-layout-overridden")).toHaveCount(0);
    const listLabels = await screenCard.locator("[data-start-list-client]").allTextContents();
    expect(listLabels).toEqual(["LIST 1", "LIST 2", "LIST 3", "LIST 4"]);
    const layoutIcon = await layoutButton.evaluate((button) => {
      const before = getComputedStyle(button, "::before");
      const after = getComputedStyle(button, "::after");
      return {
        beforeWidth: parseFloat(before.width),
        afterDisplay: after.display
      };
    });
    expect(layoutIcon.beforeWidth).toBe(2);
    expect(layoutIcon.afterDisplay).toBe("none");
    const pinButton = screenCard.locator("[data-browser-pin]");
    await expect(pinButton.locator("g")).toHaveAttribute("transform", "rotate(45 8 8)");
    await expect(pinButton.locator(".browser-pin-needle")).toHaveClass(/sharp/);
    await expect(pinButton.locator(".browser-pin-tip")).toHaveCount(1);
    await pinButton.click();
    await expect(pinButton).toHaveClass(/active/);
    await expect(pinButton.locator("g")).not.toHaveAttribute("transform", /.+/);
    await expect(pinButton.locator(".browser-pin-needle")).not.toHaveClass(/sharp/);
    await expect(pinButton.locator(".browser-pin-tip")).toHaveCount(0);
    await pinButton.click();
    await expect(pinButton).not.toHaveClass(/active/);
    const timeButton = screenCard.locator(`[data-server-time-client="${screenId}"]`);
    const diagnosticLabels = await screenCard
      .locator(".diag-row:not(.start-list-diag-row) > .diag-chip")
      .allTextContents();
    expect(diagnosticLabels).toEqual(["LEGACY", "AUDIO", "TIME", "NET", "SYNC", "SSE", "TAB"]);
    await expect(timeButton).toHaveText("TIME");
    await expect(timeButton).toHaveClass(/inactive/);
    await expect(screenCard.locator(".diag-chip", { hasText: "TAB" })).toHaveAttribute("title", /Wake Lock/);
    await expect(screen.page.locator("#serverClockDisplay")).toBeHidden();
    await timeButton.click();
    await expect(timeButton).not.toHaveClass(/inactive/);
    await expect(screen.page.locator("#serverClockDisplay")).toBeVisible();
    await expect(screen.page.locator("#serverClockDisplay")).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
    const clockGeometry = await screen.page.evaluate(() => {
      const timer = document.getElementById("time").getBoundingClientRect();
      const clock = document.getElementById("serverClockDisplay").getBoundingClientRect();
      const timerColumn = document.querySelector(".timer-column").getBoundingClientRect();
      const style = getComputedStyle(document.getElementById("serverClockDisplay"));
      return {
        timerHeight: timer.height,
        clockWidth: clock.width,
        clockHeight: clock.height,
        clockTop: clock.top,
        timerBottom: timer.bottom,
        bottomGap: timerColumn.bottom - clock.bottom,
        footerDisplay: getComputedStyle(document.querySelector(".timer-column footer")).display,
        progressDisplay: getComputedStyle(document.getElementById("progressTrack")).display,
        fontFamily: style.fontFamily,
        fontSize: parseFloat(style.fontSize),
        fontWeight: style.fontWeight,
        backgroundImage: style.backgroundImage,
        borderRadius: parseFloat(style.borderRadius)
      };
    });
    expect(clockGeometry.clockHeight).toBeLessThan(clockGeometry.timerHeight / 2);
    expect(clockGeometry.clockWidth / clockGeometry.fontSize).toBeLessThan(6.5);
    expect(clockGeometry.clockTop).toBeGreaterThanOrEqual(clockGeometry.timerBottom);
    expect(Math.abs(clockGeometry.bottomGap - clockGeometry.clockHeight), JSON.stringify(clockGeometry)).toBeLessThanOrEqual(1);
    expect(clockGeometry.footerDisplay).toBe("none");
    expect(clockGeometry.progressDisplay).toBe("none");
    expect(clockGeometry.fontFamily).toContain("FDV LCD");
    expect(Number(clockGeometry.fontWeight)).toBeGreaterThanOrEqual(700);
    expect(clockGeometry.backgroundImage).not.toBe("none");
    expect(clockGeometry.borderRadius).toBeGreaterThan(0);
    await timeButton.click();
    await expect(screen.page.locator("#serverClockDisplay")).toBeHidden();
    const placement = await layoutButton.evaluate((button) => {
      const card = button.closest(".browser-item");
      const row = button.closest(".start-list-diag-row");
      const listButtons = [...row.querySelectorAll("[data-start-list-client]")];
      const lastListRect = listButtons.at(-1).getBoundingClientRect();
      const previousListRect = listButtons.at(-2).getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      return {
        width: buttonRect.width,
        height: buttonRect.height,
        listWidth: lastListRect.width,
        listHeight: lastListRect.height,
        layoutGap: buttonRect.left - lastListRect.right,
        ordinaryGap: lastListRect.left - previousListRect.right,
        rightInset: cardRect.right - buttonRect.right
      };
    });
    expect(placement.width).toBe(placement.listWidth);
    expect(placement.height).toBe(placement.listHeight);
    expect(placement.layoutGap).toBeGreaterThan(placement.ordinaryGap);
    expect(placement.rightInset).toBeGreaterThanOrEqual(0);
    const layoutResponse = await fetch(`${server.baseUrl}/api/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "startListClientLayout",
        clientId: primaryId,
        targetClientId: screenId,
        parallel: true
      })
    });
    expect(layoutResponse.ok).toBe(true);
    const layoutState = await layoutResponse.json();
    expect(layoutState.clients.find((client) => client.id === screenId).startListParallel).toBe(true);
    await screen.page.waitForFunction(() => document.querySelectorAll(".start-list-column").length === 2, null, { timeout: 5_000 });
    await expect(layoutButton).toHaveText("||");
    await expect(layoutButton).toHaveClass(/start-list-layout-overridden/);
    await expect(screenCard.locator("[data-start-list-client].start-list-selected")).toHaveCount(2);
    await expect(screenCard.locator("[data-start-list-client].start-list-layout-overridden")).toHaveCount(0);
    const parallelIcon = await layoutButton.evaluate((button) => ({
      width: parseFloat(getComputedStyle(button, "::before").width),
      centerGap: parseFloat(getComputedStyle(button, "::after").left)
        - parseFloat(getComputedStyle(button, "::before").left),
      secondDisplay: getComputedStyle(button, "::after").display
    }));
    expect(parallelIcon.width).toBe(2);
    expect(parallelIcon.centerGap).toBe(6);
    expect(parallelIcon.secondDisplay).not.toBe("none");
    await fetch(`${server.baseUrl}/api/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "startListDisplay",
        clientId: primaryId,
        targetClientId: screenId,
        listIndex: 0,
        enabled: false
      })
    });
    await expect(layoutButton).toHaveCount(0);
  } finally {
    if (primary) {
      await fetch(`${server.baseUrl}/api/action`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "primary",
          clientId: "performance-baseline",
          primaryClientId: "performance-baseline"
        })
      }).catch(() => {});
      await primary.context.close();
    }
    if (extraScreen) await extraScreen.context.close();
    if (screen) await screen.context.close();
  }
});

test("Legacy screen renders the optional server clock below its main timer", async ({ browser }) => {
  const clientId = "visual-legacy-server-clock";
  const opened = await openLegacy(browser, server.baseUrl, clientId, { width: 1000, height: 800 }, [0]);
  try {
    await action(server.baseUrl, "startListEnabled", { enabled: false });
    await opened.page.waitForFunction(() => !document.body.classList.contains("protocol-visible"));
    await opened.page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await wait(250);
    await expect(opened.page.locator("#serverClock")).toBeHidden();
    const timerBeforeClock = await opened.page.evaluate(() => {
      const timer = document.getElementById("time");
      return {
        fontSize: parseFloat(getComputedStyle(timer).fontSize),
        top: timer.getBoundingClientRect().top
      };
    });
    await action(server.baseUrl, "clientServerTime", { targetClientId: clientId, enabled: true });
    await expect(opened.page.locator("#serverClock")).toBeVisible();
    await expect(opened.page.locator("#serverClockText")).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
    const geometry = await opened.page.evaluate(() => {
      const timer = document.getElementById("time").getBoundingClientRect();
      const clock = document.getElementById("serverClock").getBoundingClientRect();
      const timerWrap = document.getElementById("wrap").getBoundingClientRect();
      const style = getComputedStyle(document.getElementById("serverClock"));
      return {
        clockHeight: clock.height,
        clockTop: clock.top,
        clockBottom: clock.bottom,
        viewportHeight: window.innerHeight,
        bottomGap: timerWrap.bottom - clock.bottom,
        timerFontSize: parseFloat(getComputedStyle(document.getElementById("time")).fontSize),
        clockFontSize: parseFloat(style.fontSize),
        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight,
        borderRadius: parseFloat(style.borderRadius)
      };
    });
    expect(geometry.clockFontSize).toBeLessThan(geometry.timerFontSize / 2);
    expect(Math.abs(geometry.timerFontSize - timerBeforeClock.fontSize)).toBeLessThanOrEqual(1);
    expect(geometry.clockTop).toBeGreaterThan(geometry.viewportHeight * 0.6);
    expect(geometry.clockBottom).toBeLessThanOrEqual(geometry.viewportHeight);
    expect(Math.abs(geometry.bottomGap - geometry.clockHeight)).toBeLessThanOrEqual(1);
    expect(geometry.fontFamily).toContain("FDV LCD");
    expect(Number(geometry.fontWeight)).toBeGreaterThanOrEqual(700);
    expect(geometry.borderRadius).toBeGreaterThan(0);
  } finally {
    await action(server.baseUrl, "clientServerTime", { targetClientId: clientId, enabled: false }).catch(() => {});
    await action(server.baseUrl, "startListEnabled", { enabled: true }).catch(() => {});
    await opened.context.close();
  }
});

test("Legacy classic countdown starts from the same absolute timestamp after the network disappears", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  let stateRequests = 0;
  await page.route("**/api/state?**", async (route) => {
    stateRequests += 1;
    if (stateRequests > 1) {
      await route.abort("internetdisconnected");
      return;
    }
    const response = await route.fetch();
    const remote = await response.json();
    const now = Date.now();
    await route.fulfill({
      response,
      json: {
        ...remote,
        now,
        running: true,
        completed: false,
        countdownOnly: false,
        waitingForManualStart: false,
        startedAt: now + 1500,
        elapsedBeforePause: 0,
        activePreset: "classic",
        runtimePreset: "classic",
        activeSettings: { ...remote.activeSettings, rotationSeconds: 10, breakSeconds: 0, oneShot: false },
        manualLegacy: true,
        legacyRedirect: false,
        showServerTime: true,
        legacyProtocols: []
      }
    });
  });
  try {
    await page.goto(`${server.baseUrl}/legacy.html?manualLegacy=1&oldBrowser=1&clientId=visual-legacy-offline-start`, {
      waitUntil: "domcontentloaded"
    });
    await expect(page.locator("#time")).toHaveText("00:02");
    const clockBefore = await page.locator("#serverClockText").textContent();
    await wait(5_600);
    await expect(page.locator("body")).toHaveClass(/offline/);
    await expect(page.locator("#time")).toHaveText(/00:0[45]/);
    const clockAfter = await page.locator("#serverClockText").textContent();
    expect(clockAfter).not.toBe(clockBefore);
  } finally {
    await context.close();
  }
});

test("Legacy short TV viewport keeps the server clock clear of the main timer", async ({ browser }) => {
  const clientId = "visual-legacy-short-server-clock";
  const opened = await openLegacy(browser, server.baseUrl, clientId, { width: 962, height: 541 }, [0]);
  try {
    await action(server.baseUrl, "startListEnabled", { enabled: false });
    await opened.page.waitForFunction(() => !document.body.classList.contains("protocol-visible"));
    await opened.page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await wait(250);
    const timerBeforeClock = await opened.page.evaluate(() => {
      const timer = document.getElementById("time");
      return {
        fontSize: parseFloat(getComputedStyle(timer).fontSize),
        top: timer.getBoundingClientRect().top
      };
    });
    await action(server.baseUrl, "clientServerTime", { targetClientId: clientId, enabled: true });
    await expect(opened.page.locator("#serverClock")).toBeVisible();
    const geometry = await opened.page.evaluate(() => {
      const wrap = document.getElementById("wrap").getBoundingClientRect();
      const clock = document.getElementById("serverClock").getBoundingClientRect();
      const timer = document.getElementById("time").getBoundingClientRect();
      const timerFontSize = parseFloat(getComputedStyle(document.getElementById("time")).fontSize);
      return {
        clockHeight: clock.height,
        bottomGap: wrap.bottom - clock.bottom,
        timerTop: timer.top,
        timerFontSize
      };
    });
    expect(Math.abs(geometry.timerFontSize - timerBeforeClock.fontSize)).toBeLessThanOrEqual(1);
    expect(Math.abs((timerBeforeClock.top - geometry.timerTop) - geometry.clockHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.bottomGap - geometry.clockHeight)).toBeLessThanOrEqual(1);
  } finally {
    await action(server.baseUrl, "clientServerTime", { targetClientId: clientId, enabled: false }).catch(() => {});
    await action(server.baseUrl, "startListEnabled", { enabled: true }).catch(() => {});
    await opened.context.close();
  }
});

test("Legacy TV fallback keeps column headers visible after automatic scrolling", async ({ browser }) => {
  const { context, page } = await openLegacy(
    browser,
    server.baseUrl,
    "visual-legacy-tv-sticky",
    { width: 962, height: 541 },
    [0, 3],
    true
  );
  try {
    await page.locator(".protocol-scroll").evaluateAll((scrolls) => {
      for (const scroll of scrolls) {
        scroll.scrollTop = 600;
        scroll.dispatchEvent(new Event("scroll"));
      }
    });
    await wait(100);
    const headers = await page.evaluate(() => [...document.querySelectorAll(".protocol-scroll")].map((scroll) => {
      const cells = [...scroll.querySelectorAll("thead th")];
      const routeCell = cells[cells.length - 1];
      const scrollRect = scroll.getBoundingClientRect();
      const cellRects = cells.map((cell) => cell.getBoundingClientRect());
      const routeRect = routeCell.getBoundingClientRect();
      const topElement = document.elementFromPoint(
        routeRect.left + routeRect.width / 2,
        routeRect.top + routeRect.height / 2
      );
      return {
        scrollTop: scroll.scrollTop,
        deltas: cellRects.map((rect) => rect.top - scrollRect.top),
        cellBottom: routeRect.bottom,
        scrollTopEdge: scrollRect.top,
        routeText: routeCell.textContent.trim(),
        routeCellOnTop: topElement === routeCell || routeCell.contains(topElement)
      };
    }));
    await expect(page.locator("body")).toHaveClass(/protocol-sticky-fallback/);
    for (const header of headers) {
      expect(header.scrollTop).toBeGreaterThan(0);
      for (const delta of header.deltas) expect(Math.abs(delta)).toBeLessThanOrEqual(1);
      expect(header.cellBottom).toBeGreaterThan(header.scrollTopEdge);
      expect(header.routeText).toBe("5");
      expect(header.routeCellOnTop).toBe(true);
    }
    const dataCells = await page.locator(".protocol-table tbody .protocol-data-cell").evaluateAll((cells) => cells.map((cell) => ({
      clientWidth: cell.clientWidth,
      scrollWidth: cell.scrollWidth,
      textOverflow: getComputedStyle(cell).textOverflow
    })));
    for (const cell of dataCells) {
      expect(cell.textOverflow).not.toBe("ellipsis");
      expect(cell.scrollWidth - cell.clientWidth).toBeLessThanOrEqual(1);
    }
    await expect(page).toHaveScreenshot("legacy-tv-sticky-fallback.png", { fullPage: false });
  } finally {
    await context.close();
  }
});

test("Legacy TV remains stable after four protocols become two and the timer stops", async ({ browser }) => {
  const { context, page } = await openLegacy(
    browser,
    server.baseUrl,
    "visual-legacy-tv-transition",
    { width: 962, height: 541 },
    [0, 1, 2, 3]
  );
  try {
    await selectProtocols(server.baseUrl, "visual-legacy-tv-transition", [0, 3]);
    await action(server.baseUrl, "reset", {
      activePreset: "classic",
      settings: { rotationSeconds: 8, breakSeconds: 3, oneShot: false }
    });
    await page.waitForFunction(() => document.querySelectorAll(".protocol-table").length === 2);
    await wait(300);
    const metrics = await page.evaluate(() => {
      const pane = document.getElementById("protocolPane").getBoundingClientRect();
      const columns = [...document.querySelectorAll(".protocol-column")].map((column) => column.getBoundingClientRect());
      const slots = [...document.querySelectorAll(".protocol-slot")].map((slot) => slot.getBoundingClientRect());
      const tables = [...document.querySelectorAll(".protocol-table")];
      const widths = tables.map((table) => [...table.querySelectorAll("thead th")].map((cell) => cell.getBoundingClientRect().width));
      return {
        pane: pane.toJSON(),
        columns: columns.map((rect) => rect.toJSON()),
        slots: slots.map((rect) => rect.toJSON()),
        widths
      };
    });
    expect(metrics.columns).toHaveLength(1);
    expect(metrics.slots).toHaveLength(2);
    expect(Math.abs(metrics.pane.right - 962)).toBeLessThanOrEqual(1);
    expect(Math.abs(metrics.columns[0].right - metrics.pane.right)).toBeLessThanOrEqual(1);
    for (const slot of metrics.slots) {
      expect(Math.abs(slot.left - metrics.pane.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(slot.right - metrics.pane.right)).toBeLessThanOrEqual(1);
    }
    expect(metrics.widths[0].length).toBe(metrics.widths[1].length);
    metrics.widths[0].forEach((width, index) => {
      expect(Math.abs(width - metrics.widths[1][index])).toBeLessThanOrEqual(1);
    });
    await expect(page).toHaveScreenshot("legacy-tv-two-after-stop.png", { fullPage: false });
  } finally {
    await context.close();
  }
});

for (const scenario of [
  { name: "Modern 1000x1000 with four protocols", modern: true },
  { name: "Legacy 1000x1000 with four protocols", modern: false }
]) {
  test(`${scenario.name} keeps every protocol inside the viewport`, async ({ browser }) => {
    const clientId = scenario.modern ? "visual-modern-square" : "visual-legacy-square";
    const opened = scenario.modern
      ? await openModern(browser, server.baseUrl, clientId, { width: 1000, height: 1000 }, [0, 1, 2, 3])
      : await openLegacy(browser, server.baseUrl, clientId, { width: 1000, height: 1000 }, [0, 1, 2, 3]);
    try {
      const selector = scenario.modern ? ".start-list-slot" : ".protocol-slot";
      const rects = await opened.page.locator(selector).evaluateAll((slots) => slots.map((slot) => slot.getBoundingClientRect().toJSON()));
      expect(rects).toHaveLength(4);
      for (const rect of rects) {
        expect(rect.left).toBeGreaterThanOrEqual(-1);
        expect(rect.top).toBeGreaterThanOrEqual(-1);
        expect(rect.right).toBeLessThanOrEqual(1001);
        expect(rect.bottom).toBeLessThanOrEqual(1001);
        expect(rect.width).toBeGreaterThan(0);
        expect(rect.height).toBeGreaterThan(0);
      }
      await action(server.baseUrl, "showBrowserNumbers", { enabled: true });
      const badge = opened.page.locator("#browserNumberBadge");
      await expect(badge).toBeVisible();
      const badgePlacement = await opened.page.evaluate((modern) => {
        const badgeElement = document.getElementById("browserNumberBadge");
        const timerElement = document.querySelector(modern ? ".timer-column" : "#timerPane");
        const badgeRect = badgeElement.getBoundingClientRect();
        const timerRect = timerElement.getBoundingClientRect();
        return {
          timerRight: timerRect.right,
          topOffset: badgeRect.top - timerRect.top,
          rightOffset: timerRect.right - badgeRect.right
        };
      }, scenario.modern);
      expect(badgePlacement.timerRight).toBeLessThan(999);
      expect(Math.abs(badgePlacement.topOffset - 12)).toBeLessThanOrEqual(1);
      expect(Math.abs(badgePlacement.rightOffset - 12)).toBeLessThanOrEqual(1);
    } finally {
      await action(server.baseUrl, "showBrowserNumbers", { enabled: false });
      await opened.context.close();
    }
  });
}
