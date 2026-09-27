// Pure exam page-navigation helpers, shared by Exam.jsx (Pages
// navigator, jump math) and Folder.jsx (last-answered entry).
// Single pagination source: Exam renders QUESTIONS_PER_PAGE rows per
// page — buildPageList describes exactly that slicing (no second
// pagination system, no hardcoded ranges).

export const QUESTIONS_PER_PAGE = 100;

/**
 * Page metadata for the Pages navigator: one small record per page
 * ({ page, from, to }) from the existing question-number ordering.
 * Custom numbering and a partial final page fall out naturally because
 * ranges come from the numbers array itself. Never renders per-question
 * data — a 5000-question exam yields 50 records.
 */
export function buildPageList(questionNumbers, pageSize = QUESTIONS_PER_PAGE) {
  const numbers = Array.isArray(questionNumbers) ? questionNumbers : [];
  if (numbers.length === 0) return [];

  const pageCount = Math.ceil(numbers.length / pageSize);
  const pages = [];
  for (let page = 1; page <= pageCount; page += 1) {
    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, numbers.length);
    pages.push({
      page,
      from: numbers[start],
      to: numbers[end - 1],
    });
  }
  return pages;
}

/**
 * Highest question number the user has actually answered, per the same
 * "answered" definition QuestionNavigator uses (non-null, non-empty
 * choice). Returns null when nothing is answered so callers can show a
 * disabled state instead of navigating to a random question.
 * Read-only: never mutates the answers record.
 */
export function findLastAnsweredQuestion(answers) {
  if (!answers || typeof answers !== "object") return null;

  let best = null;
  for (const key of Object.keys(answers)) {
    if (key.trim() === "") continue;
    const value = answers[key];
    if (value == null || value === "") continue;
    const number = Number(key);
    if (!Number.isInteger(number)) continue;
    if (best === null || number > best) best = number;
  }
  return best;
}
