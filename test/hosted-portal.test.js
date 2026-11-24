"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const net = require("node:net");
const vm = require("node:vm");
const WebSocket = require("../lib/vendor/ws");
const { createPortal } = require("../portal/server.cjs");

test("invited email verification, per-instance enrollment and administrator suspension", { timeout: 20000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fdv-hosted-test-"));
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0,"127.0.0.1",resolve));
  const instancePortStart = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const received = [];
  const origin = "http://app.local.test";
  const adminPassword = crypto.randomBytes(16).toString("hex");
  const portal = createPortal({
    stateDir: directory, timerDir: path.resolve(__dirname,".."), publicOrigin: origin,
    domain: "timers.local.test", adminPassword, plainHttp: true, instancePortStart,
    deliver: async message => { received.push(message); }
  });
  await new Promise(resolve => portal.server.listen(0,"127.0.0.1",resolve));
  const port = portal.server.address().port;
  t.after(async () => {
    await portal.close();
    await fs.promises.rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  });
  function request(url, { host = "app.local.test", cookie, data, json, source = origin, fetchSite, secret } = {}) {
    return new Promise((resolve,reject) => {
      const headers = { Host:host, ...(cookie ? { Cookie:cookie } : {}), ...(secret ? {"X-FDV-Client-Secret":secret} : {}), ...(data ? {
        Origin:source, ...(fetchSite ? {"Sec-Fetch-Site":fetchSite} : {}),
        "Content-Type":json ? "application/json" : "application/x-www-form-urlencoded"
      } : {}) };
      const request = http.request({ hostname:"127.0.0.1", port, path:url, headers, method:data ? "POST" : "GET" }, response => {
        const chunks = [];
        response.on("data", chunk => chunks.push(chunk));
        response.on("end", () => resolve({
          status:response.statusCode, text:Buffer.concat(chunks).toString(),
          contentType:response.headers["content-type"],
          cookie:response.headers["set-cookie"]?.[0].split(";")[0]
        }));
      });
      request.on("error",reject);
      request.end(data ? json ? JSON.stringify(data) : new URLSearchParams(data).toString() : undefined);
    });
  }
  function screenStream(host) {
    return new Promise((resolve, reject) => {
      const stream = http.get({hostname:"127.0.0.1",port,path:"/api/events",headers:{Host:host}}, response => {
        response.resume();
        if (response.statusCode === 200) resolve(response);
        else reject(new Error("Unexpected screen stream status: " + response.statusCode));
      });
      stream.on("error", reject);
      t.after(() => { stream.destroy(); });
    });
  }
  assert.match((await request("/")).text,/Таймер для соревнований/);
  assert.equal((await request("/images/overview.png")).status,200);
  assert.equal((await request("/images/qualification.png")).status,200);
  assert.equal((await request("/app-icon.svg")).status,200);
  const adminCookie = (await request("/login",{data:{login:"admin",password:adminPassword}})).cookie;
  assert.ok(adminCookie);
  assert.equal((await request("/admin/invite",{data:{email:"owner@example.com"}})).status,403);
  assert.equal((await request("/admin/invite",{cookie:adminCookie,data:{email:"owner@example.com"},source:"http://foreign.test"})).status,403);
  await request("/register",{data:{email:"stranger@example.com"}});
  assert.equal(received.length,0);
  await request("/admin/invite",{cookie:adminCookie,data:{email:"Owner@Example.com"}});
  await request("/register",{data:{email:"owner@example.com"}});
  assert.equal(received.length,1);
  const token = new URL(received[0].link).searchParams.get("token");
  const verification = { token, password: "long-bouldering-password" };
  assert.equal((await request("/verify?token=" + token)).status,200);
  assert.equal((await request("/verify",{data:verification,source:"null",fetchSite:"cross-site"})).status,403);
  assert.equal((await request("/verify",{data:verification,source:"null"})).status,403);
  const userCookie = (await request("/verify",{data:verification,source:"null",fetchSite:"same-origin"})).cookie;
  assert.ok(userCookie);
  assert.equal((await request("/verify",{data:verification})).status,400);
  assert.equal((await request("/admin/invite",{cookie:userCookie,data:{email:"extra@example.com"}})).status,403);
  const reserved = await request("/account/start",{cookie:userCookie,data:{slug:"guest-testa"}});
  assert.match(reserved.text,/зарезервированы/);
  const started = await request("/account/start",{cookie:userCookie,data:{slug:"Boulder24"}});
  assert.equal(started.status,303);
  const accountPage = await request("/account",{cookie:userCookie});
  assert.match(accountPage.text,/boulder24\.timers\.local\.test/);
  const host = "boulder24.timers.local.test";
  const identity = async () => JSON.parse((await request("/api/sec/identity",{host})).text);
  const status = async () => JSON.parse((await request("/account/status",{cookie:userCookie})).text);
  const firstId = (await identity()).serverInstanceId;
  assert.ok(firstId);
  assert.match(accountPage.text,/Сервер работает/);
  assert.match(accountPage.text,/>Стоп</);
  assert.equal((await status()).service,"running");
  const changeAddress = (previous, slug, previousAddress, confirmed) =>
    request("/account/address",{cookie:userCookie,data:{previous,slug,previousAddress,...(confirmed ? {confirmed:"1"} : {})}});
  assert.match(accountPage.text,/href="\/account\/address" target="_blank"[^>]*aria-label="Изменить короткий адрес"/);
  assert.equal((await request("/account/address",{cookie:userCookie})).status,200);
  assert.equal((await changeAddress("stale-address","fdv-short","keep")).status,409);
  assert.equal((await changeAddress("boulder24","fdv-short","keep")).status,303);
  const alias = "fdv-short.timers.local.test";
  const aliasIdentity = await request("/api/sec/identity",{host:alias});
  assert.equal(JSON.parse(aliasIdentity.text).serverInstanceId,firstId);
  const aliasPage = await request("/account",{cookie:userCookie});
  assert.match(aliasPage.text,/id="pair-address" value="http:\/\/fdv-short\.timers\.local\.test"/);
  assert.match(aliasPage.text,/Скачать последнюю версию/);
  assert.equal((await identity()).serverInstanceId,firstId);
  assert.equal((await request("/account/guest/enable",{cookie:userCookie,data:{}})).status,303);
  const withGuest = await request("/account",{cookie:userCookie});
  const guest = withGuest.text.match(/http:\/\/(guest-[a-z0-9]{5}\.timers\.local\.test)/)[1];
  assert.match(withGuest.text,/href="\/account\/guest\/qr" target="_blank" rel="noopener"/);
  assert.equal((await request("/account/guest/qr")).status,303);
  assert.equal((await request("/account/guest/qr",{cookie:adminCookie})).status,403);
  const guestQr = await request("/account/guest/qr",{cookie:userCookie});
  assert.equal(guestQr.status,200);
  assert.match(guestQr.text,/<img[^>]*src="\/account\/guest\/qr\.gif"/);
  assert.ok(guestQr.text.includes(`href="http://${guest}"`));
  const guestQrImage = await request("/account/guest/qr.gif",{cookie:userCookie});
  assert.equal(guestQrImage.status,200);
  assert.equal(guestQrImage.contentType,"image/gif");
  assert.match(guestQrImage.text,/^GIF8[79]a/);
  assert.equal((await request("/account/guest/qr.gif")).status,303);
  const guestHtml = (await request("/",{host:guest})).text;
  assert.match(guestHtml,/class="viewer-mode"/);
  assert.match(guestHtml,/id="timeMinutes"/);
  assert.match(guestHtml,/id="guest-rotation" hidden/);
  assert.doesNotMatch(guestHtml,/id="guest-phase"|guest-brand/);
  const screenCode = await request("/screen.js",{host:guest});
  assert.match(screenCode.text,/function fitTimerText/);
  assert.doesNotThrow(() => new Function(screenCode.text));
  const screenContext = { document: { getElementById: () => ({}) }, window: {} };
  vm.runInNewContext(screenCode.text, screenContext);
  const screen = screenContext.window.FDVGuestScreen;
  screen.config({rotationSeconds:60,breakSeconds:20,oneShot:false},false,200);
  assert.equal(screen.rotationNumber(screen.segment(79),{status:"roundRunning"},79),1);
  assert.equal(screen.rotationNumber(screen.segment(80),{status:"roundRunning"},80),2);
  assert.equal(screen.rotationNumber(null,{status:"pause",appealAfterCycle:3},158),3);
  screen.config({rotationSeconds:60,breakSeconds:0,oneShot:true},false,200);
  assert.equal(screen.rotationNumber(null,{status:"ready",startListFinalCycle:4},0),4);
  assert.equal(screen.rotationNumber(null,{status:"roundRunning",startListFinalCycle:4},12),5);
  assert.match((await request("/screen.css",{host:guest})).text,/body\.viewer-mode \.time/);
  const fullscreenScript = await request("/guest.js",{host:guest});
  assert.equal(fullscreenScript.status,200);
  assert.doesNotThrow(() => new Function(fullscreenScript.text));
  assert.match(fullscreenScript.text,/button\.id = "guest-fullscreen"/);
  assert.equal((await request("/fonts/Roboto-Variable.ttf",{host:guest})).status,200);
  assert.equal((await request("/fonts/README.txt",{host:guest})).status,404);
  for (const route of ["/api/state","/api/session","/api/sec/identity","/api/events"]) {
    assert.equal((await request(route,{host:guest})).status,404);
  }
  assert.equal((await request("/api/action",{host:guest,data:{type:"primary",clientId:"guest-check"}})).status,405);
  const ownerState = async () => JSON.parse((await request("/api/state?diagnostics=1",{host})).text);
  const beforeGuest = (await ownerState()).clients.length;
  const guestState = JSON.parse((await request("/api/spectator?clientId=guest-check&diagnostics=1",{host:guest})).text);
  assert.equal(guestState.status,"ready");
  assert.equal(guestState.startListFinalCycle,0);
  assert.ok(guestState.clock.sentAt >= guestState.clock.receivedAt);
  assert.ok(Math.abs(guestState.clock.sentAt - Date.now()) < 10000);
  assert.equal("clients" in guestState,false);
  assert.equal("startLists" in guestState,false);
  assert.equal((await ownerState()).clients.length,beforeGuest);
  assert.equal((await request("/account/guest/disable",{cookie:userCookie,data:{}})).status,303);
  assert.equal((await request("/account/guest/qr",{cookie:userCookie})).status,404);
  assert.equal((await request("/account/guest/qr.gif",{cookie:userCookie})).status,404);
  assert.equal((await request("/api/spectator",{host:guest})).status,404);
  await request("/account/guest/enable",{cookie:userCookie,data:{}});
  assert.equal((await request("/account/status")).status,401);
  assert.equal((await request("/account/restart",{cookie:adminCookie,data:{}})).status,403);
  assert.equal((await request("/account/pin",{cookie:userCookie,data:{pin:"1234"}})).status,303);
  assert.equal((await status()).pin,true);
  assert.equal((await request("/api/launcher/pin",{host,data:{pin:""}})).status,404);
  assert.equal((await request("/account/pin",{cookie:userCookie,data:{pin:""}})).status,303);
  assert.equal((await status()).pin,false);
  const beforeStop = await request("/account/code",{cookie:userCookie,data:{}});
  const invalidated = beforeStop.text.match(/<output id="pairing-code">([a-f0-9]+)<\/output>/)[1];
  assert.equal((await request("/account/stop",{cookie:userCookie,data:{}})).status,303);
  assert.equal((await status()).service,"stopped");
  assert.equal((await request("/api/sec/identity",{host})).status,503);
  assert.match((await request("/account",{cookie:userCookie})).text,/Сервер остановлен владельцем/);
  assert.equal((await request("/account/start",{cookie:userCookie,data:{}})).status,303);
  assert.equal((await request("/api/sec/enroll",{host,data:{code:invalidated},json:true})).status,403);
  const secondId = (await identity()).serverInstanceId;
  assert.notEqual(secondId,firstId);
  assert.equal((await request("/account/restart",{cookie:userCookie,data:{}})).status,303);
  assert.notEqual((await identity()).serverInstanceId,secondId);
  assert.equal((await status()).service,"running");
  const codePage = await request("/account/code",{cookie:userCookie,data:{}});
  const code = codePage.text.match(/<output id="pairing-code">([a-f0-9]+)<\/output>/)[1];
  const body = {data:{code},json:true};
  assert.equal((await request("/api/sec/enroll",{...body,host:"other.timers.local.test"})).status,404);
  const incompatible = await request("/api/sec/enroll",{host,json:true,data:{code,build:-1}});
  assert.equal(JSON.parse(incompatible.text).code,"SEC_BUILD_MISMATCH");
  await request("/account/pin",{cookie:userCookie,data:{pin:"1234"}});
  const busy = await request("/api/sec/enroll",{...body,host});
  assert.equal(JSON.parse(busy.text).code,"SEC_TARGET_HAS_PIN");
  assert.match((await request("/account/code",{cookie:userCookie,data:{}})).text,/Снимите его в кабинете/);
  await request("/account/pin",{cookie:userCookie,data:{pin:""}});
  const redemption = await request("/api/sec/enroll",{...body,host:alias});
  assert.equal(redemption.status,200);
  const pairingToken = JSON.parse(redemption.text).token;
  assert.match(pairingToken,/^[a-f0-9]{64}$/);
  assert.equal(JSON.parse((await request("/api/sec/enroll",{...body,host})).text).code,"SEC_CODE_USED");
  const invalidTunnel = new WebSocket(`ws://127.0.0.1:${port}/api/sec/tunnel`, {headers:{
    Host:guest, Authorization:"Bearer " + pairingToken
  }});
  const guestTunnelError = await new Promise(resolve => invalidTunnel.once("error",resolve));
  assert.match(guestTunnelError.message,/403/);
  const tunnel = new WebSocket(`ws://127.0.0.1:${port}/api/sec/tunnel`, { headers:{
    Host:alias, Authorization:"Bearer " + pairingToken
  } });
  await new Promise((resolve,reject) => { tunnel.once("open",resolve); tunnel.once("error",reject); });
  assert.match((await request("/account",{cookie:userCookie})).text,/Перезапустить сервер с очисткой всех данных/);
  const confirmationPage = await request("/account/reset",{cookie:userCookie});
  assert.match(confirmationPage.text,/Не выполняйте сброс во время активной фазы соревнований/);
  const confirmation = confirmationPage.text.match(/name="confirmation" value="([a-f0-9]+)"/)[1];
  const reset = {cookie:userCookie,data:{confirmation}};
  const unusedCode = (await request("/account/code",{cookie:userCookie,data:{}})).text.match(/<output id="pairing-code">([a-f0-9]+)<\/output>/)[1];
  const browser = JSON.parse((await request("/api/session",{host,data:{clientId:"reset-test"},json:true})).text);
  const action = data => request("/api/action",{host,secret:browser.secret,json:true,data:{clientId:browser.clientId,...data}});
  await action({type:"primary",primaryClientId:browser.clientId});
  await action({type:"startLists",startLists:[{headers:["#","ФИО"],rows:[["1","Участник"]],routeCount:4}]});
  assert.equal((await ownerState()).startLists.filter(Boolean).length,1);
  assert.equal((await request("/account/pin",{cookie:userCookie,data:{pin:"1234"}})).status,303);
  const hostedParams = path.join(directory,"instances","boulder24","params.txt");
  fs.appendFileSync(hostedParams,"\n# reset-test\n");
  const beforeReset = (await identity()).serverInstanceId;
  assert.equal((await request("/account/reset",{...reset,cookie:adminCookie})).status,403);
  assert.equal((await request("/account/reset",{...reset,source:"http://foreign.test"})).status,403);
  assert.match((await request("/account/reset",{cookie:userCookie,data:{}})).text,/Откройте подтверждение сброса заново/);
  assert.equal((await identity()).serverInstanceId,beforeReset);
  const resetDisconnected = new Promise(resolve => tunnel.once("close",resolve));
  assert.equal((await request("/account/reset",reset)).status,303);
  await resetDisconnected;
  const afterReset = (await identity()).serverInstanceId;
  assert.notEqual(afterReset,beforeReset);
  assert.equal(JSON.parse((await request("/api/sec/identity",{host:alias})).text).serverInstanceId,afterReset);
  assert.equal((await ownerState()).startLists.some(Boolean),false);
  assert.equal((await status()).pin,false);
  assert.equal((await status()).paired,false);
  assert.doesNotMatch(fs.readFileSync(hostedParams,"utf8"),/reset-test/);
  assert.equal((await request("/api/spectator",{host:guest})).status,200);
  assert.equal(JSON.parse((await request("/api/sec/enroll",{host,data:{code:unusedCode},json:true})).text).code,"SEC_CODE_INVALID");
  assert.match((await request("/account/reset",reset)).text,/Откройте подтверждение сброса заново/);
  assert.equal((await identity()).serverInstanceId,afterReset);
  const oldTunnel = new WebSocket(`ws://127.0.0.1:${port}/api/sec/tunnel`, {headers:{
    Host:alias, Authorization:"Bearer " + pairingToken
  }});
  assert.match((await new Promise(resolve => oldTunnel.once("error",resolve))).message,/403/);
  const newCode = (await request("/account/code",{cookie:userCookie,data:{}})).text.match(/<output id="pairing-code">([a-f0-9]+)<\/output>/)[1];
  const next = await request("/api/sec/enroll",{host,data:{code:newCode},json:true});
  assert.equal(next.status,200);
  const newToken = JSON.parse(next.text).token;
  assert.notEqual(newToken,pairingToken);
  const newTunnel = new WebSocket(`ws://127.0.0.1:${port}/api/sec/tunnel`, {headers:{
    Host:alias, Authorization:"Bearer " + newToken
  }});
  await new Promise((resolve,reject) => { newTunnel.once("open",resolve); newTunnel.once("error",reject); });
  const [oldScreen, retainedScreen] = await Promise.all([screenStream(alias), screenStream(host)]);
  assert.equal((await changeAddress("fdv-short","fdv-kept","keep")).status,303);
  assert.equal(JSON.parse((await request("/api/sec/identity",{host:alias})).text).serverInstanceId,afterReset);
  assert.equal(newTunnel.readyState,WebSocket.OPEN);
  assert.equal(oldScreen.destroyed,false);
  assert.equal((await changeAddress("fdv-kept","fdv-short","keep")).status,303);
  const retirement = await changeAddress("fdv-short","fdv-new","retire");
  assert.match(retirement.text,/Все экраны.*потеряют связь/);
  assert.match(retirement.text,/связь с ним разорвётся/);
  assert.equal((await request("/api/sec/identity",{host:alias})).status,200);
  const oldScreenClosed = new Promise(resolve => oldScreen.once("close",resolve));
  const oldTunnelClosed = new Promise(resolve => newTunnel.once("close",resolve));
  assert.equal((await changeAddress("fdv-short","fdv-new","retire",true)).status,303);
  await Promise.all([oldScreenClosed,oldTunnelClosed]);
  assert.equal(retainedScreen.destroyed,false);
  retainedScreen.destroy();
  assert.equal((await request("/api/sec/identity",{host:alias})).status,404);
  const renamedHost = "fdv-new.timers.local.test";
  for (const address of [renamedHost,"fdv-kept.timers.local.test",host]) {
    assert.equal(JSON.parse((await request("/api/sec/identity",{host:address})).text).serverInstanceId,afterReset);
  }
  assert.equal((await request("/api/spectator",{host:guest})).status,200);
  assert.match((await request("/account",{cookie:userCookie})).text,/id="pair-address" value="http:\/\/fdv-new\.timers\.local\.test"/);
  const renamedTunnel = new WebSocket(`ws://127.0.0.1:${port}/api/sec/tunnel`, {headers:{
    Host:renamedHost, Authorization:"Bearer " + newToken
  }});
  await new Promise((resolve,reject) => { renamedTunnel.once("open",resolve); renamedTunnel.once("error",reject); });
  const disconnected = new Promise(resolve => renamedTunnel.once("close",resolve));
  await request("/admin/status",{cookie:adminCookie,data:{email:"owner@example.com",paused:"1"}});
  await disconnected;
  assert.equal((await request("/account",{cookie:userCookie})).status,303);
  assert.equal((await request("/login",{data:{login:"owner@example.com",password:verification.password}})).status,401);
  assert.equal((await request("/api/sec/identity",{host})).status,404);
  assert.equal(JSON.parse((await request("/api/sec/enroll",{...body,host})).text).code,"SEC_TARGET_SUSPENDED");
  await request("/admin/status",{cookie:adminCookie,data:{email:"owner@example.com",paused:"0"}});
  assert.equal((await request("/api/sec/identity",{host})).status,200);
  assert.equal((await request("/account",{cookie:userCookie})).status,303);
  const resumedCookie = (await request("/login",{data:{login:"owner@example.com",password:verification.password}})).cookie;
  const operator = JSON.parse((await request("/api/session",{host,data:{clientId:"stop-test"},json:true})).text);
  const operatorAction = data => request("/api/action",{host,secret:operator.secret,json:true,data:{clientId:operator.clientId,...data}});
  assert.equal((await operatorAction({type:"primary",primaryClientId:operator.clientId})).status,200);
  assert.equal((await operatorAction({type:"start",startMode:"manual",startHours:"",startMinutes:""})).status,200);
  assert.equal((await ownerState()).running,true);
  const stopWarning = await request("/account/stop",{cookie:resumedCookie,data:{}});
  assert.equal(stopWarning.status,200);
  assert.match(stopWarning.text,/Текущий отсчёт остановится/);
  assert.match(stopWarning.text,/связь с локальным сервером, она прервётся/);
  assert.equal((await ownerState()).running,true);
  assert.equal((await request("/account/stop",{cookie:resumedCookie,data:{confirmed:"1"}})).status,303);
  assert.equal((await request("/api/sec/identity",{host})).status,503);
  assert.equal((await request("/apply",{data:{email:"missing@example.com"}})).status,400);
  for (const decision of ["approved","rejected"]) {
    const email = decision + "@example.com";
    const before = received.length;
    assert.equal((await request("/apply",{data:{name:"Тест <гость>",email,phone:"12345",comment:"Комментарий"}})).status,200);
    assert.equal(received[before].email,"dfedorov@gmail.com");
    const application = JSON.parse(fs.readFileSync(path.join(directory,"access-requests.json"),"utf8")).find(item=>item.email===email);
    assert.match((await request("/admin",{cookie:adminCookie})).text,/Тест &lt;гость&gt;/);
    assert.equal((await request("/admin/request",{data:{id:application.id,decision}})).status,403);
    assert.equal((await request("/admin/request",{cookie:adminCookie,data:{id:application.id,decision}})).status,200);
    assert.equal(received[before+1].email,email);
    assert.match(received[before+1].subject,decision==="approved" ? /одобрена/ : /отклонена/);
    await request("/register",{data:{email}});
    assert.equal(Boolean(received[before+2]?.link),decision==="approved");
  }
});
