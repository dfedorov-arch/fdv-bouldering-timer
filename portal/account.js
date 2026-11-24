"use strict";

const statusLabel = document.getElementById("instance-status");
const services = {
  new: "Экземпляр ещё не создан",
  stopped: "Сервер остановлен",
  starting: "Сервер запускается",
  stopping: "Сервер останавливается",
  running: "Сервер работает",
  offline: "Сервер не отвечает"
};

function showStatus(status) {
  const running = status.service === "running";
  const ready = running && !status.recovering;
  const active = ["running", "offline"].includes(status.service);
  const availability = { start: ["new", "stopped", "offline"].includes(status.service),
    on: active, ready, pin: ready && status.pin, pair: ready && !status.paired };
  statusLabel.parentElement.dataset.service = status.service;
  if (statusLabel.textContent !== services[status.service]) statusLabel.textContent = services[status.service];
  document.getElementById("instance-build").textContent = status.build ? "Сборка " + status.build : "";
  document.getElementById("countdown-status").textContent = status.recovering ? "Таймер восстанавливает связь"
    : running ? status.running ? "Отсчёт идёт" : "Отсчёт остановлен" : "";
  document.querySelectorAll("button[data-available]").forEach(button => { button.disabled = !availability[button.dataset.available]; });
  const link = document.getElementById("open-instance");
  if (!link) return;
  link.hidden = !running;
  document.getElementById("pin-status").textContent = ready ? status.pin ? "PIN установлен" : "PIN не установлен" : "Статус PIN недоступен";
  const connection = document.getElementById("sec-status");
  connection.dataset.connection = !ready ? "unavailable" : !status.paired ? "unpaired" : status.connected ? "connected" : "disconnected";
  connection.textContent = {
    connected: "Связь с локальным сервером установлена",
    disconnected: "Связь с локальным сервером потеряна",
    unpaired: "Связь с локальным сервером не настроена",
    unavailable: "Статус связи пока недоступен"
  }[connection.dataset.connection];
}

async function refresh() {
  if (document.hidden) return;
  try {
    const response = await fetch("/account/status", { cache: "no-store" });
    if (response.status === 401) { window.location.replace("/login"); return; }
    if (response.ok) showStatus(await response.json());
  } catch (_) {
    statusLabel.textContent = "Не удалось обновить статус";
  }
}

document.querySelectorAll("[data-copy-target]").forEach(copy => {
  const target = document.getElementById(copy.dataset.copyTarget);
  const isInput = target instanceof HTMLInputElement;
  const isCode = target.id === "pairing-code";
  const result = document.getElementById(target.id + "-copy-status");
  copy.hidden = false;
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(isInput ? target.value : target.textContent);
      result.textContent = isCode ? "Код скопирован." : "Ссылка скопирована.";
    } catch (_) {
      if (isInput) {
        target.focus();
        target.select();
      } else {
        window.getSelection().selectAllChildren(target);
      }
      result.textContent = isCode ? "Скопируйте выделенный код." : "Скопируйте выделенный адрес.";
    }
  });
});

setInterval(refresh, 5000);
document.addEventListener("visibilitychange", refresh);
