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

export function isNativePlatform() {
  return isNative();
}
