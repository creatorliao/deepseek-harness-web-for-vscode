// Transport bridge — webview side (T5/T6/T7).
// Runs inside the webview document, BEFORE the DSH shell bundle. It shims
// fetch / WebSocket / navigator.clipboard so that every same-origin request
// (the DSH frontend resolves its API base to location.origin) is relayed
// through postMessage to the extension host, which performs the real call
// against the local dsh server (Node requests pass the /api trust fence).
//
// Protocol (webview -> host): http / http-abort / ws-open / ws-send / ws-close
//                            / clipboard-write / clipboard-read
//          (host -> webview): http-res / http-err / ws-open-res / ws-frame
//                            / ws-close / clipboard-res / server-status
// It also declares the DSH carrier hook (`__DSH_TRANSPORT__.ownsHost`) so the
// embedded page keeps a durable settings scope — see the section below fetch.
(function () {
  "use strict";
  var bridge = window.__DSH_BRIDGE__ || { serverBase: "" };
  var vscode = acquireVsCodeApi();
  var nextId = 1;
  var pendingHttp = new Map(); // id -> { resolve, reject }
  var pendingClipboard = new Map(); // id -> { resolve, reject }
  var sockets = []; // BridgeWebSocket registry by _id

  function post(msg) {
    vscode.postMessage(msg);
  }

  function isSameOrigin(urlStr) {
    try {
      return new URL(urlStr, location.href).origin === location.origin;
    } catch (_e) {
      return false;
    }
  }

  // fetch() inputs can be a string, a URL object (what the DSH client passes),
  // or a Request — normalize to a URL string. URL objects expose `.href`,
  // NOT `.url`; reading `.url` yields undefined and resolves to "/undefined".
  function toUrlString(input) {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    if (input && typeof input.url === "string") return input.url;
    return String(input);
  }

  // -------------------------------------- prefers-color-scheme shim (R7 fix)
  // The embedded page's client connection sees a non-loopback page origin
  // (vscode-webview://), so its settings scope runs in "memory" mode and
  // never adopts ui-theme.preference — the theme stays on "system", which
  // resolves through matchMedia("(prefers-color-scheme: dark)"). Shimming
  // that query to follow the VS Code theme makes the boot script AND the
  // ThemeRuntime resolve dark/light correctly.
  var realMatchMedia = (window.matchMedia || function () {
    return { matches: false, media: "", addEventListener: function () {}, removeEventListener: function () {}, addListener: function () {}, removeListener: function () {} };
  }).bind(window);
  var DARK_QUERY = "(prefers-color-scheme: dark)";
  var darkOverride; // undefined = real media; boolean = forced by VS Code theme
  var mediaListeners = new Set();
  window.matchMedia = function (query) {
    if (query !== DARK_QUERY) return realMatchMedia(query);
    return {
      get matches() {
        return darkOverride === undefined ? realMatchMedia(DARK_QUERY).matches : darkOverride;
      },
      media: DARK_QUERY,
      addEventListener: function (type, fn) { if (type === "change") mediaListeners.add(fn); },
      removeEventListener: function (type, fn) { if (type === "change") mediaListeners.delete(fn); },
      addListener: function (fn) { mediaListeners.add(fn); },
      removeListener: function (fn) { mediaListeners.delete(fn); },
    };
  };
  if (bridge.dark !== undefined) darkOverride = !!bridge.dark;

  // ------------------------------------------------------------------ fetch
  var nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var urlStr = toUrlString(input);
    if (!isSameOrigin(urlStr)) return nativeFetch(input, init);

    var url = new URL(urlStr, location.href);
    var method = (init && init.method) || (input && input.method) || "GET";
    var headers = init && init.headers ? normalizeHeaders(init.headers) : undefined;
    var body = init && init.body != null ? normalizeBody(init.body) : undefined;
    var signal = init && init.signal;
    var id = nextId++;

    return new Promise(function (resolve, reject) {
      var onAbort = function () {
        if (pendingHttp.delete(id)) {
          post({ type: "http-abort", id: id });
          reject(new DOMException("Aborted", "AbortError"));
        }
      };
      if (signal) {
        if (signal.aborted) return onAbort();
        signal.addEventListener("abort", onAbort, { once: true });
      }
      pendingHttp.set(id, { resolve: resolve, reject: reject });
      post({
        type: "http",
        id: id,
        method: method,
        url: url.pathname + url.search,
        headers: headers,
        body: body,
      });
    });
  };

  function normalizeHeaders(headers) {
    if (headers instanceof Headers) return Object.fromEntries(headers.entries());
    if (Array.isArray(headers)) return Object.fromEntries(headers);
    return headers;
  }

  // The DSH RPC carrier always posts JSON strings; binary bodies (downloads)
  // are the response side. Blob/FormData fall back to no body for MVP.
  function normalizeBody(body) {
    if (typeof body === "string" || body instanceof ArrayBuffer) return body;
    if (ArrayBuffer.isView(body)) return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
    return null;
  }

  // ------------------------------- DSH transport-hook declaration (R20260817-01/14)
  // The page origin is vscode-webview://…, which is not loopback, so the DSH
  // client classifies this page as "not the operator's own machine" and puts
  // its settings scope in memory mode: writes stay inside this document. The
  // visible fallout is the welcome notice reappearing on every reload even
  // though ~/.dsh/settings.yaml already holds the acknowledgement.
  //
  // Upstream's escape hatch is the carrier hook (dsh-client-connection,
  // ClientTransportHooks.ownsHost): a shell that assembles its own transport
  // declares it is the only route to the Host. That is exactly what the bridge
  // is — the page reaches the loopback dsh process only through postMessage to
  // the extension host. `fetch` is this very shim, which is what upstream would
  // pick up from globalThis.fetch anyway; `ownsHost` flips isLoopback to true.
  window.__DSH_TRANSPORT__ = { fetch: window.fetch, ownsHost: true };

  // ------------------------------------------------------------------- ws
  function BridgeWebSocket(url) {
    this.url = url;
    this.readyState = BridgeWebSocket.CONNECTING;
    this._id = nextId++;
    this._listeners = { open: [], message: [], close: [], error: [] };
    sockets.push(this);
    var parsed = new URL(url);
    post({ type: "ws-open", id: this._id, path: parsed.pathname + parsed.search });
  }
  BridgeWebSocket.CONNECTING = 0;
  BridgeWebSocket.OPEN = 1;
  BridgeWebSocket.CLOSING = 2;
  BridgeWebSocket.CLOSED = 3;
  BridgeWebSocket.prototype.addEventListener = function (type, fn) {
    if (this._listeners[type]) this._listeners[type].push(fn);
  };
  BridgeWebSocket.prototype.removeEventListener = function (type, fn) {
    if (!this._listeners[type]) return;
    this._listeners[type] = this._listeners[type].filter(function (f) { return f !== fn; });
  };
  BridgeWebSocket.prototype._fire = function (type, event) {
    this._listeners[type].forEach(function (fn) { fn(event); });
  };
  BridgeWebSocket.prototype.close = function () {
    if (this.readyState === BridgeWebSocket.CLOSED || this.readyState === BridgeWebSocket.CLOSING) return;
    this.readyState = BridgeWebSocket.CLOSING;
    post({ type: "ws-close", id: this._id });
  };
  BridgeWebSocket.prototype.send = function (data) {
    post({ type: "ws-send", id: this._id, data: String(data) });
  };
  function findSocket(id) {
    for (var i = 0; i < sockets.length; i++) if (sockets[i]._id === id) return sockets[i];
    return undefined;
  }
  window.WebSocket = BridgeWebSocket;

  // ------------------------------------------------------------- clipboard
  try {
    var clipboardShim = {
      writeText: function (text) {
        return new Promise(function (resolve, reject) {
          var id = nextId++;
          pendingClipboard.set(id, { resolve: resolve, reject: reject });
          post({ type: "clipboard-write", id: id, text: String(text) });
        });
      },
      readText: function () {
        return new Promise(function (resolve, reject) {
          var id = nextId++;
          pendingClipboard.set(id, { resolve: resolve, reject: reject });
          post({ type: "clipboard-read", id: id });
        });
      },
    };
    Object.defineProperty(navigator, "clipboard", { value: clipboardShim, configurable: true });
  } catch (_e) {
    console.error("[dsh-bridge] clipboard shim failed", _e);
  }

  // ------------------------- VS Code explorer drag -> @file reference
  // (R20260917-01) Dragging a file from the VS Code explorer onto this page
  // should add an `@path` reference to the composer, exactly like picking the
  // file from the `@` completion.
  //
  // Two VS Code facts shape this code:
  //  1. While a drag that started inside the window is in flight, VS Code sets
  //     `pointer-events: none` on every webview iframe, so the page receives no
  //     drag events at all unless the user holds Shift (the documented escape
  //     hatch, microsoft/vscode#182449 / PR #209211). Nothing here can change
  //     that; the README tells the user about Shift.
  //  2. Such a drag carries NO File objects — only string items in VS Code's own
  //     mime types — so the paths must be read from those mime types. We forward
  //     the raw payload to the extension host, which owns the (unit-tested) path
  //     grammar and answers with the finished reference text.
  //
  // Writing it back into the composer goes through the DSH frontend's own paste
  // command (`PASTE_COMMAND` -> `handlers.pasteText`), because the composer is a
  // Lexical editor: touching its DOM directly would be reverted by the next
  // editor commit.
  var RESOURCE_DRAG_TYPES = [
    "application/vnd.code.uri-list",
    "text/uri-list",
    "resourceurls",
    "codefiles",
    "codeeditors",
  ];
  var COMPOSER_SELECTOR = "[data-composer-input]";
  var dropArmed = false;
  var dropHintEl = null;

  function dragTypeList(dataTransfer) {
    try {
      return Array.prototype.slice
        .call((dataTransfer && dataTransfer.types) || [])
        .map(function (type) {
          return String(type).toLowerCase();
        });
    } catch (_e) {
      return [];
    }
  }

  // Which drags we take over. Real files (a drag from the OS) stay with DSH's
  // own attachment drop, and a text selection from an editor is not a file
  // reference — both must keep their existing behaviour.
  function isResourceDrag(dataTransfer) {
    var types = dragTypeList(dataTransfer);
    if (types.length === 0) return false;
    if (types.indexOf("files") !== -1) return false;
    if (types.indexOf("vscode-editor-data") !== -1) return false;
    for (var i = 0; i < RESOURCE_DRAG_TYPES.length; i++) {
      if (types.indexOf(RESOURCE_DRAG_TYPES[i]) !== -1) return true;
    }
    return false;
  }

  function readDropPayload(dataTransfer) {
    var out = {};
    var types = [];
    try {
      types = Array.prototype.slice.call((dataTransfer && dataTransfer.types) || []);
    } catch (_e) {
      return out;
    }
    for (var i = 0; i < types.length; i++) {
      try {
        var value = dataTransfer.getData(types[i]);
        if (value) out[String(types[i])] = value;
      } catch (_e) {
        /* unreadable type: skip it */
      }
    }
    return out;
  }

  // The hint sits above the DSH page, whose own design tokens we do not have.
  // A neutral dark pill is legible on both the light and the dark DSH theme,
  // which is why this one place hardcodes colours (every other surface in the
  // extension uses --vscode-* variables).
  function showDropHint() {
    var text = bridge.dropHint || "";
    if (!text || typeof document === "undefined") return;
    if (!dropHintEl) {
      dropHintEl = document.createElement("div");
      dropHintEl.id = "dsh-drop-hint";
      dropHintEl.style.cssText =
        "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);" +
        "z-index:2147483647;pointer-events:none;background:rgba(24,24,24,.9);color:#fff;" +
        "font:13px/1.5 system-ui,-apple-system,sans-serif;padding:8px 14px;border-radius:8px;" +
        "box-shadow:0 4px 16px rgba(0,0,0,.35);max-width:80vw;text-align:center;";
      document.body.appendChild(dropHintEl);
    }
    dropHintEl.textContent = text;
    dropHintEl.style.display = "block";
  }

  function hideDropHint() {
    if (dropHintEl) dropHintEl.style.display = "none";
  }

  function disarmDrop() {
    dropArmed = false;
    hideDropHint();
  }

  // The composer is `<div data-composer-input contenteditable role=textbox>`
  // (Lexical). The attribute also exists in the hero/empty state with
  // contenteditable="false", so writability is checked before use.
  function findComposer() {
    if (typeof document === "undefined") return null;
    var el = document.querySelector(COMPOSER_SELECTOR);
    if (el) return el;
    var roots = document.querySelectorAll('[data-lexical-editor="true"]');
    var best = null;
    for (var i = 0; i < roots.length; i++) {
      if (roots[i].getAttribute("contenteditable") !== "false") best = roots[i];
    }
    return best;
  }

  function composerWritable(el) {
    if (!el) return false;
    if (el.getAttribute("contenteditable") === "false") return false;
    if (el.getAttribute("aria-disabled") === "true") return false;
    if (el.getAttribute("data-phase") === "inert") return false;
    return true;
  }

  // A synthetic paste event is the only way in: DSH's composer is a Lexical
  // editor whose draft lives in editor state, so DOM writes get reverted. The
  // frontend handles the paste by reading `clipboardData` and inserting the
  // text through its own edit path.
  function dispatchPaste(el, text) {
    try {
      var dataTransfer = new DataTransfer();
      dataTransfer.setData("text/plain", text);
      var event = new ClipboardEvent("paste", {
        clipboardData: dataTransfer,
        bubbles: true,
        cancelable: true,
      });
      el.dispatchEvent(event);
      return true;
    } catch (_e) {
      return false;
    }
  }

  // Lexical applies an edit to editor STATE and commits the DOM on a later tick,
  // so "did it land?" cannot be answered by reading the DOM right after the
  // event. Measured against dsh 0.1.5-rc.2 with scripts/probe-composer-insert.js:
  // both the paste command and execCommand commit asynchronously (nothing
  // visible synchronously, one copy ~100ms later).
  //
  // The success criterion is the CONTENT, never "the text changed": pasting over
  // a selection that already holds the same reference replaces it with identical
  // text, so the DOM string stays the same while the write worked. An earlier
  // version used "changed" and reported failure on that case — the extension
  // host then copied the reference to the clipboard and told the user to paste,
  // which is how one reference became two.
  var INSERT_POLL_MS = 40;
  var INSERT_STEP_BUDGET_MS = [600, 400];

  function draftContains(el, needle) {
    var trimmed = String(needle || "").trim();
    if (trimmed.length === 0) return false;
    return String(el.textContent || "").indexOf(trimmed) !== -1;
  }

  function waitForReference(el, needle, deadline, onDone) {
    if (draftContains(el, needle)) {
      onDone(true);
      return;
    }
    if (Date.now() >= deadline) {
      onDone(false);
      return;
    }
    setTimeout(function () {
      waitForReference(el, needle, deadline, onDone);
    }, INSERT_POLL_MS);
  }

  function runInsertStep(el, text, before, step, done) {
    if (step === 0) {
      var pasted = dispatchPaste(el, text);
      if (!pasted) {
        // No ClipboardEvent/DataTransfer constructor: skip straight to the command.
        runInsertStep(el, text, before, 1, done);
        return;
      }
    } else if (step === 1) {
      try {
        document.execCommand("insertText", false, text);
      } catch (_e) {
        /* command unavailable: the wait below simply times out */
      }
    } else {
      done(false, "rejected");
      return;
    }
    var budget = INSERT_STEP_BUDGET_MS[step] == null ? 0 : INSERT_STEP_BUDGET_MS[step];
    waitForReference(el, text, Date.now() + budget, function (landed) {
      if (landed) done(true, step === 0 ? "paste" : "execCommand");
      else runInsertStep(el, text, before, step + 1, done);
    });
  }

  /**
   * Write `text` into the composer. `text` is the finished reference list; the
   * separating spaces are added here so the `@` token is never glued to
   * existing text (DSH only recognises `@` at a line start or after a space).
   */
  function insertReferenceText(text, done) {
    var el = findComposer();
    var before = el ? String(el.textContent || "") : "";
    var padded = (before.length > 0 ? " " : "") + text + " ";
    if (!composerWritable(el)) {
      done({ ok: false, reason: "no-composer", text: padded });
      return;
    }
    try {
      el.focus({ preventScroll: true });
    } catch (_e) {
      try {
        el.focus();
      } catch (_e2) {
        /* focus is best-effort */
      }
    }
    runInsertStep(el, padded, before, 0, function (ok, reason) {
      done({ ok: ok, reason: reason, text: padded });
    });
  }

  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener(
      "dragover",
      function (event) {
        if (!isResourceDrag(event.dataTransfer)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        dropArmed = true;
        showDropHint();
      },
      true
    );
    document.addEventListener(
      "dragleave",
      function (event) {
        // relatedTarget is null only when the pointer leaves the document.
        if (event.relatedTarget === null) disarmDrop();
      },
      true
    );
    document.addEventListener(
      "drop",
      function (event) {
        if (!isResourceDrag(event.dataTransfer)) {
          disarmDrop();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        var payload = readDropPayload(event.dataTransfer);
        disarmDrop();
        post({ type: "dsh-context-drop", payload: payload });
      },
      true
    );
    window.addEventListener("blur", disarmDrop);
  }

  // ---------------------------------------------------------- host -> page
  window.addEventListener("message", function (event) {
    var msg = event.data;
    if (!msg || typeof msg !== "object") return;
    switch (msg.type) {
      case "http-res": {
        var hp = pendingHttp.get(msg.id);
        if (!hp) break;
        pendingHttp.delete(msg.id);
        hp.resolve(
          new Response(msg.body != null ? msg.body : null, {
            status: msg.status,
            statusText: msg.statusText,
            headers: msg.headers,
          })
        );
        break;
      }
      case "http-err": {
        var he = pendingHttp.get(msg.id);
        if (!he) break;
        pendingHttp.delete(msg.id);
        he.reject(new Error(msg.message));
        break;
      }
      case "ws-open-res": {
        var wsOpen = findSocket(msg.id);
        if (!wsOpen) break;
        wsOpen.readyState = BridgeWebSocket.OPEN;
        wsOpen._fire("open", {});
        break;
      }
      case "ws-frame": {
        var wsFrame = findSocket(msg.id);
        if (!wsFrame) break;
        wsFrame._fire("message", { data: msg.data });
        break;
      }
      case "ws-close": {
        var wsClose = findSocket(msg.id);
        if (!wsClose) break;
        wsClose.readyState = BridgeWebSocket.CLOSED;
        wsClose._fire("close", { code: msg.code, reason: msg.reason });
        var wsIdx = sockets.indexOf(wsClose);
        if (wsIdx !== -1) sockets.splice(wsIdx, 1);
        break;
      }
      case "clipboard-res": {
        var cp = pendingClipboard.get(msg.id);
        if (!cp) break;
        pendingClipboard.delete(msg.id);
        if (msg.ok) cp.resolve(msg.text !== undefined ? msg.text : undefined);
        else cp.reject(new Error(msg.message || "clipboard operation failed"));
        break;
      }
      case "theme-preference": {
        darkOverride = !!msg.dark;
        mediaListeners.forEach(function (fn) {
          try {
            fn({ matches: darkOverride, media: DARK_QUERY });
          } catch (_e) {
            /* listener isolation */
          }
        });
        break;
      }
      case "dsh-context-insert": {
        // Translating the drop belongs to the host (unit-tested grammar); all
        // this side does is put the finished text into the composer and report
        // honestly whether it landed.
        insertReferenceText(String(msg.text == null ? "" : msg.text), function (result) {
          post({
            type: "dsh-context-insert-result",
            ok: result.ok,
            reason: result.reason,
            text: result.text,
          });
        });
        break;
      }
      default:
        break;
    }
  });
})();
