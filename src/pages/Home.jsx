import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, useLocation } from "react-router-dom";

import {
  getFolders,
  getExams,
  getExamData,
} from "../services/dataService";

function getMarkedCount(exams) {
  let count = 0;

  exams.forEach((exam) => {
    const data = getExamData(exam.id);

    if (
      !data ||
      !Array.isArray(data.marked)
    ) {
      return;
    }

    count += data.marked.length;
  });

  return count;
}

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

  const markedCount = useMemo(() => {
    return getMarkedCount(exams);
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

  function clearSearch() {
    setSearch("");
  }

  return (
    <>
      <header className="home-heading">

        <div>
          <h1>خانه</h1>

          <p>
            آزمون‌ها و پاسخ‌برگ‌های شما
          </p>
        </div>

      </header>

      <section className="home-search">

        <div className="search-box">

          <span className="search-icon">
            🔍
          </span>

          <input
            type="search"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="جستجو در فولدرها و آزمون‌ها..."
            aria-label="جستجو در فولدرها و آزمون‌ها"
          />

          {search && (
            <button
              type="button"
              className="search-clear"
              onClick={clearSearch}
              title="پاک کردن"
              aria-label="پاک کردن جستجو"
            >
              ×
            </button>
          )}

        </div>

        {searchText && (
          <div className="search-results">

            {!hasSearchResults ? (

              <div className="search-empty">

                <span>🔍</span>

                <p>
                  نتیجه‌ای برای «{search}» پیدا نشد.
                </p>

              </div>

            ) : (

              <>

                {searchResults.folders.length > 0 && (

                  <div className="search-result-group">

                    <h3>
                      📁 فولدرها
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
                            📁
                          </span>

                          <div>

                            <strong>
                              {folder.name}
                            </strong>

                            <span>
                              فولدر
                            </span>

                          </div>

                          <span className="search-arrow">
                            ←
                          </span>

                        </Link>

                      )
                    )}

                  </div>

                )}

                {searchResults.exams.length > 0 && (

                  <div className="search-result-group">

                    <h3>
                      📝 آزمون‌ها
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
                              📝
                            </span>

                            <div>

                              <strong>
                                {exam.name}
                              </strong>

                              <span>
                                {folder?.name ||
                                  "فولدر نامشخص"}{" "}
                                •{" "}
                                {exam.questionCount} تست
                              </span>

                            </div>

                            <span className="search-arrow">
                              ←
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

      <section className="stats">

        <div className="stat-card">

          <span className="stat-icon">
            📁
          </span>

          <div>

            <strong>
              {folders.length}
            </strong>

            <span>
              فولدر
            </span>

          </div>

        </div>

        <div className="stat-card">

          <span className="stat-icon">
            📝
          </span>

          <div>

            <strong>
              {exams.length}
            </strong>

            <span>
              آزمون
            </span>

          </div>

        </div>

        <div className="stat-card">

          <span className="stat-icon">
            ★
          </span>

          <div>

            <strong>
              {markedCount}
            </strong>

            <span>
              تست مارک‌شده
            </span>

          </div>

        </div>

      </section>

      <section className="recent-section">

        <div className="section-header">

          <div>

            <h2>
              آزمون‌های اخیر
            </h2>

            <p>
              آخرین پاسخ‌برگ‌های شما
            </p>

          </div>

          <Link
            to="/folders"
            className="primary-button"
          >
            + مشاهده فولدرها
          </Link>

        </div>

        {recentExams.length === 0 ? (

          <div className="empty-state">

            <div className="empty-icon">
              📝
            </div>

            <h3>
              هنوز آزمونی ندارید
            </h3>

            <p>
              وارد یک فولدر شوید و اولین آزمون
              خود را بسازید.
            </p>

            <Link
              to="/folders"
              className="primary-button"
            >
              مشاهده فولدرها
            </Link>

          </div>

        ) : (

          <div className="exam-grid">

            {recentExams.map((exam) => (

              <Link
                key={exam.id}
                to={`/exam/${exam.id}`}
                className="home-exam-card"
              >

                <span>
                  📝
                </span>

                <div>

                  <strong>
                    {exam.name}
                  </strong>

                  <p>
                    {exam.questionCount} تست
                  </p>

                </div>

              </Link>

            ))}

          </div>

        )}

      </section>
    </>
  );
}

export default Home;