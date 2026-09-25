const { app, BrowserWindow, shell, Tray, Menu, ipcMain, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");

const DIST_DIR = path.join(__dirname, "..", "dist");
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const CONFIG_PATH = path.join(app.getPath("userData"), "desktop-config.json");
// Google Sign-In returns from the system browser via this custom scheme
// (must also be listed in Supabase Auth → Redirect URLs).
const AUTH_PROTOCOL = "testbox";

let mainWindow = null;
let tray = null;
let quitRequested = false;

function sendAuthCallbackToRenderer(rawUrl) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.webContents.send("testbox:auth-callback", rawUrl);
  } catch {
    // renderer not ready yet — user can retry sign-in
  }
}

// --- "Close to tray" preference (Electron-side, minimal JSON file) ---
function readCloseToTray() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed.closeToTray === true;
  } catch {
    return false;
  }
}

function writeCloseToTray(enabled) {
  try {
    let config = {};
    try {
      config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) || {};
    } catch {
      config = {};
    }
    config.closeToTray = Boolean(enabled);
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch {
    // non-fatal: preference stays in-memory for this run
  }
}

let closeToTrayEnabled = false;

function trayIconImage() {
  const iconPath = path.join(__dirname, "assets", "icon.png");
  if (fs.existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath);
  }
  return nativeImage.createEmpty();
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  // Wake-from-tray/show: tell the renderer to run a sync cycle so a
  // long backgrounded window catches up immediately (spec P8).
  try {
    mainWindow.webContents.send("testbox:show-wake");
  } catch {
    // renderer may not be ready yet — next visibility event covers it
  }
}

function createTray() {
  if (tray) return;
  tray = new Tray(trayIconImage());
  tray.setToolTip("TestBox");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Show TestBox",
        click: () => showMainWindow(),
      },
      { type: "separator" },
      {
        label: "Quit TestBox",
        click: () => {
          quitRequested = true;
          app.quit();
        },
      },
    ])
  );
  tray.on("double-click", () => showMainWindow());
}

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

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
      // context-isolated. The only bridge is the send-only close-to-tray
      // toggle in preload.cjs.
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
      spellcheck: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Open external links in the system browser, never a new Electron
    // window with Node access. Google Sign-In intentionally uses this
    // path (OAuth opens in the system browser; return is testbox://).
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  if (DEV_SERVER_URL) {
    mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // HashRouter: any deep link resolves to the bundle root.
    mainWindow.loadFile(path.join(DIST_DIR, "index.html"));
  }

  mainWindow.on("close", (event) => {
    if (closeToTrayEnabled && !quitRequested) {
      // Hide to tray instead of quitting; the tray menu can reopen.
      event.preventDefault();
      mainWindow.hide();
      createTray();
    } else {
      destroyTray();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// --- Google Sign-In custom-scheme callback (testbox://) ---
function registerAuthProtocol() {
  try {
    if (process.defaultApp) {
      // Dev: electron .
      app.setAsDefaultProtocolClient(
        AUTH_PROTOCOL,
        process.execPath,
        [path.resolve(process.argv[1])]
      );
    } else {
      app.setAsDefaultProtocolClient(AUTH_PROTOCOL);
    }
  } catch {
    // Protocol registration is best-effort; installers may need a rebuild
  }
}

function extractAuthUrlFromArgv(argv) {
  return (argv || []).find(
    (arg) => typeof arg === "string" && arg.startsWith(`${AUTH_PROTOCOL}://`)
  );
}

app.on("open-url", (event, url) => {
  event.preventDefault();
  showMainWindow();
  sendAuthCallbackToRenderer(url);
});

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const authUrl = extractAuthUrlFromArgv(argv);
    showMainWindow();
    if (authUrl) {
      // Give the window a beat to finish loading before IPC send.
      setTimeout(() => sendAuthCallbackToRenderer(authUrl), 400);
    }
  });
}

app.whenReady().then(() => {
  closeToTrayEnabled = readCloseToTray();
  registerAuthProtocol();

  // Cold-start deep link: testbox://auth/callback?code=... on Windows
  const coldStartAuthUrl = extractAuthUrlFromArgv(process.argv);
  createWindow();
  if (coldStartAuthUrl && mainWindow) {
    setTimeout(() => sendAuthCallbackToRenderer(coldStartAuthUrl), 600);
  }

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

// --- Minimal IPC surface (validated, single-purpose) ---
ipcMain.on("testbox:set-close-to-tray", (_event, enabled) => {
  closeToTrayEnabled = Boolean(enabled);
  writeCloseToTray(closeToTrayEnabled);
});

ipcMain.handle("testbox:get-close-to-tray", () => closeToTrayEnabled);
