import { useMemo, useState } from "react";
import { useTranslation } from "../i18n";
import { getActivityForDateRange, getMonthlySummary, getStreak } from "../services/activityTracker";
import CalendarView from "../components/calendar/CalendarView";
import DayDetail from "../components/calendar/DayDetail";
import MonthSummary from "../components/calendar/MonthSummary";
import Icon from "../components/ui/Icon";
import PageHeader from "../components/ui/PageHeader";
import {
  toLocalDateString,
  gregorianToJalali,
  jalaliToGregorian,
  jalaliDaysInMonth,
  JALALI_MONTH_NAMES_FA,
  GREGORIAN_MONTH_NAMES_EN,
} from "../utils/date";

export default function Calendar() {
  const { t, language } = useTranslation();
  const isJalali = language === "fa";

  // Today's date in local time — single source of truth
  const todayStr = toLocalDateString(new Date());

  // The view is always stored as Gregorian year/month.
  // Jalali display is derived from this.
  const [viewGy, setViewGy] = useState(() => new Date().getFullYear());
  const [viewGm, setViewGm] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(null); // YYYY-MM-DD Gregorian

  // Derive all display data from the Gregorian view state
  const { monthLabel, gridData } = useMemo(() => {
    if (isJalali) {
      // Convert Gregorian view month to Jalali for display
      const jView = gregorianToJalali(viewGy, viewGm + 1, 1);
      const jy = jView.year;
      const jm = jView.month;
      const monthLabel = `${JALALI_MONTH_NAMES_FA[jm - 1]} ${jy}`;
      const daysInJalaliMonth = jalaliDaysInMonth(jy, jm);

      // First day of this Jalali month → Gregorian
      const firstGreg = jalaliToGregorian(jy, jm, 1);
      const firstGregDate = new Date(firstGreg.year, firstGreg.month - 1, firstGreg.day);
      const firstDow = firstGregDate.getDay();

      // Pad previous month
      const prevDays = [];
      for (let i = firstDow - 1; i >= 0; i--) {
        const prevJm = jm === 1 ? 12 : jm - 1;
        const prevJy = jm === 1 ? jy - 1 : jy;
        const prevDaysCount = jalaliDaysInMonth(prevJy, prevJm);
        const day = prevDaysCount - i;
        const greg = jalaliToGregorian(prevJy, prevJm, day);
        prevDays.push({ jalaliDay: day, gregorianDate: new Date(greg.year, greg.month - 1, greg.day), currentMonth: false });
      }

      // Current month days
      const currDays = [];
      for (let d = 1; d <= daysInJalaliMonth; d++) {
        const greg = jalaliToGregorian(jy, jm, d);
        currDays.push({ jalaliDay: d, gregorianDate: new Date(greg.year, greg.month - 1, greg.day), currentMonth: true });
      }

      // Pad next month
      const totalCells = prevDays.length + currDays.length;
      const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
      const nextDays = [];
      for (let d = 1; d <= remaining; d++) {
        const nextJm = jm === 12 ? 1 : jm + 1;
        const nextJy = jm === 12 ? jy + 1 : jy;
        const greg = jalaliToGregorian(nextJy, nextJm, d);
        nextDays.push({ jalaliDay: d, gregorianDate: new Date(greg.year, greg.month - 1, greg.day), currentMonth: false });
      }

      return { monthLabel, gridData: [...prevDays, ...currDays, ...nextDays] };
    } else {
      // Gregorian
      const monthLabel = `${GREGORIAN_MONTH_NAMES_EN[viewGm]} ${viewGy}`;
      const daysInMonth = new Date(viewGy, viewGm + 1, 0).getDate();
      const firstDow = new Date(viewGy, viewGm, 1).getDay();

      const prevDays = [];
      const prevMonthDays = new Date(viewGy, viewGm, 0).getDate();
      for (let i = firstDow - 1; i >= 0; i--) {
        const day = prevMonthDays - i;
        prevDays.push({ gregorianDay: day, gregorianDate: new Date(viewGy, viewGm - 1, day), currentMonth: false });
      }

      const currDays = [];
      for (let d = 1; d <= daysInMonth; d++) {
        currDays.push({ gregorianDay: d, gregorianDate: new Date(viewGy, viewGm, d), currentMonth: true });
      }

      const totalCells = prevDays.length + currDays.length;
      const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
      const nextDays = [];
      for (let d = 1; d <= remaining; d++) {
        nextDays.push({ gregorianDay: d, gregorianDate: new Date(viewGy, viewGm + 1, d), currentMonth: false });
      }

      return { monthLabel, gridData: [...prevDays, ...currDays, ...nextDays] };
    }
  }, [viewGy, viewGm, isJalali]);

  // Activity data for the Gregorian range covering this calendar grid
  const activityData = useMemo(() => {
    if (gridData.length === 0) return [];
    const earliest = gridData[0].gregorianDate;
    const latest = gridData[gridData.length - 1].gregorianDate;
    return getActivityForDateRange(
      toLocalDateString(earliest),
      toLocalDateString(latest)
    );
  }, [gridData]);

  const monthlyStats = useMemo(() => {
    return getMonthlySummary(viewGy, viewGm);
  }, [viewGy, viewGm]);

  const streak = useMemo(() => {
    return getStreak();
  }, [activityData]);

  const selectedDayData = useMemo(() => {
    if (!selectedDate) return null;
    return activityData.find(d => d.date === selectedDate) || null;
  }, [selectedDate, activityData]);

  function prevMonth() {
    if (viewGm === 0) {
      setViewGy(viewGy - 1);
      setViewGm(11);
    } else {
      setViewGm(viewGm - 1);
    }
    setSelectedDate(null);
  }

  function nextMonth() {
    if (viewGm === 11) {
      setViewGy(viewGy + 1);
      setViewGm(0);
    } else {
      setViewGm(viewGm + 1);
    }
    setSelectedDate(null);
  }

  function goToday() {
    const now = new Date();
    setViewGy(now.getFullYear());
    setViewGm(now.getMonth());
    setSelectedDate(todayStr);
  }

  // Re-clicking the selected day collapses its report again.
  function handleSelectDate(ds) {
    setSelectedDate((current) => (current === ds ? null : ds));
  }

  return (
    <section className="page-section calendar-page">
      <PageHeader
        icon="calendar"
        title={t("calendar.title")}
        subtitle={t("calendar.subtitle")}
        meta={
          <div className="cal-head-meta">
            <span className="cal-head-stat">
              <strong className="num">{monthlyStats?.totalSolved || 0}</strong>
              {t("calendar.totalSolved")}
            </span>
          </div>
        }
      />

      <div className="calendar-layout">
        <div className="calendar-main">
          <CalendarView
            gridData={gridData}
            monthLabel={monthLabel}
            todayStr={todayStr}
            selectedDate={selectedDate}
            activityData={activityData}
            onSelectDate={handleSelectDate}
            onPrevMonth={prevMonth}
            onNextMonth={nextMonth}
            onToday={goToday}
            isJalali={isJalali}
          />

          {selectedDate && selectedDayData && (
            <DayDetail date={selectedDate} data={selectedDayData} />
          )}

          {selectedDate && !selectedDayData?.hasActivity && (
            <div className="calendar-no-activity">
              <Icon name="inbox" size={18} />
              <p>{t("calendar.noActivity")}</p>
            </div>
          )}
        </div>

        <div className="calendar-sidebar">
          <MonthSummary stats={monthlyStats} streak={streak} />
        </div>
      </div>
    </section>
  );
}
