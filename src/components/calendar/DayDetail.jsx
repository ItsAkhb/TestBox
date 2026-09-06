import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "../../i18n";
import Icon from "../ui/Icon";
import {
  gregorianToJalali,
  JALALI_MONTH_NAMES_FA,
  GREGORIAN_MONTH_NAMES_EN,
  WEEKDAY_NAMES_FA,
  WEEKDAY_NAMES_EN,
} from "../../utils/date";
import { getDayReport } from "../../services/activityTracker";
import { formatHMS } from "../../hooks/useStopwatch";

export default function DayDetail({ date, data }) {
  const { t, language } = useTranslation();
  const [expandedSubject, setExpandedSubject] = useState(null);

  if (!data || !data.hasActivity) return null;

  // date is a "YYYY-MM-DD" local Gregorian string
  const parts = date.split("-").map(Number);
  const gy = parts[0];
  const gm = parts[1];
  const gd = parts[2];
  const weekdayIndex = new Date(gy, gm - 1, gd).getDay();

  let dateStr;
  if (language === "fa") {
    const j = gregorianToJalali(gy, gm, gd);
    dateStr = `${WEEKDAY_NAMES_FA[weekdayIndex]} ${j.day} ${JALALI_MONTH_NAMES_FA[j.month - 1]} ${j.year}`;
  } else {
    dateStr = `${WEEKDAY_NAMES_EN[weekdayIndex]}, ${GREGORIAN_MONTH_NAMES_EN[gm - 1]} ${gd}, ${gy}`;
  }

  const report = getDayReport(date);
  if (!report || report.overall.solved === 0) return null;

  const { overall, subjects } = report;

  function toggleSubject(id) {
    setExpandedSubject((current) => (current === id ? null : id));
  }

  return (
    <motion.div
      className="day-detail"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
    >
      <h3>{t("calendar.dayDetail")}</h3>
      <p className="day-detail-date">{dateStr}</p>

      <div className="day-detail-stats">
        <div className="day-detail-stat">
          <span className="day-detail-stat-value">{overall.solved}</span>
          <span className="day-detail-stat-label">{t("home.today.solved")}</span>
        </div>
        <div className="day-detail-stat">
          <span className="day-detail-stat-value">{overall.accuracy}%</span>
          <span className="day-detail-stat-label">{t("home.today.accuracy")}</span>
        </div>
        <div className="day-detail-stat day-detail-stat-correct">
          <span className="day-detail-stat-value">{overall.correct}</span>
          <span className="day-detail-stat-label">{t("exam.correct")}</span>
        </div>
        <div className="day-detail-stat day-detail-stat-wrong">
          <span className="day-detail-stat-value">{overall.wrong}</span>
          <span className="day-detail-stat-label">{t("exam.wrong")}</span>
        </div>
        {overall.unresolved > 0 && (
          <div className="day-detail-stat">
            <span className="day-detail-stat-value">{overall.unresolved}</span>
            <span className="day-detail-stat-label">{t("exam.results.unresolved")}</span>
          </div>
        )}
        {overall.studySeconds > 0 && (
          <div className="day-detail-stat">
            <span className="day-detail-stat-value num">{formatHMS(overall.studySeconds * 1000)}</span>
            <span className="day-detail-stat-label">{t("calendar.studyTime")}</span>
          </div>
        )}
      </div>

      {overall.completedExams > 0 && (
        <p className="day-detail-completed-note">
          <Icon name="flag" size={15} />
          {t("calendar.completedExams", { count: overall.completedExams })}
        </p>
      )}

      {subjects.length > 0 && (
        <div className="day-detail-subjects">
          <h4>{t("calendar.bySubject")}</h4>

          {subjects.map((subject) => {
            const key = subject.subjectId ?? "none";
            const isExpanded = expandedSubject === key;

            return (
              <div key={key} className="day-detail-subject">
                <button
                  type="button"
                  className="day-detail-subject-header"
                  onClick={() => toggleSubject(key)}
                  aria-expanded={isExpanded}
                >
                  <span className="day-detail-subject-title">
                    {subject.color && (
                      <span
                        className="filter-dot"
                        style={{ backgroundColor: subject.color }}
                      />
                    )}
                    {subject.subjectName || t("subjects.uncategorized")}
                  </span>
                  <span className="day-detail-subject-stats">
                    {subject.solved} · {subject.accuracy}%
                    <span className={`day-detail-expand-icon ${isExpanded ? "open" : ""}`} aria-hidden="true">
                      <Icon name="chevronDown" size={15} />
                    </span>
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      key="body"
                      className="day-detail-subject-body-wrap"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <div className="day-detail-subject-body">
                        {subject.folders.map((folder) => (
                          <div key={folder.folderId ?? "none"} className="day-detail-folder">
                            <div className="day-detail-folder-header">
                              <span className="day-detail-folder-name">
                                <Icon name="folder" size={14} />
                                {folder.folderName || t("subjects.uncategorized")}
                              </span>
                              <span className="day-detail-folder-count">
                                {folder.solved}
                              </span>
                            </div>
                            {folder.exams.map((exam) => (
                              <div key={exam.examId} className="day-detail-exam-row">
                                <span className="day-detail-exam-name">
                                  <Icon name="fileText" size={14} />
                                  {exam.name}
                                  {exam.completed && (
                                    <span
                                      className="day-detail-completed-badge"
                                      title={t("exam.results.completed")}
                                    >
                                      <Icon name="check" size={11} />
                                    </span>
                                  )}
                                </span>
                                <span className="day-detail-exam-count">
                                  <strong>{exam.solved}</strong>
                                  <span className="day-detail-delta correct">
                                    <Icon name="check" size={11} />
                                    {exam.correct}
                                  </span>
                                  <span className="day-detail-delta wrong">
                                    <Icon name="close" size={11} />
                                    {exam.wrong}
                                  </span>
                                </span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
