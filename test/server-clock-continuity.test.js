"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fixture, clockOrigin } = require("./helpers/controlled-clock-server");

test("native macOS clocks run without repairs on an isolated real server", { timeout: 15000 }, async (t) => {
  if (process.platform !== "darwin") return t.skip("Physical macOS clock check");
  const server = await fixture(t, null);
  const started = await server.start();
  const observedAt = performance.now();
  let maximumErrorMs = 0;
  for (let check = 0; check < 6; check += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const state = await server.state();
    const expected = started.elapsed + (performance.now() - observedAt) / 1000;
    maximumErrorMs = Math.max(maximumErrorMs, Math.abs(state.elapsed - expected) * 1000);
    assert.equal(state.version, started.version);
    assert.equal(state.clockDiagnostics.continuityAnomalyCount, 0);
    assert.equal(state.clockDiagnostics.current.status, "neutral");
  }
  assert.ok(maximumErrorMs < 250, `elapsed divergence ${maximumErrorMs.toFixed(3)} ms`);
  assert.equal(server.output.join("").includes("FDV_SERVER_CLOCK_REPAIR"), false);
  t.diagnostic(`native-clock elapsed divergence <= ${maximumErrorMs.toFixed(3)} ms`);
});

test("macOS integer uptime leaves elapsed and version unchanged during an ordinary run and sleep", { timeout: 15000 }, async (t) => {
  const server = await fixture(t, "darwin");
  const started = await server.start();
  let mono = 0;
  for (let check = 0; check < 40; check += 1) {
    mono += check % 2 ? 3650.25 : 2350.75;
    server.frame(mono);
    const state = await server.state();
    assert.ok(Math.abs(state.elapsed - mono / 1000) < 0.001);
    assert.equal(state.startedAt, started.startedAt);
    assert.equal(state.version, started.version);
    assert.equal(state.clockDiagnostics.continuityAnomalyCount, 0);
  }
  mono += 120000;
  server.frame(mono);
  const afterSleep = await server.state();
  assert.ok(Math.abs(afterSleep.elapsed - mono / 1000) < 0.001);
  assert.equal(afterSleep.version, started.version);
  assert.equal(afterSleep.clockDiagnostics.current.monotonicIncludesSleep, true);
  assert.equal(server.output.join("").includes("FDV_SERVER_CLOCK_REPAIR"), false);
});

test("a confirmed sleep advances across a rotation, broadcasts and saves exactly one correction", { timeout: 15000 }, async (t) => {
  const server = await fixture(t, "linux");
  const started = await server.start({ elapsedBeforePause: 58 });
  const controller = new AbortController();
  t.after(() => controller.abort());
  const response = await fetch(`${server.baseUrl}/api/events?clientId=clock-screen`, { signal: controller.signal });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let events = "";
  const nextState = async () => {
    while (true) {
      const boundary = events.indexOf("\n\n");
      if (boundary >= 0) {
        const block = events.slice(0, boundary);
        events = events.slice(boundary + 2);
        if (block.startsWith("event: state")) return JSON.parse(block.split("\ndata: ")[1]);
        continue;
      }
      const chunk = await reader.read();
      if (chunk.done) throw new Error("SSE closed before the correction");
      events += decoder.decode(chunk.value, { stream: true });
    }
  };
  await nextState();
  server.frame(63240, 3240, 63000);
  const restored = await server.state();
  assert.equal(restored.elapsed, 121.24);
  assert.equal(Math.floor(restored.elapsed / 75) + 1, 2);
  assert.equal(restored.version, started.version + 1);
  assert.equal(restored.clockDiagnostics.current.reason, "suspension-repaired");
  assert.equal(restored.clockDiagnostics.history[0].correctionMs, 60000);
  assert.equal((await nextState()).elapsed, 121.24);
  controller.abort();
  const saved = server.snapshot();
  assert.equal(saved.runningElapsedAtSave, 121.24);
  assert.equal(saved.timerState.version, restored.version);
  server.frame(66480, 6480, 66000);
  const later = await server.state();
  assert.equal(later.elapsed, 124.48);
  assert.equal(later.version, restored.version);
  assert.equal(later.clockDiagnostics.continuityAnomalyCount, 1);
  assert.equal((server.output.join("").match(/FDV_SERVER_CLOCK_REPAIR /g) || []).length, 1);
  server.frame(96480, 36480, 96000);
  assert.equal((await server.state()).clockDiagnostics.current.status, "neutral");
});

