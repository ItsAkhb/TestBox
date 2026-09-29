import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildPageList, findLastAnsweredQuestion, QUESTIONS_PER_PAGE } from "./examNav.js";

const HERE = new URL("./", import.meta.url);

async function read(rel) {
  const raw = await readFile(new URL(rel, HERE), "utf8");
  return raw.replace(/\r\n/g, "\n");
}

function range(from, to) {
  const out = [];
  for (let n = from; n <= to; n += 1) out.push(n);
  return out;
}

// =========================================================
// Page navigation (spec #28 — PAGE NAVIGATION)
// =========================================================

test("pages: page size is the exam's existing 100-per-page", () => {
  assert.equal(QUESTIONS_PER_PAGE, 100);
});

test("pages: empty exam yields no pages", () => {
  assert.deepEqual(buildPageList([]), []);
  assert.deepEqual(buildPageList(undefined), []);
});

test("pages: exact multiple of page size yields exact page count", () => {
  const qs = range(1, 200);
  const pages = buildPageList(qs);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[0], { page: 1, from: 1, to: 100 });
  assert.deepEqual(pages[1], { page: 2, from: 101, to: 200 });
});

test("pages: final partial page reports its true range", () => {
  const pages = buildPageList(range(1, 250));
  assert.equal(pages.length, 3);
  assert.deepEqual(pages[2], { page: 3, from: 201, to: 250 });
});

test("pages: single page exam", () => {
  const pages = buildPageList(range(1, 42));
  assert.equal(pages.length, 1);
  assert.deepEqual(pages[0], { page: 1, from: 1, to: 42 });
});

test("pages: custom numbering ranges come from the actual numbers", () => {
  const qs = [5, 10, 15, 20, 25];
  const pages = buildPageList(qs, 2);
  assert.equal(pages.length, 3);
  assert.deepEqual(pages[0], { page: 1, from: 5, to: 10 });
  assert.deepEqual(pages[2], { page: 3, from: 25, to: 25 });
});

test("pages: large exams stay efficient (metadata only, no per-question records)", () => {
  for (const [count, expected] of [
    [100, 1],
    [500, 5],
    [1000, 10],
    [5000, 50],
    [5001, 51],
  ]) {
    const qs = range(1, count);
    const pages = buildPageList(qs);
    assert.equal(pages.length, expected, `${count} questions -> ${expected} pages`);
    // Only page metadata: each record has exactly the three fields.
    for (const p of pages) {
      assert.deepEqual(Object.keys(p).sort(), ["from", "page", "to"]);
    }
  }
});

test("pages: selecting a page targets its first question (same math as the exam)", () => {
  const qs = range(1, 3000);
  const pages = buildPageList(qs);
  // jumpToQuestion computes targetPage = floor(index / 100) + 1 — a
  // card's `from` must live exactly at the start of its page.
  for (const p of pages) {
    const index = qs.indexOf(p.from);
    assert.equal(Math.floor(index / QUESTIONS_PER_PAGE) + 1, p.page);
  }
});

// =========================================================
// Last answered question (spec #28 — LAST ANSWERED)
// =========================================================

test("last-answered: no answers record -> null", () => {
  assert.equal(findLastAnsweredQuestion(undefined), null);
  assert.equal(findLastAnsweredQuestion(null), null);
  assert.equal(findLastAnsweredQuestion("not-an-object"), null);
});

test("last-answered: all blank / unanswered -> null", () => {
  assert.equal(findLastAnsweredQuestion({}), null);
  assert.equal(findLastAnsweredQuestion({ 1: "", 2: null, 3: undefined }), null);
});

test("last-answered: single answered question", () => {
  assert.equal(findLastAnsweredQuestion({ 7: "2" }), 7);
});

test("last-answered: gaps select the highest answered, not the latest opened", () => {
  // spec example: 1✓ 2✓ 3✗ 4✓ 5✗ -> 4
  assert.equal(
    findLastAnsweredQuestion({ 1: "1", 2: "3", 4: "2" }),
    4
  );
});

test("last-answered: multiple with trailing gap", () => {
  assert.equal(
    findLastAnsweredQuestion({ 10: "1", 20: "4", 30: "", 40: "2" }),
    40
  );
});

test("last-answered: every choice value counts as answered (1-4)", () => {
  for (const choice of ["1", "2", "3", "4"]) {
    assert.equal(findLastAnsweredQuestion({ 3: choice, 5: "" }), 3);
  }
});

test("last-answered: never mutates the persisted answers record", () => {
  const answers = { 1: "1", 2: "", 3: "4" };
  const frozen = Object.freeze({ ...answers });
  const snapshot = JSON.stringify(answers);
  assert.equal(findLastAnsweredQuestion(frozen), 3);
  assert.equal(JSON.stringify(answers), snapshot);
});

