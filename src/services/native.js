// Native platform integration (Capacitor). Every import is guarded so
// the same bundle keeps running unchanged on web and Electron.

function isNative() {
  return typeof window !== "undefined" && Boolean(window.Capacitor?.isNativePlatform?.());
}

/**
 * Android hardware back button:
 * - navigate back when in-app history exists (never closes the app while
 *   the user can still go back)
 * - from the root state, exit like a normal Android app
 */
export function initAndroidBackButton() {
  if (!isNative()) return;

  import("@capacitor/app").then(({ App }) => {
    App.addListener("backButton", () => {
      const hash = window.location.hash || "#/";
      const isRoot = hash === "#/" || hash === "#" || hash === "";

      if (window.history.length > 1 && !isRoot) {
        window.history.back();
        return;
      }

      // Root with no history: background the app (standard Android
      // behavior keeps the process alive rather than killing it).
      App.exitApp();
    });
  }).catch(() => {
    // Plugin unavailable — default WebView back behavior applies.
  });
}

/**
 * Platform lifecycle → sync wake (spec P8):
 * - Capacitor resume/pause: flush pending work on resume, flush the
 *   stopwatch remainder on pause so backgrounding can't lose time.
 * - Web visibility/focus and online events are handled by
 *   CloudSyncManager; this hook only covers the native path.
 */
export function initPlatformLifecycle({ onResume, onPause } = {}) {
  if (!isNative()) return () => {};

  let cleanup = () => {};
  import("@capacitor/app").then(({ App }) => {
    const resume = App.addListener("resume", () => {
      try { onResume?.(); } catch { /* wake must never crash */ }
    });
    const pause = App.addListener("pause", () => {
      try { onPause?.(); } catch { /* flush must never crash */ }
    });
    cleanup = () => {
      resume.then((h) => h?.remove?.()).catch(() => {});
      pause.then((h) => h?.remove?.()).catch(() => {});
    };
  }).catch(() => {
    // Plugin unavailable — web lifecycle events still apply.
  });
  return () => cleanup();
}

/**
 * Multi-tab coordination (spec P8): BroadcastChannel lock+notify so
 * two tabs never run overlapping full sync cycles, and a local edit
 * in one tab wakes the other.
 */
export function initSyncBroadcast({ onRemoteChange, onLockRequest } = {}) {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel("testbox-sync");
  const onMessage = (event) => {
    const data = event?.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "local-change") {
      try { onRemoteChange?.(data); } catch { /* notify must never crash */ }
    } else if (data.type === "sync-start" || data.type === "sync-end") {
      try { onLockRequest?.(data); } catch { /* lock must never crash */ }
    }
  };
  channel.addEventListener("message", onMessage);
  return () => {
    channel.removeEventListener("message", onMessage);
    channel.close();
  };
}

export function broadcastSyncMessage(message) {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel("testbox-sync");
    channel.postMessage(message);
    channel.close();
  } catch {
    // best-effort notify
  }
}

export function isNativePlatform() {
  return isNative();
}

/**
 * Open an OAuth URL in the platform-appropriate surface:
 * - Android: Capacitor Browser (Chrome Custom Tab) — with the Google
 *   app installed the native account screen is shown instead of a
 *   generic browser; the flow still returns via the testbox:// deep
 *   link (manifest filter + App.appUrlOpen). Never rejects.
 * - Electron/web: window.open — Electron's setWindowOpenHandler
 *   routes it to shell.openExternal (system browser).
 */
function openExternalFallback(url) {
  try {
    window.open(url, "_blank");
    return true;
  } catch {
    // popup blocked or window unavailable — user can retry
    return false;
  }
}

export function openAuthUrl(url) {
  if (isNative()) {
    try {
      return import("@capacitor/browser")
        .then(({ Browser }) => Browser.open({ url }))
        .then(() => true)
        .catch(() => openExternalFallback(url));
    } catch {
      // dynamic import can fail synchronously when the plugin is
      // unavailable — fall back rather than leave the flow hanging
      return Promise.resolve(openExternalFallback(url));
    }
  }
  return Promise.resolve(openExternalFallback(url));
}
