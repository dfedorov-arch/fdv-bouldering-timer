"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { guestScreenAssets } = require("./screen.cjs");
const createQrCode = require("./vendor/qrcode-generator/qrcode.js");
const guestScreens = new Map();
const html = value => String(value ?? "").replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const newTab = 'target="_blank" rel="noopener"';
const button = (label, href, secondary = false) => `<a class="button${secondary ? " secondary" : ""}" href="${html(href)}" ${newTab}>${html(label)}</a>`;
const form = (action, contents, label) => `<form action="${action}" method="post">${contents}<button>${html(label)}</button></form>`;
const field = (label, name, type = "text", attributes = "") => `<label>${html(label)}<input name="${name}" type="${type}" ${attributes} required></label>`;
function copyIcon(target, label) {
  return `<button class="secondary icon-button" data-copy-target="${html(target)}" type="button" aria-label="${html(label)}" title="${html(label)}" hidden>
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2"/></svg></button>`;
}
function layout(title, content, account = null) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="FDV Bouldering Timer для организации соревнований по боулдерингу."><title>${html(title)} · FDV Bouldering Timer</title><link rel="icon" href="/app-icon.svg" type="image/svg+xml"><link rel="stylesheet" href="/site.css"></head>
<body><header class="header"><div class="wrap top"><a class="brand" href="/"><span class="mark">FDV</span> Bouldering Timer</a><nav>
${account ? `<a href="${account.admin ? "/admin" : "/account"}">${account.admin ? "Управление доступом" : "Мой таймер"}</a>${form("/logout", "", "Выйти")}`
    : '<a href="/#features">Возможности</a><a href="/login">Войти</a>'}</nav></div></header>${content}
<footer><div class="wrap top"><span>FDV Bouldering Timer</span><a href="https://github.com/dfedorov-arch/fdv-bouldering-timer">Проект на GitHub</a></div></footer></body></html>`;
}
function landing(account) {
  return layout("Таймер для соревнований по боулдерингу", `<main>
<section class="hero wrap"><div><h1>Таймер для соревнований по боулдерингу</h1>
<p>Управляйте ходом соревнований с судейского компьютера. Показывайте отсчёт и стартовые списки спортсменам и зрителям на отдельных экранах.</p>
<div class="actions">${button("Скачать таймер", "https://github.com/dfedorov-arch/fdv-bouldering-timer/releases")}${button("Полное руководство", "https://help.fdvtimer.online/", true)}</div></div>
<figure class="hero-image"><a href="/images/overview.png"><img src="/images/overview.png" alt="Судейский экран с отсчётом и стартовым списком"></a></figure></section>
<section class="wrap section" id="features"><h2>От подготовки до финала</h2><div class="features">
<article><h3>Раунды и ротации</h3><p>Выберите нужный формат: Классический, Фестивальный или Финальный, и настройте его «под себя»: от времени ротаций, до звуков и шрифта на экранах.</p></article>
<article><h3>Стартовые списки и экраны</h3><p>Загрузите участников и распределите роли экранов. В соревновательной зоне можно оставить крупный отсчёт, а рядом показать порядок выхода.</p></article>
<article><h3>Публичный резерв</h3><p>Свяжите локальный таймер с вашим публичным экземпляром через интернет. При сбое локального сервера — экраны смогут продолжить работу.</p></article></div></section>
<section class="wrap section"><h2>Как выглядит Таймер</h2><div class="screens">
<figure><a href="/images/classic.png"><img src="/images/classic.png" loading="lazy" alt="Диалог дополнительных ротаций"></a><figcaption>Добавление дополнительной ротации в случае тех. инцидента</figcaption></figure>
<figure><a href="/images/final.png"><img src="/images/final.png" loading="lazy" alt="Отсчёт и стартовый список финала"></a><figcaption>Экран финала в зоне вызова при международном формате</figcaption></figure>
<figure><a href="/images/qualification.png"><img src="/images/qualification.png" loading="lazy" alt="Отсчёт и стартовые списки двух групп"></a><figcaption>Экран в зоне вызова при одновременной квалификации в 2 группах</figcaption></figure>
<figure><a href="/images/secondary.png"><img src="/images/secondary.png" loading="lazy" alt="Диалог подключения резервного сервера"></a><figcaption>Подключение резервного сервера</figcaption></figure></div></section>
<section class="wrap section access"><h2>Публичный таймер</h2><p>Личный кабинет доступен по приглашению. Если ваш адрес уже добавлен администратором, подтвердите его по почте и запустите свой экземпляр.</p>
${account ? "" : `<div class="actions">${button("Зарегистрироваться", "/register")}<a class="button secondary" href="/apply" id="open-application" ${newTab}>Подать заявку на доступ</a></div>
<dialog id="access-application" aria-labelledby="application-title"><div class="top"><h2 id="application-title">Заявка на доступ</h2>
<form method="dialog"><button aria-label="Закрыть">×</button></form></div>${applicationForm()}</dialog><script src="/apply.js" defer></script>`}</section></main>`, account);
}
function panel(title, content, account = null) {
  return layout(title, `<main class="wrap section panel"><h1>${html(title)}</h1>${content}</main>`, account);
}
const notice = message => `<p class="notice" role="status">${html(message)}</p>`;
function applicationForm(values = {}) {
  return form("/apply",
    `<label>ФИО <input name="name" maxlength="120" autocomplete="name" required value="${html(values.name)}"></label>
