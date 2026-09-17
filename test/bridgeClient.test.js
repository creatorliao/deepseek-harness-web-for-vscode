// Regression tests for media/bridge-client.js — the webview-side shim.
// Executes the real injected script under a minimal browser-stub harness so
// the fetch/WebSocket/clipboard relay logic is covered by node:test.
// Regression: fetch(URL-object) used to produce "/undefined" (URL has .href,
// not .url) and relay everything to HTTP 405.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

// Node's URL gives custom schemes (vscode-webview://) an opaque "null"
// origin, unlike Chromium; use an http origin so same-origin resolution
// behaves like the real webview.
const WEBVIEW_ORIGIN = "http://webview.local";
const SCRIPT = require("node:fs").readFileSync(
  path.join(__dirname, "..", "media", "bridge-client.js"),
  "utf8"
);

/**
 * A fake Lexical-ish composer element (the real one is `[data-composer-input]`).
 *
 * `commitDelayMs` models what the real editor does and what an earlier version
 * of this test got wrong: Lexical applies an edit to editor STATE and commits
 * the DOM on a later tick, so a synchronous read-back cannot decide success.
 * `sticky` models a composer that refuses the text entirely.
 */
function fakeComposer(attrs = {}, options = {}) {
  const el = {
    textContent: "",
    focused: false,
    _attrs: attrs,
    getAttribute(name) {
      return name in el._attrs ? el._attrs[name] : null;
    },
    focus() {
      el.focused = true;
    },
    dispatchEvent(event) {
      if (options.sticky) return true;
      if (event && event.type === "paste" && event.clipboardData) {
        const text = event.clipboardData.getData("text/plain");
        if (options.commitDelayMs) setTimeout(() => (el.textContent += text), options.commitDelayMs);
        else el.textContent += text;
      }
      return true;
    },
  };
  return el;
}

/** Wait for the async insert result (the write path bounds itself with timers). */
async function waitForInsertResult(h, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const msg = h.posted.find((m) => m.type === "dsh-context-insert-result");
    if (msg) return msg;
    if (Date.now() > deadline) return undefined;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** A drag event stub carrying the mime types VS Code writes. */
function dragEvent(types, data = {}) {
  return {
    dataTransfer: {
      types,
      getData: (type) => (type in data ? data[type] : ""),
      dropEffect: "",
    },
    relatedTarget: null,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
  };
}

/** Install browser globals, run the bridge script, return a probe handle. */
function loadBridge(bridgeInit, options = {}) {
  const posted = [];
  const nativeFetchCalls = [];
  const listeners = {};
  const docListeners = {};
  const execCommands = [];
  const composer = options.composer === undefined ? fakeComposer() : options.composer;

  const window = {
    fetch: (input, init) => {
      nativeFetchCalls.push({ input, init });
      return Promise.resolve(new Response("native", { status: 200 }));
    },
    matchMedia: (query) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
    addEventListener: (type, fn) => {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    WebSocket: class {
      constructor(url) {
        this.url = url;
      }
    },
  };
  const document = {
    addEventListener: (type, fn) => {
      (docListeners[type] = docListeners[type] || []).push(fn);
    },
    querySelector: (selector) =>
      selector === "[data-composer-input]" ? composer ?? null : null,
    querySelectorAll: () => (composer ? [composer] : []),
    createElement: () => ({ style: {}, textContent: "" }),
    body: { appendChild: () => {} },
    execCommand: (_command, _ui, value) => {
      execCommands.push(value);
      return false;
    },
  };
  class FakeDataTransfer {
    constructor() {
      this._data = {};
    }
    setData(type, value) {
      this._data[type] = String(value);
    }
    getData(type) {
      return this._data[type] ?? "";
    }
  }
  class FakeClipboardEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.clipboardData = init.clipboardData;
      this.bubbles = init.bubbles;
    }
  }
  const acquireVsCodeApi = () => ({ postMessage: (msg) => posted.push(msg) });
  const location = { href: WEBVIEW_ORIGIN + "/", origin: WEBVIEW_ORIGIN };
  // Node ≥21 exposes a read-only global navigator; the bridge only adds a
  // `clipboard` property to it, which is allowed.
  const navigator = globalThis.navigator;

  globalThis.window = window;
  globalThis.document = document;
  globalThis.DataTransfer = FakeDataTransfer;
  globalThis.ClipboardEvent = FakeClipboardEvent;
  globalThis.location = location;
  globalThis.acquireVsCodeApi = acquireVsCodeApi;
  if (bridgeInit) window.__DSH_BRIDGE__ = bridgeInit;

  // Run the IIFE in this context.
  const run = new Function(
    "window",
    "location",
    "navigator",
    "acquireVsCodeApi",
    "URL",
    "Headers",
    "Response",
    "DOMException",
    SCRIPT
  );
  run(window, location, navigator, acquireVsCodeApi, URL, Headers, Response, DOMException);

  return { posted, nativeFetchCalls, window, listeners, docListeners, composer, execCommands };
}

