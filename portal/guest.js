"use strict";

(function () {
  var screen = window.FDVGuestScreen;
  var time = document.getElementById("time");
  var minutes = document.getElementById("timeMinutes");
  var seconds = document.getElementById("timeSeconds");
  var notice = document.getElementById("guest-notice");
  var rotation = document.getElementById("guest-rotation");
  var snapshot, settings, appearanceKey, font, paint, fitQueued = false;
  var clockTime = 0, clockAt = 0, clockRate = 1;
  var samples = [];
  var unavailable = "Подключение…";

  function fit() {
    if (fitQueued) return;
    fitQueued = true;
    window.requestAnimationFrame(function () {
      fitQueued = false;
      screen.fit();
    });
  }

  function appearance(config) {
    var key = JSON.stringify(config);
    if (appearanceKey === key) return;
    appearanceKey = key;
    var colors = {
      "countdown-text": "countdownTextColor", "countdown-bg": "countdownBackgroundColor",
      "rotation-text": "rotationTextColor", "rotation-bg": "rotationBackgroundColor",
      "warning-text": "rotationLastFiveTextColor", "warning-bg": "rotationLastFiveBackgroundColor",
      "break-text": "breakTextColor", "break-bg": "breakBackgroundColor"
    };
    var styles = document.documentElement.style;
    Object.keys(colors).forEach(function (key) {
      var value = config[colors[key]];
      if (window.CSS && CSS.supports("color", value)) styles.setProperty("--timer-" + key, value);
    });
    var fallback = config.timerFont || "Arial, sans-serif";
    styles.setProperty("--timer-font-family", fallback);
    if (font && document.fonts) document.fonts.delete(font);
    font = null;
    var url = String(config.timerFontUrl || "");
    if (/^fonts\/[A-Za-z0-9_-]+\.(woff2?|ttf|otf)$/i.test(url) && window.FontFace && document.fonts) {
      var pending = new FontFace("Bouldering Timer Font", "url(" + JSON.stringify("/" + url) + ")",
        { weight: "100 1000", display: "swap" });
      font = pending;
      pending.load().then(function () {
        if (font !== pending) return;
        document.fonts.add(pending);
        styles.setProperty("--timer-font-family", '"Bouldering Timer Font", ' + fallback);
        fit();
      }).catch(function () {});
    }
    fit();
  }

  function calibrate(data, sent, received) {
    // Same midpoint and least-delay sampling rule as the regular FDV screen.
    var clock = data.clock;
    if (!snapshot || snapshot.instance !== data.instance) samples = [];
    var processing = Math.max(0, clock.sentAt - clock.receivedAt);
    samples.push({ local: (sent + received) / 2, server: (clock.receivedAt + clock.sentAt) / 2,
      delay: Math.max(0, received - sent - processing), at: received });
    samples = samples.filter(function (sample) { return received - sample.at < 30000; }).slice(-20);
    var best = samples.slice().sort(function (a, b) { return a.delay - b.delay; }).slice(0, 5);
    clockRate = Number(clock.rate) || 1;
    var values = best.map(function (sample) { return sample.server + (received - sample.local) * clockRate; })
      .sort(function (a, b) { return a - b; });
    var middle = Math.floor(values.length / 2);
    clockTime = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
    clockAt = received;
  }

  function text(part) {
    if (minutes.textContent.length !== part.minutes.length) fit();
    if (minutes.textContent !== part.minutes) minutes.textContent = part.minutes;
    if (seconds.textContent !== part.seconds) seconds.textContent = part.seconds;
    time.setAttribute("aria-label", part.minutes + ":" + part.seconds);
  }

  function render() {
    clearTimeout(paint);
    if (!snapshot || unavailable) {
      text({ minutes: "--", seconds: "--" });
      if (rotation) rotation.hidden = true;
      notice.hidden = false;
      notice.textContent = unavailable;
      return;
    }
    var now = performance.now();
    var canonical = clockTime + (now - clockAt) * clockRate;
    var scheduled = snapshot.status === "waitingStart" && canonical < snapshot.startedAt;
    var manualHold = scheduled && snapshot.manualStartElapsed !== null;
    var countdown = !manualHold && (snapshot.countdownOnly || scheduled || snapshot.status === "readyStart");
    var running = snapshot.status === "roundRunning" || (snapshot.status === "waitingStart" && !scheduled && !snapshot.countdownOnly);
    var remaining = 0, segment = null;
    var displayedElapsed = snapshot.elapsed;
    if (manualHold) {
      displayedElapsed = snapshot.manualStartElapsed;
      segment = screen.segment(displayedElapsed);
      remaining = segment ? segment.end - segment.start : 0;
    } else if (scheduled) remaining = (snapshot.startedAt - canonical) / 1000;
    else if (snapshot.status === "ready") remaining = settings.rotationSeconds;
    else if (running || snapshot.status === "pause") {
      var elapsed = running ? Math.max(0, (canonical - snapshot.startedAt) / 1000) : snapshot.elapsed;
      segment = screen.segment(elapsed);
      var identity = [snapshot.instance, snapshot.version, snapshot.startedAt].join(":");
      var frame = screen.protect({ elapsed: elapsed, segment: segment }, now, running, identity, clockRate);
      displayedElapsed = frame.elapsed;
      segment = frame.segment;
      remaining = segment ? segment.end - frame.elapsed : 0;
    }
    var isBreak = snapshot.status === "completed" || (settings.oneShot && running && !segment)
      || Boolean(segment && segment.type === "break");
    document.body.classList.toggle("countdown-active", countdown);
    document.body.classList.toggle("break-active", isBreak);
    document.body.classList.toggle("warning-active", !manualHold && Boolean(segment && segment.type === "rotation" && remaining > 0 && remaining <= 5));
    document.documentElement.lang = snapshot.language === "en" ? "en" : "ru";
    text(screen.parts(remaining));
    if (rotation && screen.rotationNumber) {
      var number = String(screen.rotationNumber(segment, snapshot, displayedElapsed));
      if (rotation.textContent !== number) rotation.textContent = number;
      rotation.setAttribute("aria-label", (snapshot.language === "en" ? "Rotation " : "Ротация ") + number);
      rotation.hidden = false;
    }
    notice.hidden = snapshot.sourceConnected !== false;
    if (!notice.hidden) {
      notice.dataset.state = "secondary";
      notice.textContent = snapshot.language === "en" ? "Primary server disconnected" : "Нет связи с основным сервером";
    }
    if (scheduled || running) {
      var boundary = manualHold ? snapshot.startedAt - canonical
        : remaining > 0 ? (remaining - (Math.ceil(remaining) - 1)) * 1000 : 100;
      paint = setTimeout(render, Math.max(12, Math.min(1000, boundary / clockRate + 8)));
    }
  }

  var initial = 3;
  function refresh() {
    var request = new XMLHttpRequest();
    var sent = performance.now();
    request.open("GET", "/api/spectator", true);
    request.timeout = 5000;
    request.onloadend = function () {
      var data;
      try { data = JSON.parse(request.responseText); } catch (_) {}
      if (request.status === 200 && data && data.clock) {
        calibrate(data, sent, performance.now());
        snapshot = data;
        unavailable = "";
        settings = { rotationSeconds: data.rotation, breakSeconds: data.rest, oneShot: data.oneShot };
        var theme = data.appearance || {};
        screen.config(settings, Boolean(theme.timerVerticalStretchDefault), theme.timerVerticalStretchMaxPercent);
        appearance(theme);
      } else {
        unavailable = data && data.stopped ? "Сервер остановлен"
          : request.status === 404 ? "Гостевой экран недоступен" : "Нет связи с таймером";
      }
      render();
      setTimeout(refresh, initial-- > 0 && !unavailable ? 150 : 2000);
    };
    request.send();
  }
  window.addEventListener("resize", fit);
  window.addEventListener("orientationchange", fit);
  if (window.ResizeObserver) {
    var observer = new ResizeObserver(fit);
    observer.observe(document.querySelector(".stage"));
    observer.observe(document.querySelector(".timer-wrap"));
  }
  fit();
  refresh();
}());

