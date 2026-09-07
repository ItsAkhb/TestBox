import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";

import {
  Link,
  useLocation,
  useParams,
  useNavigate,
} from "react-router-dom";

import {
  getExams,
  getExamData,
  getExamDataKey,
  getFolders,
  saveExamData,
} from "../services/dataService";
import {
  recordQuestionAnswered,
  recordExamCompleted,
  recordStudyTime,
  revertQuestion,
} from "../services/activityTracker";
import { getQuestionNumbers } from "../services/scoring";
import { useTranslation } from "../i18n";
import useTimer from "../hooks/useTimer";
import useStopwatch from "../hooks/useStopwatch";
import { useSession } from "../context/SessionContext";
import ExamTimer from "../components/exam/ExamTimer";
import QuestionNavigator from "../components/exam/QuestionNavigator";
import Modal from "../components/ui/Modal";
import Icon from "../components/ui/Icon";
import { motion } from "framer-motion";

const choices = [
  "1",
  "2",
  "3",
  "4",
];

const QUESTIONS_PER_PAGE = 100;

function calculateStats(
  results,
  totalQuestions
) {
  let correct = 0;
  let wrong = 0;

  Object.values(results).forEach(
    (result) => {
      if (result === "correct") {
        correct++;
      }

      if (result === "wrong") {
        wrong++;
      }
    }
  );

  const unanswered = Math.max(
    totalQuestions -
      correct -
      wrong,
    0
  );

  return {
    correct,
    wrong,
    unanswered,
  };
}

function calculatePercentage(
  correct,
  wrong,
  totalQuestions,
  negativeMarking,
  resultedQuestions = null
) {
  // Denominator: the number of questions with an ACTUAL result when the
  // caller provides one (practice mode — untouched questions must not
  // drag the percentage down). Exam mode passes the full total: every
  // question there ends up correct/wrong/unanswered by design.
  const denominator =
    resultedQuestions != null && resultedQuestions > 0
      ? resultedQuestions
      : totalQuestions;

  if (!denominator) {
    return 0;
  }

  const score = negativeMarking
    ? correct * 3 - wrong
    : correct;

  const maxScore = negativeMarking
    ? denominator * 3
    : denominator;

  return (
    (score / maxScore) *
    100
  );
}

function getInitialExam(id) {
  const exams = getExams();

  if (!Array.isArray(exams)) {
    return null;
  }

  return (
    exams.find(
      (item) =>
        String(item.id) ===
        String(id)
    ) || null
  );
}

function Exam() {
  const { id } = useParams();

  return (
    <ExamContent
      key={id}
      id={id}
    />
  );
}

