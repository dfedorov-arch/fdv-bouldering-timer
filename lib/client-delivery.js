(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FDVClientDelivery = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  function metadata(remote) {
    var value = remote && remote.delivery;
    return value && value.protocol === 1 && typeof value.key === "string"
      && value.key.length > 0 && value.key.length <= 300 ? value : null;
  }

  // ES5 for Legacy. No clocks, requests, timers or rendering are owned here.
  function createClient(options) {
    var received = "", applied = "", prepared = false, mainRendered = false, listReady = false, needsList = false, events = [], busy = {};
    options = options || {};
    try {
      var saved = JSON.parse(options.load ? options.load() : "null");
      if (saved && saved.events instanceof Array) events = saved.events.slice(-32).filter(function (item) {
        return item && typeof item.id === "string" && item.id.length <= 96 && ["applied", "expired", "failed"].indexOf(item.result) >= 0;
      });
      if (saved && saved.busy instanceof Array) {
        for (var n = 0; n < saved.busy.length && n < 32; n += 1) if (typeof saved.busy[n] === "string" && saved.busy[n].length <= 96) events.push({ id: saved.busy[n], result: "failed" });
        events = events.slice(-32);
      }
    } catch (_) {}
    function persist() {
      if (!options.save) return;
      try { options.save(JSON.stringify({ events: events, busy: Object.keys(busy).slice(-32) })); } catch (_) {}
    }
    return {
      receive: function (remote) {
        var value = metadata(remote);
        if (!value) return false;
        if (value.key !== received) { received = value.key; prepared = false; mainRendered = false; listReady = false; }
        return true;
      },
      prepare: function (remote) {
        var value = metadata(remote);
        prepared = Boolean(value && value.key === received);
        needsList = Boolean(remote && remote.startListEnabled && remote.startListVisible);
      },
      failed: function () { prepared = false; },
      rendered: function () { mainRendered = true; if (prepared && (!needsList || listReady)) applied = received; },
      listsRendered: function () { listReady = true; if (prepared && mainRendered) applied = received; },
      receivedKey: function () { return received; },
      needsApply: function (remote) { var value = metadata(remote); return Boolean(value && value.key !== applied); },
      knowsEvent: function (id) { return Boolean(busy[id] || events.some(function (item) { return item.id === id; })); },
      beginEvent: function (id) {
        var i;
        if (!id || busy[id] || Object.keys(busy).length >= 32) return false;
        for (i = 0; i < events.length; i += 1) if (events[i].id === id) return false;
        busy[id] = true;
        persist();
        return true;
      },
      finishEvent: function (id, result) {
        delete busy[id];
        events.push({ id: id, result: result });
        if (events.length > 32) events.shift();
        persist();
      },
      report: function () {
        return { deliveryProtocol: 1, deliveryReceived: received, deliveryApplied: applied,
          deliveryEvents: JSON.stringify(events), deliveryBlocked: prepared && needsList && !listReady ? "lists" : "" };
      }
    };
  }

  function key(instanceId, version, secondary) {
    return JSON.stringify([secondary && secondary.session || "", secondary && secondary.epoch || 0,
      secondary && secondary.primaryInstanceId || instanceId, Number(version) || 0]);
  }

  function status(client, expectedKey, waitingAge) {
    if (client.deliveryProtocol !== 1) return "unsupported";
    if (!client.connected) return "unconfirmed";
    if (client.deliveryReceived === expectedKey && client.deliveryBlocked) return "received";
    if (client.deliveryApplied === expectedKey) return "applied";
    if (client.deliveryReceived === expectedKey) return "received";
    return waitingAge <= 3000 ? "pending" : "unconfirmed";
  }

  return { metadata: metadata, createClient: createClient, key: key, status: status };
});
