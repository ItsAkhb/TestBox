import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  createBackup,
  restoreBackup,
  validateBackup,
  clearAll,
  getSettings,
  saveSettings,
} from "../services/dataService";
import {
  supabase,
  markUserInitiatedSignOut,
} from "../services/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useSync } from "../context/SyncContext";
import { useSettings } from "../context/SettingsContext";
import { useTranslation } from "../i18n";
import { useToast } from "../context/ToastContext";
import { searchCities } from "../services/weather";
import Icon from "../components/ui/Icon";
import PageHeader from "../components/ui/PageHeader";
import Toggle from "../components/ui/Toggle";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { useTheme } from "../theme/useTheme";

import pkg from "../../package.json";

// Available only inside the Electron shell (preload exposes it).
const desktopBridge =
  typeof window !== "undefined" ? window.testboxDesktop : null;

const FEEDBACK_URL = "https://github.com/ItsAkhb/TestBox/issues";

function Settings() {
  const { t, language, setLanguage } = useTranslation();
  const fileInputRef = useRef(null);
  const { showToast } = useToast();
  const navigate = useNavigate();

  const { user, authState, cachedUserId } = useAuth();
  const { setSyncStatus } = useSync();
  const { settings, updateSettings } = useSettings();

  const [weatherSearch, setWeatherSearch] = useState("");
  const [weatherResults, setWeatherResults] = useState([]);
  const [weatherSearching, setWeatherSearching] = useState(false);
  const [weatherError, setWeatherError] = useState("");

  const [closeToTray, setCloseToTray] = useState(false);

  const [loading, setLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [pendingImport, setPendingImport] = useState(null);
  const [showDangerConfirm, setShowDangerConfirm] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);

  const { preference: themeMode, setTheme } = useTheme();
  const [activeSection, setActiveSection] = useState("settings-account");

  // Track which section is under the sticky bars while scrolling so the
  // nav chip can reflect the current position (RTL-agnostic: pure Y math).
  useEffect(() => {
    let frame = 0;
    function update() {
      frame = 0;
      const topbar = document.querySelector(".topbar");
      const nav = document.querySelector(".settings-nav");
      const offset =
        (topbar?.getBoundingClientRect().height || 0) +
        (nav?.getBoundingClientRect().height || 0) +
        24;
      let current = null;
      for (const section of document.querySelectorAll(
        ".settings-section[id], .settings-danger[id]"
      )) {
        if (section.getBoundingClientRect().top <= offset) {
          current = section.id;
        }
      }
      if (current) setActiveSection(current);
    }
    function onScroll() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const searchTimeoutRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    if (desktopBridge?.getCloseToTray) {
      desktopBridge
        .getCloseToTray()
        .then((enabled) => {
          if (!cancelled) setCloseToTray(Boolean(enabled));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleCloseToTray() {
    const next = !closeToTray;
    setCloseToTray(next);
    // Persist Electron-side (userData config) — desktop shell preference.
    desktopBridge?.setCloseToTray?.(next);
  }

  const currentLocation = (() => {
    try {
      return getSettings()?.weatherLocation?.name || "Tehran";
    } catch {
      return "Tehran";
    }
  })();

  function handleWeatherSearch(value) {
    setWeatherSearch(value);
    setWeatherError("");
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (value.trim().length < 2) {
      setWeatherResults([]);
      setWeatherSearching(false);
      return;
    }
    setWeatherSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const lang = language === "fa" ? "fa" : "en";
        const results = await searchCities(value, lang);
        setWeatherResults(results);
        if (results.length === 0)
          setWeatherError(t("settings.weather.noResults"));
      } catch {
        setWeatherError(t("settings.weather.error"));
      } finally {
        setWeatherSearching(false);
      }
    }, 400);
  }

  function selectWeatherCity(city) {
    try {
      const store = getSettings() || {};
      saveSettings({
        ...store,
        weatherLocation: {
          lat: city.latitude,
          lon: city.longitude,
          name: city.name,
        },
      });
      setWeatherSearch("");
      setWeatherResults([]);
      showToast(`${city.name} ✓`, "success");
    } catch {
      showToast(t("settings.weather.error"), "error");
    }
  }

  async function handleLogout() {
    setLoading(true);

    // Flag BEFORE calling signOut so AuthContext can tell this
    // user-initiated sign-out from an offline token-refresh failure.
    markUserInitiatedSignOut();

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Failed to sign out", error);
      showToast(t("account.logout.failed"), "error");
      setLoading(false);
      return;
    }

    navigate("/");
    setLoading(false);
  }

  // Single sync engine: triggers the SAME full cycle (push-then-pull)
  // that CloudSyncManager runs automatically.
  async function handleFullSync() {
    if (!user) {
      showToast(t("account.loginRequired"), "error");
      return;
    }

    setSyncLoading(true);
    setSyncMessage(t("account.syncing"));
    setSyncStatus("syncing");

    try {
      const { syncLocalToCloud, syncCloudToLocal } = await import(
        "../services/cloudSync"
      );
      const { getDirtyState, markTombstonesPushed } = await import(
        "../services/dataService"
      );

      const dirty = getDirtyState();
      await syncLocalToCloud(user.id, { dirty });
      if (dirty.deletes.length > 0) {
        markTombstonesPushed(dirty.deletes.map((d) => ({ ...d })));
      }
      const result = await syncCloudToLocal(user.id);

      setSyncStatus("synced");
      setLastSyncAt(new Date());
      setSyncMessage(
        `${result.folders} ${t("common.folders")} · ${result.exams} ${t("common.tests")}`
      );
      showToast(t("account.sync.success"), "success");
    } catch (error) {
      console.error("Sync failed", error);
      setSyncStatus("error");
      setSyncMessage(t("account.sync.failed"));
      showToast(error?.message || t("account.sync.failed"), "error");
    } finally {
      setSyncLoading(false);
    }
  }

  function exportBackup() {
    try {
      const backup = createBackup();
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `testbox-backup-${date}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast(t("settings.export.success"), "success");
    } catch (error) {
      console.error("Failed to export backup", error);
      showToast(t("settings.export.failed"), "error");
    }
  }

  function openImport() {
    fileInputRef.current?.click();
  }

  function importBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = JSON.parse(reader.result);
        if (!validateBackup(backup)) {
          throw new Error("Invalid backup");
        }
        setPendingImport(backup);
      } catch (error) {
        console.error("Failed to import backup", error);
        showToast(t("settings.import.failed"), "error");
      } finally {
        event.target.value = "";
      }
    };
    reader.onerror = () => {
      showToast(t("settings.import.readFailed"), "error");
      event.target.value = "";
    };
    reader.readAsText(file);
  }

  async function confirmImport() {
    const backup = pendingImport;
    if (!backup) return;
    try {
      const restored = restoreBackup(backup);
      if (!restored) {
        throw new Error("Restore failed");
      }
      setPendingImport(null);
      showToast(t("settings.import.success"), "success");
      setTimeout(() => {
        window.location.hash = "#/";
      }, 1000);
    } catch (error) {
      console.error("Failed to import backup", error);
      showToast(t("settings.import.failed"), "error");
      // Re-throw so ConfirmDialog stays open and shows the failure.
      throw new Error(t("settings.import.failed"), { cause: error });
    }
  }

  function clearAllData() {
    setShowDangerConfirm(true);
  }

  async function confirmClearAll() {
    const cleared = clearAll();
    if (!cleared) {
      showToast(t("settings.danger.failed"), "error");
      // Re-throw so ConfirmDialog stays open and shows the failure.
      throw new Error(t("settings.danger.failed"));
    }
    setShowDangerConfirm(false);
    window.location.hash = "#/";
  }

  const defaultNegativeMarking = settings?.defaultNegativeMarking !== false;
  const defaultExamType = settings?.defaultExamType === "exam" ? "exam" : "practice";

  // ---- Section anchor navigation (B3) -------------------------------
  const NAV_SECTIONS = [
    { id: "settings-account", labelKey: "settings.account.title" },
    { id: "settings-appearance", labelKey: "settings.appearance.title" },
    { id: "settings-language", labelKey: "settings.language.title" },
    { id: "settings-study", labelKey: "settings.study.title" },
    { id: "settings-data", labelKey: "settings.data.title" },
    { id: "settings-weather", labelKey: "settings.weather.title" },
    ...(desktopBridge
      ? [{ id: "settings-desktop", labelKey: "settings.desktop.title" }]
      : []),
    { id: "settings-about", labelKey: "settings.about.title" },
    { id: "settings-feedback", labelKey: "settings.feedback.title" },
    { id: "settings-danger", labelKey: "settings.danger.title" },
  ];

  function scrollToSection(id) {
    const el = document.getElementById(id);
    if (!el) return;
    // Respect the sticky TopBar (+ sticky sub-nav) so headings are not
    // hidden underneath them.
    const topbar = document.querySelector(".topbar");
    const nav = document.querySelector(".settings-nav");
    const offset =
      (topbar?.getBoundingClientRect().height || 0) +
      (nav?.getBoundingClientRect().height || 0) +
      12;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({
      top,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    // Move focus to the section for keyboard/screen-reader users.
    el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  }

  return (
    <section className="page-section">
      <PageHeader
        icon="settings"
        title={t("settings.title")}
        subtitle={t("settings.subtitle")}
      />

      <nav className="settings-nav" aria-label={t("settings.nav.label")}>
        {NAV_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            className={`settings-nav-chip ${
              activeSection === section.id ? "is-active" : ""
            }`}
            aria-current={activeSection === section.id ? "true" : undefined}
            onClick={() => scrollToSection(section.id)}
          >
            {t(section.labelKey)}
          </button>
        ))}
      </nav>

      {/* Account / Profile */}
      <div className="settings-section" id="settings-account">
        <div className="settings-section-header">
          <span className="settings-section-icon" aria-hidden="true">
            <Icon name="user" size={17} />
          </span>
          <div>
            <h2>{t("settings.account.title")}</h2>
            <p>{t("settings.account.description")}</p>
          </div>
        </div>

        <p className="account-email">
          <Icon name="user" size={15} />
          {user?.email || t("account.anonymous")}
        </p>

        {authState && (
          <p
            className={`account-auth-state auth-${authState}`}
            data-auth-state={authState}
          >
            {t(`auth.state.${authState}`)}
            {!user && cachedUserId ? ` · ${cachedUserId.slice(0, 8)}` : ""}
          </p>
        )}

        <div className="account-actions">
          <Button
            variant="primary"
            onClick={handleFullSync}
            loading={syncLoading}
            disabled={loading}
            icon={<Icon name="refresh" size={15} />}
          >
            {syncLoading
              ? t("account.syncing")
              : `${t("account.syncNow")} (${t("account.syncToLocal")})`}
          </Button>

          <Button
            variant="danger"
            onClick={handleLogout}
            disabled={loading || syncLoading}
            loading={loading}
            icon={<Icon name="logout" size={15} />}
          >
            {loading ? t("account.loggingOut") : t("account.logout")}
          </Button>
        </div>

        <p className="account-sync-status" role="status" aria-live="polite">
          {syncMessage
            ? syncMessage
            : lastSyncAt
              ? `${t("account.lastSync", "Last synced")}: ${lastSyncAt.toLocaleTimeString()}`
              : t("account.sync.idle", "Not synced yet")}
        </p>
      </div>

      {/* Appearance */}
      <div className="settings-section" id="settings-appearance">
        <div className="settings-section-header">
          <span className="settings-section-icon" aria-hidden="true">
            <Icon
              name={
                themeMode === "system"
                  ? "monitor"
                  : themeMode === "light"
                    ? "sun"
                    : "moon"
              }
              size={17}
            />
          </span>
          <div>
            <h2>{t("settings.appearance.title")}</h2>
            <p>{t("settings.appearance.description")}</p>
          </div>
        </div>
        <div
          className="settings-actions theme-segment"
          role="radiogroup"
          aria-label={t("settings.appearance.title")}
        >
          {[
            { value: "system", icon: "monitor", label: t("settings.appearance.systemMode") },
            { value: "light", icon: "sun", label: t("settings.appearance.lightMode") },
            { value: "dark", icon: "moon", label: t("settings.appearance.darkMode") },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={themeMode === option.value}
              className={`settings-action ${themeMode === option.value ? "is-active" : ""}`}
              onClick={() => setTheme(option.value)}
            >
              <span className="settings-action-icon" aria-hidden="true">
                <Icon name={option.icon} size={16} />
              </span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Language */}
      <div className="settings-section" id="settings-language">
        <div className="settings-section-header">
          <span className="settings-section-icon" aria-hidden="true">
            <Icon name="book" size={17} />
          </span>
          <div>
            <h2>{t("settings.language.title")}</h2>
            <p>{t("settings.language.description")}</p>
          </div>
        </div>
        <div className="settings-actions">
          <button
            type="button"
            className={`settings-action ${language === "fa" ? "is-active" : ""}`}
            onClick={() => setLanguage("fa")}
            aria-pressed={language === "fa"}
          >
            <span className="settings-action-icon">
              <Icon name="book" size={18} />
            </span>
            <span>
              <strong>فارسی</strong>
              <small>{t("settings.language.fa")}</small>
            </span>
          </button>
          <button
            type="button"
            className={`settings-action ${language === "en" ? "is-active" : ""}`}
            onClick={() => setLanguage("en")}
            aria-pressed={language === "en"}
          >
            <span className="settings-action-icon">
              <Icon name="book" size={18} />
            </span>
            <span>
              <strong>English</strong>
              <small>{t("settings.language.en")}</small>
            </span>
          </button>
        </div>
      </div>

      {/* Study / Exam preferences */}
      <div className="settings-section" id="settings-study">
        <div className="settings-section-header">
          <span className="settings-section-icon" aria-hidden="true">
            <Icon name="graduation" size={17} />
          </span>
          <div>
            <h2>{t("settings.study.title")}</h2>
            <p>{t("settings.study.description")}</p>
          </div>
        </div>

        <Toggle
          label={t("settings.study.defaultNegativeMarking")}
          description={t("settings.study.defaultNegativeMarking.hint")}
          checked={defaultNegativeMarking}
          onChange={() =>
            updateSettings({
              defaultNegativeMarking: !defaultNegativeMarking,
            })
          }
        />

        <p className="wx-hint" style={{ margin: "0 0 8px" }}>
          {t("settings.study.defaultExamType.type")}
        </p>
        <div className="settings-actions" style={{ marginTop: 10 }}>
          <button
            type="button"
            className={`settings-action ${defaultExamType === "practice" ? "is-active" : ""}`}
            onClick={() => updateSettings({ defaultExamType: "practice" })}
            aria-pressed={defaultExamType === "practice"}
          >
            <span className="settings-action-icon">
              <Icon name="circle" size={18} />
            </span>
            <span>
              <strong>{t("exam.type.practice")}</strong>
              <small>{t("settings.study.defaultExamType.practice")}</small>
            </span>
          </button>
          <button
            type="button"
            className={`settings-action ${defaultExamType === "exam" ? "is-active" : ""}`}
            onClick={() => updateSettings({ defaultExamType: "exam" })}
            aria-pressed={defaultExamType === "exam"}
          >
            <span className="settings-action-icon">
              <Icon name="alignJustify" size={18} />
            </span>
            <span>
              <strong>{t("exam.type.exam")}</strong>
              <small>{t("settings.study.defaultExamType.exam")}</small>
            </span>
          </button>
        </div>
      </div>

      {/* Data / Backup */}
      <div className="settings-section" id="settings-data">
        <div className="settings-section-header">
          <span className="settings-section-icon" aria-hidden="true">
            <Icon name="database" size={17} />
          </span>
          <div>
            <h2>{t("settings.data.title")}</h2>
            <p>{t("settings.data.description")}</p>
          </div>
        </div>

        <div className="settings-actions">
          <button className="settings-action" onClick={exportBackup}>
            <span className="settings-action-icon">
              <Icon name="download" size={18} />
            </span>
            <span>
              <strong>{t("settings.export")}</strong>
              <small>{t("settings.export.description")}</small>
            </span>
          </button>

          <button className="settings-action" onClick={openImport}>
            <span className="settings-action-icon">
              <Icon name="upload" size={18} />
            </span>
            <span>
              <strong>{t("settings.import")}</strong>
              <small>{t("settings.import.description")}</small>
            </span>
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={importBackup}
          hidden
        />
      </div>

      {/* Weather location */}
      <div className="settings-section" id="settings-weather">
        <div className="settings-section-header">
          <span className="settings-section-icon" aria-hidden="true">
            <Icon name="mapPin" size={17} />
          </span>
          <div>
            <h2>{t("settings.weather.title")}</h2>
            <p>{t("settings.weather.description")}</p>
            <p className="wx-current">
              {t("settings.weather.current", "Current")}: {currentLocation}
            </p>
          </div>
        </div>
        <div className="wx-search">
          <Input
            type="text"
            className="wx-input"
            value={weatherSearch}
            onChange={(e) => handleWeatherSearch(e.target.value)}
            placeholder={t("settings.weather.searchPlaceholder", "Search city...")}
            aria-label={t("settings.weather.searchPlaceholder", "Search city...")}
          />
          {weatherSearching && (
            <p className="wx-hint">{t("settings.weather.searching", "Searching...")}</p>
          )}
          {weatherError && !weatherSearching && (
            <p className="wx-error">{weatherError}</p>
          )}
          {weatherResults.length > 0 && (
            <div className="wx-results" role="listbox">
              {weatherResults.map((city, i) => (
                <button
                  key={i}
                  type="button"
                  role="option"
                  aria-selected="false"
                  onClick={() => selectWeatherCity(city)}
                  className="wx-result"
                >
                  <Icon name="mapPin" size={14} />
                  <strong>{city.name}</strong>
                  <span className="wx-result-sub">
                    {city.admin1 ? `${city.admin1}, ` : ""}
                    {city.country}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Desktop (Electron only) */}
      {desktopBridge && (
        <div className="settings-section" id="settings-desktop">
          <div className="settings-section-header">
            <span className="settings-section-icon" aria-hidden="true">
              <Icon name="settings" size={17} />
            </span>
            <div>
              <h2>{t("settings.desktop.title", "Desktop")}</h2>
              <p>{t("settings.desktop.description", "Windows app behavior")}</p>
            </div>
          </div>
          <Toggle
            label={t("settings.desktop.closeToTray", "Close to system tray")}
            checked={closeToTray}
            onChange={toggleCloseToTray}
          />
        </div>
      )}

      {/* About */}
      <div className="settings-section" id="settings-about">
        <div className="settings-section-header">
          <span className="settings-section-icon" aria-hidden="true">
            <Icon name="info" size={17} />
          </span>
          <div>
            <h2>{t("settings.about.title")}</h2>
            <p>{t("settings.about.description")}</p>
          </div>
        </div>
        <p className="account-email">
          <Icon name="sparkles" size={15} />
          TestBox · {t("settings.about.version")} {pkg.version}
        </p>
      </div>

      {/* Feedback */}
      <div className="settings-section" id="settings-feedback">
        <div className="settings-section-header">
          <span className="settings-section-icon" aria-hidden="true">
            <Icon name="helpCircle" size={17} />
          </span>
          <div>
            <h2>{t("settings.feedback.title")}</h2>
            <p>{t("settings.feedback.description")}</p>
          </div>
        </div>
        <div className="settings-actions">
          <a
            className="settings-action"
            href={FEEDBACK_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="settings-action-icon">
              <Icon name="helpCircle" size={18} />
            </span>
            <span>
              <strong>{t("settings.feedback.action")}</strong>
              <small>{t("settings.feedback.hint")}</small>
            </span>
          </a>
        </div>
      </div>

      {/* Danger zone */}
      <div className="settings-danger" id="settings-danger">
        <div className="settings-danger-info">
          <span className="settings-section-icon is-danger" aria-hidden="true">
            <Icon name="alertTriangle" size={17} />
          </span>
          <div>
            <h2>{t("settings.danger.title")}</h2>
            <p>{t("settings.danger.description")}</p>
          </div>
        </div>

        <Button variant="danger" onClick={clearAllData}>
          {t("settings.danger.button")}
        </Button>
      </div>

      <ConfirmDialog
        open={Boolean(pendingImport)}
        onClose={() => setPendingImport(null)}
        onConfirm={confirmImport}
        title={t("settings.import")}
        message={t("settings.import.confirm")}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
      />

      <ConfirmDialog
        open={showDangerConfirm}
        onClose={() => setShowDangerConfirm(false)}
        onConfirm={confirmClearAll}
        title={t("settings.danger.title")}
        message={`${t("settings.danger.confirm1")} ${t("settings.danger.confirm2")}`}
        confirmLabel={t("settings.danger.button")}
        cancelLabel={t("common.cancel")}
      />
    </section>
  );
}

export default Settings;