test("system clock steps preserve elapsed and allow pause on macOS, Windows and Linux", { timeout: 20000 }, async (t) => {
  for (const platform of ["darwin", "win32", "linux"]) {
    for (const adjustment of [-120000, 120000]) {
      const server = await fixture(t, platform);
      const started = await server.start();
      // A wall-clock step must be handled even before the normal 3 s check.
      server.frame(500 + adjustment, 500, 0);
      const stepped = await server.state();
      assert.equal(stepped.elapsed, 0.5, platform);
      assert.equal(stepped.startedAt, clockOrigin + adjustment);
      assert.equal(stepped.clockDiagnostics.current.reason, "wall-clock-adjustment");
      assert.equal(stepped.clockDiagnostics.history[0].correctionMs, 0);
      assert.equal(stepped.version, started.version, "calendar adjustment must not replace client audio");
      assert.equal(stepped.timerClock.startedAt, started.timerClock.startedAt);
      assert.equal(stepped.timerClock.now - started.timerClock.now, 500);
      assert.equal(stepped.timerClock.sentAt - stepped.timerClock.receivedAt, 0);
      server.frame(6480 + adjustment, 6480, 6000);
      const paused = await server.action({ type: "pause" });
      assert.equal(paused.running, false);
      assert.equal(paused.elapsed, 6.48);
      assert.equal(server.output.join("").includes("FDV_SERVER_CLOCK_REPAIR"), false);
    }
  }
});

test("ambiguous sleep and system clock changes do not move the timer or latch SYNC", { timeout: 15000 }, async (t) => {
  const server = await fixture(t, "linux");
  const started = await server.start();
  server.frame(123240, 3240, 63000);
  const ambiguous = await server.state();
  assert.equal(ambiguous.elapsed, 3.24);
  assert.equal(ambiguous.version, started.version);
  assert.equal(ambiguous.clockDiagnostics.current.status, "bad");
  server.frame(126480, 6480, 66000);
  const stable = await server.state();
  assert.equal(stable.elapsed, 6.48);
  assert.equal(stable.clockDiagnostics.current.status, "neutral");
  assert.equal(stable.clockDiagnostics.continuityAnomalyCount, 1);
});

test("a confirmed sleep completes a one-shot timer and saves its final duration", { timeout: 15000 }, async (t) => {
  const server = await fixture(t, "win32");
  await server.start({ activePreset: "final", settings: { rotationSeconds: 60, breakSeconds: 0, oneShot: true } });
  server.frame(63240, 3240, 63000);
  const completed = await server.state();
  assert.equal(completed.running, false);
  assert.equal(completed.completed, true);
  assert.equal(completed.elapsed, 60);
  assert.equal((await server.state()).version, completed.version);
  assert.equal(server.snapshot().timerState.completed, true);
  assert.equal(server.snapshot().runningElapsedAtSave, 60);
});

test("future scheduled starts keep their wall target when system time changes", { timeout: 15000 }, async (t) => {
  const server = await fixture(t, "darwin");
  const scheduledTime = new Date(clockOrigin + 60000);
  const started = await server.start({ startMode: "scheduled",
    startHours: scheduledTime.getHours(), startMinutes: scheduledTime.getMinutes() });
  assert.equal(started.startedAt, clockOrigin + 60000);
  server.frame(30000);
  assert.equal((await server.state()).elapsed, 0);
  server.frame(-87000, 33000, 33000);
  const waiting = await server.state();
  assert.equal(waiting.startedAt, started.startedAt);
  assert.equal(waiting.elapsed, 0);
  server.frame(60000, 36000, 36000);
  assert.equal((await server.state()).elapsed, 0);
  server.frame(63240, 39240, 39000);
  const running = await server.state();
  assert.equal(running.elapsed, 3.24);
  assert.equal(running.startedAt, started.startedAt);
  assert.equal(running.version, started.version + 2, "only pending wall-target changes reschedule the start");
  assert.equal(running.timerClock.startedAt, clockOrigin + 36000);
  assert.equal(running.clockDiagnostics.continuityAnomalyCount, 0, JSON.stringify(running.clockDiagnostics.history));
});

test("paused server clock survives wall changes and commands use the measured timer coordinate", async (t) => {
  const server = await fixture(t, "darwin");
  const before = await server.state();
  server.frame(121000, 1000, 1000);
  const idle = await server.state();
  assert.equal(idle.timerClock.now - before.timerClock.now, 1000);
  const started = await server.start();
  server.frame(122000, 2000, 2000);
  const paused = await server.action({ type: "pause", baseServerInstanceId: started.serverInstanceId,
    intendedTimerTime: started.timerClock.now + 500 });
  assert.equal(paused.elapsed, 0.5);
  assert.equal(paused.running, false);
});

test("confirmed sleep advances the public timer clock while the competition is paused", async (t) => {
  const server = await fixture(t, "linux");
  const before = await server.state();
  server.frame(61000, 1000, 61000);
  const after = await server.state();
  assert.equal(after.timerClock.now - before.timerClock.now, 61000);
  assert.equal(after.elapsed, before.elapsed);
  const started = await server.start();
  server.frame(62000, 2000, 62000);
  const running = await server.state();
  assert.equal(running.elapsed, 1);
  assert.equal(running.timerClock.startedAt, started.timerClock.startedAt);
});
