// Probe: what does writing an `@reference` into the real DSH composer actually do?
//
// WHY THIS EXISTS (2026-09-17, defect: the explorer context menu inserted the
// SAME reference twice): `insertReferenceText` in media/bridge-client.js was
// only ever exercised against a fake composer whose `textContent` changes
// synchronously inside `dispatchEvent`. A real Lexical editor may commit on a
// later tick — in which case the synchronous "did it land?" check fails, the
// `execCommand` fallback fires as well, and the text lands TWICE. Unit tests
// with a hand-written DOM cannot answer that; a real page can.
//
// It starts a real `dsh web`, opens it in headless Chromium with the extension's
// own session preset, injects the real bridge script, then runs three
// experiments against the live composer:
//   A. synthetic paste only        → does it land, and when?
//   B. execCommand only            → does Lexical accept it?
//   C. the shipped insert path     → how many copies, and what does it report?
//
// Usage: node scripts/probe-composer-insert.js
"use strict";
const path = require("node:path");
const fs = require("node:fs");
const { execSync } = require("node:child_process");
const { DshServerManager } = require("../out/serverManager.js");
const { buildSessionPresetPayload } = require("../out/workspaceTracker.js");

const ROOT = path.resolve(__dirname, "..");

/** Playwright is a developer tool, not a dependency of the packaged extension. */
function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    /* fall through to the global install */
  }
  try {
    const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    return require(path.join(globalRoot, "playwright"));
  } catch {
    return undefined;
  }
}

/**
 * Launch whatever Chromium exists on this machine. The bundled browser is tried
 * first; a global Playwright whose downloaded build does not match its own
 * version is common, so the system Chrome/Edge channels come next rather than
 * failing the probe with "Executable doesn't exist".
 */
