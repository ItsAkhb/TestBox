import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useSync } from "../../context/SyncContext";
import { useSession } from "../../context/SessionContext";
import { useTranslation } from "../../i18n";
import { useSettings } from "../../context/SettingsContext";
import { useAuth } from "../../context/AuthContext";
import { useOfflineMode } from "../../context/OfflineModeContext";
import { fetchWeather } from "../../services/weather";
import { shouldShowTopbarSession } from "../../services/timerUi";
import { useTheme } from "../../theme/useTheme";
import Icon from "../ui/Icon";
import Badge from "../ui/Badge";

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
  const { session, focusTimerVisible } = useSession();
  const { t, language, setLanguage, formatDate } = useTranslation();
  const { settings } = useSettings();
  const { user, authState } = useAuth();
  const { manualOffline, goOnline } = useOfflineMode();
  const { preference: themeMode, setTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const onExamPage = /^\/exam\/[^/]+\/?$/.test(location.pathname);

  // Display-only mirror of the Exam page's single timer engine: appears
  // when the in-page focus timer scrolls out of view or the user leaves
  // the exam route. Never two independent countdowns.
  const showSession = shouldShowTopbarSession({
    session,
    onExamPage,
    focusTimerVisible,
  });

  // Return to the exact active attempt (never /start — that path can
  // begin a fresh session). The Exam route restores examState + timer
  // persistence for the same examId.
  function handleSessionClick() {
    if (!session?.examId) return;
    navigate(`/exam/${session.examId}`);
  }

  const [time, setTime] = useState(() => new Date());
  const [weather, setWeather] = useState(null);

  // Cycle System → Light → Dark → System (single module owns persistence
  // and data-theme; this button only advances the preference).
  function cycleTheme() {
    const order = ["system", "light", "dark"];
    const next = order[(order.indexOf(themeMode) + 1) % order.length];
    setTheme(next);
  }

  const themeIconName =
    themeMode === "system" ? "monitor" : themeMode === "light" ? "sun" : "moon";

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const loc = settings?.weatherLocation;
    if (!loc?.lat || !loc?.lon) return;

    fetchWeather(loc.lat, loc.lon)
      .then(setWeather)
      .catch(() => {});
  }, [settings?.weatherLocation]);

  const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const dateStr = formatDate(time, { weekday: "short", month: "short", day: "numeric" });

  // Manual sync: fire the same local-change event the sync engine
  // listens on — the orchestrator's own offline/backoff guards decide
  // whether a cycle runs. Clicking never bypasses data safety.
  function handleManualSync() {
    if (manualOffline) return;
    if (!user) return;
    if (syncStatus === "syncing") return;
    window.dispatchEvent(new CustomEvent("testbox-local-change"));
  }

  const authBadge =
    authState && authState !== "authenticated" && authState !== "unknown"
      ? t(`auth.state.${authState}`)
      : null;

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

        {manualOffline ? (
          <button
            type="button"
            className="topbar-sync sync-offlineMode"
            title={t("offline.mode.goOnline")}
            aria-label={t("offline.mode.goOnline")}
            onClick={goOnline}
          >
            <span className="sync-dot" />
            <span className="sync-text">{t("sync.offlineMode")}</span>
          </button>
        ) : (
          <button
            key={syncStatus}
            type="button"
            className={`topbar-sync sync-${syncStatus}`}
            title={
              syncStatus === "offline" || syncStatus === "idle"
                ? t(`sync.${syncStatus}`)
                : `${t(`sync.${syncStatus}`)} — ${t("sync.manual")}`
            }
            onClick={handleManualSync}
            aria-label={`${t(`sync.${syncStatus}`)} — ${t("sync.manual")}`}
          >
            <span className="sync-dot" />
            {syncStatus !== "idle" && <span className="sync-text">{t(`sync.${syncStatus}`)}</span>}
          </button>
        )}

        {authBadge && (
          <Badge
            variant={
              authState === "needs_revalidation"
                ? "warning"
                : authState === "logged_out"
                  ? "danger"
                  : "muted"
            }
            size="sm"
            className={`topbar-auth-badge auth-${authState}`}
            title={authBadge}
            aria-label={authBadge}
          >
            <span className="topbar-auth-badge-text">{authBadge}</span>
          </Badge>
        )}

        {/* Active exam timer / practice stopwatch — mirrored from the
            Exam page's own engines; docked into the TopBar when the
            in-page focus timer is off-screen or the exam route is left.
            Click restores that exact exam session (examId), never /start. */}
        <AnimatePresence initial={false}>
          {showSession && session && (
            <motion.span
              key="topbar-session"
              className={`topbar-session is-${session.kind} ${session.running === false ? "is-paused" : ""}`}
              role="timer"
              title={session.label}
              onClick={handleSessionClick}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleSessionClick();
                }
              }}
              tabIndex={session.examId ? 0 : -1}
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <Icon name={session.kind === "exam" ? "timer" : "play"} size={13} />
              <span className="topbar-session-time num">
                {session.kind === "exam"
                  ? formatCountdown(session.remainingSeconds)
                  : formatCountdown(Math.floor(session.elapsedMs / 1000))}
              </span>
            </motion.span>
          )}
        </AnimatePresence>

      </div>

      <div className="topbar-right">
        <button
          type="button"
          className="topbar-btn topbar-lang-btn"
          onClick={() => setLanguage(language === "fa" ? "en" : "fa")}
          title={t("topbar.switchLanguage")}
          aria-label={t("topbar.switchLanguage")}
        >
          {language === "fa" ? "EN" : "فا"}
        </button>

        <button
          type="button"
          className="topbar-btn"
          onClick={cycleTheme}
          title={`${t("topbar.toggleTheme")} — ${t(`theme.${themeMode}`)}`}
          aria-label={`${t("topbar.toggleTheme")} — ${t(`theme.${themeMode}`)}`}
        >
          <Icon name={themeIconName} size={17} />
        </button>

        <Link
          to={user ? "/settings" : "/login"}
          className="topbar-account"
          aria-label={user ? t("nav.settings") : t("nav.login")}
        >
          <span className="account-avatar" aria-hidden="true">
            {(user?.email?.[0] || "T").toUpperCase()}
          </span>
        </Link>
      </div>
    </header>
  );
}