<label>Email <input name="email" type="email" maxlength="254" autocomplete="email" required value="${html(values.email)}"></label>
<label>Телефон <input name="phone" type="tel" maxlength="40" autocomplete="tel" value="${html(values.phone)}"></label>
<label>Комментарий <textarea name="comment" maxlength="1000" rows="4">${html(values.comment)}</textarea></label>`, "Отправить заявку");
}
function applyPage(message = "", values = {}, submitted = false) {
  return panel("Заявка на доступ", `${message ? notice(message) : ""}${submitted ? button("На главную", "/", true) : applicationForm(values)}`);
}
function login(message) {
  return panel("Вход в кабинет", `${message ? notice(message) : ""}${form("/login", field("Почта или имя администратора", "login", "text", 'autocomplete="username" maxlength="254"')
    + field("Пароль", "password", "password", 'autocomplete="current-password" maxlength="128"'), "Войти")}<p><a href="/register">Регистрация по приглашению</a></p>`);
}
function register(message) {
  return panel("Регистрация", `<p>Введите адрес, который администратор добавил в список приглашённых.</p>${message ? notice(message) : ""}
${form("/register", field("Электронная почта", "email", "email", 'autocomplete="email" maxlength="254"'), "Получить письмо")}`);
}
function verify(token) {
  return panel("Подтверждение почты", `<p>Задайте пароль для входа в кабинет. Минимум 12 символов.</p>${form("/verify",
    `<input type="hidden" name="token" value="${html(token)}">` + field("Пароль", "password", "password", 'autocomplete="new-password" minlength="12" maxlength="128"'), "Подтвердить и войти")}`);
}
const services = { new: "Экземпляр ещё не создан", stopped: "Сервер остановлен", starting: "Сервер запускается",
  stopping: "Сервер останавливается", running: "Сервер работает", offline: "Сервер не отвечает" };
const journalTime = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", dateStyle: "short", timeStyle: "medium" });
const resetLabel = "Перезапустить сервер с очисткой всех данных";
function instanceButton(action, label, availability, disabled = false) {
  return `<form action="/account/${action}" method="post"><button data-available="${availability}"${disabled ? " disabled" : ""}>${label}</button></form>`;
}
function addressField(domain, value) {
  const editing = value !== undefined;
  return `<label for="address-prefix">Адрес таймера</label><div class="address-box address-prefix">
<input id="address-prefix" name="slug" type="text" maxlength="18" placeholder="boulder24" autocomplete="off"
  autocapitalize="off" spellcheck="false" aria-describedby="address-hint"${editing ? ` value="${html(value)}" required` : ""}>
<span>.${html(domain)}</span></div>
<p id="address-hint">${editing ? "До 18 латинских букв, цифр и дефисов. Дефис можно использовать внутри имени." : "Оставьте поле пустым, чтобы получить короткий адрес автоматически."}</p>`;
}
function accountPage(account, links, status, code, message) {
  const url = links.owner;
  const running = status.service === "running";
  const ready = running && !status.recovering;
  const disabled = status.service === "stopped";
  const pinText = ready ? status.pin ? "PIN установлен" : "PIN не установлен" : "Статус PIN недоступен";
  const sec = !ready ? "unavailable" : !status.paired ? "unpaired" : status.connected ? "connected" : "disconnected";
  const secText = { connected: "Связь с локальным сервером установлена", disconnected: "Связь с локальным сервером потеряна",
    unpaired: "Связь с локальным сервером не настроена", unavailable: "Статус связи пока недоступен" }[sec];
  const journal = [...(account.instance?.journal || [])].reverse().map(entry =>
    `<li><time datetime="${new Date(entry.at).toISOString()}">${journalTime.format(entry.at)}</time><span>${html(entry.message)}</span></li>`).join("");
  return layout("Мой публичный таймер", `<main class="wrap section panel launcher">
