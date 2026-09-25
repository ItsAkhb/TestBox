import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const HERE = new URL("./", import.meta.url);

async function read(rel) {
  return readFile(new URL(rel, HERE), "utf8");
}

// Runs electron/preload.cjs against a minimal ipcRenderer that keeps
// every listener per channel, so tests can act as main.cjs (emit) and
// as the renderer (register/pull).
function loadPreload(source) {
  const listeners = new Map();
  const ipcRenderer = {
    on(channel, handler) {
      if (!listeners.has(channel)) listeners.set(channel, new Set());
      listeners.get(channel).add(handler);
    },
    removeListener(channel, handler) {
      listeners.get(channel)?.delete(handler);
    },
    send() {},
    invoke: async () => undefined,
  };

  const exposed = {};
  const context = vm.createContext({
    require(name) {
      assert.equal(name, "electron");
      return {
        contextBridge: {
          exposeInMainWorld: (key, api) => {
            exposed[key] = api;
          },
        },
        ipcRenderer,
      };
    },
  });
  vm.runInContext(source, context);

  const emit = (channel, ...args) => {
    for (const handler of [...(listeners.get(channel) ?? [])]) {
      handler({}, ...args);
    }
  };
  return { exposed, emit };
}

function loadNative(source, windowStub) {
  const context = vm.createContext({ window: windowStub });
  vm.runInContext(
    source.replace(/^export\s+/gm, "") +
      "\n;globalThis.__native = { openAuthUrl, isNativePlatform };",
    context
  );
  return context.__native;
}

test("auth delivery: preload subscribes to the callback channel at load time", async () => {
  const source = await read("../../electron/preload.cjs");
  const subscribeAt = source.indexOf('ipcRenderer.on("testbox:auth-callback"');
  const exposeAt = source.indexOf("contextBridge.exposeInMainWorld");
  assert.ok(subscribeAt !== -1, "always-on channel handler present");
  assert.ok(exposeAt !== -1, "bridge exposed to the renderer");
  assert.ok(
    subscribeAt < exposeAt,
    "channel subscribed before the bridge so a callback sent during boot is never dropped"
  );
});

test("auth delivery: callback arriving before any listener is buffered and consumed once", async () => {
  const source = await read("../../electron/preload.cjs");
  const { exposed, emit } = loadPreload(source);

  const url = "testbox://auth/callback?code=pkce-boot";
  // main.cjs fires on its boot timer while React is still mounting —
  // no renderer listener exists yet.
  emit("testbox:auth-callback", url);

  assert.equal(
    exposed.testboxDesktop.getPendingAuthUrl(),
    url,
    "mount-time pull returns the buffered URL"
  );
  assert.equal(
    exposed.testboxDesktop.getPendingAuthUrl(),
    null,
    "consume-once: the same PKCE code can never be exchanged twice"
  );
});

test("auth delivery: buffered callback is handed to the first listener on registration", async () => {
  const source = await read("../../electron/preload.cjs");
  const { exposed, emit } = loadPreload(source);

  const url = "testbox://auth/callback?code=pkce-queued";
  emit("testbox:auth-callback", url);

  const seen = [];
  const off = exposed.testboxDesktop.onAuthCallback((u) => seen.push(u));
  assert.deepEqual(seen, [url], "delivered exactly once when the listener registers");
  assert.equal(exposed.testboxDesktop.getPendingAuthUrl(), null, "registration drained the buffer");

  off();
});

test("auth delivery: live callback reaches the registered listener exactly once", async () => {
  const source = await read("../../electron/preload.cjs");
  const { exposed, emit } = loadPreload(source);

  const seen = [];
  const off = exposed.testboxDesktop.onAuthCallback((u) => seen.push(u));

  emit("testbox:auth-callback", "testbox://auth/callback?code=pkce-live");
  assert.deepEqual(seen, ["testbox://auth/callback?code=pkce-live"], "live delivery once");
  assert.equal(
    exposed.testboxDesktop.getPendingAuthUrl(),
    null,
    "live delivery clears the buffered copy (no second exchange)"
  );

  off();
  emit("testbox:auth-callback", "testbox://auth/callback?code=pkce-after-cleanup");
  assert.deepEqual(
    seen,
    ["testbox://auth/callback?code=pkce-live"],
    "cleanup removed the live listener"
  );
  assert.equal(
    exposed.testboxDesktop.getPendingAuthUrl(),
    "testbox://auth/callback?code=pkce-after-cleanup",
    "with no listener the code is still buffered for the next registration/pull"
  );
});

test("auth delivery: AuthContext registers, drains the buffer, and dedupes exchanges", async () => {
  const source = await read("../context/AuthContext.jsx");
  const registerAt = source.indexOf("onAuthCallback");
  const pullAt = source.indexOf("getPendingAuthUrl");
  assert.ok(registerAt !== -1, "live listener wired");
  assert.ok(pullAt !== -1, "mount-time pull wired");
  assert.ok(
    registerAt < pullAt,
    "listener registered before the pull drains any queued URL"
  );
  assert.ok(
    source.includes("lastCallbackUrl"),
    "one exchange per callback URL (boot location + listener + pull cannot double-fire)"
  );
  assert.ok(
    source.includes('import { openAuthUrl } from "../services/native"'),
    "native opener imported"
  );
  assert.ok(source.includes("openAuthUrl(url)"), "custom-scheme open goes through openAuthUrl");
});

test("auth delivery: main forwards deep links from open-url, second-instance, and cold start", async () => {
  const source = await read("../../electron/main.cjs");
  assert.ok(source.includes('app.on("open-url"'), "macOS/Linux-style open-url handled");
  assert.ok(source.includes('app.on("second-instance"'), "running-instance deep link handled");
  assert.ok(
    source.includes("setTimeout(() => sendAuthCallbackToRenderer(authUrl), 400)"),
    "second-instance callback forwarded after the renderer settles"
  );
  assert.ok(
    source.includes("setTimeout(() => sendAuthCallbackToRenderer(coldStartAuthUrl), 600)"),
    "cold-start argv callback forwarded after boot"
  );
});

test("auth delivery: openAuthUrl uses the Custom Tab bridge and never rejects", async () => {
  const source = await read("./native.js");
  assert.ok(source.includes('"@capacitor/browser"'), "Capacitor Browser plugin imported");
  assert.ok(source.includes("Browser.open({ url })"), "URL handed to the Custom Tab opener");

  // Native platform: dynamic import is unavailable in the VM, which
  // exercises the fallback path — must resolve, not reject.
  const calls = [];
  const native = loadNative(source, {
    Capacitor: { isNativePlatform: () => true },
    open: (url) => calls.push(url),
  });
  assert.equal(await native.openAuthUrl("https://example.test/auth"), true);
  assert.deepEqual(calls, ["https://example.test/auth"], "fallback opened the URL");

  // Web/Electron: straight to window.open.
  const webCalls = [];
  const web = loadNative(source, { open: (url) => webCalls.push(url) });
  assert.equal(await web.openAuthUrl("https://example.test/auth"), true);
  assert.deepEqual(webCalls, ["https://example.test/auth"]);

  // No window at all: resolve false, never throw.
  const bare = loadNative(source, undefined);
  assert.equal(await bare.openAuthUrl("https://example.test/auth"), false);
});
