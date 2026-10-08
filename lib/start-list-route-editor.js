(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FDVStartListRouteEditor = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function create(deps) {
    const drafts = new Map();
    let saving = false;
    const canonical = (index) => String(deps.getList(index)?.routeCount || deps.defaultValue());
    function begin(index) {
      if (!drafts.has(index)) drafts.set(index, {
        source: deps.getList(index), value: canonical(index), version: 0,
        editing: false, dirty: false, pending: false, inflight: null, requested: null, error: false
      });
      return drafts.get(index);
    }
    function input(index, value) {
      const draft = begin(index);
      draft.value = String(value);
      draft.version += 1;
      draft.dirty = true;
      draft.error = false;
      deps.onUpdate(index);
    }
    async function flush() {
      if (saving) return;
      saving = true;
      try {
        while (true) {
          const job = [...drafts.entries()].find(([, draft]) => draft.requested);
          if (!job) break;
          const [index, draft] = job;
          const request = draft.requested;
          draft.requested = null;
          draft.pending = true;
          draft.inflight = request;
          deps.onUpdate(index);
          let saved = false;
          try { saved = await deps.save(index, request.value) === true; } catch (error) {}
          draft.pending = false;
          draft.inflight = null;
          if (drafts.get(index) !== draft) continue;
          if (saved && draft.version === request.version && !draft.requested) {
            draft.dirty = false;
            draft.error = false;
            if (!draft.editing) drafts.delete(index);
          } else if (!saved && !draft.requested) {
            draft.error = true;
          }
          deps.onUpdate(index);
        }
      } finally { saving = false; }
    }
    function commit(index, value) {
      const draft = begin(index);
      if (draft.value !== String(value)) input(index, value);
      draft.value = String(Math.max(1, Math.min(20, Math.round(Number(value) || 1))));
      draft.dirty = true;
      if (!deps.getList(index)) {
        deps.onUpdate(index);
        return;
      }
      if (draft.inflight?.value === Number(draft.value) && draft.inflight.version === draft.version) {
        deps.onUpdate(index);
        return;
      }
      if (!draft.pending && !draft.requested && !draft.error && draft.value === canonical(index)) {
        draft.dirty = false;
        if (!draft.editing) drafts.delete(index);
      } else {
        draft.requested = { value: Number(draft.value), version: draft.version };
        draft.error = false;
      }
      deps.onUpdate(index);
      void flush();
    }
    return Object.freeze({
      input, commit,
      focus(index) { begin(index).editing = true; },
      blur(index) {
        const draft = drafts.get(index);
        if (!draft) return;
        draft.editing = false;
        if (!draft.dirty && !draft.pending && !draft.requested && !draft.error) drafts.delete(index);
      },
      value(index) {
        const draft = drafts.get(index);
        return draft && (draft.dirty || draft.pending || draft.requested || draft.error) ? draft.value : canonical(index);
      },
      status(index) {
        const draft = drafts.get(index);
        return draft?.error ? "error" : draft?.pending || draft?.requested ? "saving" : "";
      },
      reconcile(lists) {
        // Called only when canonical list data changes, not on timer ticks.
        for (const [index, draft] of drafts) {
          const next = lists[index] || null;
          const previous = draft.source || null;
          if (next !== previous && (!next || !previous
              || JSON.stringify([next.title, next.headers, next.rows]) !== JSON.stringify([previous.title, previous.headers, previous.rows]))) {
            drafts.delete(index);
          } else { draft.source = next; }
        }
      }
    });
  }
  return Object.freeze({ create });
});
