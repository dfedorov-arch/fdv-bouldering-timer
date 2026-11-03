"use strict";
// Real HTTP session provisioning for test clients. Raw global fetch remains
// available to security tests, which must exercise missing/forged credentials.
const assert = require('node:assert/strict');
const sessions = new Map();
const pending = new Map();
async function credentials(baseUrl, clientId) {
  const origin = new URL(baseUrl).origin;
  const key = origin + ':' + clientId;
  if (sessions.has(key)) return sessions.get(key);
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    const state = await (await globalThis.fetch(origin + '/api/state')).json();
    for (const peer of [state.sec?.primaryUrl, state.sec?.secondaryUrl]) {
      const existing = peer && sessions.get(new URL(peer).origin + ':' + clientId);
      if (existing) { sessions.set(key, existing); return existing; }
    }
    const response = await globalThis.fetch(origin + '/api/session', {
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({clientId})
    });
    assert.equal(response.status,200,await response.clone().text());
    const result = await response.json();
    assert.equal(result.clientId,clientId,'Test client must provision identity before assigning rights');
    sessions.set(key,result);
    return result;
  })();
  pending.set(key,task);
  try { return await task; } finally { pending.delete(key); }
}
async function authenticatedFetch(input, init = {}) {
  const url = new URL(input);
  let id = url.searchParams.get('clientId');
  if (init.body && typeof init.body === 'string') {
    try { id = JSON.parse(init.body).clientId || id; } catch (_) {}
  }
  if (!id || init.headers?.['x-fdv-client-secret']) return globalThis.fetch(input,init);
  const session = await credentials(url.origin,id);
  return globalThis.fetch(input,{...init,headers:{...init.headers,'x-fdv-client-secret':session.secret}});
}
module.exports = {credentials,authenticatedFetch,rememberCredentials: (base,id,value) => sessions.set(new URL(base).origin+":"+id,value)};
