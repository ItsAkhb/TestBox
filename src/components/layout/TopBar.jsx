import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSync } from "../../context/SyncContext";
import { useSession } from "../../context/SessionContext";
import { useTranslation } from "../../i18n";
import { useSettings } from "../../context/SettingsContext";
import { useAuth } from "../../context/AuthContext";
import { fetchWeather } from "../../services/weather";
import Icon from "../ui/Icon";

// Pure: seconds → "h:mm:ss" / "mm:ss"
function formatCountdown(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// WMO weather-code → Icon map name (day/night aware where it matters)
function weatherIconName(code, isDay) {
  if (code === 0) return isDay ? "cloudSun" : "cloudMoon";
  if (code === 1 || code === 2) return isDay ? "cloudSun" : "cloudMoon";
  if (code === 3) return "cloud";
  if (code === 45 || code === 48) return "cloudFog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "cloudRain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "cloudSnow";
  if (code >= 95) return "cloudLightning";
  return "cloud";
}

export default function TopBar() {
  const { syncStatus } = useSync();
  const { session } = useSession();
  const { t, language, setLanguage, formatDate } = useTranslation();
  const { settings } = useSettings();
  const { user } = useAuth();
  const location = useLocation();
  const onExamPage = /^\/exam\/[^/]+\/?$/.test(location.pathname);

  const [time, setTime] = useState(() => new Date());
  const [weather, setWeather] = useState(null);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("testbox-theme") === "dark";
  });

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    localStorage.setItem("testbox-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    const loc = settings?.weatherLocation;
    if (!loc?.lat || !loc?.lon) return;

    fetchWeather(loc.lat, loc.lon)
      .then(setWeather)
      .catch(() => {});
  }, [settings?.weatherLocation]);

  const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const dateStr = formatDate(time, { weekday: "short", month: "short", day: "numeric" });

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-clock" suppressHydrationWarning>
          {weather && (
            <span className="topbar-weather" title={weather.cityName || ""}>
              <Icon name={weatherIconName(weather.weatherCode, weather.isDay)} size={14} />
              <span className="topbar-weather-temp num">{weather.temperature}°</span>
            </span>
          )}

          <span className="topbar-datetime">
            <span className="topbar-time num">{timeStr}</span>
            <span className="topbar-date">{dateStr}</span>
          </span>
        </span>

        <span key={syncStatus} className={`topbar-sync sync-${syncStatus}`} title={t(`sync.${syncStatus}`)}>
          <span className="sync-dot" />
          {syncStatus !== "idle" && <span className="sync-text">{t(`sync.${syncStatus}`)}</span>}
        </span>

        {/* Active exam timer / practice stopwatch — mirrored from the
            Exam page's own engines; hidden on the exam page itself to
            avoid a duplicate next to the focusbar timer. */}
        {session && !onExamPage && (
          <span
            className={`topbar-session is-${session.kind} ${session.running === false ? "is-paused" : ""}`}
            role="timer"
            title={session.label}
          >
            <Icon name={session.kind === "exam" ? "timer" : "play"} size={13} />
            <span className="topbar-session-time num">
              {session.kind === "exam"
                ? formatCountdown(session.remainingSeconds)
                : formatCountdown(Math.floor(session.elapsedMs / 1000))}
            </span>
          </span>
        )}

      </div>

      <div className="topbar-right">
        <button
          type="button"
          className="topbar-btn topbar-lang-btn"
          onClick={() => setLanguage(language === "fa" ? "en" : "fa")}
          title={language === "fa" ? "Switch to English" : "تغییر به فارسی"}
          aria-label={language === "fa" ? "Switch to English" : "تغییر به فارسی"}
        >
          {language === "fa" ? "EN" : "فا"}
        </button>

        <button
          type="button"
          className="topbar-btn"
          onClick={() => setDarkMode((prev) => !prev)}
          title={darkMode ? "Light" : "Dark"}
          aria-label="Toggle theme"
        >
          <Icon name={darkMode ? "sun" : "moon"} size={17} />
        </button>

        <Link
          to={user ? "/account" : "/login"}
          className="topbar-account"
          aria-label={user ? t("nav.account") : t("nav.login")}
        >
          <span className="account-avatar" aria-hidden="true">
            {(user?.email?.[0] || "T").toUpperCase()}
          </span>
        </Link>
      </div>
    </header>
  );
}
