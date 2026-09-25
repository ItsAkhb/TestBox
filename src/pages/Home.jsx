import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useLocation } from "react-router-dom";

import {
  getFolders,
  getExams,
  getExamData,
} from "../services/dataService";
import { isExamAttemptActive } from "../services/timerUi";
import { getTodayActivity, getStreak, getActivityForDateRange, getDayReport } from "../services/activityTracker";
import { toLocalDateString } from "../utils/date";

// 3600s → "1:00:00", 125s → "2:05"; hours grow unbounded
function formatStudySeconds(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
    : `${m}:${String(s % 60).padStart(2, "0")}`;
}
import MiniCalendar from "../components/calendar/MiniCalendar";
import Icon from "../components/ui/Icon";
import CountUp from "../components/ui/CountUp";
import EmptyArt from "../components/ui/EmptyArt";
import EmptyState from "../components/ui/EmptyState";
import PageHeader from "../components/ui/PageHeader";
import Badge from "../components/ui/Badge";
import { useTranslation } from "../i18n";

function readHomeData() {
  const folders = getFolders();
  const exams = getExams();

  return {
    folders: Array.isArray(folders)
      ? folders
      : [],

    exams: Array.isArray(exams)
      ? exams
      : [],
  };
}

function Home() {
  const location = useLocation();
  const { t, formatDate } = useTranslation();

  const [data, setData] = useState(() =>
    readHomeData()
  );

  const refreshData = useCallback(() => {
    setData(readHomeData());
  }, []);

  useEffect(() => {
    refreshData();
  }, [
    location.pathname,
    location.key,
    refreshData,
  ]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (
        document.visibilityState === "visible"
      ) {
        refreshData();
      }
    }

    function handleStorageChange() {
      refreshData();
    }

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    window.addEventListener(
      "storage",
      handleStorageChange
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );

      window.removeEventListener(
        "storage",
        handleStorageChange
      );
    };
  }, [refreshData]);

  const {
    folders,
    exams,
  } = data;

  const [search, setSearch] = useState("");

  const { todayActivity, dayReport } = useMemo(() => {
    return {
      todayActivity: getTodayActivity(),
      // Same source as Calendar DayDetail — overall + per-subject accuracy
      dayReport: getDayReport(toLocalDateString(new Date())),
    };
  }, [data]);

  const streak = useMemo(() => {
    return getStreak();
  }, [data]);

  // Last 7 days of solved counts (oldest → today) for the rhythm strip
  const weekActivity = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(toLocalDateString(d));
    }
    const range = getActivityForDateRange(days[0], days[6]);
    const byDate = {};
    (range || []).forEach((entry) => {
      if (entry?.date) byDate[entry.date] = Number(entry.solved) || 0;
    });
    return days.map((ds) => ({ date: ds, solved: byDate[ds] || 0 }));
  }, [data]);

  const weekMax = useMemo(() => {
    return Math.max(1, ...weekActivity.map((d) => d.solved));
  }, [weekActivity]);

  // First in-progress exam (if any) → resume CTA
  const resumableExam = useMemo(() => {
    for (const exam of exams) {
      try {
        const ed = getExamData(exam.id);
        if (isExamAttemptActive(ed)) return exam;
      } catch {
        // ignore unreadable records
      }
    }
    return null;
  }, [exams]);

  // Answered/total per recent exam for row progress hairlines
  const examProgress = useMemo(() => {
    const map = {};
    for (const exam of exams) {
      try {
        const ed = getExamData(exam.id);
        const answered = ed?.answers ? Object.keys(ed.answers).length : 0;
        const total = Number(exam.questionCount) || 0;
        map[exam.id] = { answered, total };
      } catch {
        map[exam.id] = { answered: 0, total: Number(exam.questionCount) || 0 };
      }
    }
    return map;
  }, [exams]);

  const recentExams = useMemo(() => {
    return [...exams]
      .sort((a, b) => {
        const aTime = Date.parse(
          a.createdAt
        );

        const bTime = Date.parse(
          b.createdAt
        );

        if (
          Number.isFinite(aTime) &&
          Number.isFinite(bTime)
        ) {
          return bTime - aTime;
        }

        return 0;
      })
      .slice(0, 6);
  }, [exams]);

  const searchText = search
    .trim()
    .toLowerCase();

  const searchResults = useMemo(() => {
    if (!searchText) {
      return {
        folders: [],
        exams: [],
      };
    }

    return {
      folders: folders.filter((folder) =>
        String(folder.name || "")
          .toLowerCase()
          .includes(searchText)
      ),

      exams: exams.filter((exam) =>
        String(exam.name || "")
          .toLowerCase()
          .includes(searchText)
      ),
    };
  }, [
    searchText,
    folders,
    exams,
  ]);

  const hasSearchResults =
    searchResults.folders.length > 0 ||
    searchResults.exams.length > 0;

  const searchResultCount =
    searchResults.folders.length +
    searchResults.exams.length;

  const searchInputRef = useRef(null);
  const resultsRef = useRef(null);

  const showSearchResults = Boolean(searchText);

  function getResultLinks() {
    const container = resultsRef.current;
    if (!container) return [];
    return Array.from(
      container.querySelectorAll("a.search-result")
    );
  }

  function clearSearch() {
    setSearch("");
  }

  function handleSearchKeyDown(event) {
    if (event.key === "ArrowDown") {
      const links = getResultLinks();
      if (links.length > 0) {
        event.preventDefault();
        links[0].focus();
      }
    } else if (event.key === "Escape" && search) {
      event.preventDefault();
      clearSearch();
    }
  }

  function handleResultsKeyDown(event) {
    const links = getResultLinks();
    const index = links.indexOf(document.activeElement);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (index >= 0 && index < links.length - 1) {
        links[index + 1].focus();
      } else if (index === -1 && links.length > 0) {
        links[0].focus();
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index > 0) {
        links[index - 1].focus();
      } else {
        searchInputRef.current?.focus();
      }
    } else if (event.key === "Home") {
      event.preventDefault();
      if (links.length > 0) links[0].focus();
    } else if (event.key === "End") {
      event.preventDefault();
      if (links.length > 0) links[links.length - 1].focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      searchInputRef.current?.focus();
      clearSearch();
    }
  }

  return (
    <>
      <PageHeader
        className="home-heading"
        title={t("home.title")}
        subtitle={t("home.subtitle")}
      />

      <section className="home-search">

        <div className="search-box">

          <span className="search-icon">
            <Icon name="search" size={17} />
          </span>

          <input
            ref={searchInputRef}
            type="search"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            onKeyDown={handleSearchKeyDown}
            placeholder={t("home.search.placeholder")}
            aria-label={t("home.search.placeholder")}
            aria-controls="home-search-results"
            aria-expanded={showSearchResults}
          />

          {/* Always rendered so the field never shifts when it appears */}
          <button
            type="button"
            className={`search-clear ${search ? "" : "is-hidden"}`}
            onClick={clearSearch}
            title={t("home.search.clear")}
            aria-label={t("home.search.clear")}
            aria-hidden={search ? undefined : true}
            tabIndex={search ? 0 : -1}
          >
            <Icon name="close" size={14} />
          </button>

        </div>

        {showSearchResults && (
          <p className="sr-only" role="status" aria-live="polite">
            {searchResultCount > 0
              ? t("home.search.resultsAnnounce", {
                  count: searchResultCount,
                  query: search,
                })
              : `${t("home.search.noResults")} «${search}» ${t("home.search.found")}`}
          </p>
        )}

        {showSearchResults && (
          <div
            ref={resultsRef}
            id="home-search-results"
            className="search-results"
            onKeyDown={handleResultsKeyDown}
          >

            {!hasSearchResults ? (

              <div className="search-empty">

                <Icon name="searchX" size={26} />

                <p>
                  {t("home.search.noResults")} «{search}» {t("home.search.found")}
                </p>

              </div>

            ) : (

              <>

                {searchResults.folders.length > 0 && (

                  <div className="search-result-group">

                    <h3>
                      <Icon name="folder" size={15} /> {t("home.search.folders")}
                    </h3>

                    {searchResults.folders.map(
                      (folder) => (

                        <Link
                          key={folder.id}
                          to={`/folder/${folder.id}`}
                          className="search-result"
                          onClick={clearSearch}
                        >

                          <span className="search-result-icon">
                            <Icon name="folder" size={17} />
                          </span>

                          <div>

                            <strong>
                              {folder.name}
                            </strong>

                            <span>
                              {t("home.search.folder")}
                            </span>

                          </div>

                          <span className="search-arrow">
                            <Icon name="arrowBack" size={15} />
                          </span>

                        </Link>

                      )
                    )}

                  </div>

                )}

                {searchResults.exams.length > 0 && (

                  <div className="search-result-group">

                    <h3>
                      <Icon name="fileText" size={15} /> {t("home.search.exams")}
                    </h3>

                    {searchResults.exams.map(
                      (exam) => {

                        const folder =
                          folders.find(
                            (item) =>
                              String(item.id) ===
                              String(exam.folderId)
                          );

                        return (

                          <Link
                            key={exam.id}
                            to={`/exam/${exam.id}`}
                            className="search-result"
                            onClick={clearSearch}
                          >

<span className="search-result-icon">
                            <Icon name="fileText" size={17} />
                          </span>

                            <div>

                              <strong>
                                {exam.name}
                              </strong>

                              <span>
                                {folder?.name ||
                                  t("subjects.uncategorized")}{" "}
                                •{" "}
                                {exam.questionCount} {t("common.tests")}
                              </span>

                            </div>

                            <span className="search-arrow">
                              <Icon name="arrowBack" size={15} />
                            </span>

                          </Link>

                        );
                      }
                    )}

                  </div>

                )}

              </>

            )}

          </div>
        )}

      </section>

      {/* ---- Today briefing (staged hero) ---- */}
      <section className="today-brief">
        <div className="today-stage">
          <p className="today-eyebrow">{t("home.today.eyebrow", "Today")}</p>

          <div className="today-hero">
            <span className="today-count num"><CountUp value={todayActivity?.solved || 0} duration={800} /></span>
            <span className="today-count-unit">{t("home.today.solved")}</span>
          </div>

          <div className="today-meta">
            <span className="today-meta-item">
              <strong className="num">
                {dayReport?.overall
                  ? dayReport.overall.accuracy
                  : todayActivity && todayActivity.solved > 0
                    ? Math.round((todayActivity.correct / todayActivity.solved) * 100)
                    : 0}
                %
              </strong>
              <span className="meta-lb">{t("home.today.accuracy")}</span>
            </span>
            <span className="today-meta-dot" aria-hidden="true">·</span>
            {(todayActivity?.studySeconds || 0) > 0 && (
              <>
                <span className="today-meta-item">
                  <span className="meta-ic" aria-hidden="true"><Icon name="timer" size={15} /></span>
                  <strong className="num">{formatStudySeconds(todayActivity.studySeconds)}</strong>
                  <span className="meta-lb">{t("calendar.studyTime")}</span>
                </span>
                <span className="today-meta-dot" aria-hidden="true">·</span>
              </>
            )}
            <span className="today-meta-item">
              <span className="meta-ic" aria-hidden="true"><Icon name="flame" size={15} /></span>
              <strong className="num">{streak}</strong>
              <span className="meta-lb">{t("home.streak.title")}</span>
            </span>
          </div>

          {dayReport && dayReport.subjects.length > 0 && (
            <div className="today-subjects">
              <p className="today-subjects-title">{t("home.today.bySubject")}</p>
              <div className="today-subjects-list">
                {dayReport.subjects.map((subject) => (
                  <div
                    key={subject.subjectId ?? "none"}
                    className="today-subject-row"
                  >
                    <span className="today-subject-name">
                      {subject.color && (
                        <span
                          className="filter-dot"
                          style={{ backgroundColor: subject.color }}
                        />
                      )}
                      {subject.subjectName || t("subjects.uncategorized")}
                    </span>
                    <span className="today-subject-acc num">
                      {subject.solved > 0 ? `${subject.accuracy}%` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="today-week" role="img" aria-label={t("home.week.title")}>
            {weekActivity.map((d) => {
              const [y, m, day] = d.date.split("-").map(Number);
              return (
                <div key={d.date} className="today-week-day">
                  <span
                    className="today-week-bar"
                    style={{ height: `${Math.max(Math.round((d.solved / weekMax) * 100), 4)}%` }}
                  />
                  <span className="today-week-label">
                    {formatDate(new Date(y, m - 1, day), { weekday: "narrow" })}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="today-week-caption">{t("home.week.title")}</p>
        </div>
      </section>

      {/* ---- Resume an in-progress exam ---- */}
      {resumableExam && (
        <Link to={`/exam/${resumableExam.id}`} className="resume-cta">
          <Badge
            dot
            variant="warning"
            className="resume-cta-badge"
          >
            {t("home.resume.badge")}
          </Badge>
          <span className="resume-cta-name">{resumableExam.name}</span>
          <span className="resume-cta-action">
            {t("exam.start.resume")}
            <Icon name="arrowBack" size={15} />
          </span>
        </Link>
      )}

      {/* ---- Continue: recent exams as a quiet list ---- */}
      <section className="continue-section">
        <div className="section-head">
          <h2>{t("home.recent.title")}</h2>
          <span className="section-head-meta">
            <span className="library-meta-item">
              <Icon name="folder" size={14} />
              <strong className="num">{folders.length}</strong>
              <span className="meta-lb">{t("home.stats.folders")}</span>
            </span>
            <span className="today-meta-dot" aria-hidden="true">·</span>
            <span className="library-meta-item">
              <Icon name="fileText" size={14} />
              <strong className="num">{exams.length}</strong>
              <span className="meta-lb">{t("home.stats.exams")}</span>
            </span>
          </span>
          <Link to="/folders" className="section-link">
            {t("home.recent.viewAll")}
          </Link>
        </div>

        {recentExams.length === 0 ? (
          <EmptyState
            icon={<EmptyArt variant="sheets" />}
            title={t("home.empty.title")}
            description={t("home.empty.description")}
            action={{
              label: t("home.empty.action"),
              onClick: () => {
                window.location.hash = "#/folders";
              },
            }}
          />
        ) : (
          <div className="continue-list rise-list">
            {recentExams.map((exam) => {
              const prog = examProgress[exam.id] || { answered: 0, total: 0 };
              const pct = prog.total > 0 ? Math.min(Math.round((prog.answered / prog.total) * 100), 100) : 0;
              return (
                <Link key={exam.id} to={`/exam/${exam.id}`} className="continue-row">
                  <span
                    className={`continue-kind ${exam.type === "exam" ? "is-exam" : ""}`}
                    aria-hidden="true"
                  >
                    <Icon name={exam.type === "exam" ? "alignJustify" : "circle"} size={15} />
                  </span>
                  <span className="continue-name">{exam.name}</span>
                  <span className="continue-meta num">
                    {prog.answered > 0 ? `${prog.answered}/${prog.total}` : `${exam.questionCount} ${t("common.tests")}`}
                  </span>
                  <span className="continue-arrow" aria-hidden="true"><Icon name="arrowBack" size={15} /></span>
                  {pct > 0 && (
                    <span className="continue-progress" aria-hidden="true">
                      <span style={{ width: `${pct}%` }} />
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ---- Mini calendar as a quiet footer panel ---- */}
      <aside className="home-calendar">
        <MiniCalendar />
      </aside>
    </>
  );
}

export default Home;