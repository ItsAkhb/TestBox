import { useMemo } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "../../i18n";
import Icon from "../ui/Icon";

const DAY_NAMES_FA = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
const DAY_NAMES_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarView({ gridData, monthLabel, todayStr, selectedDate, activityData, onSelectDate, onPrevMonth, onNextMonth, onToday, isJalali }) {
  const { t, language } = useTranslation();
  const isRtl = language === "fa";

  const dayNames = isJalali ? DAY_NAMES_FA : DAY_NAMES_EN;

  const activityByDate = useMemo(() => {
    const map = {};
    (activityData || []).forEach((entry) => {
      if (entry.hasActivity) map[entry.date] = entry;
    });
    return map;
  }, [activityData]);

  const maxSolved = useMemo(() => {
    let max = 0;
    Object.values(activityByDate).forEach((entry) => {
      if (Number(entry.solved) > max) max = Number(entry.solved);
    });
    return max;
  }, [activityByDate]);

  function intensityOf(dateStr) {
    const entry = activityByDate[dateStr];
    if (!entry || !maxSolved) return 0;
    return Math.min(Math.max(Math.ceil((Number(entry.solved) / maxSolved) * 4), 1), 4);
  }

  function dayNumber(dayInfo) {
    return isJalali ? dayInfo.jalaliDay : dayInfo.gregorianDay;
  }

  function dateStr(dayInfo) {
    const d = dayInfo.gregorianDate;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function isToday(dayInfo) {
    if (!dayInfo.currentMonth) return false;
    return dateStr(dayInfo) === todayStr;
  }

  function isSelected(dayInfo) {
    if (!selectedDate) return false;
    return dateStr(dayInfo) === selectedDate;
  }

  return (
    <div className="calendar-view">
      <div className="calendar-nav">
        <button
          type="button"
          className="secondary-button calendar-nav-btn"
          onClick={onPrevMonth}
          aria-label={t("calendar.prevMonth")}
          title={t("calendar.prevMonth")}
        >
          <Icon name={isRtl ? "chevronRight" : "chevronLeft"} size={18} />
        </button>
        <div className="calendar-nav-center">
          <h2>{monthLabel}</h2>
          <button type="button" className="calendar-today-btn" onClick={onToday}>
            <Icon name="calendar" size={13} />
            {t("calendar.today")}
          </button>
        </div>
        <button
          type="button"
          className="secondary-button calendar-nav-btn"
          onClick={onNextMonth}
          aria-label={t("calendar.nextMonth")}
          title={t("calendar.nextMonth")}
        >
          <Icon name={isRtl ? "chevronLeft" : "chevronRight"} size={18} />
        </button>
      </div>

      <motion.div
        key={monthLabel}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="calendar-grid"
      >
        {dayNames.map((name) => (
          <div key={name} className="calendar-day-name">{name}</div>
        ))}

        {gridData.map((dayInfo, index) => {
          const ds = dateStr(dayInfo);
          const entry = activityByDate[ds];
          const hasActivity = !!entry;
          const intensity = intensityOf(ds);

          return (
            <button
              key={index}
              type="button"
              className={`calendar-day ${!dayInfo.currentMonth ? "other-month" : ""} ${isToday(dayInfo) ? "today" : ""} ${isSelected(dayInfo) ? "selected" : ""} ${hasActivity ? "has-activity" : ""} ${intensity > 1 ? `intensity-${intensity}` : ""}`}
              onClick={() => onSelectDate(ds)}
              title={hasActivity ? `${entry.solved} ${t("calendar.totalSolved")}` : undefined}
              aria-pressed={isSelected(dayInfo)}
            >
              <span className="calendar-day-number">{dayNumber(dayInfo)}</span>
              {hasActivity && <span className="calendar-day-dot" aria-hidden="true" />}
            </button>
          );
        })}
      </motion.div>
    </div>
  );
}
