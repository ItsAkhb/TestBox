// Minimal, send-only preload: the renderer can request the app-level
// "close to tray" mode and receive show-wake notifications. No Node
// globals are exposed; channels are validated in main.cjs.
const { contextBridge, ipcRenderer } = require("electron");

// OAuth callback buffer: main.cjs forwards the testbox:// callback on
// a short timer, which can fire before React mounts its listener.
// ipcRenderer events with no listener are dropped on arrival, so the
// channel is subscribed at preload time (always on) and the URL is
// held until the renderer pulls it or registers a listener.
let pendingAuthUrl = null;

ipcRenderer.on("testbox:auth-callback", (_event, url) => {
  if (typeof url === "string" && url) {
    pendingAuthUrl = url;
  }
});

contextBridge.exposeInMainWorld("testboxDesktop", {
  setCloseToTray(enabled) {
    ipcRenderer.send("testbox:set-close-to-tray", Boolean(enabled));
  },
  getCloseToTray() {
    // async one-shot request/response (invoked once by the renderer)
    return ipcRenderer.invoke("testbox:get-close-to-tray");
  },
  // Electron show-from-tray wake (spec P8): renderer listens and runs
  // a sync cycle without waiting for the periodic reconcile tick.
  onShowWake(callback) {
    if (typeof callback !== "function") return () => {};
    const handler = () => {
      try {
        callback();
      } catch {
        // wake must never crash the shell
      }
    };
    ipcRenderer.on("testbox:show-wake", handler);
    return () => ipcRenderer.removeListener("testbox:show-wake", handler);
  },
  // Google Sign-In: system-browser OAuth returns via testbox:// deep
  // link; main forwards the full callback URL to the renderer. The URL
  // is buffered here (see below) so a PKCE code sent before React
  // mounts its listener is never dropped — a spent/lost code cannot be
  // retried, which used to leave the app stuck "not signed in".
  onAuthCallback(callback) {
    if (typeof callback !== "function") return () => {};
    const handler = (_event, url) => {
      try {
        callback(url);
      } catch {
        // OAuth callback must never crash the shell
      }
      // Delivered live — drop the copy the always-on handler buffered
      // so this code can never be exchanged a second time.
      pendingAuthUrl = null;
    };
    ipcRenderer.on("testbox:auth-callback", handler);
    // A callback may already have arrived before this listener
    // existed (renderer still booting): hand it over exactly once.
    if (pendingAuthUrl !== null) {
      const queued = pendingAuthUrl;
      pendingAuthUrl = null;
      try {
        callback(queued);
      } catch {
        // OAuth callback must never crash the shell
      }
    }
    return () => ipcRenderer.removeListener("testbox:auth-callback", handler);
  },
  // Pull-style accessor for the renderer's mount effect: consume the
  // buffered callback URL once (returns null when there is none).
  getPendingAuthUrl() {
    const url = pendingAuthUrl;
    pendingAuthUrl = null;
    return url;
  },
});