test("fetch with a URL object relays the correct path (regression: /undefined)", async () => {
  const h = loadBridge();
  const input = new URL(WEBVIEW_ORIGIN + "/api/host.pickDirectory", "http://x");
  const p = h.window.fetch(input, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(h.posted.length, 1);
  assert.deepEqual(h.posted[0], {
    type: "http",
    id: 1,
    method: "POST",
    url: "/api/host.pickDirectory",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(h.nativeFetchCalls.length, 0);
  // Resolve the relay: respond and check the Response status.
  const msg = h.listeners.message;
  h.listeners.message.forEach((fn) => fn({ data: { type: "http-res", id: 1, status: 200, statusText: "OK", headers: {}, body: "{}" } }));
  const res = await p;
  assert.equal(res.status, 200);
});

test("fetch with a string input relays too", () => {
  const h = loadBridge();
  h.window.fetch(WEBVIEW_ORIGIN + "/api/session.list", { method: "POST", body: "{}" });
  assert.equal(h.posted[0].url, "/api/session.list");
});

test("cross-origin fetches (blob/data) fall through to native fetch", async () => {
  const h = loadBridge();
  const res = await h.window.fetch("blob:http://x/abc", {});
  assert.equal(h.nativeFetchCalls.length, 1);
  assert.equal(h.posted.length, 0);
  assert.equal(res.status, 200);
});

test("WebSocket shim relays ws-open with the path", () => {
  const h = loadBridge();
  const ws = new h.window.WebSocket(WEBVIEW_ORIGIN + "/api/events.mux");
  assert.equal(ws.readyState, h.window.WebSocket.CONNECTING);
  assert.equal(h.posted[0].type, "ws-open");
  assert.equal(h.posted[0].path, "/api/events.mux");
  // open-res flips readyState and fires open listeners.
  const opened = [];
  ws.addEventListener("open", () => opened.push(true));
  h.listeners.message.forEach((fn) => fn({ data: { type: "ws-open-res", id: h.posted[0].id, ok: true } }));
  assert.equal(ws.readyState, h.window.WebSocket.OPEN);
  assert.equal(opened.length, 1);
});

test("clipboard shim relays writeText and resolves clipboard-res", async () => {
  const h = loadBridge();
  const p = navigator.clipboard.writeText("hello");
  assert.equal(h.posted[0].type, "clipboard-write");
  assert.equal(h.posted[0].text, "hello");
  h.listeners.message.forEach((fn) => fn({ data: { type: "clipboard-res", id: h.posted[0].id, ok: true } }));
  await p; // resolves without rejection
});

test("bridge declares the DSH carrier hook so the page keeps host settings", async () => {
  // Regression (R20260817-01/14): the page origin is vscode-webview://…, i.e.
  // not loopback, so without __DSH_TRANSPORT__.ownsHost the DSH client keeps
  // its settings scope in memory mode — the welcome notice then reappears on
  // every reload and panel settings never reach ~/.dsh/settings.yaml.
  const h = loadBridge();
  const transport = h.window.__DSH_TRANSPORT__;
  assert.equal(transport.ownsHost, true);
  // The declared carrier must be the bridge shim, not the native fetch.
  assert.equal(transport.fetch, h.window.fetch);
  const p = transport.fetch(WEBVIEW_ORIGIN + "/api/settings.describe", { method: "POST", body: "{}" });
  assert.equal(h.posted.length, 1);
  assert.equal(h.posted[0].type, "http");
  assert.equal(h.posted[0].url, "/api/settings.describe");
  assert.equal(h.nativeFetchCalls.length, 0);
  h.listeners.message.forEach((fn) => fn({ data: { type: "http-res", id: h.posted[0].id, status: 200, statusText: "OK", headers: {}, body: "{}" } }));
  assert.equal((await p).status, 200);
});

test("matchMedia shim follows __DSH_BRIDGE__.dark and theme-preference messages", () => {
  // Pre-set __DSH_BRIDGE__ with dark:true before the script loads.
  const h = loadBridge({ serverBase: "http://x", dark: true });
  const darkMql = h.window.matchMedia("(prefers-color-scheme: dark)");
  assert.equal(darkMql.matches, true);
  // Other queries pass through to the real matchMedia.
  assert.equal(h.window.matchMedia("(max-width: 1px)").matches, false);

  // A theme-preference message flips the override and fires listeners.
  const seen = [];
  darkMql.addEventListener("change", (e) => seen.push(e.matches));
  h.listeners.message.forEach((fn) => fn({ data: { type: "theme-preference", dark: false } }));
  assert.equal(darkMql.matches, false);
  assert.deepEqual(seen, [false]);
});

// ------------------------- VS Code explorer drag -> @reference (R20260917-01)

test("a VS Code resource drag is taken over and its raw payload forwarded", () => {
  const h = loadBridge();
  const data = {
    "application/vnd.code.uri-list": "file:///d%3A/code/proj/src/a.ts",
    "text/plain": "src/a.ts",
  };
  const over = dragEvent(Object.keys(data), data);
  h.docListeners.dragover.forEach((fn) => fn(over));
  assert.equal(over.defaultPrevented, true, "dragover must be allowed or no drop fires");
  assert.equal(over.dataTransfer.dropEffect, "copy");

  const drop = dragEvent(Object.keys(data), data);
  h.docListeners.drop.forEach((fn) => fn(drop));
  assert.equal(drop.defaultPrevented, true);
  assert.equal(h.posted.length, 1);
  assert.equal(h.posted[0].type, "dsh-context-drop");
  // Raw payload only: the path grammar belongs to the (unit-tested) host side.
  assert.deepEqual(h.posted[0].payload, data);
});

test("an OS file drag is left to DSH's own attachment drop", () => {
  // These carry real File objects; DSH uploads them as attachments and must
  // keep working, so the extension must not intercept them.
  const h = loadBridge();
  const over = dragEvent(["Files", "text/plain"], {});
  h.docListeners.dragover.forEach((fn) => fn(over));
  assert.equal(over.defaultPrevented, false);

  const drop = dragEvent(["Files", "text/plain"], {});
  h.docListeners.drop.forEach((fn) => fn(drop));
  assert.equal(drop.defaultPrevented, false);
  assert.equal(h.posted.length, 0);
});

test("dragging a text selection out of an editor is not treated as a file reference", () => {
  const h = loadBridge();
  const data = { "text/plain": "const x = 1;", "vscode-editor-data": '{"version":1}' };
  const over = dragEvent(Object.keys(data), data);
  h.docListeners.dragover.forEach((fn) => fn(over));
  assert.equal(over.defaultPrevented, false);
  assert.equal(h.posted.length, 0);
});

test("dsh-context-insert writes the reference through a synthetic paste", () => {
  const h = loadBridge();
  h.composer.textContent = "看看这个";
  h.listeners.message.forEach((fn) => fn({ data: { type: "dsh-context-insert", text: "@src/a.ts" } }));
  // A space is added before the reference: DSH only recognises `@` at a line
  // start or after whitespace, so gluing it to existing text would break it.
  assert.equal(h.composer.textContent, "看看这个 @src/a.ts ");
  assert.equal(h.composer.focused, true);
  const result = h.posted.find((m) => m.type === "dsh-context-insert-result");
  assert.equal(result.ok, true);
  assert.equal(result.reason, "paste");
  assert.equal(result.text, " @src/a.ts ");
});

test("dsh-context-insert into an empty composer adds no leading space", () => {
  const h = loadBridge();
  h.listeners.message.forEach((fn) => fn({ data: { type: "dsh-context-insert", text: "@a.ts @b.ts" } }));
  assert.equal(h.composer.textContent, "@a.ts @b.ts ");
});

test("a read-only composer reports failure instead of pretending", () => {
  const h = loadBridge(undefined, { composer: fakeComposer({ contenteditable: "false" }) });
  h.listeners.message.forEach((fn) => fn({ data: { type: "dsh-context-insert", text: "@src/a.ts" } }));
  assert.equal(h.composer.textContent, "");
  const result = h.posted.find((m) => m.type === "dsh-context-insert-result");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "no-composer");
  // The text still comes back so the host can put it on the clipboard.
  assert.equal(result.text, "@src/a.ts ");
});

// Regression (2026-09-17, defect: the context menu inserted the reference TWICE)
// — the real composer applies the edit to editor state and commits the DOM on a
// later tick. Deciding success with a synchronous read-back reported "rejected"
// while the text was on its way; the extension host then copied the reference to
// the clipboard and told the user to press Ctrl+V, so pasting produced a second
// copy. `node scripts/probe-composer-insert.js` measured the real editor.

test("an asynchronously committed composer is a success, inserted exactly once", async () => {
  const h = loadBridge(undefined, { composer: fakeComposer({}, { commitDelayMs: 30 }) });
  h.listeners.message.forEach((fn) => fn({ data: { type: "dsh-context-insert", text: "@src/a.ts" } }));
  const result = await waitForInsertResult(h);
  assert.ok(result, "no result was reported");
  assert.equal(result.ok, true);
  assert.equal(result.reason, "paste");
  assert.equal(h.composer.textContent.split("@src/a.ts").length - 1, 1, "inserted more than once");
  // The fallback must not fire once the paste has landed — that is the other way
  // one reference becomes two.
  assert.deepEqual(h.execCommands, []);
});

test("a composer that refuses the text reports failure after both attempts", async () => {
  const h = loadBridge(undefined, { composer: fakeComposer({}, { sticky: true }) });
  h.listeners.message.forEach((fn) => fn({ data: { type: "dsh-context-insert", text: "@src/a.ts" } }));
  const result = await waitForInsertResult(h);
  assert.ok(result, "no result was reported");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "rejected");
  assert.equal(h.execCommands.length, 1, "the execCommand fallback should be tried once");
});
