import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Link,
  useLocation,
  useParams,
} from "react-router-dom";

import {
  getExams,
  getExamData,
  saveExamData,
} from "../services/dataService";

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
  negativeMarking
) {
  if (!totalQuestions) {
    return 0;
  }

  const score = negativeMarking
    ? correct * 3 - wrong
    : correct;

  const maxScore = negativeMarking
    ? totalQuestions * 3
    : totalQuestions;

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

  const [exam] =
    useState(() =>
      getInitialExam(id)
    );

  const [examData, setExamData] =
    useState(() =>
      getExamData(id)
    );

  const [
    currentPage,
    setCurrentPage,
  ] = useState(1);

  const {
    answers,
    correctAnswers,
    marked,
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

    return calculatePercentage(
      stats.correct,
      stats.wrong,
      exam.questionCount || 0,
      negativeMarking
    );
  }, [
    exam,
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
    results:
      newResults = results,
    note:
      newNote = note,
  } = {}) {
    const newData = {
      answers:
        newAnswers,

      correctAnswers:
        newCorrectAnswers,

      marked:
        newMarked,

      results:
        newResults,

      note:
        newNote,
    };

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

  function selectAnswer(
    questionNumber,
    answer
  ) {
    const currentAnswer =
      answers[
        questionNumber
      ];

    const updatedAnswers = {
      ...answers,
    };

    const updatedResults = {
      ...results,
    };

    const updatedCorrectAnswers =
      {
        ...correctAnswers,
      };

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
      });

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
    });
  }

  function selectCorrectAnswer(
    questionNumber,
    answer
  ) {
    const result =
      results[
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
        ...correctAnswers,
      };

    const currentCorrectAnswer =
      correctAnswers[
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
    const isMarked =
      marked.includes(
        questionNumber
      );

    const updatedMarked =
      isMarked
        ? marked.filter(
            (number) =>
              number !==
              questionNumber
          )
        : [
            ...marked,
            questionNumber,
          ];

    saveData({
      marked:
        updatedMarked,
    });
  }

  function setQuestionResult(
    questionNumber,
    result
  ) {
    const selectedAnswer =
      answers[
        questionNumber
      ];

    // بدون پاسخ، درست/غلط قابل تعیین نیست.
    if (!selectedAnswer) {
      return;
    }

    const currentResult =
      results[
        questionNumber
      ];

    const updatedResults = {
      ...results,
    };

    const updatedCorrectAnswers =
      {
        ...correctAnswers,
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

  if (!exam) {
    return (
      <section className="page-section">

        <div className="empty-state">

          <div className="empty-icon">
            📝
          </div>

          <h3>
            آزمون پیدا نشد
          </h3>

          <p>
            ممکن است این آزمون حذف شده باشد.
          </p>

          <Link
            to="/folders"
            className="primary-button"
          >
            ← بازگشت به فولدرها
          </Link>

        </div>

      </section>
    );
  }

  return (
    <section className="page-section exam-page-content">

      <div className="exam-header">

        <div className="exam-header-info">

          <Link
            to={`/folder/${exam.folderId}`}
            className="back-link"
          >
            ← بازگشت به فولدر
          </Link>

          <h1>
            {exam.name}
          </h1>

          <p>
            {exam.questionCount} تست
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
            ↓ یادداشت آزمون
          </button>

          <div className="marked-counter">

            <span>
              ⭐
            </span>

            <strong>
              {marked.length}
            </strong>

            <span>
              مارک‌شده
            </span>

          </div>

        </div>

      </div>

      <div className="exam-results-summary">

        <div className="exam-percentage">

          <span>
            درصد
          </span>

          <strong>
            {percentage.toFixed(
              1
            )}٪
          </strong>

          <small>
            {negativeMarking
              ? "با نمره منفی"
              : "بدون نمره منفی"}
          </small>

        </div>

        <div className="exam-stat correct">

          <strong>
            {stats.correct}
          </strong>

          <span>
            درست
          </span>

        </div>

        <div className="exam-stat wrong">

          <strong>
            {stats.wrong}
          </strong>

          <span>
            غلط
          </span>

        </div>

        <div className="exam-stat unanswered">

          <strong>
            {stats.unanswered}
          </strong>

          <span>
            نزده
          </span>

        </div>

      </div>

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
                className={`question-row ${
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
                      پاسخ من
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

                          return (
                            <button
                              key={
                                choice
                              }
                              type="button"
                              aria-label={`گزینه ${choice} برای تست ${questionNumber}`}
                              aria-pressed={
                                isSelected
                              }
                              className={`answer-choice ${
                                isSelected
                                  ? "selected"
                                  : ""
                              } ${
                                isCorrect
                                  ? "answer-correct"
                                  : ""
                              } ${
                                isWrong
                                  ? "answer-wrong"
                                  : ""
                              }`}
                              onClick={() =>
                                selectAnswer(
                                  questionNumber,
                                  choice
                                )
                              }
                            >
                              {choice}
                            </button>
                          );
                        }
                      )}

                    </div>

                  </div>

                  <div className="correct-answer-row">

                    <span className="correct-answer-label">
                      پاسخ صحیح
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
                              aria-label={`ثبت گزینه ${choice} به عنوان پاسخ صحیح تست ${questionNumber}`}
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
                            >
                              {choice}
                            </button>
                          );
                        }
                      )}

                    </div>

                  </div>

                </div>

                <div className="question-result-actions">

                  <button
                    type="button"
                    className={`result-button result-correct ${
                      result ===
                      "correct"
                        ? "selected"
                        : ""
                    }`}
                    aria-label={`درست بودن تست ${questionNumber}`}
                    aria-pressed={
                      result ===
                      "correct"
                    }
                    disabled={
                      !selected
                    }
                    onClick={() =>
                      setQuestionResult(
                        questionNumber,
                        "correct"
                      )
                    }
                    title={
                      selected
                        ? "درست"
                        : "ابتدا یک گزینه را انتخاب کن"
                    }
                  >
                    ✓
                  </button>

                  <button
                    type="button"
                    className={`result-button result-wrong ${
                      result ===
                      "wrong"
                        ? "selected"
                        : ""
                    }`}
                    aria-label={`غلط بودن تست ${questionNumber}`}
                    aria-pressed={
                      result ===
                      "wrong"
                    }
                    disabled={
                      !selected
                    }
                    onClick={() =>
                      setQuestionResult(
                        questionNumber,
                        "wrong"
                      )
                    }
                    title={
                      selected
                        ? "غلط"
                        : "ابتدا یک گزینه را انتخاب کن"
                    }
                  >
                    ✕
                  </button>

                </div>

                <button
                  type="button"
                  aria-label={
                    isMarked
                      ? `برداشتن مارک تست ${questionNumber}`
                      : `مارک کردن تست ${questionNumber}`
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
                  title={
                    isMarked
                      ? "برداشتن علامت"
                      : "علامت‌گذاری"
                  }
                >
                  {isMarked
                    ? "★"
                    : "☆"}
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
            ← قبلی
          </button>

          <span>
            صفحه{" "}
            {currentPage} از{" "}
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
            بعدی →
          </button>

        </div>
      )}

      <div
        id="exam-note"
        className="exam-note"
      >

        <div className="note-header">

          <h2>
            📝 یادداشت آزمون
          </h2>

          <span>
            این یادداشت فقط مربوط به همین آزمون است.
          </span>

        </div>

        <textarea
          value={note}
          onChange={(event) =>
            handleNoteChange(
              event.target.value
            )
          }
          placeholder="یادداشت‌های مربوط به این آزمون..."
        />

      </div>

    </section>
  );
}

export default Exam;