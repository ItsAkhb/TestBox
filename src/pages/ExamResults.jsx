import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "../i18n";
import { getExams, getExamData, saveExamData } from "../services/dataService";
import { autoScore, getGrade, getQuestionNumbers } from "../services/scoring";
import Icon from "../components/ui/Icon";
import CountUp from "../components/ui/CountUp";
import ScoreRing from "../components/exam/ScoreRing";
import ConfirmDialog from "../components/ui/ConfirmDialog";

function getExam(id) {
  const exams = getExams();
  if (!Array.isArray(exams)) return null;
  return exams.find((item) => String(item.id) === String(id)) || null;
}

export default function ExamResults() {
  const { id } = useParams();
  const { t, formatDate } = useTranslation();
  const navigate = useNavigate();

  const [reviewFilter, setReviewFilter] = useState("all");
  const [showRetakeConfirm, setShowRetakeConfirm] = useState(false);

  const exam = getExam(id);
  const examData = getExamData(id);

  const results = useMemo(() => {
    if (!exam || !examData) return null;

    const answerKey = examData.answerKey || {};
    const hasAnswerKey = Object.keys(answerKey).length > 0;

    // Authoritative total = the exam's own question numbers, never the key size
    const questionNumbers = getQuestionNumbers(exam);

    if (hasAnswerKey) {
      // Auto-scoring: key-covered questions are graded; the rest are ungraded
      return autoScore(examData.answers || {}, answerKey, exam.negativeMarking !== false, {
        questionNumbers,
      });
    }

    // Fallback: use manual results if no answer key
    const manualResults = examData.results || {};
    let correct = 0;
    let wrong = 0;
    let unanswered = 0;

    const details = {};

    for (const qNum of questionNumbers) {
      const result = manualResults[qNum];
      if (result === "correct") { correct++; details[qNum] = "correct"; }
      else if (result === "wrong") { wrong++; details[qNum] = "wrong"; }
      else { unanswered++; details[qNum] = "unanswered"; }
    }

    const questionCount = questionNumbers.length;

    const percentage = exam.negativeMarking !== false
      ? Math.max(0, Math.round(((correct * 3 - wrong) / (questionCount * 3)) * 100 * 10) / 10)
      : questionCount > 0 ? Math.round((correct / questionCount) * 100 * 10) / 10 : 0;

    return { correct, wrong, unanswered, ungraded: 0, graded: questionCount, totalQuestions: questionCount, percentage, details };
  }, [exam, examData]);

  if (!exam || !results) {
    return (
      <section className="page-section">
        <div className="empty-state">
          <div className="empty-icon"><Icon name="fileText" size={24} /></div>
          <h3>{t("exam.notFound")}</h3>
          <p>{t("exam.notFoundDescription")}</p>
          <Link to="/folders" className="primary-button">{t("exam.backToFolders")}</Link>
        </div>
      </section>
    );
  }

  const grade = getGrade(results.percentage);

  // Time spent: derived from persisted exam state
  const examState = examData?.examState || {};
  const timeSpentSeconds =
    examState.startedAt && examState.finishedAt
      ? Math.max(0, Math.round((examState.finishedAt - examState.startedAt) / 1000))
      : null;
  const avgSecondsPerQuestion =
    timeSpentSeconds != null && results.totalQuestions > 0
      ? Math.round(timeSpentSeconds / results.totalQuestions)
      : null;

  const gradedCount = results.correct + results.wrong;
  const accuracy =
    gradedCount > 0 ? Math.round((results.correct / gradedCount) * 1000) / 10 : 0;

  const markedSet = new Set(
    Array.isArray(examData?.marked) ? examData.marked.map(Number) : []
  );

  function formatDuration(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function handleRetake() {
    // Fresh attempt: clear answers/results but keep the saved answer key
    saveExamData(id, {
      ...examData,
      answers: {},
      correctAnswers: {},
      results: {},
      marked: [],
      examState: null,
    });
    // Clear timer persistence
    try { localStorage.removeItem(`testbox-timer-${id}`); } catch {
      // ignore — retake still valid
    }
    navigate(`/exam/${id}/start`);
  }

  const breakdown = [
    { id: "correct", value: results.correct, label: t("exam.results.correctAnswers") },
    { id: "wrong", value: results.wrong, label: t("exam.results.wrongAnswers") },
    { id: "unanswered", value: results.unanswered, label: t("exam.results.unanswered") },
    ...(results.ungraded > 0
      ? [{ id: "ungraded", value: results.ungraded, label: t("exam.results.ungraded") }]
      : []),
  ];

  const filters = [
    { id: "all", label: t("exam.workspace.filterAll"), count: results.totalQuestions },
    ...breakdown.map((b) => ({ id: b.id, label: b.label, count: b.value })),
    ...(markedSet.size > 0
      ? [{ id: "marked", label: t("exam.markedCount"), count: markedSet.size }]
      : []),
  ];

  const reviewEntries = Object.entries(results.details).filter(([qNum, status]) => {
    if (reviewFilter === "all") return true;
    if (reviewFilter === "marked") return markedSet.has(Number(qNum));
    return status === reviewFilter;
  });

  const statusGlyph = {
    correct: "✓",
    wrong: "✕",
    unanswered: "—",
    ungraded: "?",
  };

  return (
    <section className="page-section exam-results-page">
      <div className="exam-results-header">
        <Link to={`/exam/${id}?review=1`} className="back-link">
          <Icon name="eye" size={15} />
          {t("exam.results.review")}
        </Link>
        <p className="results-eyebrow">{t("exam.results.subtitle")}</p>
        <h1>{exam.name}</h1>
        {examState.finishedAt && (
          <p className="results-finished">
            {t("exam.results.finishedOn", {
              date: formatDate(examState.finishedAt, {
                year: "numeric",
                month: "long",
                day: "numeric",
              }),
            })}
          </p>
        )}
      </div>

      <motion.div
        className="exam-results-card"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        <ScoreRing percentage={results.percentage} grade={grade} />

        <div className="results-breakdown">
          <h2>{t("exam.results.breakdown")}</h2>
          <div
            className="breakdown-bar"
            role="img"
            aria-label={t("exam.results.totalOf", { total: results.totalQuestions })}
          >
            {breakdown.map((segment) => (
              <span
                key={segment.id}
                className={`breakdown-seg breakdown-${segment.id}`}
                style={{
                  width: `${results.totalQuestions > 0 ? (segment.value / results.totalQuestions) * 100 : 0}%`,
                }}
              />
            ))}
          </div>
          <ul className="breakdown-legend">
            {breakdown.map((segment, index) => (
              <motion.li
                key={segment.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.25 + index * 0.07 }}
              >
                <span className={`legend-swatch legend-${segment.id}`} aria-hidden="true" />
                <span className="legend-label">{segment.label}</span>
                <strong className="legend-value num"><CountUp value={segment.value} /></strong>
              </motion.li>
            ))}
          </ul>
          <p className="results-total-note">
            {t("exam.results.totalOf", { total: results.totalQuestions })}
            {results.ungraded > 0 && ` · ${t("exam.results.gradedOf", { graded: results.graded })}`}
          </p>
        </div>
      </motion.div>

      {timeSpentSeconds != null && (
        <div className="results-time-card">
          <div className="results-time-item">
            <Icon name="clock" size={16} />
            <span className="results-time-value">{formatDuration(timeSpentSeconds)}</span>
            <span className="results-time-label">{t("exam.results.timeTaken")}</span>
          </div>
          {avgSecondsPerQuestion != null && (
            <div className="results-time-item">
              <Icon name="timer" size={16} />
              <span className="results-time-value">{formatDuration(avgSecondsPerQuestion)}</span>
              <span className="results-time-label">{t("exam.results.avgTime")}</span>
            </div>
          )}
          <div className="results-time-item">
            <Icon name="target" size={16} />
            <span className="results-time-value">{accuracy}%</span>
            <span className="results-time-label">{t("exam.results.accuracy")}</span>
          </div>
        </div>
      )}

      <div className="results-review-section">
        <div className="results-review-head">
          <h2>{t("exam.results.review")}</h2>
          <p>{t("exam.results.reviewHint")}</p>
        </div>
        <div className="navigator-filters" role="tablist" aria-label={t("exam.results.review")}>
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              role="tab"
              aria-selected={reviewFilter === filter.id}
              className={`filter-chip ${reviewFilter === filter.id ? "active" : ""}`}
              onClick={() => setReviewFilter(filter.id)}
            >
              {filter.label}
              <span className="filter-chip-count">{filter.count}</span>
            </button>
          ))}
        </div>
        <div className="results-review-list">
          {reviewEntries.map(([qNum, status]) => (
            <Link
              key={qNum}
              to={`/exam/${id}?question=${qNum}&review=1`}
              className={`results-review-item results-review-${status} ${markedSet.has(Number(qNum)) ? "is-marked" : ""}`}
            >
              <span className="results-review-number">{qNum}</span>
              <span className="results-review-status">
                {statusGlyph[status] || "·"}
              </span>
            </Link>
          ))}
        </div>
      </div>

      <div className="results-actions">
        <button
          type="button"
          className="primary-button"
          onClick={() => setShowRetakeConfirm(true)}
        >
          <Icon name="retake" size={16} />
          {t("exam.results.retake")}
        </button>
        <Link to={`/folder/${exam?.folderId || ""}`} className="secondary-button">
          <Icon name="folder" size={16} />
          {t("exam.start.backToFolder")}
        </Link>
      </div>

      <ConfirmDialog
        open={showRetakeConfirm}
        onClose={() => setShowRetakeConfirm(false)}
        onConfirm={handleRetake}
        title={t("exam.results.retakeTitle")}
        message={t("exam.results.retakeConfirm")}
        confirmLabel={t("exam.results.retake")}
        cancelLabel={t("common.cancel")}
        variant="danger"
      />
    </section>
  );
}
