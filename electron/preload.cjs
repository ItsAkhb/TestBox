// Minimal, send-only preload: the renderer can request the app-level
// "close to tray" mode and receive show-wake notifications. No Node
// globals are exposed; channels are validated in main.cjs.
const { contextBridge, ipcRenderer } = require("electron");

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
  // link; main forwards the full callback URL to the renderer once.
  onAuthCallback(callback) {
    if (typeof callback !== "function") return () => {};
    const handler = (_event, url) => {
      try {
        callback(url);
      } catch {
        // OAuth callback must never crash the shell
      }
    };
    ipcRenderer.on("testbox:auth-callback", handler);
    return () => ipcRenderer.removeListener("testbox:auth-callback", handler);
  },
});
