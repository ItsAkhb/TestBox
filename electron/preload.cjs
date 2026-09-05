// Minimal, send-only preload: the renderer can request the app-level
// "close to tray" mode and nothing else. No Node globals are exposed;
// the channel is validated in main.cjs.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("testboxDesktop", {
  setCloseToTray(enabled) {
    ipcRenderer.send("testbox:set-close-to-tray", Boolean(enabled));
  },
  getCloseToTray() {
    // async one-shot request/response (invoked once by the renderer)
    return ipcRenderer.invoke("testbox:get-close-to-tray");
  },
});
