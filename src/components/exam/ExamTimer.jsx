import { useTranslation } from "../../i18n";
import Icon from "../ui/Icon";

function splitHMS(remaining) {
  const r = Math.max(remaining || 0, 0);
  return {
    h: Math.floor(r / 3600),
    m: Math.floor((r % 3600) / 60),
    s: r % 60,
  };
}

export default function ExamTimer({ formatted, isWarning, isCritical, isPulsing, remaining, mode = "countdown" }) {
  const { t } = useTranslation();

  // Stopwatch mode shares the exact pill; a session timer is never urgent.
  if (mode === "stopwatch") {
    return (
      <div
        className="focus-timer is-normal"
        role="timer"
        aria-live="off"
        aria-label={`${t("exam.stopwatch.elapsed")}: ${formatted}`}
        title={t("exam.stopwatch.elapsed")}
      >
        <span className="focus-timer-icon" aria-hidden="true">
          <Icon name="timer" size={17} />
        </span>
        <span className="focus-timer-value num" aria-hidden="true">
          {formatted}
        </span>
      </div>
    );
  }

  const { h, m, s } = splitHMS(remaining);

  const display =
    h > 0
      ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : formatted;

  const state = isCritical || isPulsing ? "critical" : isWarning ? "warning" : "normal";

  return (
    <div
      className={`focus-timer is-${state} ${isPulsing ? "is-pulsing" : ""}`}
      role="timer"
      aria-live={state === "normal" ? "off" : "polite"}
      aria-label={`${t("exam.timer.remaining")}: ${display}`}
      title={t("exam.timer.remaining")}
    >
      <span className="focus-timer-icon" aria-hidden="true">
        <Icon name="timer" size={17} />
      </span>
      <span className="focus-timer-value" aria-hidden="true">
        {display}
      </span>
    </div>
  );
}
