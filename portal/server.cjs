"use strict";
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const site = require("./site.cjs");
const { createInstances } = require("./instances.cjs");

const HOUR = 3600_000;
const random = bytes => crypto.randomBytes(bytes).toString("hex");
const digest = value => crypto.createHash("sha256").update(value).digest("hex");
const emailAddress = value => {
  const email = String(value || "").trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
};
const pairingMessages = {
  SEC_TARGET_RUNNING: "На публичном таймере идёт отсчёт. Остановите отсчёт и сбросьте состояние в интерфейсе самого таймера, затем создайте код.",
  SEC_TARGET_HAS_TIMER_STATE: "На публичном таймере сохранён отсчёт. Если он больше не нужен, сбросьте его в интерфейсе таймера.",
  SEC_TARGET_HAS_START_LISTS: "На публичном таймере есть стартовые списки. Уберите их, если этот экземпляр должен стать резервом.",
  SEC_TARGET_HAS_PIN: "На публичном таймере установлен PIN. Снимите его в кабинете перед привязкой.",
  SEC_TARGET_HAS_OPERATOR: "У публичного таймера выбран управляющий браузер. Освободите управление перед привязкой.",
  SEC_TARGET_ALREADY_PAIRED: "Экземпляр уже привязан. Сначала отключите текущую пару в SEC.",
  SEC_TARGET_PAIRING_BUSY: "Уже выполняется привязка. Дождитесь её завершения.",
  SEC_TARGET_STOPPED: "Сначала запустите публичный таймер."
};
function passwordHash(password, salt = random(16)) {
  return salt + ":" + crypto.scryptSync(password, salt, 64).toString("hex");
}
function passwordMatches(password, previous) {
  const calculated = passwordHash(password, previous.split(":")[0]);
  return crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(previous));
}
function sendMail(message) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.FDV_SMTP_PYTHON || "python3", [path.join(__dirname, "mail.py")],
      { stdio: ["pipe", "ignore", "inherit"] });
    const timeout = setTimeout(() => child.kill("SIGKILL"), 20000);
    child.stdin.on("error", reject);
    child.once("error", error => { clearTimeout(timeout); reject(error); });
    child.once("close", code => {
      clearTimeout(timeout);
      if (code === 0) resolve(); else reject(new Error("SMTP delivery failed"));
    });
    child.stdin.end(JSON.stringify(message));
  });
}
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return req.headers["content-type"]?.startsWith("application/json")
    ? JSON.parse(text) : Object.fromEntries(new URLSearchParams(text));
}

