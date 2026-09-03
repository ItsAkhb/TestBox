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
import { useTranslation } from "../i18n";
import Icon from "../components/ui/Icon";
import PageHeader from "../components/ui/PageHeader";
import EmptyArt from "../components/ui/EmptyArt";

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
  const { t } = useTranslation();

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

      <PageHeader
        icon="star"
        iconFilled
        tone="warm"
        title={t("marked.title")}
        subtitle={t("marked.subtitle")}
        meta={
          totalMarked > 0 && (
            <div className="marked-total">

              <strong>
                {totalMarked}
              </strong>

              <span>
                {t("marked.total")}
              </span>

            </div>
          )
        }
      />

      {groups.length === 0 ? (

        <div className="empty-state marked-empty-state">

          <EmptyArt variant="star" />

          <h3>
            {t("marked.empty.title")}
          </h3>

          <p>
            {t("marked.empty.description")}
          </p>

        </div>

      ) : (

        <div className="marked-groups rise-list">

          {groups.map((group) => (

            <div
              key={group.examId}
              className="marked-group"
            >

              <div className="marked-group-header">

                <div className="marked-group-info">

                  <span className="marked-folder">
                    <Icon name="folder" size={14} />

                    <span>
                      {group.folderName}
                    </span>
                  </span>

                  <h3>
                    <Icon name="fileText" size={16} />

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
                    {t("marked.total")}
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
                      title={t("marked.goToQuestion", { q: questionNumber })}
                    >

                      <span className="marked-question-star">
                        <Icon name="star" size={14} fill="currentColor" />
                      </span>

                      <span className="marked-question-number">
                        {questionNumber}
                      </span>

                      <span className="marked-question-arrow">
                        <Icon name="arrowBack" size={14} />
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