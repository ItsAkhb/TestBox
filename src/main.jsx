import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import "@fontsource/vazirmatn/400.css";
import "@fontsource/vazirmatn/500.css";
import "@fontsource/vazirmatn/600.css";
import "@fontsource/vazirmatn/700.css";
import "@fontsource/vazirmatn/800.css";
import "@fontsource/vazirmatn/900.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import "./index.css";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext";
import { SyncProvider } from "./context/SyncContext";
import { SessionProvider } from "./context/SessionContext";
import { I18nProvider } from "./i18n";
import { SettingsProvider } from "./context/SettingsContext";
import { ToastProvider } from "./context/ToastContext";
import { OfflineModeProvider } from "./context/OfflineModeContext";
import { setStorageUser, migrateMarkedToTags, migrateLocalStorageToIDB } from "./services/dataService";
import { initAndroidBackButton, initPlatformLifecycle } from "./services/native";
import { initTheme } from "./theme/theme";

// Apply the persisted (or system) theme before first paint — the single
// theme module owns data-theme for the whole app.
initTheme();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
    <HashRouter>
      <AuthProvider>
        <SyncProvider>
          <OfflineModeProvider>
            <SessionProvider>
              <SettingsProvider>
                <I18nProvider>
                  <ToastProvider>
                    <App />
                  </ToastProvider>
                </I18nProvider>
              </SettingsProvider>
            </SessionProvider>
          </OfflineModeProvider>
        </SyncProvider>
      </AuthProvider>
    </HashRouter>
    </MotionConfig>
  </StrictMode>
);

// One-time, per-user migration of legacy marked questions into the tag
// system (no-op once migrated or when there is nothing to migrate).
migrateMarkedToTags();
setStorageUser(null);

// Crash-safe localStorage → IndexedDB bootstrap (P2). Resumable; no-ops
// once the versioned flag is set. Fire-and-forget: the app still reads
// localStorage while migration runs.
migrateLocalStorageToIDB().catch(() => {});

// Native lifecycle: Android back button + Capacitor resume/pause
// wake for the sync engine (spec P8). No-ops on web/Electron.
initAndroidBackButton();
initPlatformLifecycle({
  onResume: () => {
    window.dispatchEvent(new Event("testbox-resume"));
  },
  onPause: () => {
    window.dispatchEvent(new Event("testbox-pause"));
  },
});
