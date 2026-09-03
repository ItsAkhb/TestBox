import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "../i18n";
import {
  getExams,
  getExamData,
  getExamDataKey,
  getFolders,
  getSubjects,
} from "../services/dataService";
import { getQuestionNumbers } from "../services/scoring";
import Icon from "../components/ui/Icon";

function getExam(id) {
  const exams = getExams();
  if (!Array.isArray(exams)) return null;
  return exams.find((item) => String(item.id) === String(id)) || null;
}

function readRemainingSeconds(id) {
  try {
    const raw = localStorage.getItem(`testbox-timer-${id}`);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!Number.isFinite(saved?.remainingSeconds) || !saved?.savedAt) return null;
    const elapsed = Math.floor((Date.now() - saved.savedAt) / 1000);
    return Math.max(saved.remainingSeconds - elapsed, 0);
  } catch {
    return null;
  }
}

function formatClock(totalSeconds) {
  const s = Math.max(Math.round(totalSeconds || 0), 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export default function ExamStart() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const exam = getExam(id);
  const examData = getExamData(id);

  if (!exam) {
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

  const duration = exam.timerDuration || 60;
  const examStatus = examData?.examState?.status;
  const isResumable = examStatus === "in_progress";

  // Completed exams go to results, not start
  if (examStatus === "completed") {
    return <Navigate to={`/exam/${id}/results`} replace />;
  }

  const folder = (getFolders() || []).find((f) => String(f.id) === String(exam.folderId)) || null;
  const subject = folder?.subjectId != null
    ? (getSubjects() || []).find((s) => String(s.id) === String(folder.subjectId)) || null
    : null;

  const totalQuestions = getQuestionNumbers(exam).length || Number(exam.questionCount) || 0;
  const keyEntries = examData?.answerKey ? Object.keys(examData.answerKey).length : 0;
  const answeredSoFar = examData?.answers ? Object.keys(examData.answers).length : 0;
  const remainingSeconds = isResumable ? readRemainingSeconds(id) : null;

  function handleStart() {
    // Initialize exam state
    const examState = {
      status: "in_progress",
      startedAt: Date.now(),
      remainingSeconds: duration * 60,
    };

    // Save exam state to localStorage
    try {
      const key = getExamDataKey(id);
      const data = JSON.parse(localStorage.getItem(key) || "{}");
      data.examState = examState;
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      // non-fatal: exam can still proceed with in-memory state
    }

    // Set timer start — { remainingSeconds, savedAt } format used by useTimer
    try {
      localStorage.setItem(`testbox-timer-${id}`, JSON.stringify({
        remainingSeconds: duration * 60,
        savedAt: Date.now(),
      }));
    } catch {
      // non-fatal: timer still works in-memory
    }

    navigate(`/exam/${id}`);
  }

  function handleResume() {
    navigate(`/exam/${id}`);
  }

  const rules = [
    { icon: "timer", text: t("exam.start.rule1") },
    { icon: "pen", text: t("exam.start.rule2") },
    { icon: "bookmark", text: t("exam.start.rule3") },
  ];

  return (
    <section className="page-section exam-brief-page">
      <Link to={`/folder/${exam.folderId}`} className="brief-back">
        <Icon name="arrowBack" size={16} />
        {t("exam.start.backToFolder")}
      </Link>

      <div className="brief-sheet">
        <div className="brief-badges">
          <span className="mode-badge is-timed">
            <Icon name="timer" size={14} />
            {t("exam.start.timedMode")}
          </span>
          <span className={`brief-state ${isResumable ? "is-resume" : "is-new"}`}>
            <span className="brief-state-dot" aria-hidden="true" />
            {isResumable ? t("exam.start.inProgress") : t("exam.start.newAttempt")}
          </span>
        </div>

        <h1 className="brief-title">{exam.name}</h1>
        <p className="brief-crumb">
          {folder?.name || t("common.folders")}
          {subject && (
            <>
              <span className="brief-crumb-sep" aria-hidden="true">·</span>
              <span
                className="filter-dot"
                style={{ backgroundColor: subject.color || "#4A90E2" }}
                aria-hidden="true"
              />
              {subject.name}
            </>
          )}
        </p>

        <div className="brief-stats">
          <div className="brief-stat">
            <span className="brief-stat-icon" aria-hidden="true"><Icon name="list" size={17} /></span>
            <span className="brief-stat-value">{totalQuestions}</span>
            <span className="brief-stat-label">{t("exam.start.questions")}</span>
          </div>
          <div className="brief-stat">
            <span className="brief-stat-icon" aria-hidden="true"><Icon name="timer" size={17} /></span>
            <span className="brief-stat-value">{duration}<small> {t("exam.start.minutesUnit")}</small></span>
            <span className="brief-stat-label">{t("exam.start.duration")}</span>
          </div>
          <div className="brief-stat">
            <span className="brief-stat-icon" aria-hidden="true"><Icon name="keyRound" size={17} /></span>
            <span className="brief-stat-value">
              {keyEntries > 0 ? `${keyEntries}/${totalQuestions}` : "—"}
            </span>
            <span className="brief-stat-label">{t("exam.start.keyCoverage")}</span>
          </div>
          {isResumable && (
            <div className="brief-stat">
              <span className="brief-stat-icon" aria-hidden="true"><Icon name="checkCircle" size={17} /></span>
              <span className="brief-stat-value">{answeredSoFar}<small>/{totalQuestions}</small></span>
              <span className="brief-stat-label">{t("exam.start.answeredSoFar")}</span>
            </div>
          )}
        </div>

        {keyEntries === 0 && (
          <p className="brief-nokey">
            <Icon name="info" size={15} />
            {t("exam.start.noKey")}
          </p>
        )}

        {isResumable && remainingSeconds != null && (
          <div className="brief-remaining">
            <Icon name="clock" size={16} />
            <span>{t("exam.start.timeRemaining")}</span>
            <strong>{formatClock(remainingSeconds)}</strong>
          </div>
        )}

        <div className="brief-rules">
          <h2>{t("exam.start.rulesTitle")}</h2>
          <ul>
            {rules.map((rule) => (
              <li key={rule.text}>
                <Icon name={rule.icon} size={15} />
                <span>{rule.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="brief-actions">
          {isResumable ? (
            <button type="button" className="primary-button brief-cta" onClick={handleResume}>
              <Icon name="play" size={17} />
              {t("exam.start.resume")}
            </button>
          ) : (
            <button type="button" className="primary-button brief-cta" onClick={handleStart}>
              <Icon name="play" size={17} />
              {t("exam.start.begin")}
            </button>
          )}
          <Link to={`/folder/${exam.folderId}`} className="secondary-button">
            {t("exam.cancel")}
          </Link>
        </div>
      </div>
    </section>
  );
}