function createPortal({ stateDir, timerDir, publicOrigin, domain, adminPassword, deliver, plainHttp = false, instanceLimit = 8, instancePortStart = 9200 }) {
  if (!adminPassword || adminPassword.length < 16) throw new Error("FDV_PORTAL_ADMIN_PASSWORD must be at least 16 characters");
  if (!plainHttp && new URL(publicOrigin).protocol !== "https:") throw new Error("The public portal requires HTTPS");
  const portalHost = new URL(publicOrigin).host;
  const adminHash = passwordHash(adminPassword);
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const file = path.join(stateDir, "accounts.json");
  const users = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
  const requestFile = path.join(stateDir, "access-requests.json");
  const requests = fs.existsSync(requestFile) ? JSON.parse(fs.readFileSync(requestFile, "utf8")) : [];
  const sending = new Set();
  const sessions = new Map(), limits = new Map(), managing = new Set();
  const instances = createInstances({ stateDir, timerDir, domain, origin: name => (plainHttp ? "http://" : "https://") + name,
    isAddressAllowed: (instance, host) => hostRoute(host).user?.instance === instance });
  const admin = { admin: true, email: "admin" };
  const byEmail = email => users.find(user => user.email === email);
  const activeSlug = instance => instance.ownerAlias || instance.slug;
  function bySlug(slug) {
    return users.find(({instance}) => instance && ([instance.slug, instance.ownerAlias, instance.guestSlug].includes(slug)
      || Object.hasOwn(instance.addressHistory || {}, slug)));
  }
  function hostRoute(host) {
    const suffix = "." + domain;
    if (!host?.endsWith(suffix)) return {};
    const slug = host.slice(0, -suffix.length);
    const user = bySlug(slug);
    if (!user || user.instance.addressHistory?.[slug] === false) return {};
    return { user, guest: slug === user.instance.guestSlug };
  }
  function chooseSlug(prefix) {
    const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
    let name;
    do {
      name = prefix + Array.from({length:5}, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
    } while (bySlug(name));
    return name;
  }
  function requestedSlug(value, owner) {
    const name = String(value || "").trim().toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,16}[a-z0-9])?$/.test(name) || /^(guest|pilot)-/.test(name)) {
      return { message: "Введите от 1 до 18 латинских букв или цифр. Дефис можно использовать внутри имени. Начала guest- и pilot- зарезервированы." };
    }
    const existing = bySlug(name);
    if (existing && existing !== owner) return { message: "Этот адрес уже занят. Выберите другой." };
    return { name };
  }
  const sessionId = req => /(?:^|;\s*)fdv_portal=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || "")?.[1];
  function prune(map, now) {
    for (const [key, value] of map) if (value.until <= now) map.delete(key);
  }
  function current(req) {
    const session = sessions.get(sessionId(req));
    if (!session || session.until < Date.now()) return null;
    const account = session.email === "admin" ? admin : byEmail(session.email);
    return account && !account.paused ? account : null;
  }
  function writeState(target, data) {
    const temp = target + ".tmp";
    const fd = fs.openSync(temp, "w", 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(data)); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(temp, target);
  }
  function save() { writeState(file, users); }
  function saveRequests() { writeState(requestFile, requests); }
  function limit(key, max, interval) {
    const now = Date.now();
    prune(limits, now);
    const bucket = limits.get(key) || { count: 0, until: now + interval };
    if (bucket.count >= max || (!limits.has(key) && limits.size >= 12000)) return false;
    bucket.count++;
    limits.set(key, bucket);
    return true;
  }
  function cookie(res, token, seconds) {
    res.setHeader("Set-Cookie", "fdv_portal=" + token + "; Path=/; Max-Age=" + seconds
      + "; HttpOnly; SameSite=Lax" + (plainHttp ? "" : "; Secure"));
  }
  function signIn(req, res, account) {
    const now = Date.now();
    prune(sessions, now);
    sessions.delete(sessionId(req));
    const id = random(32);
    sessions.set(id, { email: account.email, until: now + 8 * HOUR });
    cookie(res, id, 28800);
    redirect(res, account.admin ? "/admin" : "/account");
  }
  function redirect(res, url) { res.writeHead(303, { Location: url }); res.end(); }
  function reply(res, status, body, contentType = "text/html; charset=utf-8") {
    res.writeHead(status, { "content-type": contentType });
    res.end(body);
  }
  function failure(res, status, explanation) {
    reply(res, status, site.panel("Доступ к FDV", site.notice(explanation)));
  }
  function guestAddress(instance) {
    return instance?.guestEnabled ? instances.address(instance, instance.guestSlug) : "";
  }
  async function accountPage(res, user, code = "", message = "") {
    const instance = user.instance;
    const links = { domain };
    if (instance) {
      links.owner = instances.address(instance, instance.ownerAlias);
      links.guest = guestAddress(instance);
    }
    reply(res, 200, site.accountPage(user, links, await instances.status(instance), code, message));
  }
  function record(instance, message) {
    instance.journal = [...(instance.journal || []), { at: Date.now(), message }].slice(-30);
    save();
  }
  const resetConfirmation = instance => digest("reset:" + instance.token);
  async function manage(res, user, action) {
    if (managing.has(user.email)) return accountPage(res, user, "", "Операция уже выполняется.");
    managing.add(user.email);
    try { return await action(); }
    finally { managing.delete(user.email); }
  }
  function adminPage(res, message = "") { reply(res, 200, site.adminPage(admin, users, requests, message)); }
  async function notifyRequest(request) {
    if (!deliver || sending.has(request.id)) return;
    sending.add(request.id);
    let message;
    if (request.status === "pending") {
      message = { email: "dfedorov@gmail.com", subject: "FDV — новая заявка на доступ",
        text: ["ФИО: " + request.name, "Email: " + request.email, "Телефон: " + (request.phone || "не указан"),
          "Комментарий: " + (request.comment || "не указан"), "", "Рассмотреть заявку: " + publicOrigin + "/admin#requests"].join("\n") };
    } else {
      const approved = request.status === "approved";
      message = { email: request.email, subject: approved ? "FDV — заявка одобрена" : "FDV — заявка отклонена",
        text: approved ? "Ваша заявка на доступ к FDV Bouldering Timer одобрена. Зарегистрируйтесь с этим адресом: " + publicOrigin + "/register"
          : "Администратор отклонил вашу заявку на доступ к FDV Bouldering Timer." };
    }
    try {
      await deliver(message);
      request.mail = "sent";
    } catch (_) {
      console.warn("FDV access-request mail could not be delivered");
      request.mail = "failed";
    } finally {
      sending.delete(request.id);
      saveRequests();
    }
  }
  function verifiedToken(token) {
    if (!/^[a-f0-9]{64}$/.test(String(token))) return null;
    const hash = digest(token);
    return users.find(user => !user.paused && !user.password && user.verify?.hash === hash && user.verify.until > Date.now());
  }
  async function enroll(req, res, user, remote, hostname) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    const send = (status, data) => reply(res, status, JSON.stringify(data), "application/json");
    if (req.method !== "POST") return send(405, { code: "SEC_HOSTED_ADDRESS" });
    if (!limit("code:" + remote, 30, HOUR)) return send(429, { code: "SEC_CODE_RATE_LIMITED" });
    const { code, build } = await readBody(req);
    if (hostRoute(hostname).user !== user) return send(404, { code: "SEC_HOSTED_ADDRESS" });
    if (user.paused) return send(403, { code: "SEC_TARGET_SUSPENDED" });
    if (user.instance.stopped) return send(409, { code: "SEC_TARGET_STOPPED" });
    const pairing = user.pairing;
    if (!/^[a-f0-9]{24}$/i.test(String(code)) || pairing?.hash !== digest(String(code).toLowerCase())) {
      return send(403, { code: "SEC_CODE_INVALID" });
    }
    if (pairing.used) return send(403, { code: "SEC_CODE_USED" });
    if (pairing.until <= Date.now()) return send(403, { code: "SEC_CODE_EXPIRED" });
    const issue = await instances.pairingIssue(user.instance, build);
    if (hostRoute(hostname).user !== user) return send(404, { code: "SEC_HOSTED_ADDRESS" });
    if (user.paused || user.instance.stopped) return send(409, { code: user.paused ? "SEC_TARGET_SUSPENDED" : "SEC_TARGET_STOPPED" });
    if (user.pairing !== pairing) return send(403, { code: "SEC_CODE_INVALID" });
    if (pairing.used) return send(403, { code: "SEC_CODE_USED" });
    if (pairing.until <= Date.now()) return send(403, { code: "SEC_CODE_EXPIRED" });
    if (issue) return send(409, { code: issue });
    pairing.used = true;
    save();
    send(200, { token: user.instance.token });
  }
  async function guestPage(req, res, route, user) {
    const received = Number(process.hrtime.bigint()) / 1e6;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    if (!user.instance.guestEnabled) return reply(res, 404, site.guest("Гостевая ссылка отключена."));
    if (req.method !== "GET") return reply(res, 405, "Method not allowed", "text/plain");
    if (route === "/") return reply(res, 200, site.guest());
    if (route !== "/api/spectator") {
      const asset = site.guestAsset(route, timerDir);
      return asset ? reply(res, 200, asset[1], asset[0]) : reply(res, 404, "Not found", "text/plain");
    }
    const send = (status, state) => reply(res, status, JSON.stringify(state), "application/json");
    if (user.instance.stopped) return send(503, { stopped: true });
    let state;
    try { state = await instances.spectator(user.instance); }
    catch (_) { return send(503, { stopped: Boolean(user.instance.stopped) }); }
    if (user.paused || !user.instance.guestEnabled) return send(404, { unavailable: true });
    if (user.instance.stopped) return send(503, { stopped: true });
    const { observedAt, clockTime, clockRate, ...display } = state;
    const sent = Number(process.hrtime.bigint()) / 1e6;
    const timerAt = local => clockTime + (local - observedAt) * clockRate;
    return send(200, { ...display, clock: { receivedAt: timerAt(received), sentAt: timerAt(sent), rate: clockRate } });
  }
  async function dispatch(req, res) {
    const hostname = String(req.headers.host || "").toLowerCase();
    const remote = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress).split(",").pop().trim();
    const url = new URL(req.url, "http://localhost");
    const route = url.pathname;
    if (hostname !== portalHost) {
      if (route === "/_tls/authorize" && req.method === "GET" && hostname === "127.0.0.1:" + req.socket.localPort) {
        const target = hostRoute(url.searchParams.get("domain"));
        return reply(res, target.user && !target.user.paused && (!target.guest || target.user.instance.guestEnabled) ? 200 : 403, "", "text/plain");
      }
      const { user, guest } = hostRoute(hostname);
      if (guest) return user.paused ? failure(res, 404, "Гостевой экран недоступен.") : guestPage(req, res, route, user);
      if (user?.password && route === "/api/sec/enroll") return enroll(req, res, user, remote, hostname);
      if (!user || user.paused || !user.password || route === "/_tls/authorize") return failure(res, 404, "Экземпляр недоступен.");
      if (user.instance.stopped) {
        res.setHeader("Cache-Control", "no-store");
        return failure(res, 503, "Владелец остановил таймер.");
      }
      if (route.startsWith("/api/launcher/")) return failure(res, 404, "Страница не найдена.");
      return instances.proxy(user.instance, req, res);
    }
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'self'; img-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    const auth = current(req);
    if (req.method === "GET") {
      const asset = site.staticAsset(route, timerDir);
      if (asset) return reply(res, 200, asset[1], asset[0]);
      if (route === "/") return reply(res, 200, site.landing(auth));
      if (route === "/login") return reply(res, 200, site.login());
      if (route === "/register") return reply(res, 200, site.register());
      if (route === "/apply") return reply(res, 200, site.applyPage());
      if (route === "/verify") {
        const token = url.searchParams.get("token");
        return verifiedToken(token) ? reply(res, 200, site.verify(token)) : failure(res, 400, "Ссылка недействительна или просрочена.");
      }
      if (route === "/account" && auth && !auth.admin) return accountPage(res, auth);
      if (route === "/account/reset" && auth && !auth.admin && auth.instance) {
        return reply(res, 200, site.confirmReset(auth, resetConfirmation(auth.instance)));
      }
      if (route === "/account/address" && auth && !auth.admin && auth.instance) {
        return reply(res, 200, site.editAddress(auth, domain, activeSlug(auth.instance)));
      }
      if (route === "/account/guest/qr" || route === "/account/guest/qr.gif") {
        if (!auth) return redirect(res, "/login");
        if (auth.admin) return failure(res, 403, "Действие недоступно.");
        const address = guestAddress(auth.instance);
        if (!address) return failure(res, 404, "Гостевая ссылка отключена.");
        if (route.endsWith(".gif")) return reply(res, 200, site.guestQrImage(address), "image/gif");
        return reply(res, 200, site.guestQrPage(auth, address));
      }
      if (route === "/account/status") {
        return reply(res, auth && !auth.admin ? 200 : 401,
          JSON.stringify(auth && !auth.admin ? await instances.status(auth.instance) : { error: "Sign in required" }),
          "application/json");
      }
      if (route === "/admin" && auth?.admin) return adminPage(res);
      if (["/account", "/account/reset", "/account/address", "/admin"].includes(route)) return redirect(res, "/login");
      return failure(res, 404, "Страница не найдена.");
    }
    const origin = req.headers.origin;
    // With no-referrer, a browser can send an opaque Origin for a native form.
    const localForm = (origin === "null" || origin === undefined) && req.headers["sec-fetch-site"] === "same-origin";
    if (req.method !== "POST" || (origin !== publicOrigin && !localForm)) return failure(res, 403, "Запрос отклонён.");
    if (!limit("post:" + remote, 80, 60000)) return failure(res, 429, "Повторите попытку позже.");
    const body = await readBody(req);
    const password = typeof body?.password === "string" ? body.password : "";
    if (route === "/apply") {
      const values = { name: String(body.name || "").trim().slice(0,120), email: emailAddress(body.email),
        phone: String(body.phone || "").trim().slice(0,40), comment: String(body.comment || "").trim().slice(0,1000) };
      if (!values.name || !values.email) return reply(res, 400, site.applyPage("Укажите ФИО и действительный email.", values));
      if (!requests.some(request => request.email === values.email && request.status !== "rejected")) {
        if (!limit("apply-ip:" + remote, 8, HOUR) || !limit("apply-email:" + values.email, 2, HOUR)) {
          return reply(res, 429, site.applyPage("Повторите попытку позже.", values));
        }
        const request = { ...values, id: random(12), status: "pending", mail: "failed" };
        requests.push(request);
        saveRequests();
        notifyRequest(request).catch(() => console.warn("FDV access-request state could not be saved"));
      }
      return reply(res, 200, site.applyPage("Заявка принята. Решение придёт на указанный email.", {}, true));
    }
    if (route === "/register") {
      if (!deliver) return failure(res, 503, "Подтверждение по почте пока недоступно.");
      const user = byEmail(emailAddress(body.email));
      if (user && !user.password && !user.paused && limit("register:" + user.email, 3, HOUR)) {
        const token = random(32);
        const verify = { hash: digest(token), until: Date.now() + HOUR };
        user.verify = verify;
        save();
        Promise.resolve().then(() => deliver({ email: user.email, link: publicOrigin + "/verify?token=" + token })).catch(() => {
          if (user.verify === verify) { delete user.verify; save(); }
          console.warn("FDV verification mail could not be delivered");
        }).catch(() => console.warn("FDV verification state could not be saved"));
      }
      return reply(res, 200, site.register("Если адрес приглашён и ещё не зарегистрирован, на него придёт письмо."));
    }
    if (route === "/verify") {
      const user = verifiedToken(body.token);
      if (!user || password.length < 12 || password.length > 128) return failure(res, 400, "Ссылка недействительна или пароль не подходит.");
      user.password = passwordHash(password);
      delete user.verify;
      save();
      return signIn(req, res, user);
    }
    if (route === "/login") {
      const login = String(body.login || "").trim().toLowerCase();
      const user = login === "admin" ? admin : byEmail(emailAddress(login));
      const expected = user?.admin ? adminHash : user?.password;
      if (!limit("login:" + remote, 12, 15 * 60000)) return failure(res, 429, "Повторите попытку позже.");
      if (password.length <= 128 && passwordMatches(password, expected || adminHash) && expected && !user.paused) return signIn(req, res, user);
      return reply(res, 401, site.login("Не удалось войти. Проверьте данные и доступ к кабинету."));
    }
    if (route === "/logout") {
      sessions.delete(sessionId(req));
      cookie(res, "", 0);
      return redirect(res, "/login");
    }
    if (!auth) return failure(res, 403, "Войдите в кабинет.");
    if (route === "/admin/request" && auth.admin) {
      const request = requests.find(item => item.id === body.id);
      if (!request) return failure(res, 404, "Заявка не найдена.");
      if (sending.has(request.id)) return adminPage(res, "Письмо ещё отправляется. Повторите действие через несколько секунд.");
      if (body.decision === "retry" && request.mail === "failed") {
        await notifyRequest(request);
      } else if (request.status === "pending" && ["approved","rejected"].includes(body.decision)) {
        if (body.decision === "approved" && !byEmail(request.email)) {
          users.push({ email: request.email, paused: false });
          save();
        }
        request.status = body.decision;
        request.mail = "failed";
        saveRequests();
        await notifyRequest(request);
      } else return adminPage(res, "Решение по этой заявке уже принято.");
      return adminPage(res, request.mail === "sent" ? "Письмо отправлено." : "Решение сохранено. Отправку письма можно повторить.");
    }
    if (route === "/admin/invite" && auth.admin) {
      const email = emailAddress(body.email);
      if (!email) return adminPage(res, "Введите действительный адрес почты.");
      if (!byEmail(email)) { users.push({ email, paused: false }); save(); }
      return adminPage(res, "Адрес добавлен.");
    }
    if (route === "/admin/status" && auth.admin) {
      const user = byEmail(emailAddress(body.email));
      if (!user || !["0", "1"].includes(body.paused)) return failure(res, 404, "Пользователь не найден.");
      user.paused = body.paused === "1";
      if (user.paused) {
        delete user.verify;
        delete user.pairing;
        for (const [id, session] of sessions) if (session.email === user.email) sessions.delete(id);
      }
      save();
      if (user.paused && user.instance) await instances.stop(user.instance);
      return adminPage(res, user.paused ? "Доступ приостановлен." : "Доступ восстановлен.");
    }
    if (route === "/account/start" && !auth.admin) return manage(res, auth, async () => {
      if (!auth.instance) {
        const allocated = users.filter(user => user.instance).length;
        if (allocated >= instanceLimit) return accountPage(res, auth, "", "Свободных экземпляров пока нет.");
        const requested = String(body.slug || "").trim();
        const selection = requested ? requestedSlug(requested) : { name: chooseSlug("fdv-") };
        if (!selection.name) return accountPage(res, auth, "", selection.message);
        auth.instance = { slug: selection.name, port: instancePortStart + allocated, token: random(32) };
        save();
      }
      const instance = auth.instance;
      const previous = await instances.status(instance);
      if (auth.paused) return failure(res, 403, "Доступ приостановлен.");
      if (previous.service !== "running") {
        instance.stopped = false;
        save();
        try { await instances.start(instance); }
        catch (_) { record(instance, "Не удалось запустить сервер."); return accountPage(res, auth, "", "Сервер не запустился."); }
        record(instance, "Сервер запущен.");
      }
      return redirect(res, "/account");
    });
    if (route === "/account/address" && !auth.admin && auth.instance) {
      const instance = auth.instance;
      const previous = activeSlug(instance);
      if (body.previous !== previous) {
        return reply(res, 409, site.editAddress(auth, domain, previous, { message: "Адрес уже изменился. Проверьте его и повторите действие." }));
      }
      const keep = body.previousAddress === "keep";
      const retire = body.previousAddress === "retire";
      if (!keep && !retire) {
        return reply(res, 400, site.editAddress(auth, domain, previous, { message: "Выберите, что делать с прежним адресом." }));
      }
      const selection = requestedSlug(body.slug, auth);
      if (!selection.name) return reply(res, 400, site.editAddress(auth, domain, previous,
        { slug: String(body.slug || "").slice(0, 18), retire, message: selection.message }));
      if (selection.name === previous) return redirect(res, "/account");
      if (retire && body.confirmed !== "1") {
        return reply(res, 200, site.confirmAddressChange(auth, previous, selection.name,
          instances.address(instance, previous), instances.address(instance, selection.name)));
      }
      const { ownerAlias, addressHistory, journal } = instance;
      instance.addressHistory = { ...addressHistory, [previous]: keep };
      delete instance.addressHistory[selection.name];
      instance.ownerAlias = selection.name;
      try {
        record(instance, keep ? "Короткий адрес изменён. Прежний адрес работает." : "Короткий адрес изменён. Прежний адрес отключён.");
      } catch (error) {
        Object.assign(instance, { ownerAlias, addressHistory, journal });
        throw error;
      }
      if (retire) instances.disconnectAddress(instance, previous);
      return redirect(res, "/account");
    }
    if (["/account/guest/enable", "/account/guest/disable"].includes(route) && !auth.admin && auth.instance) {
      const enabled = route.endsWith("/enable");
      if (enabled && !auth.instance.guestSlug) auth.instance.guestSlug = chooseSlug("guest-");
      if (Boolean(auth.instance.guestEnabled) !== enabled) {
        auth.instance.guestEnabled = enabled;
        record(auth.instance, enabled ? "Гостевая ссылка включена." : "Гостевая ссылка отключена.");
      }
      return redirect(res, "/account");
    }
    if (["/account/stop", "/account/restart"].includes(route) && !auth.admin && auth.instance) return manage(res, auth, async () => {
      const instance = auth.instance;
      if (route === "/account/stop") {
        if (body?.confirmed !== "1") {
          const status = await instances.status(instance);
          if (auth.paused) return failure(res, 403, "Доступ приостановлен.");
          if (status.running || status.connected) return reply(res, 200, site.confirmStop(auth, status));
        }
        instance.stopped = true;
        delete auth.pairing;
        record(instance, "Сервер остановлен владельцем.");
        await instances.stop(instance);
      } else if (!instance.stopped) {
        await instances.stop(instance);
        if (auth.paused) return failure(res, 403, "Доступ приостановлен.");
        try { await instances.start(instance); }
        catch (_) { record(instance, "Не удалось перезапустить сервер."); return accountPage(res, auth, "", "Сервер не запустился."); }
        record(instance, "Сервер перезапущен.");
      }
      return redirect(res, "/account");
    });
    if (route === "/account/reset" && !auth.admin && auth.instance) return manage(res, auth, async () => {
      const instance = auth.instance;
      if (body?.confirmation !== resetConfirmation(instance)) {
        return accountPage(res, auth, "", "Откройте подтверждение сброса заново.");
      }
      instance.stopped = true;
      instance.token = random(32);
      delete auth.pairing;
      save();
      try {
        await instances.stop(instance);
        instances.clearData(instance);
      } catch (error) {
        console.error("FDV hosted timer reset failed:", error.code || error.name);
        record(instance, "Очистка данных не завершилась.");
        return accountPage(res, auth, "", "Не удалось завершить очистку. Сервер остановлен. Повторите сброс.");
      }
      if (auth.paused) return failure(res, 403, "Доступ приостановлен.");
      instance.stopped = false;
      record(instance, "Данные и настройки таймера очищены. Привязка к локальному серверу сброшена.");
      try { await instances.start(instance); }
      catch (_) {
        record(instance, "После очистки сервер не запустился.");
        return accountPage(res, auth, "", "Данные очищены, но сервер не запустился. Нажмите «Запустить», чтобы повторить запуск.");
      }
      record(instance, "Сервер запущен после очистки данных.");
      return redirect(res, "/account");
    });
    if (route === "/account/pin" && !auth.admin && auth.instance) return manage(res, auth, async () => {
      const pin = typeof body.pin === "string" ? body.pin : "invalid";
      if (pin !== "" && !/^\d{4}$/.test(pin)) return accountPage(res, auth, "", "Введите четырёхзначный PIN.");
      try { await instances.setPin(auth.instance, pin); }
      catch (_) { return accountPage(res, auth, "", "Сервер не принял команду PIN. Проверьте состояние сервера и пары SEC."); }
      record(auth.instance, pin ? "PIN управления установлен." : "PIN управления снят.");
      return redirect(res, "/account");
    });
    if (route === "/account/code" && !auth.admin && auth.instance) return manage(res, auth, async () => {
      const issue = await instances.pairingIssue(auth.instance);
      if (auth.paused) return failure(res, 403, "Доступ приостановлен.");
      if (issue) return accountPage(res, auth, "", pairingMessages[issue] || "Публичный таймер пока недоступен. Проверьте его статус и повторите попытку.");
      const code = random(12);
      auth.pairing = { hash: digest(code), until: Date.now() + 15 * 60000 };
      save();
      return accountPage(res, auth, code);
    });
    return failure(res, 403, "Действие недоступно.");
  }
  const server = http.createServer((req, res) => {
    dispatch(req, res).catch(error => {
      console.error("FDV portal request failed:", error.code || error.name);
      if (!res.headersSent) failure(res, 503, "Сервис временно недоступен.");
      else res.destroy();
    });
  });
  server.on("upgrade", (req, socket, head) => {
    const { user, guest } = hostRoute(String(req.headers.host || "").toLowerCase());
    if (!user || guest || user.paused || !user.password || user.instance.stopped || req.url !== "/api/sec/tunnel") {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    instances.upgrade(user.instance, req, socket, head).catch(() => socket.destroy());
  });
  async function close() {
    server.close();
    await Promise.all(users.filter(user => user.instance).map(user => instances.stop(user.instance)));
  }
  server.on("listening", () => {
    for (const user of users) {
      if (user.instance && !user.instance.stopped && !user.paused) instances.start(user.instance).catch(() => {});
    }
  });
  return { server, close };
}

if (require.main === module) {
  const portal = createPortal({
    stateDir: process.env.FDV_PORTAL_STATE_DIR || path.join(__dirname, "state"),
    timerDir: process.env.FDV_PORTAL_TIMER_DIR || path.resolve(__dirname, ".."),
    publicOrigin: process.env.FDV_PORTAL_ORIGIN || "https://app.fdvtimer.online",
    domain: process.env.FDV_PORTAL_INSTANCE_DOMAIN || "timers.fdvtimer.online",
    adminPassword: process.env.FDV_PORTAL_ADMIN_PASSWORD,
    deliver: process.env.FDV_SMTP_HOST && process.env.FDV_SMTP_FROM ? sendMail : null
  });
  portal.server.listen(Number(process.env.FDV_PORTAL_PORT) || 9190, "127.0.0.1");
  process.on("SIGTERM", () => portal.close().catch(() => process.exit(1)));
}
module.exports = { createPortal };
