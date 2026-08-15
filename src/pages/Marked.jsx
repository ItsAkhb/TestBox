import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, useLocation } from "react-router-dom";

import {
  getExams,
  getFolders,
  getExamData,
} from "../services/dataService";

function getMarkedGroups(exams, folders) {
  const grouped = [];

  exams.forEach((exam) => {
    const data = getExamData(exam.id);

    if (
      !data ||
      !Array.isArray(data.marked) ||
      data.marked.length === 0
    ) {
      return;
    }

    const folder = folders.find(
      (item) =>
        String(item.id) ===
        String(exam.folderId)
    );

    const questions = [...data.marked].sort(
      (a, b) => Number(a) - Number(b)
    );

    grouped.push({
      examId: exam.id,
      examName: exam.name,
      folderId: exam.folderId,
      folderName:
        folder?.name || "فولدر نامشخص",
      questions,
      createdAt: exam.createdAt,
    });
  });

  return grouped.sort(
    (a, b) => {
      const aTime = Date.parse(a.createdAt);
      const bTime = Date.parse(b.createdAt);

      if (
        Number.isFinite(aTime) &&
        Number.isFinite(bTime)
      ) {
        return bTime - aTime;
      }

      return 0;
    }
  );
}

function readMarkedGroups() {
  const exams = getExams();
  const folders = getFolders();

  const safeExams = Array.isArray(exams)
    ? exams
    : [];

  const safeFolders = Array.isArray(folders)
    ? folders
    : [];

  return getMarkedGroups(
    safeExams,
    safeFolders
  );
}

function Marked() {
  const location = useLocation();

  const [groups, setGroups] = useState(() =>
    readMarkedGroups()
  );

  const refreshMarked = useCallback(() => {
    setGroups(readMarkedGroups());
  }, []);

  useEffect(() => {
    refreshMarked();
  }, [
    location.pathname,
    location.key,
    refreshMarked,
  ]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (
        document.visibilityState === "visible"
      ) {
        refreshMarked();
      }
    }

    function handleStorageChange() {
      refreshMarked();
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
  }, [refreshMarked]);

  const totalMarked = useMemo(() => {
    return groups.reduce(
      (total, group) =>
        total + group.questions.length,
      0
    );
  }, [groups]);

  return (
    <section className="page-section marked-page">

      <div className="page-title marked-page-title">

        <div className="marked-page-heading">

          <div className="marked-page-icon">
            ⭐
          </div>

          <div>
            <h1>
              تست‌های مارک‌شده
            </h1>

            <p>
              تست‌هایی که برای بررسی دوباره
              علامت زده‌اید.
            </p>
          </div>

        </div>

        {totalMarked > 0 && (
          <div className="marked-total">

            <strong>
              {totalMarked}
            </strong>

            <span>
              تست
            </span>

          </div>
        )}

      </div>

      {groups.length === 0 ? (

        <div className="empty-state marked-empty-state">

          <div className="empty-icon">
            ☆
          </div>

          <h3>
            هنوز تستی مارک نشده
          </h3>

          <p>
            تست‌هایی که می‌خواهی بعداً دوباره
            بررسی کنی را ⭐ کن.
          </p>

        </div>

      ) : (

        <div className="marked-groups">

          {groups.map((group) => (

            <div
              key={group.examId}
              className="marked-group"
            >

              <div className="marked-group-header">

                <div className="marked-group-info">

                  <span className="marked-folder">
                    📁

                    <span>
                      {group.folderName}
                    </span>
                  </span>

                  <h3>
                    📝

                    <span>
                      {group.examName}
                    </span>
                  </h3>

                </div>

                <div className="marked-count">

                  <strong>
                    {group.questions.length}
                  </strong>

                  <span>
                    تست
                  </span>

                </div>

              </div>

              <div className="marked-question-list">

                {group.questions.map(
                  (questionNumber) => (

                    <Link
                      key={`${group.examId}-${questionNumber}`}
                      to={`/exam/${group.examId}?question=${questionNumber}`}
                      className="marked-question"
                      title={`رفتن به تست ${questionNumber}`}
                    >

                      <span className="marked-question-star">
                        ★
                      </span>

                      <span className="marked-question-number">
                        {questionNumber}
                      </span>

                      <span className="marked-question-arrow">
                        ←
                      </span>

                    </Link>

                  )
                )}

              </div>

            </div>

          ))}

        </div>

      )}

    </section>
  );
}

export default Marked;