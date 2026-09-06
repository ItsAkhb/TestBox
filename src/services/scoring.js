// =========================================================
// Scoring
//
// Two distinct concepts:
//   - exam question count (authoritative, from the exam object)
//   - answer-key coverage (how many questions currently have a key entry)
//
// The total is NEVER derived from the answer key. Questions without a key
// entry are reported as "ungraded" — never silently correct, wrong, or
// dropped from the total.
// =========================================================

// Authoritative question-number list for an exam (custom-numbering aware)
export function getQuestionNumbers(exam) {
  if (!exam) return [];

  const count = Number(exam.questionCount || 0);
  if (!Number.isInteger(count) || count < 1) return [];

  const start = exam.customNumbering
    ? Number(exam.startNumber)
    : 1;

  const step =
    exam.customNumbering && exam.useStep
      ? Number(exam.step)
      : 1;

  if (!Number.isInteger(start) || !Number.isInteger(step) || step < 1) {
    return [];
  }

  return Array.from({ length: count }, (_, index) => start + index * step);
}

// Question numbers described by the exam form's raw inputs (custom-numbering
// aware). Single source of truth for the answer-key editor and the save
// path — custom mode derives from start/end/step, so the editor can never
// fall back to the (hidden, empty) count input. Empty or invalid input
// yields [] (never 1..N guesses, never a phantom question 0 — Number("")
// coerces to 0, so blanks are rejected explicitly). Mirrors
// getQuestionNumbers for saved exams: length === floor((end - start) /
// step) + 1, which is the count persisted as exam.questionCount.
export function computeFormQuestionNumbers({ customNumbering, questionCount, startNumber, endNumber, useStep, step }) {
  const toInt = (v) => (String(v ?? "").trim() === "" ? NaN : Number(v));
  if (!customNumbering) {
    const count = toInt(questionCount);
    if (!Number.isInteger(count) || count < 1) return [];
    return Array.from({ length: count }, (_, i) => i + 1);
  }
  const start = toInt(startNumber);
  const end = toInt(endNumber);
  const s = useStep ? toInt(step) : 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return [];
  if (!Number.isInteger(s) || s < 1) return [];
  const numbers = [];
  for (let n = start; n <= end; n += s) numbers.push(n);
  return numbers;
}

/**
 * Score an exam against its answer key.
 *
 * options.questionNumbers: authoritative list of ALL exam question numbers.
 *                          Falls back to key-covered questions only when not
 *                          provided (legacy callers) — prefer passing it.
 * options.results: persisted per-question results (from the finish flow).
 *                  A question with result "unresolved" is reported as
 *                  unresolved — worked-on but scored as unanswered (it has
 *                  no answer, so accuracy is unaffected).
 *
 * Result shape:
 *   totalQuestions — full exam size
 *   graded         — questions with a key entry (correct+wrong+unanswered+unresolved)
 *   ungraded       — questions without a key entry (totalQuestions - graded)
 *   correct/wrong/unanswered/unresolved — graded questions only
 *   percentage     — computed over totalQuestions (the whole exam)
 *   details        — per-question: correct | wrong | unanswered | unresolved | ungraded
 */
export function autoScore(answers, answerKey, negativeMarking = true, options = {}) {
  const allNumbers =
    Array.isArray(options.questionNumbers) && options.questionNumbers.length > 0
      ? options.questionNumbers
      : Object.keys(answerKey).map(Number).sort((a, b) => a - b);

  const persistedResults =
    options.results && typeof options.results === "object" ? options.results : null;

  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  let unresolved = 0;
  let ungraded = 0;

  const details = {};

  for (const qNum of allNumbers) {
    const userAnswer = answers[qNum];
    const correctAnswer = answerKey[qNum];

    // No key entry → cannot grade; never guess
    if (correctAnswer == null || correctAnswer === "") {
      ungraded += 1;
      details[qNum] = "ungraded";
      continue;
    }

    if (!userAnswer) {
      if (persistedResults && persistedResults[qNum] === "unresolved") {
        unresolved += 1;
        details[qNum] = "unresolved";
      } else {
        unanswered += 1;
        details[qNum] = "unanswered";
      }
    } else if (String(userAnswer) === String(correctAnswer)) {
      correct += 1;
      details[qNum] = "correct";
    } else {
      wrong += 1;
      details[qNum] = "wrong";
    }
  }

  const totalQuestions = allNumbers.length;
  const graded = correct + wrong + unanswered + unresolved;

  const percentage = calculatePercentage(
    correct,
    wrong,
    totalQuestions,
    negativeMarking
  );

  return {
    correct,
    wrong,
    unanswered,
    unresolved,
    ungraded,
    graded,
    totalQuestions,
    percentage,
    details,
  };
}

export function calculatePercentage(correct, wrong, totalQuestions, negativeMarking = true) {
  if (!totalQuestions) return 0;

  const score = negativeMarking ? correct * 3 - wrong : correct;
  const maxScore = negativeMarking ? totalQuestions * 3 : totalQuestions;

  return Math.max(0, Math.round((score / maxScore) * 100 * 10) / 10);
}

export function calculateStats(results) {
  let correct = 0;
  let wrong = 0;

  Object.values(results).forEach((result) => {
    if (result === "correct") correct++;
    if (result === "wrong") wrong++;
  });

  return { correct, wrong };
}

export function getGrade(percentage) {
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B+";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C";
  if (percentage >= 40) return "D";
  return "F";
}
