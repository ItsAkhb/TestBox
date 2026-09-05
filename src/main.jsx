import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
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
import { setStorageUser, migrateMarkedToTags } from "./services/dataService";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <SyncProvider>
          <SessionProvider>
            <SettingsProvider>
              <I18nProvider>
                <ToastProvider>
                  <App />
                </ToastProvider>
              </I18nProvider>
            </SettingsProvider>
          </SessionProvider>
        </SyncProvider>
      </AuthProvider>
    </HashRouter>
  </StrictMode>
);

// One-time, per-user migration of legacy marked questions into the tag
// system (no-op once migrated or when there is nothing to migrate).
migrateMarkedToTags();
setStorageUser(null);