async function launchBrowser(playwright) {
  const attempts = [
    ["bundled chromium", () => playwright.chromium.launch()],
    ["system chrome", () => playwright.chromium.launch({ channel: "chrome" })],
    ["system msedge", () => playwright.chromium.launch({ channel: "msedge" })],
  ];
  let lastError;
  for (const [label, attempt] of attempts) {
    try {
      const browser = await attempt();
      console.log(`[probe] browser: ${label}`);
      return browser;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/** The probe proper; the browser is created inside so the caller can always clean up. */
async function probe(playwright, manager, { url, bridgeJs, preset, cwd }) {
  const browser = await launchBrowser(playwright);
  try {
    const context = await browser.newContext();

    // The extension relays /api through its own bridge; here the page talks to
    // the loopback server directly, so the browser-session cookie is set by hand
    // from the very header the extension would send.
    const cookieHeader = manager.authCookieHeader;
    if (cookieHeader) {
      const [name, ...rest] = cookieHeader.split("=");
      await context.addCookies([{ name, value: rest.join("="), url, sameSite: "Strict" }]);
    }

    // Stand in for the EXTENSION HOST side of the bridge. Injecting the real
    // media/bridge-client.js replaces fetch/WebSocket with a postMessage relay,
    // so without a host that answers, the app can never load and the composer
    // stays in its hero state (contenteditable=false). Capturing the natives
    // BEFORE the bridge loads is what keeps the relay from eating itself.
    await context.addInitScript(
      ({ presetPayload, serverBase }) => {
        const nativeFetch = window.fetch.bind(window);
        const NativeWebSocket = window.WebSocket;
        const sockets = new Map();
        const reply = (msg) => window.postMessage(msg, "*");
        const handle = async (msg) => {
          if (!msg || typeof msg !== "object") return;
          switch (msg.type) {
            case "http": {
              try {
                const res = await nativeFetch(serverBase + msg.url, {
                  method: msg.method || "GET",
                  headers: msg.headers,
                  body: msg.body,
                });
                const headers = {};
                res.headers.forEach((value, key) => {
                  headers[key] = value;
                });
                reply({
                  type: "http-res",
                  id: msg.id,
                  status: res.status,
                  statusText: res.statusText,
                  headers,
                  body: await res.text(),
                });
              } catch (err) {
                reply({ type: "http-err", id: msg.id, message: String(err) });
              }
              break;
            }
            case "ws-open": {
              const ws = new NativeWebSocket(serverBase.replace(/^http/, "ws") + msg.path);
              sockets.set(msg.id, ws);
              ws.onopen = () => reply({ type: "ws-open-res", id: msg.id, ok: true });
              ws.onmessage = (event) => reply({ type: "ws-frame", id: msg.id, data: event.data });
              ws.onclose = (event) => {
                sockets.delete(msg.id);
                reply({ type: "ws-close", id: msg.id, code: event.code, reason: event.reason });
              };
              break;
            }
            case "ws-send": {
              const ws = sockets.get(msg.id);
              if (ws && ws.readyState === 1) ws.send(msg.data);
              break;
            }
            case "ws-close": {
              sockets.get(msg.id)?.close();
              break;
            }
            case "clipboard-write":
            case "clipboard-read": {
              reply({ type: "clipboard-res", id: msg.id, ok: false, message: "probe host: no clipboard" });
              break;
            }
            default:
              break;
          }
        };
        window.__DSH_BRIDGE__ = { serverBase, dark: true, dropHint: "probe" };
        window.__posted = [];
        window.acquireVsCodeApi = () => ({
          postMessage: (msg) => {
            window.__posted.push(msg);
            void handle(msg);
          },
        });
        try {
          localStorage.setItem("dsh.sessions.current", presetPayload);
        } catch (err) {
          /* ignore */
        }
      },
      { presetPayload: preset ?? "", serverBase: url }
    );

    const page = await context.newPage();
    page.on("pageerror", (err) => console.log(`[probe] pageerror: ${err.message}`));
    if (process.env.PROBE_DEBUG) {
      page.on("console", (msg) => console.log(`[probe] console.${msg.type()}: ${msg.text().slice(0, 200)}`));
      page.on("requestfailed", (req) => console.log(`[probe] requestfailed: ${req.url()} ${req.failure()?.errorText}`));
    }
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: bridgeJs });

    // Wait for a writable composer: the attribute also exists in the hero state
    // with contenteditable=false, which is why both are checked.
    const composer = page.locator("[data-composer-input]");
    await composer.waitFor({ timeout: 30000 });
    const writable = async () =>
      (await composer.getAttribute("contenteditable")) !== "false" &&
      (await composer.getAttribute("data-phase")) !== "inert";

    // The page opens on the first-run setup flow (model/API key + workspace), so
    // enter a conversation the way a user does: dismiss the setup, then pick the
    // workspace. The `dsh.sessions.current` preset alone does not get past it.
    if (!(await writable())) {
      const labels = [
        "稍后配置",
        "跳过",
        "Configure later",
        "Skip",
        path.basename(cwd),
        "新会话",
        "New session",
      ];
      for (const label of labels) {
        if (await writable()) break;
        const item = page.getByText(label, { exact: true }).first();
        if ((await item.count()) === 0) continue;
        console.log(`[probe] hero/向导态：点击 "${label}"`);
        await item.click({ timeout: 5000 }).catch((err) => console.log(`[probe] 点击失败: ${err.message}`));
        await page.waitForTimeout(2000);
      }
      console.log(`[probe] 进入会话后 composer 可写：${await writable()}`);
    }
    if (process.env.PROBE_DEBUG) {
      const debug = await page.evaluate(() => {
        const counts = {};
        for (const msg of window.__posted) counts[msg.type] = (counts[msg.type] ?? 0) + 1;
        const text = (el) => (el.innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
        return {
          preset: localStorage.getItem("dsh.sessions.current"),
          messageTypes: counts,
          body: (document.body.innerText ?? "").replace(/\s+/g, " ").slice(0, 200),
          composers: document.querySelectorAll("[data-composer-input]").length,
          buttons: [...document.querySelectorAll('button, [role="button"], a[href]')]
            .map(text)
            .filter(Boolean)
            .slice(0, 25),
          inputs: [...document.querySelectorAll("input, textarea")].map((el) => ({
            type: el.type,
            placeholder: el.getAttribute("placeholder"),
            aria: el.getAttribute("aria-label"),
          })),
        };
      });
      console.log(`[probe][debug] ${JSON.stringify(debug)}`);
    }
    const state = await composer.evaluate((el) => ({
      phase: el.getAttribute("data-phase"),
      editable: el.getAttribute("contenteditable"),
      lexical: el.getAttribute("data-lexical-editor"),
    }));
    console.log(`[probe] composer: ${JSON.stringify(state)}`);
    if (state.editable === "false" || state.phase === "inert") {
      console.log("[probe] composer 不可写（hero/忙态）——探针无法继续，请检查会话 preset");
      return 1;
    }

    // NOTE: there is no reliable way to clear a Lexical draft from the outside —
    // `execCommand("delete")` over a selection is a no-op here (measured) — so
    // every experiment inserts its OWN unique marker and only counts that one.
    const readDraft = (mark) =>
      page.evaluate((needle) => {
        const el = document.querySelector("[data-composer-input]");
        const text = el.textContent ?? "";
        return { text, count: text.split(needle).length - 1 };
      }, mark);

    // --- A. synthetic paste only, sampled synchronously and later ------------
    const markA = "@probe/a-paste.md";
    const experimentA = await page.evaluate((mark) => {
      const el = document.querySelector("[data-composer-input]");
      el.focus();
      const before = el.textContent ?? "";
      const dataTransfer = new DataTransfer();
      dataTransfer.setData("text/plain", ` ${mark} `);
      el.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: dataTransfer, bubbles: true, cancelable: true })
      );
      return { before, sync: el.textContent ?? "" };
    }, markA);
    await page.waitForTimeout(400);
    const afterA = await readDraft(markA);
    console.log(
      `[probe] A 合成 paste：同步后${experimentA.sync === experimentA.before ? "未变（异步提交）" : "已变（同步提交）"}；` +
        `400ms 后出现 ${afterA.count} 次`
    );

    // --- B. execCommand only -------------------------------------------------
    const markB = "@probe/b-command.md";
    const experimentB = await page.evaluate((mark) => {
      const el = document.querySelector("[data-composer-input]");
      el.focus();
      const before = el.textContent ?? "";
      const used = document.execCommand("insertText", false, ` ${mark} `);
      return { before, sync: el.textContent ?? "", used };
    }, markB);
    await page.waitForTimeout(400);
    const afterB = await readDraft(markB);
    console.log(
      `[probe] B execCommand：返回 ${experimentB.used}；同步后${experimentB.sync === experimentB.before ? "未变" : "已变"}；` +
        `400ms 后出现 ${afterB.count} 次`
    );

    // --- C. the shipped path (bridge-client's message handler) ---------------
    const markC = "@probe/c-shipped.md";
    await page.evaluate((mark) => {
      window.__posted.length = 0;
      window.dispatchEvent(new MessageEvent("message", { data: { type: "dsh-context-insert", text: mark } }));
    }, markC);
    await page.waitForTimeout(1500);
    const afterC = await readDraft(markC);
    const reported = await page.evaluate(() => ({
      results: window.__posted.filter((m) => m.type === "dsh-context-insert-result"),
      types: window.__posted.map((m) => m.type),
    }));
    console.log(`[probe] C 线上路径：出现 ${afterC.count} 次；回报 ${JSON.stringify(reported)}`);
    console.log(`[probe] 草稿内容：${JSON.stringify(afterC.text.slice(0, 120))}`);

    const verdict =
      afterC.count === 1 ? "正确（恰好 1 次）" : afterC.count === 0 ? "没写进去" : `重复 ${afterC.count} 次 ← 缺陷`;
    console.log(`[probe] 结论：${verdict}`);

    // --- D. the explorer DRAG path, as far as the page can see it ------------
    // A user drag that VS Code never delivers cannot be simulated here, but the
    // page half can: does a VS Code-shaped drop arm the handler and get its raw
    // payload forwarded? If this passes and the real drag does nothing, the
    // failure is on the VS Code side of the iframe boundary.
    const dragResult = await page.evaluate(() => {
      const composer = document.querySelector("[data-composer-input]");
      const payload = {
        "application/vnd.code.uri-list": "file:///d%3A/code/proj/src/a.ts",
        "text/plain": "src/a.ts",
      };
      const makeEvent = (type) => {
        const dataTransfer = new DataTransfer();
        for (const [mime, value] of Object.entries(payload)) dataTransfer.setData(mime, value);
        return new DragEvent(type, { dataTransfer, bubbles: true, cancelable: true });
      };
      window.__posted.length = 0;
      const over = makeEvent("dragover");
      composer.dispatchEvent(over);
      const drop = makeEvent("drop");
      composer.dispatchEvent(drop);
      return {
        overPrevented: over.defaultPrevented,
        dropPrevented: drop.defaultPrevented,
        forwarded: window.__posted.filter((m) => m.type === "dsh-context-drop"),
      };
    });
    console.log(
      `[probe] D 页面内拖拽：dragover 被接管 ${dragResult.overPrevented}；drop 被接管 ${dragResult.dropPrevented}；` +
        `转发 ${JSON.stringify(dragResult.forwarded)}`
    );
    const dragOk =
      dragResult.overPrevented && dragResult.dropPrevented && dragResult.forwarded.length === 1;
    console.log(
      `[probe] D 结论：${dragOk ? "页面侧链路正常（真机拖不动＝VS Code 没把事件交给 iframe，见 §Shift）" : "页面侧链路有问题"}` +
        `；注意 DataTransfer 在真实跨源拖拽里可能读不到值，那属于同一个结论`
    );

    return afterC.count === 1 && dragOk ? 0 : 1;
  } finally {
    await browser.close().catch(() => {});
  }
}

async function main() {
  const playwright = loadPlaywright();
  if (!playwright) {
    console.log("[probe] SKIP: playwright 不可用（`npm i -g playwright && npx playwright install chromium`）");
    return 0;
  }
  const bridgeJs = fs.readFileSync(path.join(ROOT, "media", "bridge-client.js"), "utf8");
  const cwd = process.env.HOME || process.env.USERPROFILE;
  const manager = new DshServerManager();
  // The dsh child must never outlive this process, however the probe ends
  // (it is spawned with shell:true, so an orphan would keep the port).
  process.on("exit", () => manager.stop());
  try {
    const url = await manager.start({ cwd, ...(process.env.DSH_HOME ? { dshHome: process.env.DSH_HOME } : {}) });
    console.log(`[probe] dsh web ready: ${url}`);
    const sessionId = await manager.ensureWorkspaceSession(cwd);
    console.log(`[probe] session: ${sessionId ?? "(none)"}`);
    return await probe(playwright, manager, {
      url,
      bridgeJs,
      preset: buildSessionPresetPayload(sessionId),
      cwd,
    });
  } finally {
    manager.stop();
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 5000);
      manager.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("[probe] FAIL:", err?.stack ?? err);
    process.exit(1);
  });