test("last-answered: ignores junk keys (non-numeric, whitespace)", () => {
  assert.equal(findLastAnsweredQuestion({ note: "1", "": "2" }), null);
  assert.equal(findLastAnsweredQuestion({ note: "1", 4: "2" }), 4);
});

// =========================================================
// Integration wiring (source-level; shared by Web/Windows/Android)
// =========================================================

test("pages: Exam.jsx reuses the shared page size and opens the Pages modal from the focus bar", async () => {
  const exam = await read("../pages/Exam.jsx");
  assert.ok(
    !exam.includes("const QUESTIONS_PER_PAGE"),
    "Exam.jsx must not define its own page size (single source: examNav)"
  );
  assert.ok(
    exam.includes('import { QUESTIONS_PER_PAGE } from "../services/examNav"'),
    "shared page size imported"
  );
  assert.ok(
    exam.includes('import PagesNavigator from "../components/exam/PagesNavigator"'),
    "Pages navigator wired"
  );
  assert.ok(
    exam.includes("onClick={() => setShowPages(true)}"),
    "focus bar button opens the Pages modal"
  );
  assert.ok(
    exam.includes('aria-label={t("exam.pages.title")}'),
    "Pages button is labelled for assistive tech"
  );
  assert.ok(
    exam.includes("setShowPages(false);\n    setCurrentQuestion(questionNumber);"),
    "page jumps route through the existing jumpToQuestion (closes both modals)"
  );
  assert.ok(
    exam.includes("onJump={jumpToQuestion}"),
    "PagesNavigator delegates to the exam's own jump"
  );
});

test("pages: PagesNavigator renders cards only (no per-question list) and marks the current page", async () => {
  const pages = await read("../components/exam/PagesNavigator.jsx");
  assert.ok(
    pages.includes("buildPageList(questionNumbers)"),
    "cards built from shared page metadata"
  );
  assert.ok(
    pages.includes("onJump(entry.from)"),
    "card click jumps to the page's first question"
  );
  assert.ok(
    pages.includes("aria-current={isCurrent ? \"page\" : undefined}"),
    "current page exposed to assistive tech"
  );
  assert.ok(
    pages.includes('className={`page-card${isCurrent ? " is-current" : ""}`}'),
    "current page visually identifiable"
  );
});

test("last-answered: Folder card reads persisted answers and deep-links the jump", async () => {
  const folder = await read("../pages/Folder.jsx");
  assert.ok(
    folder.includes("findLastAnsweredQuestion(getExamData(exam.id)?.answers)"),
    "based on the existing persisted answers, not 'last opened'"
  );
  assert.ok(
    folder.includes("`/exam/${exam.id}?question=${lastAnswered}`"),
    "jump uses the existing ?question= deep link (same as Tags/Results)"
  );
  assert.ok(
    folder.includes('disabled={lastAnswered === null}'),
    "graceful disabled state when nothing is answered"
  );
  assert.ok(
    folder.includes('t("exam.lastAnswered.none")'),
    "empty state has an accessible explanation"
  );
});

test("pages: i18n keys exist in both Persian and English", async () => {
  const source = await read("../i18n/translations.js");
  const faStart = source.indexOf("fa: {");
  const enStart = source.indexOf("en: {");
  assert.ok(faStart >= 0 && enStart > faStart);
  const faBlock = source.slice(faStart, enStart);
  const enBlock = source.slice(enStart);

  for (const key of [
    "exam.pages.title",
    "exam.pages.hint",
    "exam.pages.page",
    "exam.pages.range",
    "exam.pages.current",
    "exam.pages.go",
    "exam.pages.empty",
    "exam.lastAnswered",
    "exam.lastAnswered.none",
  ]) {
    assert.ok(faBlock.includes(`"${key}"`), `missing fa key: ${key}`);
    assert.ok(enBlock.includes(`"${key}"`), `missing en key: ${key}`);
  }
});

// =========================================================
// Practice / Exercise (Beta 4 — both content types, §17 matrix)
// =========================================================

test("practice: §17 matrix — 1 q, one full page, multi full, partial final, large set", () => {
  // 1 question
  assert.deepEqual(buildPageList(range(1, 1)), [{ page: 1, from: 1, to: 1 }]);
  // exactly one full page
  assert.deepEqual(buildPageList(range(1, 100)), [{ page: 1, from: 1, to: 100 }]);
  // multiple full pages
  const full = buildPageList(range(1, 300));
  assert.equal(full.length, 3);
  assert.deepEqual(full[2], { page: 3, from: 201, to: 300 });
  // partial final page — no empty trailing page, no nonexistent questions
  const partial = buildPageList(range(1, 125));
  assert.equal(partial.length, 2);
  assert.deepEqual(partial[1], { page: 2, from: 101, to: 125 });
  // large practice set
  const large = buildPageList(range(1, 5000));
  assert.equal(large.length, 50);
  assert.deepEqual(large[0], { page: 1, from: 1, to: 100 });
  assert.deepEqual(large[49], { page: 50, from: 4901, to: 5000 });
  // page count is always ceil(n / pageSize), for every structural size
  for (const n of [1, 99, 100, 101, 500, 1000, 5000, 5001]) {
    assert.equal(
      buildPageList(range(1, n)).length,
      Math.ceil(n / QUESTIONS_PER_PAGE),
      `ceil(${n}/100)`
    );
  }
  // selecting a page targets its first question (identity used by jumpToQuestion)
  const nums = range(1, 5000);
  for (const p of large) {
    assert.equal(
      Math.floor(nums.indexOf(p.from) / QUESTIONS_PER_PAGE) + 1,
      p.page
    );
  }
});