function ExamContent({ id }) {
  const location =
    useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [exam] =
    useState(() =>
      getInitialExam(id)
    );

  const [examData, setExamData] =
    useState(() =>
      getExamData(id)
    );

  // Mirror of examData that updates synchronously — saveData merges onto
  // this so consecutive rapid saves never operate on a stale snapshot.
  const latestExamDataRef =
    useRef(examData);

  useEffect(() => {
    latestExamDataRef.current =
      examData;
  }, [examData]);

  // Load answer key for exam mode
  const [answerKeyData] = useState(() => {
    if (!exam || exam.type !== "exam") return {};
    try {
      const data = JSON.parse(localStorage.getItem(getExamDataKey(id)) || "{}");
      return data.answerKey || {};
    } catch {
      return {};
    }
  });

  // Check if this is exam mode
  const isExamMode = exam?.type === "exam";

  // Resolve subject metadata once per exam via the folder registry
  const examMeta = useMemo(() => {
    if (!exam) return null;
    const folder = getFolders().find(
      (f) => String(f.id) === String(exam.folderId)
    );
    return {
      examId: exam.id,
      examName: exam.name,
      folderId: exam.folderId ?? null,
      subjectId: folder?.subjectId ?? null,
    };
  }, [exam]);

  // Review mode: completed exams are viewable read-only via ?review=1
  const isReviewMode =
    isExamMode &&
    examData?.examState?.status === "completed" &&
    new URLSearchParams(location.search).get("review") === "1";

  // Exam-mode atmosphere: lets CSS theme the workspace per mode
  // (ink focus slab in active exams). Always cleaned up on unmount.
  useEffect(() => {
    const mode = isReviewMode ? "review" : isExamMode ? "exam" : "practice";
    document.body.dataset.examMode = mode;
    return () => {
      delete document.body.dataset.examMode;
    };
  }, [isExamMode, isReviewMode]);

  // Lifecycle redirect (deferred to useEffect so it never violates hook order —
  // the component previously had early returns before later hooks, which
  // crashed React's reconciler on the finish transition).
  useEffect(() => {
    if (!exam || !isExamMode || isReviewMode) return;
    const examStatus = examData?.examState?.status;
    if (examStatus === "completed") {
      navigate(`/exam/${id}/results`, { replace: true });
    } else if (examStatus !== "in_progress") {
      navigate(`/exam/${id}/start`, { replace: true });
    }
  }, [exam, isExamMode, isReviewMode, examData, id, navigate]);

  const [
    currentPage,
    setCurrentPage,
  ] = useState(1);

  const [showNavigator, setShowNavigator] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);

  // Question currently holding keyboard focus — target for 1–4 / M shortcuts.
  const activeQuestionRef = useRef(null);
  // Guards the finish flow against double-fire (manual confirm + timer expiry).
  const finishingRef = useRef(false);

  const {
    answers,
    correctAnswers,
    marked,
    unresolved,
    results,
    note,
  } = examData;

  const negativeMarking =
    exam?.negativeMarking ??
    true;

  const stats = useMemo(() => {
    if (!exam) {
      return {
        correct: 0,
        wrong: 0,
        unanswered: 0,
      };
    }

    return calculateStats(
      results,
      exam.questionCount || 0
    );
  }, [
    exam,
    results,
  ]);

  const percentage = useMemo(() => {
    if (!exam) {
      return 0;
    }

    // Practice mode: only questions with an actual result (correct/wrong)
    // count toward the percentage — untouched questions must not drag it
    // down. Exam mode: the whole exam (answered + unanswered) is the
    // denominator by design.
    const resulted =
      isExamMode
        ? exam.questionCount || 0
        : stats.correct + stats.wrong;

    return calculatePercentage(
      stats.correct,
      stats.wrong,
      exam.questionCount || 0,
      negativeMarking,
      resulted
    );
  }, [
    exam,
    isExamMode,
    stats.correct,
    stats.wrong,
    negativeMarking,
  ]);

  const questionNumbers =
    useMemo(() => {
      if (!exam) {
        return [];
      }

      const count = Number(
        exam.questionCount || 0
      );

      if (
        !Number.isInteger(
          count
        ) ||
        count < 1
      ) {
        return [];
      }

      const start =
        exam.customNumbering
          ? Number(
              exam.startNumber
            )
          : 1;

      const step =
        exam.customNumbering &&
        exam.useStep
          ? Number(
              exam.step
            )
          : 1;

      if (
        !Number.isInteger(
          start
        ) ||
        !Number.isInteger(
          step
        ) ||
        step < 1
      ) {
        return [];
      }

      return Array.from(
        {
          length: count,
        },
        (_, index) =>
          start +
          index * step
      );
    }, [exam]);

  const totalPages =
    useMemo(() => {
      return Math.ceil(
        questionNumbers.length /
          QUESTIONS_PER_PAGE
      );
    }, [
      questionNumbers,
    ]);

  const visibleQuestionNumbers =
    useMemo(() => {
      const start =
        (currentPage - 1) *
        QUESTIONS_PER_PAGE;

      return questionNumbers.slice(
        start,
        start +
          QUESTIONS_PER_PAGE
      );
    }, [
      questionNumbers,
      currentPage,
    ]);

  useEffect(() => {
    if (totalPages === 0) {
      setCurrentPage(1);
      return;
    }

    if (
      currentPage > totalPages
    ) {
      setCurrentPage(
        totalPages
      );
    }
  }, [
    currentPage,
    totalPages,
  ]);

  useEffect(() => {
    if (
      !exam ||
      questionNumbers.length ===
        0
    ) {
      return;
    }

    const params =
      new URLSearchParams(
        location.search
      );

    const question =
      params.get(
        "question"
      );

    if (!question) {
      return;
    }

    const questionNumber =
      Number(question);

    const questionIndex =
      questionNumbers.findIndex(
        (number) =>
          Number(number) ===
          questionNumber
      );

    if (
      questionIndex === -1
    ) {
      return;
    }

    const targetPage =
      Math.floor(
        questionIndex /
          QUESTIONS_PER_PAGE
      ) + 1;

    setCurrentPage(
      targetPage
    );

    const timer =
      setTimeout(() => {
        const element =
          document.getElementById(
            `question-${questionNumber}`
          );

        if (!element) {
          return;
        }

        element.scrollIntoView({
          behavior:
            "smooth",
          block: "center",
        });

        element.classList.add(
          "question-focused"
        );

        const removeFocusTimer =
          setTimeout(() => {
            element.classList.remove(
              "question-focused"
            );
          }, 1800);

        return () =>
          clearTimeout(
            removeFocusTimer
          );
      }, 200);

    return () => {
      clearTimeout(
        timer
      );
    };
  }, [
    exam,
    location.search,
    questionNumbers,
  ]);

  function saveData({
    answers:
      newAnswers = answers,
    correctAnswers:
      newCorrectAnswers =
        correctAnswers,
    marked:
      newMarked = marked,
    unresolved:
      newUnresolved = unresolved,
    results:
      newResults = results,
    note:
      newNote = note,
  } = {}) {
    // Merge onto the LATEST data (kept in a ref that updates synchronously)
    // so rapid consecutive clicks can't overwrite each other with stale
    // closures. answerKey and examState are preserved because they live in
    // the same record but are managed by their own flows.
    const base = latestExamDataRef.current || examData;

    const newData = {
      ...base,

      answers:
        newAnswers === answers ? base.answers : newAnswers,

      correctAnswers:
        newCorrectAnswers === correctAnswers ? base.correctAnswers : newCorrectAnswers,

      marked:
        newMarked === marked ? base.marked : newMarked,

      unresolved:
        newUnresolved === unresolved ? base.unresolved : newUnresolved,

      results:
        newResults === results ? base.results : newResults,

      note:
        newNote === note ? base.note : newNote,
    };

    latestExamDataRef.current = newData;

    const saved =
      saveExamData(
        id,
        newData
      );

    if (!saved) {
      console.error(
        "Failed to save exam data"
      );

      return false;
    }

    setExamData(
      newData
    );

    return true;
  }

  const handleFinishExam = useCallback(() => {
    if (!exam || !isExamMode) return;
    // The timer and the manual confirm button can race (expiry while the
    // dialog is open). Finish exactly once per mount.
    if (finishingRef.current) return;
    finishingRef.current = true;

    // Read the LATEST data from the ref — the timer can fire this from an
    // interval, and closure state can be stale relative to recent clicks.
    const current = latestExamDataRef.current || examData;
    const currentAnswers = current.answers;
    const currentUnresolved = Array.isArray(current.unresolved)
      ? current.unresolved
      : [];

    // Auto-score based on answer key
    let finalStats = null;
    if (Object.keys(answerKeyData).length > 0) {
      const updatedResults = { ...current.results };
      const updatedCorrectAnswers = { ...current.correctAnswers };

      // Authoritative question list from the exam object — NEVER from the key
      const allQuestionNumbers = getQuestionNumbers(exam);

      let correct = 0;
      let wrong = 0;
      let unanswered = 0;
      let unresolved = 0;
      let ungraded = 0;

      // Score each question; keyless questions stay ungraded
      allQuestionNumbers.forEach((questionNumber) => {
        const userAnswer = currentAnswers[questionNumber];
        const correctAnswer = answerKeyData[questionNumber];

        if (correctAnswer == null || correctAnswer === "") {
          ungraded += 1;
          updatedResults[questionNumber] = "ungraded";
          return;
        }

        if (!userAnswer) {
          // A question the user explicitly marked unresolved counts as
          // worked-on but is scored as unanswered (no accuracy impact —
          // it has no correct/incorrect outcome).
          if (currentUnresolved.includes(questionNumber)) {
            unresolved += 1;
            updatedResults[questionNumber] = "unresolved";
          } else {
            unanswered += 1;
          }
        } else if (String(userAnswer) === String(correctAnswer)) {
          updatedResults[questionNumber] = "correct";
          updatedCorrectAnswers[questionNumber] = userAnswer;
          correct += 1;
        } else {
          updatedResults[questionNumber] = "wrong";
          updatedCorrectAnswers[questionNumber] = correctAnswer;
          wrong += 1;
        }
      });

      saveData({
        results: updatedResults,
        correctAnswers: updatedCorrectAnswers,
      });

      finalStats = {
        correct,
        wrong,
        unanswered,
        unresolved,
        ungraded,
        graded: correct + wrong + unanswered + unresolved,
        total: allQuestionNumbers.length,
      };
    }

    // Update exam state to completed
    try {
      const key = getExamDataKey(id);
      const data = JSON.parse(localStorage.getItem(key) || "{}");
      data.examState = { ...data.examState, status: "completed", finishedAt: Date.now() };
      localStorage.setItem(key, JSON.stringify(data));
      latestExamDataRef.current = { ...latestExamDataRef.current, examState: data.examState };
    } catch {
      // non-fatal: results page still renders from navigation
    }

    // Record exam completion in daily activity (idempotent, replaces prior stats)
    if (examMeta && finalStats) {
      recordExamCompleted(examMeta, finalStats);
    }

    // Navigate to results
    navigate(`/exam/${id}/results`);
  }, [exam, isExamMode, id, navigate, answerKeyData, examMeta]);

  // Timer for exam mode
  const timerDurationSeconds = isExamMode ? (exam?.timerDuration || 60) * 60 : 0;
  const timer = useTimer(
    isExamMode ? id : null,
    timerDurationSeconds,
    handleFinishExam
  );

  // Practice session stopwatch (opt-in per exam via the creation form).
  // Only genuinely-run deltas reach statistics: pause flushes its own
  // delta, the hook flushes incremental deltas + the unmount remainder,
  // and reset touches the engine only — never recorded history.
  const stopwatchOn = !isExamMode && exam?.stopwatchEnabled === true;
  const handleStopwatchTick = useCallback((deltaMs) => {
    if (examMeta) recordStudyTime(examMeta, deltaMs);
  }, [examMeta]);
  const stopwatch = useStopwatch(stopwatchOn ? id : null, {
    onTick: handleStopwatchTick,
  });

  // Mirror the active timer/stopwatch into the shared session state so
  // the TopBar shows it on every page (no second engine — display only).
  // Exam sessions are wall-clock ({endsAt}) and stay registered across
  // navigation, matching the persisted timer's own behavior. Practice
  // stopwatches pause on unmount (engine behavior) so they clear here.
  const { updateSession } = useSession();
  useEffect(() => {
    if (isExamMode && timer.remaining > 0) {
      updateSession({
        kind: "exam",
        examId: id,
        label: exam?.name || "",
        endsAt: Date.now() + timer.remaining * 1000,
      });
    } else if (isExamMode) {
      updateSession(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExamMode, id, exam?.name, timer.remaining > 0, updateSession]);

  useEffect(() => {
    if (stopwatchOn && stopwatch.elapsedMs > 0) {
      updateSession({
        kind: "stopwatch",
        examId: id,
        label: exam?.name || "",
        elapsedMs: stopwatch.elapsedMs,
        running: stopwatch.running,
      });
    } else if (!isExamMode) {
      updateSession(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    stopwatchOn,
    stopwatch.elapsedMs,
    stopwatch.running,
    isExamMode,
    id,
    exam?.name,
    updateSession,
  ]);

  // Practice stopwatch: its engine pauses on unmount, so drop the
  // session indicator when leaving the page. Exam sessions persist
  // (the countdown keeps running like the persisted timer record).
  useEffect(() => {
    return () => {
      updateSession((current) =>
        current && current.kind === "stopwatch" ? null : current
      );
    };
  }, [updateSession]);

  function handleStopwatchPause() {
    const flushed = stopwatch.pause();
    if (flushed > 0 && examMeta) recordStudyTime(examMeta, flushed);
  }

  function selectAnswer(
    questionNumber,
    answer
  ) {
    // Read from the ref (always current) — not from the render closure —
    // so fast consecutive interactions on different questions never race.
    const current = latestExamDataRef.current || examData;
    const currentAnswers = current.answers;
    const currentResults = current.results;
    const currentCorrectAnswers = current.correctAnswers;

    const currentAnswer =
      currentAnswers[
        questionNumber
      ];

    const updatedAnswers = {
      ...currentAnswers,
    };

    const updatedResults = {
      ...currentResults,
    };

    const updatedCorrectAnswers =
      {
        ...currentCorrectAnswers,
      };

    // Answering normally lifts the unresolved mark: the question now has
    // an answer (or returns to plain unanswered on deselect).
    const currentUnresolved = Array.isArray(current.unresolved)
      ? current.unresolved
      : [];
    const wasUnresolved = currentUnresolved.includes(
      questionNumber
    );
    const updatedUnresolved = wasUnresolved
      ? currentUnresolved.filter(
          (number) => number !== questionNumber
        )
      : currentUnresolved;

    // کلیک دوباره روی همان گزینه:
    // تست به حالت «نزده» برمی‌گردد.
    if (
      currentAnswer ===
      answer
    ) {
      delete updatedAnswers[
        questionNumber
      ];

      delete updatedResults[
        questionNumber
      ];

      delete updatedCorrectAnswers[
        questionNumber
      ];

      saveData({
        answers:
          updatedAnswers,

        results:
          updatedResults,

        correctAnswers:
          updatedCorrectAnswers,

        unresolved:
          updatedUnresolved,
      });

      // Deselect: fully revert the question's recorded outcome — it must
      // not remain counted as solved/tested (per-day rollback).
      if (examMeta) {
        revertQuestion(examMeta, questionNumber);
      }

      return;
    }

    // تغییر پاسخ:
    // نتیجه قبلی و پاسخ صحیح قبلی دیگر معتبر نیستند.
    updatedAnswers[
      questionNumber
    ] = answer;

    delete updatedResults[
      questionNumber
    ];

    delete updatedCorrectAnswers[
      questionNumber
    ];

    saveData({
      answers:
        updatedAnswers,

      results:
        updatedResults,

      correctAnswers:
        updatedCorrectAnswers,

      unresolved:
        updatedUnresolved,
    });

    // Record the answer. Exam mode with a key knows the outcome immediately;
    // practice starts as unanswered until the user marks it.
    if (examMeta) {
      const keyAnswer = isExamMode ? answerKeyData[questionNumber] : null;
      const outcome =
        keyAnswer != null
          ? String(answer) === String(keyAnswer)
            ? "correct"
            : "wrong"
          : "unanswered";
      recordQuestionAnswered(examMeta, questionNumber, outcome);
    }
  }

  function selectCorrectAnswer(
    questionNumber,
    answer
  ) {
    const currentCorrect = (latestExamDataRef.current || examData).correctAnswers;

    const result =
      (latestExamDataRef.current || examData).results[
        questionNumber
      ];

    // پاسخ صحیح فقط وقتی قابل تعیین است
    // که تست غلط اعلام شده باشد.
    if (
      result !== "wrong"
    ) {
      return;
    }

    const updatedCorrectAnswers =
      {
        ...currentCorrect,
      };

    const currentCorrectAnswer =
      currentCorrect[
        questionNumber
      ];

    // کلیک دوباره روی همان پاسخ صحیح:
    // پاسخ صحیح پاک می‌شود.
    if (
      currentCorrectAnswer ===
      answer
    ) {
      delete updatedCorrectAnswers[
        questionNumber
      ];

      saveData({
        correctAnswers:
          updatedCorrectAnswers,
      });

      return;
    }

    updatedCorrectAnswers[
      questionNumber
    ] = answer;

    saveData({
      correctAnswers:
        updatedCorrectAnswers,
    });
  }

  function toggleMark(
    questionNumber
  ) {
    const currentMarked = (latestExamDataRef.current || examData).marked;

    const isMarked =
      currentMarked.includes(
        questionNumber
      );

    const updatedMarked =
      isMarked
        ? currentMarked.filter(
            (number) =>
              number !==
              questionNumber
          )
        : [
            ...currentMarked,
            questionNumber,
          ];

    saveData({
      marked:
        updatedMarked,
    });
  }

  // First-class "unresolved" state: the user worked on the question but
  // could not solve it and does not want to enter an answer. Stored as a
  // distinct list (never as an option or result value). Marking unresolved
  // clears any answer/result for the question; answering normally removes
  // the unresolved mark (handled in selectAnswer).
  function toggleUnresolved(
    questionNumber
  ) {
    const current = latestExamDataRef.current || examData;
    const currentUnresolved = Array.isArray(current.unresolved)
      ? current.unresolved
      : [];

    const isUnresolved = currentUnresolved.includes(
      questionNumber
    );

    if (isUnresolved) {
      // Remove unresolved: the question returns to a clean state — fully
      // revert its recorded outcome (it must not stay counted as solved).
      saveData({
        unresolved: currentUnresolved.filter(
          (number) => number !== questionNumber
        ),
      });

      if (examMeta) {
        revertQuestion(examMeta, questionNumber);
      }

      return;
    }

    // Mark unresolved: drop any selected answer, manual result, and
    // practice correct-answer record — the question has no answer.
    const updatedAnswers = { ...current.answers };
    const updatedResults = { ...current.results };
    const updatedCorrectAnswers = { ...current.correctAnswers };

    delete updatedAnswers[questionNumber];
    delete updatedResults[questionNumber];
    delete updatedCorrectAnswers[questionNumber];

    saveData({
      answers: updatedAnswers,
      results: updatedResults,
      correctAnswers: updatedCorrectAnswers,
      unresolved: [...currentUnresolved, questionNumber],
    });

    if (examMeta) {
      recordQuestionAnswered(examMeta, questionNumber, "unresolved");
    }
  }

  function setQuestionResult(
    questionNumber,
    result
  ) {
    const current = latestExamDataRef.current || examData;

    const selectedAnswer =
      current.answers[
        questionNumber
      ];

    // بدون پاسخ، درست/غلط قابل تعیین نیست.
    if (!selectedAnswer) {
      return;
    }

    const currentResult =
      current.results[
        questionNumber
      ];

    const updatedResults = {
      ...current.results,
    };

    const updatedCorrectAnswers =
      {
        ...current.correctAnswers,
      };

    // کلیک دوباره روی همان وضعیت:
    // وضعیت به حالت «نزده / بررسی نشده» برمی‌گردد.
    if (
      currentResult ===
      result
    ) {
      delete updatedResults[
        questionNumber
      ];

      delete updatedCorrectAnswers[
        questionNumber
      ];

      saveData({
        results:
          updatedResults,

        correctAnswers:
          updatedCorrectAnswers,
      });

      // Unmarking correct/wrong: fully revert the recorded outcome
      if (examMeta) {
        revertQuestion(examMeta, questionNumber);
      }

      return;
    }

    updatedResults[
      questionNumber
    ] = result;

    if (
      result === "correct"
    ) {
      // پاسخ کاربر خودکار پاسخ صحیح است.
      updatedCorrectAnswers[
        questionNumber
      ] = selectedAnswer;
    } else {
      // اگر غلط شد، پاسخ صحیح باید دوباره
      // توسط کاربر مشخص شود.
      delete updatedCorrectAnswers[
        questionNumber
      ];
    }

    saveData({
      results:
        updatedResults,

      correctAnswers:
        updatedCorrectAnswers,
    });

    // Practice marking updates today's outcome (dedup prevents double counting)
    if (examMeta) {
      recordQuestionAnswered(examMeta, questionNumber, result);
    }
  }

  function handleNoteChange(
    value
  ) {
    saveData({
      note: value,
    });
  }

  function scrollToNote() {
    document
      .getElementById(
        "exam-note"
      )
      ?.scrollIntoView({
        behavior:
          "smooth",
        block: "start",
      });
  }

  function scrollToQuestion(questionNumber) {
    const element = document.getElementById(
      `question-${questionNumber}`
    );

    if (!element) {
      return;
    }

    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    element.classList.add(
      "question-focused"
    );

    setTimeout(() => {
      element.classList.remove(
        "question-focused"
      );
    }, 1800);
  }

  function jumpToQuestion(questionNumber) {
    setShowNavigator(false);

    const questionIndex =
      questionNumbers.findIndex(
        (number) =>
          Number(number) ===
          Number(questionNumber)
      );

    if (questionIndex === -1) {
      return;
    }

    const targetPage =
      Math.floor(
        questionIndex /
          QUESTIONS_PER_PAGE
      ) + 1;

    if (targetPage !== currentPage) {
      setCurrentPage(targetPage);
      // Rows remount on page change — scroll after they paint.
      setTimeout(() => {
        scrollToQuestion(questionNumber);
      }, 120);
    } else {
      scrollToQuestion(questionNumber);
    }
  }

  // Keyboard answering: 1–4 selects an option and M toggles the mark on the
  // focused question row. Ignored while typing and in read-only review.
  // Handlers are reached through refs so the listener always calls the
  // latest closure without re-subscribing (same pattern as saveData).
  const selectAnswerRef = useRef(null);
  const toggleMarkRef = useRef(null);

  useEffect(() => {
    selectAnswerRef.current = selectAnswer;
    toggleMarkRef.current = toggleMark;
  });

  useEffect(() => {
    if (isReviewMode) {
      return undefined;
    }

    function handleKeyDown(event) {
      const target = event.target;

      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }

      const active =
        activeQuestionRef.current;

      if (active == null) {
        return;
      }

      if (
        event.key >= "1" &&
        event.key <= "4"
      ) {
        event.preventDefault();
        selectAnswerRef.current?.(active, event.key);
      } else if (
        event.key === "m" ||
        event.key === "M"
      ) {
        event.preventDefault();
        toggleMarkRef.current?.(active);
      }
    }

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [isReviewMode]);

  const isActiveExam = isExamMode && !isReviewMode;

  const safeAnswers = answers || {};
  const safeMarked = Array.isArray(marked) ? marked : [];
  const unresolvedList = Array.isArray(unresolved) ? unresolved : [];
  const answeredCount = Object.keys(safeAnswers).length;
  const totalCount = questionNumbers.length;
  const unansweredCount = Math.max(totalCount - answeredCount, 0);
  const progressPct = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0;

  if (!exam) {
    return (
      <section className="page-section">

        <div className="empty-state">

          <div className="empty-icon">
            <Icon name="fileText" size={24} />
          </div>

          <h3>
            {t("exam.notFound")}
          </h3>

          <p>
            {t("exam.notFoundDescription")}
          </p>

          <Link
            to="/folders"
            className="primary-button"
          >
            {t("exam.backToFolders")}
          </Link>

        </div>

      </section>
    );
  }

  return (
    <section className="page-section exam-page-content">

      {isActiveExam ? (
        <div className="focusbar">

          <Link
            to={`/folder/${exam.folderId}`}
            className="focusbar-exit"
            aria-label={t("exam.workspace.exitExam")}
            title={t("exam.workspace.exitExam")}
          >
            <Icon name="arrowBack" size={18} />
          </Link>

          <div className="focusbar-id">

            <span className="mode-badge is-timed">
              <Icon name="timer" size={13} />
              {t("exam.workspace.timedExam")}
            </span>

            <span className="focusbar-name">
              {exam.name}
            </span>

          </div>

          <div
            className="focusbar-count"
            aria-live="polite"
          >

            <strong>
              {answeredCount}
            </strong>

            <span className="focusbar-count-total">
              /{totalCount}
            </span>

            <span className="focusbar-count-label">
              {t("exam.workspace.answered")}
            </span>

          </div>

          <ExamTimer
            formatted={timer.formatted}
            isWarning={timer.isWarning}
            isCritical={timer.isCritical}
            isPulsing={timer.isPulsing}
            totalSeconds={timer.totalSeconds}
            remaining={timer.remaining}
          />

          <button
            type="button"
            className="focusbar-nav"
            onClick={() =>
              setShowNavigator(true)
            }
            aria-label={t("exam.workspace.navigator")}
            title={t("exam.workspace.navigator")}
          >
            <Icon name="grid" size={18} />
            {safeMarked.length > 0 && (
              <span
                className="focusbar-nav-dot"
                aria-hidden="true"
              />
            )}
          </button>

          <button
            type="button"
            className="primary-button focusbar-finish"
            onClick={() =>
              setShowFinishConfirm(true)
            }
          >
            <Icon name="flag" size={16} />
            {t("exam.results.finish")}
          </button>

          <div
            className="focusbar-progress"
            aria-hidden="true"
          >
            <motion.div
              className="focusbar-progress-fill"
              initial={false}
              animate={{
                width: `${progressPct}%`,
              }}
              transition={{
                duration: 0.3,
                ease: "easeOut",
              }}
            />
          </div>

        </div>
      ) : (
      <>
      {isReviewMode && (
        <div className="review-banner">

          <span className="review-banner-chip">
            <Icon name="eye" size={14} />
            {t("exam.workspace.reviewBanner")}
          </span>

          <span className="review-banner-hint">
            {t("exam.workspace.reviewHint")}
          </span>

        </div>
      )}

      <div className="exam-header">

        <div className="exam-header-info">

          <Link
            to={`/folder/${exam.folderId}`}
            className="back-link"
          >
            {t("exam.back")}
          </Link>

          {!isExamMode && (
            <span className="mode-badge is-practice">
              <Icon name="bookOpen" size={13} />
              {t("exam.workspace.practiceSheet")}
            </span>
          )}

          <h1>
            {exam.name}
          </h1>

          <p>
            {exam.questionCount} {t("exam.questionCount")}
          </p>

        </div>

        <div className="exam-header-actions">

          <button
            type="button"
            className="secondary-button exam-note-button"
            onClick={
              scrollToNote
            }
          >
            {t("exam.noteButton")}
          </button>

          {stopwatchOn && (
            <div className="stopwatch-cluster" role="group" aria-label={t("exam.stopwatch.elapsed")}>
              <ExamTimer
                mode="stopwatch"
                formatted={stopwatch.formatted}
              />
              <button
                type="button"
                className="secondary-button btn-icon-only btn-sm"
                onClick={stopwatch.running ? handleStopwatchPause : stopwatch.start}
                aria-label={
                  stopwatch.running
                    ? t("exam.stopwatch.pause")
                    : stopwatch.elapsedMs > 0
                      ? t("exam.stopwatch.resume")
                      : t("exam.stopwatch.start")
                }
                title={
                  stopwatch.running
                    ? t("exam.stopwatch.pause")
                    : stopwatch.elapsedMs > 0
                      ? t("exam.stopwatch.resume")
                      : t("exam.stopwatch.start")
                }
              >
                <Icon name={stopwatch.running ? "pause" : "play"} size={15} />
              </button>
              <button
                type="button"
                className="secondary-button btn-icon-only btn-sm"
                onClick={stopwatch.reset}
                disabled={stopwatch.elapsedMs === 0 && !stopwatch.running}
                aria-label={t("exam.stopwatch.reset")}
                title={t("exam.stopwatch.reset")}
              >
                <Icon name="rotateCcw" size={15} />
              </button>
            </div>
          )}

          {isExamMode && !isReviewMode && (
            <button
              type="button"
              className="primary-button exam-finish-btn"
              onClick={handleFinishExam}
            >
              {t("exam.results.finish")}
            </button>
          )}

          {isReviewMode && (
            <Link
              to={`/exam/${id}/results`}
              className="secondary-button"
            >
              {t("exam.results.title")}
            </Link>
          )}

          <div className="marked-counter">

            <span className="marked-counter-icon">
              <Icon name="star" size={15} />
            </span>

            <strong>
              {marked.length}
            </strong>

            <span>
              {t("exam.markedCount")}
            </span>

          </div>

        </div>

      </div>

      <div className="exam-results-summary">

        <div className="exam-percentage">

          <span>
            {t("exam.percentage")}
          </span>

          <strong>
            {percentage.toFixed(
              1
            )}٪
          </strong>

          <small>
            {negativeMarking
              ? t("exam.withNegative")
              : t("exam.withoutNegative")}
          </small>

        </div>

        <div className="exam-stat correct">

          <strong>
            {stats.correct}
          </strong>

          <span>
            {t("exam.correct")}
          </span>

        </div>

        <div className="exam-stat wrong">

          <strong>
            {stats.wrong}
          </strong>

          <span>
            {t("exam.wrong")}
          </span>

        </div>

        <div className="exam-stat unanswered">

          <strong>
            {stats.unanswered}
          </strong>

          <span>
            {t("exam.unanswered")}
          </span>

        </div>

      </div>
      </>
      )}

      <div className="answer-sheet">

        {visibleQuestionNumbers.map(
          (
            questionNumber,
            visibleIndex
          ) => {

            const questionIndex =
              (currentPage - 1) *
                QUESTIONS_PER_PAGE +
              visibleIndex +
              1;

            const selected =
              answers[
                questionNumber
              ];

            const correctAnswer =
              correctAnswers[
                questionNumber
              ];

            const isMarked =
              marked.includes(
                questionNumber
              );

            const isUnresolved =
              Array.isArray(
                unresolvedList
              ) &&
              unresolvedList.includes(
                questionNumber
              );

            const result =
              results[
                questionNumber
              ];

            return (
              <div
                id={`question-${questionNumber}`}
                key={
                  questionNumber
                }
                style={{
                  "--row-i": Math.min(visibleIndex, 15),
                }}
                onFocus={() => {
                  activeQuestionRef.current =
                    questionNumber;
                }}
                onMouseDown={() => {
                  activeQuestionRef.current =
                    questionNumber;
                }}
                className={`question-row question-enter ${
                  isActiveExam
                    ? "exam-mode-row"
                    : ""
                } ${
                  isReviewMode
                    ? "is-review"
                    : ""
                } ${
                  isMarked
                    ? "question-marked"
                    : ""
                } ${
                  result ===
                  "correct"
                    ? "question-correct"
                    : ""
                } ${
                  result ===
                  "wrong"
                    ? "question-wrong"
                    : ""
                }`}
              >

                <div className="question-number">

                  <span className="question-index">
                    {questionIndex}
                  </span>

                  <span className="question-number-main">
                    {questionNumber}
                  </span>

                </div>

                <div className="question-content">

                  <div className="answer-row">

                    <span className="answer-label">
                      {t("exam.myAnswer")}
                    </span>

                    <div className="answer-options">

                      {choices.map(
                        (choice) => {

                          const isSelected =
                            selected ===
                            choice;

                          const isCorrect =
                            result ===
                              "correct" &&
                            isSelected;

                          const isWrong =
                            result ===
                              "wrong" &&
                            isSelected &&
                            correctAnswer !==
                              choice;

                          // Answer-key colors are revealed ONLY in read-only review
                          // mode (post-completion). During an active exam the key
                          // must stay hidden — options show selection state only.
                          const showCorrectHighlight = isReviewMode && answerKeyData[questionNumber] && String(answerKeyData[questionNumber]) === choice;
                          const showWrongHighlight = isReviewMode && isSelected && answerKeyData[questionNumber] && String(selected) !== String(answerKeyData[questionNumber]);

                          return (
                            <button
                              key={
                                choice
                              }
                              type="button"
                              aria-label={t("exam.a11y.chooseOption", {
                                choice,
                                q: questionNumber,
                              })}
                              aria-pressed={
                                isSelected
                              }
                              className={`answer-choice ${
                                isSelected
                                  ? "selected"
                                  : ""
                              } ${
                                isCorrect || showCorrectHighlight
                                  ? "answer-correct"
                                  : ""
                              } ${
                                isWrong || showWrongHighlight
                                  ? "answer-wrong"
                                  : ""
                              }`}
                              onClick={() =>
                                selectAnswer(
                                  questionNumber,
                                  choice
                                )
                              }
                              disabled={isReviewMode}
                            >
                              {choice}
                            </button>
                          );
                        }
                      )}

                    </div>

                  </div>

                  {!isExamMode && (
                    <div className="correct-answer-row">

                      <span className="correct-answer-label">
                        {t("exam.correctAnswer")}
                      </span>

                      <div className="correct-answer-options">

                        {choices.map(
                          (choice) => {

                            const isCorrect =
                              correctAnswer ===
                              choice;

                            const canSelectCorrect =
                              result ===
                              "wrong";

                            return (
                              <button
                                key={
                                  choice
                                }
                                type="button"
                                disabled={
                                  !canSelectCorrect
                                }
                                aria-label={t("exam.a11y.setCorrectAnswer", {
                                  choice,
                                  q: questionNumber,
                                })}
                                aria-pressed={
                                  isCorrect
                                }
                                className={`correct-answer-choice ${
                                  isCorrect
                                    ? "selected"
                                    : ""
                                }`}
                                onClick={() =>
                                  selectCorrectAnswer(
                                    questionNumber,
                                    choice
                                  )
                                }
                                disabled={isReviewMode}
                              >
                                {choice}
                              </button>
                            );
                          }
                        )}

                      </div>

                    </div>
                  )}

                </div>

                {!isExamMode && (
                  <div className="question-result-actions">

                    <button
                      type="button"
                      className={`result-button result-unresolved ${
                        isUnresolved
                          ? "selected"
                          : ""
                      }`}
                      aria-label={t("exam.a11y.unresolved", {
                        q: questionNumber,
                      })}
                      aria-pressed={
                        isUnresolved
                      }
                      disabled={
                        isReviewMode
                      }
                      onClick={() =>
                        toggleUnresolved(
                          questionNumber
                        )
                      }
                      title={
                        isUnresolved
                          ? t("exam.a11y.removeUnresolved")
                          : t("exam.a11y.unresolved")
                      }
                    >
                      <Icon name="circle" size={15} />
                    </button>

                    <button
                      type="button"
                      className={`result-button result-correct ${
                        result ===
                        "correct"
                          ? "selected"
                          : ""
                      }`}
                      aria-label={t("exam.a11y.markCorrect", {
                        q: questionNumber,
                      })}
                      aria-pressed={
                        result ===
                        "correct"
                      }
                      disabled={
                        !selected ||
                        isReviewMode
                      }
                      onClick={() =>
                        setQuestionResult(
                          questionNumber,
                          "correct"
                        )
                      }
                      title={
                        selected
                          ? t("exam.a11y.correct")
                          : t("exam.a11y.needAnswerFirst")
                      }
                    >
                      <Icon name="check" size={15} />
                    </button>

                    <button
                      type="button"
                      className={`result-button result-wrong ${
                        result ===
                        "wrong"
                          ? "selected"
                          : ""
                      }`}
                      aria-label={t("exam.a11y.markWrong", {
                        q: questionNumber,
                      })}
                      aria-pressed={
                        result ===
                        "wrong"
                      }
                      disabled={
                        !selected ||
                        isReviewMode
                      }
                      onClick={() =>
                        setQuestionResult(
                          questionNumber,
                          "wrong"
                        )
                      }
                      title={
                        selected
                          ? t("exam.a11y.wrong")
                          : t("exam.a11y.needAnswerFirst")
                      }
                    >
                      <Icon name="close" size={15} />
                    </button>

                  </div>
                )}

                <button
                  type="button"
                  aria-label={
                    isMarked
                      ? t("exam.a11y.unmarkQuestion", {
                          q: questionNumber,
                        })
                      : t("exam.a11y.markQuestion", {
                          q: questionNumber,
                        })
                  }
                  aria-pressed={
                    isMarked
                  }
                  className={`mark-button ${
                    isMarked
                      ? "marked"
                      : ""
                  }`}
                  onClick={() =>
                    toggleMark(
                      questionNumber
                    )
                  }
                  disabled={isReviewMode}
                  title={
                    isMarked
                      ? t("exam.a11y.unmarkQuestion", {
                          q: questionNumber,
                        })
                      : t("exam.a11y.markQuestion", {
                          q: questionNumber,
                        })
                  }
                >
                  <Icon
                    name="star"
                    size={16}
                    fill={isMarked ? "currentColor" : "none"}
                  />
                </button>

              </div>
            );
          }
        )}

      </div>

      {totalPages > 1 && (
        <div className="exam-pagination">

          <button
            type="button"
            className="secondary-button"
            disabled={
              currentPage === 1
            }
            onClick={() =>
              setCurrentPage(
                (page) =>
                  Math.max(
                    page - 1,
                    1
                  )
              )
            }
          >
            {t("exam.pagination.previous")}
          </button>

          <span>
            {t("exam.pagination.page")}{" "}
            {currentPage} {t("exam.pagination.of")}{" "}
            {totalPages}
          </span>

          <button
            type="button"
            className="secondary-button"
            disabled={
              currentPage ===
              totalPages
            }
            onClick={() =>
              setCurrentPage(
                (page) =>
                  Math.min(
                    page + 1,
                    totalPages
                  )
              )
            }
          >
            {t("exam.pagination.next")}
          </button>

        </div>
      )}

      <div
        id="exam-note"
        className="exam-note"
      >

        <div className="note-header">

          <span className="note-header-icon" aria-hidden="true">
            <Icon name="notebook" size={17} />
          </span>

          <h2>
            {t("exam.note.title")}
          </h2>

          <span>
            {t("exam.note.description")}
          </span>

        </div>

        <textarea
          value={note}
          onChange={(event) =>
            handleNoteChange(
              event.target.value
            )
          }
          placeholder={t("exam.note.placeholder")}
          disabled={isReviewMode}
        />

      </div>

      <QuestionNavigator
        open={showNavigator}
        onClose={() =>
          setShowNavigator(false)
        }
        questionNumbers={questionNumbers}
        answers={answers}
        marked={marked}
        onJump={jumpToQuestion}
      />

      <Modal
        open={showFinishConfirm}
        onClose={() =>
          setShowFinishConfirm(false)
        }
        title={t("exam.workspace.finishTitle")}
        subtitle={t("exam.results.finishConfirm")}
        size="sm"
      >
        <div className="finish-summary">
          <div className="finish-summary-row">
            <Icon name="checkCircle" size={16} />
            <span>
              {t("exam.workspace.finishSummary", {
                answered: answeredCount,
                total: totalCount,
              })}
            </span>
          </div>
          {unansweredCount > 0 && (
            <div className="finish-summary-row is-warn">
              <Icon name="alertTriangle" size={16} />
              <span>
                {t("exam.workspace.finishUnanswered", {
                  count: unansweredCount,
                })}
              </span>
            </div>
          )}
          {safeMarked.length > 0 && (
            <div className="finish-summary-row is-marked">
              <Icon name="star" size={16} />
              <span>
                {t("exam.workspace.finishMarked", {
                  count: safeMarked.length,
                })}
              </span>
            </div>
          )}
        </div>
        <div className="modal-buttons">
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              setShowFinishConfirm(false)
            }
          >
            {t("exam.workspace.keepGoing")}
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={() => {
              setShowFinishConfirm(false);
              handleFinishExam();
            }}
          >
            <Icon name="flag" size={15} />
            {t("exam.workspace.finishAnyway")}
          </button>
        </div>
      </Modal>

    </section>
  );
}

export default Exam;