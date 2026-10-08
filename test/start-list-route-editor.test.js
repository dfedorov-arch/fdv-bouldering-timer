"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { create } = require("../lib/start-list-route-editor");

function fixture() {
  let lists = [{ headers: ["#", "Name"], rows: [["1", "Participant"]], routeCount: 5 }];
  const requests = [];
  const editor = create({
    getList: index => lists[index], defaultValue: () => 5, onUpdate() {},
    save(index, value) {
      return new Promise(resolve => requests.push({ index, value,
        finish(saved = true) {
          if (saved) replace(lists.map((list, i) => i === index ? { ...list, routeCount: value } : list));
          resolve(saved);
        }
      }));
    }
  });
  function replace(next) { editor.reconcile(next); lists = next; }
  return { editor, requests, replace, lists: () => lists };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test("route input survives clock synchronization, blank and multi-digit drafts do not save", () => {
  const { editor, requests } = fixture();
  editor.focus(0);
  for (const value of ["4", "", "1", "12"]) {
    editor.input(0, value);
    assert.equal(editor.value(0), value);
    assert.equal(requests.length, 0);
  }
});

test("route commits protect pending values and deduplicate Enter followed by native change", async () => {
  const { editor, requests } = fixture();
  editor.focus(0); editor.input(0, "4"); editor.commit(0, "4"); editor.commit(0, "4");
  assert.equal(editor.value(0), "4");
  assert.equal(editor.status(0), "saving");
  assert.equal(requests.length, 1);
  editor.blur(0);
  requests[0].finish(); await settle();
  assert.equal(editor.value(0), "4");
  assert.equal(editor.status(0), "");
  assert.equal(requests.length, 1);
});

test("rapid route changes serialize saves and coalesce queued values to the latest", async () => {
  const { editor, requests } = fixture();
  for (const value of ["4", "3", "2"]) { editor.input(0, value); editor.commit(0, value); }
  assert.equal(requests.length, 1);
  requests[0].finish(); await settle();
  assert.equal(editor.value(0), "2");
  assert.equal(requests.length, 2);
  assert.equal(requests[1].value, 2);
  requests[1].finish(); await settle();
  assert.equal(editor.value(0), "2"); assert.equal(editor.status(0), "");
});

test("an acknowledgement does not erase a newer unfinished draft", async () => {
  const { editor, requests } = fixture();
  editor.input(0, "4"); editor.commit(0, "4"); editor.input(0, "1");
  requests[0].finish(); await settle();
  assert.equal(editor.value(0), "1"); assert.equal(requests.length, 1);
  editor.input(0, "12"); editor.commit(0, "12");
  requests[1].finish(); await settle(); assert.equal(editor.value(0), "12");
});

test("a failed save keeps the value and error until explicit retry, then recovers", async () => {
  const { editor, requests } = fixture();
  editor.input(0, "4"); editor.commit(0, "4"); editor.blur(0);
  requests[0].finish(false); await settle();
  assert.equal(editor.value(0), "4"); assert.equal(editor.status(0), "error");
  editor.commit(0, "4"); requests[1].finish(); await settle();
  assert.equal(editor.status(0), ""); assert.equal(editor.value(0), "4");
});

test("replacing or deleting a list cancels its queued edits and ignores late acknowledgement", async () => {
  const f = fixture();
  f.editor.input(0, "4"); f.editor.commit(0, "4");
  f.editor.input(0, "3"); f.editor.commit(0, "3");
  f.replace([{ headers: ["#", "Name"], rows: [["1", "New participant"]], routeCount: 7 }]);
  f.requests[0].finish(false); await settle();
  assert.equal(f.requests.length, 1); assert.equal(f.editor.value(0), "7");
  f.editor.input(0, "6"); f.replace([null]); assert.equal(f.editor.value(0), "5");
});

test("empty-list route choices remain local until import, then canonical data takes over", () => {
  const f = fixture(); f.replace([null]);
  f.editor.input(0, "4"); f.editor.commit(0, "4"); f.editor.blur(0);
  assert.equal(f.requests.length, 0); assert.equal(f.editor.value(0), "4");
  f.replace([{ headers: ["#", "Name"], rows: [["1", "Imported"]], routeCount: 4 }]);
  assert.equal(f.editor.value(0), "4"); assert.equal(f.editor.status(0), "");
});

test("different list edits serialize independently and do not copy another pending count", async () => {
  const f = fixture(); f.replace([f.lists()[0], { ...f.lists()[0], rows: [["1", "Second"]] }]);
  f.editor.input(0, "4"); f.editor.commit(0, "4");
  f.editor.input(1, "3"); f.editor.commit(1, "3");
  f.requests[0].finish(); await settle();
  assert.equal(f.requests[1].index, 1); f.requests[1].finish(); await settle();
  assert.deepEqual(f.lists().map(list => list.routeCount), [4, 3]);
});