test("practice: Pages entry lives in the shared pagination footer (un-gated by mode)", async () => {
  const exam = await read("../pages/Exam.jsx");
  const footStart = exam.indexOf('<div className="exam-pagination">');
  assert.ok(footStart > -1, "shared pagination footer exists");
  const footEnd = exam.indexOf('id="exam-note"', footStart);
  assert.ok(footEnd > footStart, "footer located");
  const foot = exam.slice(footStart, footEnd);
  assert.ok(foot.includes("exam-pagination-pages"), "footer Pages button present");
  assert.ok(foot.includes("setShowPages(true)"), "footer button opens the Pages modal");
  assert.ok(
    foot.includes('aria-haspopup="dialog"') && foot.includes("aria-expanded={showPages}"),
    "footer button announced as a dialog trigger"
  );
  assert.ok(
    !/isActiveExam|isExamMode|isReviewMode/.test(foot),
    "footer is not gated by exam/practice/review mode"
  );
  const gate = exam.slice(Math.max(0, footStart - 200), footStart);
  assert.ok(gate.includes("totalPages > 1"), "gated only by having multiple pages");
  // practice renders inside the same workspace
  assert.ok(exam.includes("mode-badge is-practice"), "practice badge in same workspace");
  // focusbar keeps its own entry for exams — exactly two call sites
  assert.equal(
    (exam.match(/setShowPages\(true\)/g) || []).length,
    2,
    "focusbar + footer entry points"
  );
});

test("practice: page slices are computed without mode gates (shared model)", async () => {
  const exam = await read("../pages/Exam.jsx");
  const start = exam.indexOf("const totalPages =");
  assert.ok(start > -1, "totalPages memo present");
  const end = exam.indexOf("useEffect", start);
  const block = exam.slice(start, end);
  assert.ok(block.includes("QUESTIONS_PER_PAGE"), "slices use the shared page size");
  assert.ok(
    block.includes("visibleQuestionNumbers"),
    "same visible slice feeds exam and practice rows"
  );
  assert.ok(
    !/isActiveExam|isExamMode|isReviewMode/.test(block),
    "slice math has no mode condition"
  );
});

test("practice: jump moves only current question/page — no answer/note/timer state", async () => {
  const exam = await read("../pages/Exam.jsx");
  const start = exam.indexOf("function jumpToQuestion");
  assert.ok(start > -1, "jumpToQuestion present");
  const end = exam.indexOf("// Keyboard answering:", start);
  assert.ok(end > start, "jump body located via stable marker");
  const body = exam.slice(start, end);
  for (const call of [
    "setShowNavigator(false)",
    "setShowPages(false)",
    "setCurrentQuestion(questionNumber)",
    "setCurrentPage(targetPage)",
  ]) {
    assert.ok(body.includes(call), `jump performs ${call}`);
  }
  for (const forbidden of [
    "setAnswers",
    "setNote(",
    "setResults",
    "setUnresolved",
    "setTimer",
    "handleNoteChange",
    "answers[",
    "unresolvedList",
    "results[",
  ]) {
    assert.ok(!body.includes(forbidden), `jump must not touch ${forbidden}`);
  }
});

test("practice: prev/next footer navigation unchanged; modal rendered outside mode ternaries", async () => {
  const exam = await read("../pages/Exam.jsx");
  assert.ok(exam.includes('t("exam.pagination.previous")'), "previous button intact");
  assert.ok(exam.includes('t("exam.pagination.next")'), "next button intact");
  assert.equal(
    (exam.match(/setCurrentPage\(\s*\(page\)/g) || []).length,
    2,
    "both footer arrows still step pages"
  );
  const renderAt = exam.indexOf("<PagesNavigator");
  assert.ok(renderAt > -1, "PagesNavigator rendered");
  assert.equal((exam.match(/<PagesNavigator/g) || []).length, 1, "single modal instance");
  assert.ok(
    renderAt > exam.indexOf('id="exam-note"'),
    "modal rendered at root level (outside focusbar/header ternaries)"
  );
});
