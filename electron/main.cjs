const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

const DIST_DIR = path.join(__dirname, "..", "dist");
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 360,
    minHeight: 560,
    title: "TestBox",
    icon: path.join(__dirname, "assets", "icon.ico"),
    autoHideMenuBar: true,
    backgroundColor: "#FAF8F5",
    webPreferences: {
      // Renderer is the finalized TestBox web UI: no Node integration,
      // no remote module, context-isolated.
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
      spellcheck: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Open external links in the system browser, never a new Electron
    // window with Node access.
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // No privileged APIs are exposed: no ipcMain.handle listeners exist,
  // and preload is intentionally omitted.

  if (DEV_SERVER_URL) {
    mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // HashRouter: any deep link resolves to the bundle root.
    mainWindow.loadFile(path.join(DIST_DIR, "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