<div class="launcher-heading"><div><h1>Мой публичный таймер</h1><p>${html(account.email)}</p></div>
<div class="launcher-build"><span id="instance-build">${status.build ? "Сборка " + html(status.build) : ""}</span>
${button("Скачать последнюю версию", "https://github.com/dfedorov-arch/fdv-bouldering-timer/releases/latest", true)}</div></div>
${message ? notice(message) : ""}
<div class="instance-status" data-service="${html(status.service)}"><strong id="instance-status" role="status">${services[status.service]}</strong>
<span id="countdown-status">${status.recovering ? "Таймер восстанавливает связь" : running ? status.running ? "Отсчёт идёт" : "Отсчёт остановлен" : ""}</span></div>
<section aria-labelledby="instance-address-title"><h2 id="instance-address-title">Адрес таймера</h2>
${url ? `<div class="address-box"><label for="instance-address">Публичный HTTPS</label>
<div class="instance-address-controls"><input id="instance-address" type="url" value="${html(url)}" readonly>
<div class="address-actions">${copyIcon("instance-address", "Копировать ссылку")}
<a class="button secondary icon-button" href="/account/address" ${newTab} aria-label="Изменить короткий адрес" title="Изменить короткий адрес">
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
<path d="M4 20l4.5-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20zM14.5 7.5l3 3"/></svg></a>
${button("QR-код", "/account/timer/qr", true)}</div></div></div>
<p id="instance-address-copy-status" class="copy-status" role="status"></p>
<div class="launcher-actions server-actions">
  <a id="open-instance" class="button" href="${html(url)}" ${newTab}${running ? "" : " hidden"}>Открыть таймер</a>
  ${instanceButton("start", "Запустить", "start", running)}
  ${instanceButton("restart", "Перезапуск сервера", "on", disabled)}
  ${instanceButton("stop", "Стоп", "on", disabled)}
  <a class="button secondary danger" href="/account/reset" ${newTab}>${resetLabel}</a>
</div>`
    : `<p>Запустите публичный экземпляр, чтобы связать его с локальным таймером.</p>${form("/account/start", addressField(links.domain), "Запустить таймер")}`}</section>
${url ? `<div class="launcher-options"><section id="instance-pin"><h2>PIN управления</h2><p id="pin-status">${pinText}</p>
<form class="pin-form" action="/account/pin" method="post">
${field("Новый PIN", "pin", "password", 'inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off"')}
<button data-available="ready"${ready ? "" : " disabled"}>Установить</button></form>
<form action="/account/pin" method="post"><input type="hidden" name="pin" value=""><button class="secondary" data-available="pin"${ready && status.pin ? "" : " disabled"}>Снять PIN</button></form></section>
<section><h2>Связь с локальным таймером</h2><p id="sec-status" data-connection="${sec}">${secText}</p>
${code ? `<div class="code"><span>Код привязки</span><div class="code-value"><output id="pairing-code">${html(code)}</output>
${copyIcon("pairing-code", "Копировать код привязки")}</div>
<p id="pairing-code-copy-status" class="copy-status" role="status"></p>
<p>Введите этот код и адрес в диалоге SEC локального таймера. Код действует 15 минут и используется один раз.</p></div>` : ""}
<label for="pair-address">Адрес для связывания с локальным сервером</label><input id="pair-address" value="${html(url)}" readonly>
${instanceButton("code", "Создать код привязки", "pair", !ready || status.paired)}</section></div>` : ""}
${url ? `<section><h2>Гостевая ссылка</h2><p>На гостевых экранах управление недоступно. Они не отображаются в панели управления основного браузера и меньше нагружают сервер.</p>
${links.guest ? `<div class="address-box guest-address-box"><label for="guest-address">Адрес</label><output id="guest-address">${html(links.guest)}</output>
<div class="address-actions">${copyIcon("guest-address", "Копировать гостевую ссылку")}
${button("QR-код", "/account/guest/qr", true)}</div></div>
<p id="guest-address-copy-status" class="copy-status" role="status"></p>
<div class="launcher-actions">${button("Открыть гостевой экран", links.guest, true)}
${form("/account/guest/disable", "", "Отключить")}</div>`
  : form("/account/guest/enable", "", account.instance.guestSlug ? "Включить гостевую ссылку" : "Создать гостевую ссылку")}</section>` : ""}
