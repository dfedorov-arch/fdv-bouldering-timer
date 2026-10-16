(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FDVSecondaryServer = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  function create(environment, options) {
    var env = environment;
    var opts = options || {};
    var nativeFetch = env.fetch ? env.fetch.bind(env) : null;
    var original = env.location.protocol + "//" + env.location.host;
    var active = original;
    var config = null;
    var available = false;
    var pending = false;
    var timer = null;
    var lastContact = now();
    var lastInstance = "";
    var retiredInstances = {};
    var key = "fdvSecondaryServerV1";
    var activeKey = key + ":" + (opts.clientId ? opts.clientId() : "");
    function now() { return env.performance && env.performance.now ? env.performance.now() : new Date().getTime(); }
    function notify() { if (opts.changed) opts.changed(); }
    function persist() {
      try {
        env.localStorage.setItem(key, JSON.stringify({ config: config }));
        env.localStorage.setItem(activeKey, JSON.stringify({ session: config ? config.session : "", active: active }));
      } catch (_) {}
    }
    function schedule(delay) {
      if (opts.disabled || !config || timer !== null) return;
      timer = env.setTimeout(function () { timer = null; check(); }, delay);
    }
    function getJson(method, address, body, done) {
      var xhr = new env.XMLHttpRequest();
      var finished = false;
      function finish(error, result) {
        if (finished) return;
        finished = true;
        done(error, result);
      }
      xhr.open(method, address, true);
      try { xhr.timeout = 1800; } catch (_) {}
      if (body) xhr.setRequestHeader("content-type", "application/json");
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status < 200 || xhr.status >= 300) { finish(new Error("SEC unavailable")); return; }
        try { finish(null, JSON.parse(xhr.responseText)); } catch (error) { finish(error); }
      };
      xhr.onerror = function () { finish(new Error("SEC unavailable")); };
      xhr.ontimeout = xhr.onerror;
      try { xhr.send(body ? JSON.stringify(body) : null); } catch (error) { finish(error); }
    }
    function switchEndpoint(address) {
      if (!config || active === address) return false;
      if (lastInstance) retiredInstances[lastInstance] = true;
      active = address;
      lastInstance = "";
      lastContact = now();
      available = true;
      persist();
      if (opts.switched) opts.switched(active);
      notify();
      return true;
    }
    function switchToSecondary() { return config ? switchEndpoint(config.secondaryUrl) : false; }
    function observe(remote) {
      if (opts.disabled || !remote) return false;
      var next = remote.sec;
      var samePair = config && next && config.session === next.session;
      if (samePair && (next.epoch || 0) < (config.epoch || 0)) return true;
      var rolesChanged = next && (next.epoch || 0) > (samePair ? config.epoch || 0 : 0);
      if (rolesChanged && next.secondaryInstanceId) delete retiredInstances[next.secondaryInstanceId];
      if (remote.serverInstanceId && retiredInstances[remote.serverInstanceId]) return true;
      if (next && next.protocol === 1 && next.secondaryUrl) {
        if (!config || config.session !== next.session) {
          config = next;
          available = false;
          persist();
          schedule(0);
        } else {
          config = next;
        }
        if (rolesChanged) {
          available = false;
          if (opts.rolesChanged) opts.rolesChanged(next);
          persist();
          schedule(0);
          // Finish the old group handover once, not on every state response:
          // a deliberate later move to the new standby must remain possible.
          if (active !== next.primaryUrl) {
            switchEndpoint(next.primaryUrl);
            return true;
          }
        }
        if (active !== next.secondaryUrl && (next.switchAll
          || (next.switchClients || []).indexOf(opts.clientId ? opts.clientId() : "") >= 0)) {
          switchToSecondary();
          return true;
        }
      } else if (Object.prototype.hasOwnProperty.call(remote, "sec") && config && active === config.primaryUrl) {
        config = null;
        available = false;
        if (timer !== null) env.clearTimeout(timer);
        timer = null;
        persist();
      }
      if (remote.serverInstanceId) lastInstance = remote.serverInstanceId;
      notify();
      return false;
    }
    function check(done) {
      if (pending || opts.disabled || !config) { if (done) done(false); return; }
      pending = true;
      var expectedSession = config.session;
      var expectedSecondary = config.secondaryUrl;
      getJson("GET", expectedSecondary + "/api/sec/status?session=" + encodeURIComponent(config.session), null,
        function (error, result) {
          pending = false;
          if (!config || config.session !== expectedSession) { if (done) done(false); return; }
          available = !error && result && result.sec && result.sec.session === expectedSession && result.sec.ready;
          if (available) {
            observe(result);
            if (config.secondaryUrl !== expectedSecondary) {
              available = false;
              notify(); schedule(0);
              if (done) done(false);
              return;
            }
            if ((active !== config.secondaryUrl && now() - lastContact >= 20000)
              || (active === config.secondaryUrl && !result.sec.sourceConnected && !result.sec.switchAll)) {
              if (!result.sec.sourceConnected && !result.sec.switchAll) {
                pending = true;
                getJson("POST", config.secondaryUrl + "/api/sec/takeover", { session: expectedSession },
                  function (takeoverError, takeover) {
                    pending = false;
                    if (!takeoverError && config && config.session === expectedSession) observe(takeover);
                    schedule(2500);
                  });
              } else { switchToSecondary(); }
            }
          }
          notify();
          if (done) done(available);
          schedule(2500);
        });
    }
    if (!opts.disabled) {
      try {
        var saved = JSON.parse(env.localStorage.getItem(key) || "null");
        if (saved && saved.config && saved.config.protocol === 1 && saved.config.secondaryUrl) {
          config = saved.config;
          var own = JSON.parse(env.localStorage.getItem(activeKey) || "null");
          if (own && own.session === config.session
            && (own.active === config.secondaryUrl || own.active === config.primaryUrl)) active = own.active;
          schedule(0);
        }
      } catch (_) {}
    }
    return {
      observe: observe,
      contact: function () { lastContact = now(); },
      check: check,
      switchToSecondary: switchToSecondary,
      url: function (path) {
        return !opts.disabled && active !== original && /^\/?(?:api|beeps|fonts)\//.test(path)
          ? active + (path.charAt(0) === "/" ? "" : "/") + path : path;
      },
      fetch: function (path, init) { return nativeFetch(this.url(path), init); },
      info: function () { return { config: config, available: available, active: active,
        onSecondary: Boolean(config && active === config.secondaryUrl) }; },
      close: function () { if (timer !== null) env.clearTimeout(timer); timer = null; config = null; }
    };
  }
  return { create: create };
});
