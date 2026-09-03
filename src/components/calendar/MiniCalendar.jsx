import { useMemo } from "react";
import { useTranslation } from "../../i18n";
import { getActivityForDateRange } from "../../services/activityTracker";
import { Link } from "react-router-dom";
import Icon from "../ui/Icon";
import {
  toLocalDateString,
  gregorianToJalali,
  jalaliToGregorian,
  jalaliDaysInMonth,
  JALALI_MONTH_NAMES_FA,
  GREGORIAN_MONTH_NAMES_EN,
} from "../../utils/date";

const DAY_NAMES_FA = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
const DAY_NAMES_EN = ["S", "M", "T", "W", "T", "F", "S"];

export default function MiniCalendar() {
  const { language } = useTranslation();
  const isJalali = language === "fa";
  const dayNames = isJalali ? DAY_NAMES_FA : DAY_NAMES_EN;

  const todayStr = toLocalDateString(new Date());

  const { monthLabel, gridData } = useMemo(() => {
    const now = new Date();
    if (isJalali) {
      const j = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
      const daysInMonth = jalaliDaysInMonth(j.year, j.month);
      const firstGreg = jalaliToGregorian(j.year, j.month, 1);
      const firstGregDate = new Date(firstGreg.year, firstGreg.month - 1, firstGreg.day);
      const firstDow = firstGregDate.getDay();

      const cells = [];
      for (let i = 0; i < firstDow; i++) cells.push(null);
      for (let d = 1; d <= daysInMonth; d++) {
        const greg = jalaliToGregorian(j.year, j.month, d);
        const ds = `${greg.year}-${String(greg.month).padStart(2, "0")}-${String(greg.day).padStart(2, "0")}`;
        cells.push({ day: d, dateStr: ds });
      }

      return { monthLabel: `${JALALI_MONTH_NAMES_FA[j.month - 1]} ${j.year}`, gridData: cells };
    } else {
      const gy = now.getFullYear();
      const gm = now.getMonth();
      const daysInMonth = new Date(gy, gm + 1, 0).getDate();
      const firstDow = new Date(gy, gm, 1).getDay();

      const cells = [];
      for (let i = 0; i < firstDow; i++) cells.push(null);
      for (let d = 1; d <= daysInMonth; d++) {
        const ds = `${gy}-${String(gm + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        cells.push({ day: d, dateStr: ds });
      }

      return { monthLabel: `${GREGORIAN_MONTH_NAMES_EN[gm]} ${gy}`, gridData: cells };
    }
  }, [isJalali]);

  const activityData = useMemo(() => {
    const first = gridData.find(c => c !== null);
    const last = [...gridData].reverse().find(c => c !== null);
    if (!first || !last) return [];
    return getActivityForDateRange(first.dateStr, last.dateStr);
  }, [gridData]);

  const solvedByDate = useMemo(() => {
    const map = {};
    activityData.forEach((d) => {
      if (d.hasActivity) map[d.date] = Number(d.solved) || 0;
    });
    return map;
  }, [activityData]);

  const maxSolved = useMemo(() => {
    return Math.max(0, ...Object.values(solvedByDate));
  }, [solvedByDate]);

  return (
    <div className="mini-calendar">
      <div className="mini-calendar-header">
        <Link to="/calendar" className="mini-calendar-title">
          <Icon name="calendar" size={14} />
          {monthLabel}
        </Link>
      </div>

      <div className="mini-calendar-grid">
        {dayNames.map((name, i) => (
          <div key={i} className="mini-calendar-dayname">{name}</div>
        ))}

        {gridData.map((cell, index) => {
          if (!cell) return <div key={index} className="mini-calendar-cell empty" />;
          const solved = solvedByDate[cell.dateStr] || 0;
          const hasActivity = solved > 0;
          const intensity = hasActivity && maxSolved > 0
            ? Math.min(Math.max(Math.ceil((solved / maxSolved) * 4), 1), 4)
            : 0;
          const isToday = cell.dateStr === todayStr;
          return (
            <div key={index} className={`mini-calendar-cell ${isToday ? "today" : ""} ${hasActivity ? "has-activity" : ""} ${intensity > 1 ? `intensity-${intensity}` : ""}`}>
              <span>{cell.day}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
