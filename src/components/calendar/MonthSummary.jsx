import { useTranslation } from "../../i18n";
import Icon from "../ui/Icon";
import { formatHMS } from "../../hooks/useStopwatch";

export default function MonthSummary({ stats, streak = 0 }) {
  const { t } = useTranslation();

  if (!stats) return null;

  const total = (stats.totalCorrect || 0) + (stats.totalWrong || 0);

  return (
    <div className="month-summary">
      <h3>{t("calendar.monthlyStats")}</h3>

      <div className="month-summary-stats">
        <div className="month-summary-stat">
          <span className="month-summary-stat-icon" aria-hidden="true">
            <Icon name="zap" size={17} />
          </span>
          <span className="month-summary-stat-text">
            <span className="month-summary-stat-value">{stats.totalSolved}</span>
            <span className="month-summary-stat-label">{t("calendar.totalSolved")}</span>
          </span>
        </div>
        <div className="month-summary-stat">
          <span className="month-summary-stat-icon" aria-hidden="true">
            <Icon name="target" size={17} />
          </span>
          <span className="month-summary-stat-text">
            <span className="month-summary-stat-value">{stats.accuracy}%</span>
            <span className="month-summary-stat-label">{t("home.today.accuracy")}</span>
          </span>
        </div>
        <div className="month-summary-stat">
          <span className="month-summary-stat-icon" aria-hidden="true">
            <Icon name="calendar" size={17} />
          </span>
          <span className="month-summary-stat-text">
            <span className="month-summary-stat-value">{stats.activeDays}</span>
            <span className="month-summary-stat-label">{t("calendar.activeDays")}</span>
          </span>
        </div>
        {streak > 0 && (
          <div className="month-summary-stat">
            <span className="month-summary-stat-icon" aria-hidden="true">
              <Icon name="flame" size={17} />
            </span>
            <span className="month-summary-stat-text">
              <span className="month-summary-stat-value">{streak}</span>
              <span className="month-summary-stat-label">{t("home.streak.title")}</span>
            </span>
          </div>
        )}
        {stats.totalStudySeconds > 0 && (
          <div className="month-summary-stat">
            <span className="month-summary-stat-icon" aria-hidden="true">
              <Icon name="timer" size={17} />
            </span>
            <span className="month-summary-stat-text">
              <span className="month-summary-stat-value num">{formatHMS(stats.totalStudySeconds * 1000)}</span>
              <span className="month-summary-stat-label">{t("calendar.studyTime")}</span>
            </span>
          </div>
        )}
        {stats.totalUnresolved > 0 && (
          <div className="month-summary-stat">
            <span className="month-summary-stat-icon" aria-hidden="true">
              <Icon name="circle" size={17} />
            </span>
            <span className="month-summary-stat-text">
              <span className="month-summary-stat-value">{stats.totalUnresolved}</span>
              <span className="month-summary-stat-label">{t("exam.results.unresolved")}</span>
            </span>
          </div>
        )}
      </div>

      {stats.totalCorrect > 0 && (
        <div className="month-summary-breakdown">
          <div
            className="cal-breakdown-bar"
            role="img"
            aria-label={`${t("exam.correct")}: ${stats.totalCorrect}, ${t("exam.wrong")}: ${stats.totalWrong}`}
          >
            <span
              className="cal-breakdown-correct"
              style={{ width: `${total > 0 ? (stats.totalCorrect / total) * 100 : 0}%` }}
            />
            <span
              className="cal-breakdown-wrong"
              style={{ width: `${total > 0 ? (stats.totalWrong / total) * 100 : 0}%` }}
            />
          </div>
          <div className="month-summary-row">
            <span className="month-summary-dot correct" />
            <span>{t("exam.correct")}</span>
            <strong>{stats.totalCorrect}</strong>
          </div>
          <div className="month-summary-row">
            <span className="month-summary-dot wrong" />
            <span>{t("exam.wrong")}</span>
            <strong>{stats.totalWrong}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