<section><h2>Журнал сервера</h2>${journal ? `<ol class="instance-journal">${journal}</ol>` : '<p>Событий пока нет.</p>'}</section>
<script src="/account.js" defer></script></main>`, account);
}
function editAddress(account, domain, previous, { slug = previous, retire = false, message = "" } = {}) {
  return panel("Изменить короткий адрес", `${message ? notice(message) : ""}
<form action="/account/address" method="post">
<input type="hidden" name="previous" value="${html(previous)}">
${addressField(domain, slug)}
<fieldset class="address-choice"><legend>Прежний адрес</legend>
<label><input type="radio" name="previousAddress" value="keep"${retire ? "" : " checked"}> Оставить рабочим до полной очистки</label>
<label><input type="radio" name="previousAddress" value="retire"${retire ? " checked" : ""}> Отключить</label></fieldset>
<div class="actions"><button type="submit">Сохранить адрес</button><a class="button secondary" href="/account">Отмена</a></div></form>`, account);
}
function confirmAddressChange(account, previous, slug, oldAddress, newAddress) {
  return panel("Отключить прежний адрес?", `
<p>Прежний адрес <strong>${html(oldAddress)}</strong> перестанет работать. Все экраны, подключённые к нему, потеряют связь с публичным таймером. Если локальный сервер связан по этому адресу, связь с ним разорвётся.</p>
<p>Новый адрес <strong>${html(newAddress)}</strong>.</p>
<form action="/account/address" method="post">
<input type="hidden" name="previous" value="${html(previous)}">
<input type="hidden" name="slug" value="${html(slug)}">
<input type="hidden" name="previousAddress" value="retire">
<input type="hidden" name="confirmed" value="1">
<div class="actions"><button class="danger" type="submit">Сменить адрес и отключить прежний</button>
<a class="button secondary" href="/account/address">Отмена</a></div></form>`, account);
}
function confirmStop(account, status) {
  return panel("Остановить сервер?", `
<p>${status.running ? "Текущий отсчёт остановится. " : ""}${status.connected
    ? "Связь с локальным сервером прервётся." : "Если установлена связь с локальным сервером, она прервётся."}</p>
<form action="/account/stop" method="post"><input type="hidden" name="confirmed" value="1">
<div class="actions"><button class="danger" type="submit">Остановить сервер</button>
<a class="button secondary" href="/account">Отмена</a></div></form>`, account);
}
function confirmReset(account, confirmation) {
  return panel(resetLabel, `
<p>Все данные и настройки публичного таймера будут удалены. Это включает стартовые списки, параметры раунда и PIN управления. Текущий отсчёт остановится, а связь с локальным сервером разорвётся.</p>
<p>Сохранённые прежние адреса будут отключены. Текущий публичный HTTPS-адрес и гостевая ссылка сохранятся.</p>
<p><strong>Не выполняйте сброс во время активной фазы соревнований.</strong></p>
<div class="actions"><a class="button secondary" href="/account">Отмена</a>
<form action="/account/reset" method="post"><input type="hidden" name="confirmation" value="${html(confirmation)}">
<button class="danger" type="submit">Очистить данные и перезапустить</button></form></div>`, account);
}
function addressQrPage(account, address, kind) {
  const title = kind === "guest" ? "QR-код гостевой ссылки" : "QR-код публичного адреса таймера";
  return panel(title, `<img class="address-qr" src="/account/${kind}/qr.gif" alt="${html(title)}">
