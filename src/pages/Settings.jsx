import { useEffect, useRef, useState } from "react";

import {
  createBackup,
  restoreBackup,
  validateBackup,
  clearAll,
} from "../services/dataService";
import { useTranslation } from "../i18n";
import { useToast } from "../context/ToastContext";
import { searchCities } from "../services/weather";
import Icon from "../components/ui/Icon";
import PageHeader from "../components/ui/PageHeader";

// Available only inside the Electron shell (preload exposes it).
const desktopBridge =
  typeof window !== "undefined" ? window.testboxDesktop : null;

function Settings() {
  const { t, language } = useTranslation();
  const fileInputRef = useRef(null);
  const { showToast } = useToast();

  const [weatherSearch, setWeatherSearch] = useState("");
  const [weatherResults, setWeatherResults] = useState([]);
  const [weatherSearching, setWeatherSearching] = useState(false);
  const [weatherError, setWeatherError] = useState("");

  const [closeToTray, setCloseToTray] = useState(false);

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
    // Persist Electron-side (userData config) — this is a desktop shell
    // preference, not account data, so it stays out of the sync model.
    desktopBridge?.setCloseToTray?.(next);
  }

  const currentLocation = (() => {
    try {
      const s = JSON.parse(localStorage.getItem("testbox-settings") || "null");
      return s?.weatherLocation?.name || "Tehran";
    } catch { return "Tehran"; }
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
        if (results.length === 0) setWeatherError(t("settings.weather.noResults"));
      } catch {
        setWeatherError(t("settings.weather.error"));
      } finally {
        setWeatherSearching(false);
      }
    }, 400);
  }

  function selectWeatherCity(city) {
    try {
      const settings = JSON.parse(localStorage.getItem("testbox-settings") || "{}");
      settings.weatherLocation = { lat: city.latitude, lon: city.longitude, name: city.name };
      localStorage.setItem("testbox-settings", JSON.stringify(settings));
      setWeatherSearch("");
      setWeatherResults([]);
      showToast(`${city.name} ✓`, "success");
    } catch {
      showToast(t("settings.weather.error"), "error");
    }
  }

  function exportBackup() {
    try {
      const backup = createBackup();

      const json = JSON.stringify(
        backup,
        null,
        2
      );

      const blob = new Blob(
        [json],
        {
          type: "application/json",
        }
      );

      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");

      const date = new Date()
        .toISOString()
        .slice(0, 10);

      link.href = url;
      link.download = `testbox-backup-${date}.json`;

      document.body.appendChild(link);

      link.click();

      link.remove();

      URL.revokeObjectURL(url);

      showToast(
        t("settings.export.success"),
        "success"
      );
    } catch (error) {
      console.error(
        "Failed to export backup",
        error
      );

      showToast(
        t("settings.export.failed"),
        "error"
      );
    }
  }

  function openImport() {
    fileInputRef.current?.click();
  }

  function importBackup(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const backup = JSON.parse(
          reader.result
        );

        if (!validateBackup(backup)) {
          throw new Error(
            "Invalid backup"
          );
        }

        const confirmed = window.confirm(
          t("settings.import.confirm")
        );

        if (!confirmed) {
          return;
        }

        const restored = restoreBackup(backup);

        if (!restored) {
          throw new Error(
            "Restore failed"
          );
        }

        showToast(
          t("settings.import.success"),
          "success"
        );

        setTimeout(() => {
          window.location.href = "/";
        }, 1000);
      } catch (error) {
        console.error(
          "Failed to import backup",
          error
        );

        showToast(
          t("settings.import.failed"),
          "error"
        );
      } finally {
        event.target.value = "";
      }
    };

    reader.onerror = () => {
      showToast(
        t("settings.import.readFailed"),
        "error"
      );

      event.target.value = "";
    };

    reader.readAsText(file);
  }

  function clearAllData() {
    const firstConfirm = window.confirm(
      t("settings.danger.confirm1")
    );

    if (!firstConfirm) {
      return;
    }

    const secondConfirm = window.confirm(
      t("settings.danger.confirm2")
    );

    if (!secondConfirm) {
      return;
    }

    const cleared = clearAll();

    if (!cleared) {
      showToast(
        t("settings.danger.failed"),
        "error"
      );

      return;
    }

    window.location.href = "/";
  }

  return (
    <section className="page-section">

      <PageHeader
        icon="settings"
        title={t("settings.title")}
        subtitle={t("settings.subtitle")}
      />

      <div className="settings-section">

        <div className="settings-section-header">

          <span className="settings-section-icon" aria-hidden="true">
            <Icon name="database" size={17} />
          </span>

          <div>
            <h2>{t("settings.data.title")}</h2>

            <p>
              {t("settings.data.description")}
            </p>
          </div>

        </div>

        <div className="settings-actions">

          <button
            className="settings-action"
            onClick={exportBackup}
          >

            <span className="settings-action-icon">
              <Icon name="download" size={18} />
            </span>

            <span>
              <strong>
                {t("settings.export")}
              </strong>

              <small>
                {t("settings.export.description")}
              </small>
            </span>

          </button>

          <button
            className="settings-action"
            onClick={openImport}
          >

            <span className="settings-action-icon">
              <Icon name="upload" size={18} />
            </span>

            <span>
              <strong>
                {t("settings.import")}
              </strong>

              <small>
                {t("settings.import.description")}
              </small>
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

      <div className="settings-section">
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
          <input
            type="text"
            className="input-field"
            value={weatherSearch}
            onChange={(e) => handleWeatherSearch(e.target.value)}
            placeholder={t("settings.weather.searchPlaceholder", "Search city...")}
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
                    {city.admin1 ? `${city.admin1}, ` : ""}{city.country}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {desktopBridge && (
        <div className="settings-section">
          <div className="settings-section-header">
            <span className="settings-section-icon" aria-hidden="true">
              <Icon name="settings" size={17} />
            </span>
            <div>
              <h2>{t("settings.desktop.title", "Desktop")}</h2>
              <p>{t("settings.desktop.description", "Windows app behavior")}</p>
            </div>
          </div>
          <label className="toggle-row" style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={closeToTray}
              onChange={toggleCloseToTray}
            />
            <span>
              {t("settings.desktop.closeToTray", "Close to system tray")}
            </span>
          </label>
        </div>
      )}

      <div className="settings-danger">

        <div className="settings-danger-info">

          <span className="settings-section-icon is-danger" aria-hidden="true">
            <Icon name="alertTriangle" size={17} />
          </span>

          <div>
            <h2>{t("settings.danger.title")}</h2>

            <p>
              {t("settings.danger.description")}
            </p>
          </div>

        </div>

        <button
          className="danger-button"
          onClick={clearAllData}
        >
          {t("settings.danger.button")}
        </button>

      </div>

    </section>
  );
}

export default Settings;