(function () {
  var stage = document.querySelector(".stage");
  var button = document.createElement("button");
  var body = document.body;
  var root = document.documentElement;
  var hideTimer, tap, lastGesture = -Infinity;
  var nativeActive = false;
  var switching = false;

  button.id = "guest-fullscreen";
  button.type = "button";
  button.className = "exit-fullscreen-button";
  button.style.display = "flex";
  button.style.width = button.style.height = "44px";
  button.style.top = button.style.right = "10px";
  if (window.CSS && CSS.supports("top", "max(10px, env(safe-area-inset-top))")) {
    button.style.top = "max(10px, env(safe-area-inset-top))";
    button.style.right = "max(10px, env(safe-area-inset-right))";
  }
  stage.style.touchAction = "manipulation";
  stage.insertBefore(button, stage.firstChild);

  function nativeFullscreen() {
    return document.fullscreenElement || document.webkitFullscreenElement;
  }
  function active() {
    return body.classList.contains("fullscreen");
  }
  function reveal() {
    var label = root.lang === "en"
      ? (active() ? "Exit full screen" : "Full screen")
      : (active() ? "Выйти из полноэкранного режима" : "На весь экран");
    button.title = label;
    button.setAttribute("aria-label", label);
    button.style.opacity = ".8";
    button.style.pointerEvents = "auto";
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      if (document.activeElement === button) return;
      button.style.opacity = "0";
      button.style.pointerEvents = "none";
    }, 2400);
  }
  function setMode(enabled) {
    body.classList.toggle("fullscreen", enabled);
    button.textContent = enabled ? "×" : "⛶";
    button.setAttribute("aria-pressed", String(enabled));
    reveal();
    window.requestAnimationFrame(window.FDVGuestScreen.fit);
  }
  function toggle() {
    if (switching) return;
    var entering = !active();
    var fullscreen = nativeFullscreen();
    var action = entering ? root.requestFullscreen || root.webkitRequestFullscreen
      : fullscreen && (document.exitFullscreen || document.webkitExitFullscreen);
    setMode(entering);
    if (!action) return;
    switching = true;
    function finished() {
      switching = false;
      if (!entering && nativeFullscreen()) setMode(true);
    }
    try { Promise.resolve(action.call(entering ? root : document)).then(finished, finished); }
    catch (_) { finished(); }
  }
  function onFullscreenChange() {
    if (nativeFullscreen()) {
      nativeActive = true;
      setMode(true);
    } else if (nativeActive) {
      nativeActive = false;
      setMode(false);
    }
  }
  function toggleGesture(event) {
    if (performance.now() - lastGesture < 700) return;
    lastGesture = performance.now();
    tap = null;
    event.preventDefault();
    toggle();
  }
  button.addEventListener("click", function (event) {
    tap = null;
    toggle();
    if (event.detail) button.blur();
  });
  button.addEventListener("focus", reveal);
  button.addEventListener("blur", reveal);
  stage.addEventListener("pointermove", reveal);
  stage.addEventListener("click", reveal);
  stage.addEventListener("dblclick", function (event) {
    if (!button.contains(event.target)) toggleGesture(event);
  });
  stage.addEventListener("touchend", function (event) {
    if (button.contains(event.target) || event.touches.length || event.changedTouches.length !== 1) return;
    reveal();
    var point = event.changedTouches[0];
    var now = performance.now();
    if (tap && now - tap.at <= 550 && Math.hypot(point.clientX - tap.x, point.clientY - tap.y) <= 80) {
      toggleGesture(event);
    } else tap = { at: now, x: point.clientX, y: point.clientY };
  }, { passive: false });
  document.addEventListener("keydown", function (event) {
    if (event.repeat) return;
    if (((event.ctrlKey || event.metaKey) && event.code === "KeyF")
        || (event.key === "Escape" && active() && !nativeFullscreen())) {
      event.preventDefault();
      toggle();
    }
  });
  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onFullscreenChange);
  setMode(false);
}());