<p><a class="instance-link" href="${html(address)}" ${newTab}>${html(address)}</a></p>`, account);
}
function addressQrImage(address) {
  const code = createQrCode(0, "M");
  code.addData(address);
  code.make();
  return Buffer.from(code.createDataURL(8).slice("data:image/gif;base64,".length), "base64");
}
function guest(message = "") {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Таймер болдеринга</title><link rel="stylesheet" href="/screen.css"></head>
<body class="viewer-mode"><main class="app"><section class="stage" aria-label="Экран таймера">
<div class="stage-main"><div class="timer-column"><div class="timer-wrap">
<div class="time" id="time" aria-label="--:--"><span class="time-part" id="timeMinutes">--</span><span class="time-separator">:</span><span class="time-part" id="timeSeconds">--</span></div>
</div></div></div></section></main>
<div class="server-connection-warning" id="guest-notice" role="status"${message ? "" : " hidden"}>${html(message)}</div>
${message ? "" : '<div class="guest-rotation" id="guest-rotation" hidden></div>'}
${message ? "" : '<script src="/lib/timer-stretch.js" defer></script><script src="/screen.js" defer></script><script src="/guest.js" defer></script>'}</body></html>`;
}
function adminPage(account, users, requests, message) {
  const rows = users.map(user => `<tr><td>${html(user.email)}</td><td>${user.paused ? "Приостановлен" : user.password ? "Зарегистрирован" : "Приглашён"}</td><td>
${form("/admin/status", `<input type="hidden" name="email" value="${html(user.email)}"><input type="hidden" name="paused" value="${user.paused ? "0" : "1"}">`,
    user.paused ? "Возобновить" : "Приостановить")}</td></tr>`).join("");
  const applications = requests.slice().reverse().map(request => {
    const id = `<input type="hidden" name="id" value="${html(request.id)}">`;
    const status = { pending: "На рассмотрении", approved: "Одобрена", rejected: "Отклонена" }[request.status];
    return `<article class="access-request"><h3>${html(request.name)}</h3><p>${html(request.email)}${request.phone ? " · " + html(request.phone) : ""}</p>
${request.comment ? `<p class="request-comment">${html(request.comment)}</p>` : ""}<p>${status}${request.mail === "failed" ? " · Письмо не отправлено" : ""}</p>
<div class="actions">${request.status === "pending" ? form("/admin/request", id + '<input type="hidden" name="decision" value="approved">', "Одобрить")
      + form("/admin/request", id + '<input type="hidden" name="decision" value="rejected">', "Отклонить") : ""}
${request.mail === "failed" ? form("/admin/request", id + '<input type="hidden" name="decision" value="retry">', "Повторить отправку") : ""}</div></article>`;
  }).join("");
  return panel("Управление доступом", `${message ? notice(message) : ""}<section id="requests"><h2>Заявки на доступ</h2>${applications || "<p>Заявок пока нет.</p>"}</section><section><h2>Разрешить регистрацию</h2>
${form("/admin/invite", field("Электронная почта", "email", "email", 'maxlength="254"'), "Добавить адрес")}</section><section>
<h2>Пользователи</h2>${rows ? `<div class="table"><table><thead><tr><th>Почта</th><th>Статус</th><th>Действие</th></tr></thead><tbody>${rows}</tbody></table></div>` : "<p>Список пуст.</p>"}</section>`, account);
}
function staticAsset(pathname, timerDir) {
  if (["/images/overview.png", "/images/classic.png", "/images/final.png", "/images/qualification.png"].includes(pathname)) {
    return ["image/png", fs.readFileSync(path.join(__dirname, pathname.slice(1)))];
  }
  if (pathname === "/images/secondary.png") return ["image/png", fs.readFileSync(path.join(timerDir, "help-assets", "secondary-server.png"))];
  if (pathname === "/app-icon.svg") return ["image/svg+xml", fs.readFileSync(path.join(timerDir, "app-icon.svg"))];
  if (pathname === "/apply.js") return ["text/javascript; charset=utf-8", fs.readFileSync(path.join(__dirname, "apply.js"))];
  if (pathname === "/site.css") return ["text/css; charset=utf-8", fs.readFileSync(path.join(__dirname, "site.css"))];
  if (pathname === "/account.js") return ["text/javascript; charset=utf-8", fs.readFileSync(path.join(__dirname, "account.js"))];
  if (pathname === "/guest.js") return ["text/javascript; charset=utf-8", fs.readFileSync(path.join(__dirname, "guest.js"))];
}
function guestAsset(pathname, timerDir) {
  if (pathname === "/guest.js") return staticAsset(pathname, timerDir);
  if (pathname === "/lib/timer-stretch.js") return ["text/javascript; charset=utf-8", fs.readFileSync(path.join(timerDir, "lib", "timer-stretch.js"))];
  if (pathname === "/screen.js" || pathname === "/screen.css") {
    if (!guestScreens.has(timerDir)) guestScreens.set(timerDir, guestScreenAssets(timerDir));
    const screen = guestScreens.get(timerDir);
    return pathname === "/screen.js" ? ["text/javascript; charset=utf-8", screen.js] : ["text/css; charset=utf-8", screen.css];
  }
  if (/^\/fonts\/[A-Za-z0-9_-]+\.(woff2?|ttf|otf)$/i.test(pathname)) {
    const file = path.join(timerDir, pathname.slice(1));
    if (fs.existsSync(file)) return ["font/" + path.extname(file).slice(1), fs.readFileSync(file)];
  }
}
module.exports = { landing, panel, notice, login, register, verify, applyPage, accountPage, editAddress, confirmAddressChange, confirmStop, confirmReset, adminPage, staticAsset, guest, guestAsset, addressQrPage, addressQrImage };
