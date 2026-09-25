import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function loadScoring() {
  const source = (await readFile(new URL("./scoring.js", import.meta.url), "utf8"))
    .replace(/^import[\s\S]*?from ["'][^"']+["'];/gm, "")
    .replace(/export /g, "");
  const context = vm.createContext({});
  vm.runInContext(source, context);
  return context;
}

test("scoring: question count never comes from the answer key alone", async () => {
  const { autoScore, getQuestionNumbers } = await loadScoring();
  const exam = { questionCount: 5, customNumbering: false };
  const numbers = [...getQuestionNumbers(exam)];
  assert.deepEqual(numbers, [1, 2, 3, 4, 5]);

  // Key covers only 2 questions — total stays 5, rest are ungraded.
  const result = autoScore(
    { 1: "1", 2: "2" },
    { 1: "1", 2: "3" },
    true,
    { questionNumbers: numbers }
  );
  assert.equal(result.totalQuestions, 5);
  assert.equal(result.graded, 2);
  assert.equal(result.ungraded, 3);
  assert.equal(result.correct, 1);
  assert.equal(result.wrong, 1);
});

test("scoring: unresolved is reported distinctly from unanswered", async () => {
  const { autoScore } = await loadScoring();
  const numbers = [1, 2, 3];
  const result = autoScore(
    { 1: "1" },
    { 1: "1", 2: "2", 3: "3" },
    true,
    {
      questionNumbers: numbers,
      results: { 2: "unresolved" },
    }
  );
  assert.equal(result.correct, 1);
  assert.equal(result.unresolved, 1);
  assert.equal(result.unanswered, 1);
  assert.equal(result.details[2], "unresolved");
  assert.equal(result.details[3], "unanswered");
});

test("scoring: unresolved list without result markers still counts (reload before finish)", async () => {
  const { autoScore } = await loadScoring();
  const numbers = [1, 2, 3, 4];
  const result = autoScore(
    { 1: "1" },
    { 1: "1", 2: "2", 3: "3", 4: "4" },
    true,
    {
      questionNumbers: numbers,
      results: {},
      unresolved: [2],
    }
  );
  assert.equal(result.correct, 1);
  assert.equal(result.unresolved, 1);
  assert.equal(result.unanswered, 2);
  assert.equal(result.totalQuestions, 4);
  assert.equal(
    result.correct + result.wrong + result.unanswered + result.unresolved + result.ungraded,
    4
  );
});

test("scoring: all-unresolved stays in total and denominator", async () => {
  const { autoScore, calculatePercentage } = await loadScoring();
  const numbers = [1, 2, 3];
  const result = autoScore(
    {},
    { 1: "1", 2: "2", 3: "3" },
    true,
    {
      questionNumbers: numbers,
      unresolved: numbers,
    }
  );
  assert.equal(result.totalQuestions, 3);
  assert.equal(result.unresolved, 3);
  assert.equal(result.correct, 0);
  assert.equal(result.wrong, 0);
  assert.equal(result.unanswered, 0);
  assert.equal(result.percentage, 0);
  assert.equal(result.percentage, calculatePercentage(0, 0, 3, true));
});

test("scoring: keyless unresolved is unresolved, not ungraded-only", async () => {
  const { autoScore } = await loadScoring();
  // q1: key + no answer → unanswered
  // q2: no key + unresolved → unresolved (not ungraded)
  // q3: no key + no answer + not unresolved → ungraded
  const numbers = [1, 2, 3];
  const result = autoScore(
    {},
    { 1: "1" },
    true,
    {
      questionNumbers: numbers,
      results: {},
      unresolved: [2],
    }
  );
  assert.equal(result.unanswered, 1);
  assert.equal(result.unresolved, 1);
  assert.equal(result.ungraded, 1);
  assert.equal(result.totalQuestions, 3);
  assert.equal(
    result.correct + result.wrong + result.unanswered + result.unresolved + result.ungraded,
    3
  );
});

test("scoring: negative marking — 3 wrong cancel 1 correct boundary", async () => {
  const { autoScore, calculatePercentage } = await loadScoring();
  const numbers = [1, 2, 3, 4];
  // 1 correct, 3 wrong → score = 3 - 3 = 0
  const result = autoScore(
    { 1: "1", 2: "9", 3: "9", 4: "9" },
    { 1: "1", 2: "2", 3: "3", 4: "4" },
    true,
    { questionNumbers: numbers }
  );
  assert.equal(result.correct, 1);
  assert.equal(result.wrong, 3);
  assert.equal(result.percentage, 0);
  assert.equal(calculatePercentage(1, 3, 4, true), 0);
  // 0 correct, 1 wrong → clamped to 0 (never negative)
  assert.equal(calculatePercentage(0, 1, 4, true), 0);
  // all correct → 100
  assert.equal(calculatePercentage(4, 0, 4, true), 100);
});

test("scoring: zero total / zero division returns 0", async () => {
  const { autoScore, calculatePercentage, scoreManualResults } = await loadScoring();
  const empty = autoScore({}, {}, true, { questionNumbers: [] });
  assert.equal(empty.totalQuestions, 0);
  assert.equal(empty.percentage, 0);
  assert.equal(calculatePercentage(0, 0, 0, true), 0);
  assert.equal(calculatePercentage(0, 0, 0, false), 0);
  const manualEmpty = scoreManualResults({}, [], [], true);
  assert.equal(manualEmpty.totalQuestions, 0);
  assert.equal(manualEmpty.percentage, 0);
});

test("scoring: more wrong than correct stays non-negative percentage", async () => {
  const { calculatePercentage } = await loadScoring();
  assert.equal(calculatePercentage(1, 5, 10, true), 0);
  assert.equal(calculatePercentage(2, 5, 10, false), 20);
});

test("scoring: practice denominator includes unresolved (correct+wrong+unresolved)", async () => {
  const { calculatePercentage, calculateStats } = await loadScoring();
  // 2 correct, 0 wrong, 2 unresolved, 6 untouched out of 10
  const stats = calculateStats(
    { 1: "correct", 2: "correct" },
    10,
    [3, 4]
  );
  assert.equal(stats.correct, 2);
  assert.equal(stats.wrong, 0);
  assert.equal(stats.unresolved, 2);
  assert.equal(stats.unanswered, 6);
  const resulted = stats.correct + stats.wrong + stats.unresolved;
  assert.equal(resulted, 4);
  // 2/4 with no negative → 50 (unresolved in denominator)
  assert.equal(calculatePercentage(2, 0, 10, false, resulted), 50);
  // wrong denominator (old bug: correct+wrong only) would show 100
  assert.notEqual(calculatePercentage(2, 0, 10, false, stats.correct + stats.wrong), 50);
});

test("scoring: exam mode denominator is always full total", async () => {
  const { calculatePercentage } = await loadScoring();
  // unresolved/unanswered never leave the exam denominator
  assert.equal(calculatePercentage(1, 0, 5, false, 5), 20);
  assert.equal(calculatePercentage(1, 0, 5, true, 5), 20);
});

test("scoring: calculateStats mutual exclusivity — total = c+w+unanswered+unresolved(+ungraded)", async () => {
  const { calculateStats } = await loadScoring();
  const cases = [
    // results, total, unresolvedList
    [{ 1: "correct", 2: "wrong", 3: "unresolved" }, 5, [3]],
    [{}, 4, [1, 2, 3, 4]],
    [{ 1: "correct", 2: "correct", 3: "correct", 4: "correct" }, 4, []],
    [{ 1: "wrong", 2: "wrong", 3: "wrong" }, 3, []],
    [{ 1: "correct", 2: "ungraded", 3: "unresolved" }, 5, [3]],
    [{ 1: "unresolved" }, 1, [1]],
    [{}, 0, []],
    [null, 3, null],
  ];
  for (const [results, total, unresolvedList] of cases) {
    const s = calculateStats(results || {}, total, unresolvedList || []);
    const sum = s.correct + s.wrong + s.unanswered + s.unresolved + s.ungraded;
    assert.equal(sum, total, `sum=${sum} total=${total}`);
    assert.ok(s.unanswered >= 0);
    assert.ok(s.unresolved >= 0);
  }
});

test("scoring: results marker and list do not double-count unresolved", async () => {
  const { calculateStats, autoScore } = await loadScoring();
  const stats = calculateStats({ 2: "unresolved" }, 3, [2]);
  assert.equal(stats.unresolved, 1);
  const scored = autoScore({}, { 1: "1", 2: "2", 3: "3" }, true, {
    questionNumbers: [1, 2, 3],
    results: { 2: "unresolved" },
    unresolved: [2],
  });
  assert.equal(scored.unresolved, 1);
});

test("scoring: scoreManualResults counts unresolved from list or marker", async () => {
  const { scoreManualResults } = await loadScoring();
  const numbers = [1, 2, 3, 4];
  const result = scoreManualResults(
    { 1: "correct", 2: "wrong", 3: "unresolved" },
    [3, 4],
    numbers,
    true
  );
  assert.equal(result.correct, 1);
  assert.equal(result.wrong, 1);
  assert.equal(result.unresolved, 2);
  assert.equal(result.unanswered, 0);
  assert.equal(result.totalQuestions, 4);
  assert.equal(
    result.correct + result.wrong + result.unanswered + result.unresolved + result.ungraded,
    4
  );
  // list-only unresolved (no marker) — reload before finish
  const listOnly = scoreManualResults({}, [2], numbers, false);
  assert.equal(listOnly.unresolved, 1);
  assert.equal(listOnly.unanswered, 3);
  assert.equal(listOnly.unresolved + listOnly.unanswered, 4);
});

test("scoring: exam vs practice unresolved after navigation / toggle", async () => {
  const { calculateStats, calculatePercentage } = await loadScoring();
  // Mark unresolved, then answer normally (list cleared, result written)
  const afterAnswer = calculateStats({ 1: "correct" }, 3, []);
  assert.equal(afterAnswer.unresolved, 0);
  assert.equal(afterAnswer.correct, 1);
  // Mark unresolved again (list has it, no result)
  const afterMark = calculateStats({ 1: "correct" }, 3, [2]);
  assert.equal(afterMark.unresolved, 1);
  assert.equal(afterMark.unanswered, 1);
  // Practice % with the unresolved mark present
  const resulted = afterMark.correct + afterMark.wrong + afterMark.unresolved;
  assert.equal(calculatePercentage(1, 0, 3, false, resulted), 50);
});

test("scoring: all correct / all wrong / mixed exam totals", async () => {
  const { autoScore } = await loadScoring();
  const numbers = [1, 2, 3, 4, 5];
  const key = { 1: "1", 2: "2", 3: "3", 4: "4", 5: "5" };
  const allCorrect = autoScore(
    { 1: "1", 2: "2", 3: "3", 4: "4", 5: "5" },
    key,
    true,
    { questionNumbers: numbers }
  );
  assert.equal(allCorrect.correct, 5);
  assert.equal(allCorrect.percentage, 100);
  const allWrong = autoScore(
    { 1: "9", 2: "9", 3: "9", 4: "9", 5: "9" },
    key,
    true,
    { questionNumbers: numbers }
  );
  assert.equal(allWrong.wrong, 5);
  assert.equal(allWrong.percentage, 0);
  assert.equal(allWrong.totalQuestions, 5);
  // mixed: 2 correct, 1 wrong, 1 unresolved, 1 unanswered
  const mixed = autoScore(
    { 1: "1", 2: "2", 3: "9" },
    key,
    false,
    { questionNumbers: numbers, unresolved: [4] }
  );
  assert.equal(mixed.correct, 2);
  assert.equal(mixed.wrong, 1);
  assert.equal(mixed.unresolved, 1);
  assert.equal(mixed.unanswered, 1);
  assert.equal(mixed.totalQuestions, 5);
  assert.equal(
    mixed.correct + mixed.wrong + mixed.unanswered + mixed.unresolved + mixed.ungraded,
    5
  );
  assert.equal(mixed.percentage, 40);
});

test("scoring: custom numbering is honored", async () => {
  const { getQuestionNumbers, computeFormQuestionNumbers } = await loadScoring();
  const exam = {
    questionCount: 3,
    customNumbering: true,
    startNumber: 5,
    useStep: true,
    step: 2,
  };
  assert.deepEqual([...getQuestionNumbers(exam)], [5, 7, 9]);
  assert.deepEqual(
    [...computeFormQuestionNumbers({
      customNumbering: true,
      startNumber: 5,
      endNumber: 9,
      useStep: true,
      step: 2,
    })],
    [5, 7, 9]
  );
});

async function activityHarness() {
  const storageSource = (await readFile(new URL("./storage.js", import.meta.url), "utf8"))
    .replace(/export /g, "");
  const trackerSource = (await readFile(new URL("./activityTracker.js", import.meta.url), "utf8"))
    .replace(/^import[\s\S]*?from ["'][^"']+["'];/gm, "")
    .replace(/export /g, "");
  const dateSource = (await readFile(new URL("../utils/date.js", import.meta.url), "utf8"))
    .replace(/export /g, "");

  const values = new Map();
  const sandbox = vm.createContext({
    console: { error() {}, warn() {} },
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
      keys: () => [...values.keys()],
    },
    window: { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} },
    CustomEvent: class {},
    Date,
    Math,
    JSON,
    Number,
    Object,
    Array,
    String,
    Boolean,
  });
  // storageAdapter.keys() uses Object.keys(localStorage) — polyfill
  sandbox.localStorage = new Proxy(sandbox.localStorage, {
    ownKeys: () => [...values.keys()],
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  });
  // Simpler: expose keys via Object.keys override by assigning plain object
  const ls = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  // Object.keys(localStorage) won't see Map-backed keys; mirror into ls
  const lsProxy = new Proxy(ls, {
    get(target, prop) {
      if (prop === Symbol.iterator || prop === "length") {
        // not used
      }
      if (typeof prop === "string" && !(prop in target)) {
        // numeric-like keys from Object.keys
        if (values.has(prop)) return values.get(prop);
        return undefined;
      }
      return target[prop];
    },
    ownKeys: () => [...values.keys()],
    getOwnPropertyDescriptor: (t, p) => {
      if (values.has(String(p))) {
        return { enumerable: true, configurable: true, value: values.get(String(p)) };
      }
      if (p in t) return { enumerable: true, configurable: true, value: t[p] };
      return undefined;
    },
    has: (t, p) => values.has(String(p)) || p in t,
  });

  const box = vm.createContext({
    console: { error() {}, warn() {} },
    localStorage: lsProxy,
    window: { dispatchEvent() {} },
    CustomEvent: class {},
    Date,
    Math,
    JSON,
    Number,
    Object,
    Array,
    String,
    Boolean,
  });
  vm.runInContext(dateSource, box);
  vm.runInContext(storageSource, box);
  box.setStorageUser("stats-user");
  vm.runInContext(trackerSource, box);
  return box;
}

test("activity: same question answered twice in one day counts once", async () => {
  const box = await activityHarness();
  const meta = { examId: 1, examName: "E", folderId: null, subjectId: null };
  box.recordQuestionAnswered(meta, 1, "correct");
  box.recordQuestionAnswered(meta, 1, "wrong"); // re-answer same day
  const day = box.getTodayActivity();
  assert.equal(day.solved, 1);
  assert.equal(day.correct, 0);
  assert.equal(day.wrong, 1);
  assert.equal(day.answeredKeys["1:1"], "wrong");
});

test("activity: study seconds accumulate and never go negative", async () => {
  const box = await activityHarness();
  const meta = { examId: 1, examName: "E", folderId: null, subjectId: null };
  box.recordStudyTime(meta, 10_000);
  box.recordStudyTime(meta, 5_000);
  assert.equal(box.getTodayActivity().studySeconds, 15);
  box.recordStudyTime(meta, -999_999);
  assert.ok(box.getTodayActivity().studySeconds >= 0);
});

test("activity: revertQuestion removes the answered key and tallies", async () => {
  const box = await activityHarness();
  const meta = { examId: 1, examName: "E", folderId: null, subjectId: null };
  box.recordQuestionAnswered(meta, 3, "correct");
  assert.equal(box.getTodayActivity().correct, 1);
  box.revertQuestion(meta, 3);
  const day = box.getTodayActivity();
  assert.equal(day.correct, 0);
  assert.equal(day.solved, 0);
  assert.equal(day.answeredKeys["1:3"], undefined);
});

test("stopwatch: pure elapsed/format helpers", async () => {
  const source = (await readFile(new URL("../hooks/useStopwatch.js", import.meta.url), "utf8"))
    .replace(/^import[\s\S]*?from ["'][^"']+["'];/gm, "")
    .replace(/export default function[\s\S]*$/m, "")
    .replace(/export /g, "");
  const box = vm.createContext({
    useCallback: (fn) => fn,
    useEffect: () => {},
    useRef: (v) => ({ current: v }),
    useState: (v) => (typeof v === "function" ? [v()] : [v]),
    Date,
    Math,
    Number,
    JSON,
    String,
    console,
    localStorage: {
      getItem: () => null,
      setItem: () => {},
    },
  });
  vm.runInContext(source, box);

  assert.equal(
    box.elapsedMs({ accumulatedMs: 1000, runningSince: null }, 9999),
    1000
  );
  assert.equal(
    box.elapsedMs({ accumulatedMs: 1000, runningSince: 5000 }, 8000),
    4000
  );
  assert.equal(box.formatHMS(0), "00:00:00");
  assert.equal(box.formatHMS(3_661_000), "01:01:01");
  assert.equal(box.formatHMS(25 * 3_600_000 + 4 * 60_000 + 9_000), "25:04:09");
});

// =========================================================
// Regression: test edition must not record study activity
// =========================================================

test("activity: test edition paths do not record activity", async () => {
  const box = await activityHarness();

  assert.equal(
    box.createFolder({ id: 1, name: "Folder", createdAt: "2026-09-23T00:00:00Z" }),
    true
  );
  assert.equal(
    box.createExam({
      id: 10,
      folderId: 1,
      name: "Edition",
      questionCount: 5,
      type: "exam",
      timerDuration: 600,
      negativeMarking: true,
      createdAt: "2026-09-23T00:00:00Z",
    }),
    true
  );

  assert.equal(
    box.updateExam(10, { name: "Renamed", timerDuration: 900, negativeMarking: false }),
    true
  );

  assert.equal(
    box.saveExamData(10, {
      answerKey: { 1: "2", 2: "3", 3: "1" },
      marked: [1],
      questionTags: { 1: ["tag-a"] },
      note: "prep note",
    }),
    true
  );

  const day = box.getTodayActivity();
  assert.ok(!day, "edition writes must not create an activity day");
});

test("activity: edition paths leave activity empty; later study still records", async () => {
  const box = await activityHarness();
  box.createFolder({ id: 1, name: "F", createdAt: "2026-09-23T00:00:00Z" });
  box.createExam({
    id: 10,
    folderId: 1,
    name: "E",
    questionCount: 3,
    createdAt: "2026-09-23T00:00:00Z",
  });
  box.updateExam(10, { name: "E2" });
  box.saveExamData(10, { answerKey: { 1: "1" }, unresolved: [], correctAnswers: {} });

  assert.ok(!box.getTodayActivity());

  box.recordQuestionAnswered(
    { examId: 10, examName: "E2", folderId: 1, subjectId: null },
    1,
    "correct"
  );
  const after = box.getTodayActivity();
  assert.equal(after.solved, 1);
  assert.equal(after.correct, 1);
});

// =========================================================
// Unresolved + Correct Answer coexistence
// =========================================================

async function storageExamHarness(examId = 10) {
  const box = await activityHarness();
  box.createFolder({ id: 1, name: "F", createdAt: "2026-09-23T00:00:00Z" });
  box.createExam({
    id: examId,
    folderId: 1,
    name: "E",
    questionCount: 5,
    type: "exam",
    createdAt: "2026-09-23T00:00:00Z",
  });
  return box;
}

test("unresolved: can receive a Correct Answer; both persist after reload", async () => {
  const box = await storageExamHarness();

  assert.equal(
    box.saveExamData(10, {
      answers: {},
      results: {},
      correctAnswers: { 2: "2" },
      unresolved: [2],
      marked: [],
      questionTags: {},
    }),
    true
  );

  const data = box.getExamData(10);
  assert.deepEqual(data.unresolved, [2]);
  assert.equal(data.correctAnswers[2], "2");
  assert.equal(data.unresolved.includes(2), true, "unresolved status preserved");
});

test("unresolved: without a Correct Answer remains valid", async () => {
  const box = await storageExamHarness();

  assert.equal(
    box.saveExamData(10, {
      answers: {},
      results: {},
      correctAnswers: {},
      unresolved: [2],
      marked: [],
      questionTags: {},
    }),
    true
  );

  const data = box.getExamData(10);
  assert.deepEqual(data.unresolved, [2]);
  assert.deepEqual(data.correctAnswers, {});
});

test("unresolved: setting Correct Answer does not clear user answers/results/tags/marked", async () => {
  const box = await storageExamHarness();

  box.saveExamData(10, {
    answers: { 1: "1" },
    results: { 1: "correct" },
    correctAnswers: {},
    unresolved: [2],
    marked: [3],
    questionTags: { 1: ["t1"] },
    note: "keep me",
  });

  const current = box.getExamData(10);
  const next = {
    ...current,
    correctAnswers: { ...current.correctAnswers, 2: "2" },
  };
  assert.equal(box.saveExamData(10, next), true);

  const data = box.getExamData(10);
  assert.deepEqual(data.unresolved, [2]);
  assert.equal(data.correctAnswers[2], "2");
  assert.equal(data.answers[1], "1");
  assert.equal(data.results[1], "correct");
  assert.deepEqual(data.marked, [3]);
  assert.deepEqual(data.questionTags, { 1: ["t1"] });
  assert.equal(data.note, "keep me");
});

test("scoring: unresolved with a key/Correct Answer still scores as unresolved", async () => {
  const { autoScore, scoreManualResults, calculateStats } = await loadScoring();
  const numbers = [1, 2, 3];

  const examScored = autoScore(
    { 1: "1" },
    { 1: "1", 2: "2", 3: "3" },
    true,
    { questionNumbers: numbers, unresolved: [2] }
  );
  assert.equal(examScored.details[2], "unresolved");
  assert.equal(examScored.unresolved, 1);
  assert.equal(examScored.correct, 1);
  assert.equal(examScored.wrong, 0);

  const practice = scoreManualResults({ 2: "unresolved" }, [2], numbers, false);
  assert.equal(practice.unresolved, 1);
  assert.equal(practice.details[2], "unresolved");

  const stats = calculateStats({ 2: "unresolved" }, 3, [2]);
  assert.equal(stats.unresolved, 1);
  assert.equal(stats.correct + stats.wrong + stats.unanswered + stats.unresolved, 3);
});

test("unresolved: Exam.jsx allows Correct Answer and preserves unresolved status", async () => {
  const examSource = await readFile(new URL("../pages/Exam.jsx", import.meta.url), "utf8");

  assert.ok(
    examSource.includes('result !== "wrong" &&') && examSource.includes("!isUnresolved"),
    "selectCorrectAnswer accepts unresolved questions"
  );

  assert.ok(
    /canSelectCorrect\s*=\s*result\s*===\s*"wrong"\s*\|\|\s*isUnresolved/.test(examSource),
    "practice Correct Answer buttons enabled when unresolved"
  );

  const combinedDisabled =
    examSource.match(/disabled=\{\s*!canSelectCorrect\s*\|\|\s*isReviewMode\s*\}/g) || [];
  assert.ok(combinedDisabled.length >= 1, "combined disabled expression present");

  // No second disabled prop on the same correct-answer button (last-prop-wins)
  const correctRowStart = examSource.indexOf("correct-answer-row");
  const correctRow = examSource.slice(correctRowStart, correctRowStart + 2500);
  assert.ok(correctRowStart >= 0, "correct-answer row found");
  const disabledAttrs = correctRow.match(/disabled=\{/g) || [];
  assert.equal(disabledAttrs.length, 1, "exactly one disabled prop on correct-answer buttons");
  assert.ok(
    !correctRow.includes("disabled={isReviewMode}"),
    "no duplicate standalone disabled override on correct-answer buttons"
  );

  const markStart = examSource.indexOf("Mark unresolved: drop any selected answer");
  const markEnd = examSource.indexOf('recordQuestionAnswered(examMeta, questionNumber, "unresolved")');
  assert.ok(markStart >= 0 && markEnd > markStart, "mark-unresolved block found");
  const markBlock = examSource.slice(markStart, markEnd);
  assert.ok(
    !markBlock.includes("delete updatedCorrectAnswers"),
    "marking unresolved does not delete correctAnswers"
  );
  assert.ok(
    !markBlock.includes("correctAnswers: updatedCorrectAnswers"),
    "mark-unresolved saveData does not overwrite correctAnswers"
  );

  const finishStart = examSource.indexOf('detail === "unresolved"');
  const finishEnd = examSource.indexOf('detail === "ungraded"');
  assert.ok(finishStart >= 0 && finishEnd > finishStart, "finish unresolved branch found");
  const finishSlice = examSource.slice(finishStart, finishEnd);
  assert.ok(
    !finishSlice.includes("delete updatedCorrectAnswers"),
    "finish flow does not delete correctAnswers for unresolved"
  );
  assert.ok(
    finishSlice.includes("updatedCorrectAnswers[questionNumber] = keyEntry"),
    "finish flow derives Correct Answer from key when present"
  );
});

test("unresolved: Folder answer-key editor is not gated on unresolved", async () => {
  const folderSource = await readFile(new URL("../pages/Folder.jsx", import.meta.url), "utf8");
  assert.ok(
    !folderSource.includes("activityTracker"),
    "test edition never imports activity tracker"
  );

  const keySectionStart = folderSource.indexOf("function AnswerKeyGrid");
  assert.ok(keySectionStart >= 0, "AnswerKeyGrid exists");
  const keySection = folderSource.slice(keySectionStart, keySectionStart + 3000);
  assert.ok(
    !keySection.includes("unresolved"),
    "answer-key grid has no unresolved gating"
  );
});

// =========================================================
// Daily report — overall + subject accuracy (Home reuse)
// =========================================================

function localToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

test("day report: empty day returns null / no subjects", async () => {
  const box = await activityHarness();
  const report = box.getDayReport(localToday());
  assert.equal(report, null, "no activity day → null report");
});

test("day report: multiple subjects — accuracy per subject, correct denominators", async () => {
  const box = await activityHarness();
  box.createSubject({ id: 1, name: "Math", color: "#f00" });
  box.createSubject({ id: 2, name: "Phys", color: "#0f0" });
  box.createFolder({ id: 10, name: "Algebra", subjectId: 1, createdAt: "2026-09-24T00:00:00Z" });
  box.createFolder({ id: 11, name: "Mechanics", subjectId: 2, createdAt: "2026-09-24T00:00:00Z" });

  // Math: 3 correct + 1 wrong → 75%
  box.recordQuestionAnswered({ examId: 1, examName: "M1", folderId: 10, subjectId: 1 }, 1, "correct");
  box.recordQuestionAnswered({ examId: 1, examName: "M1", folderId: 10, subjectId: 1 }, 2, "correct");
  box.recordQuestionAnswered({ examId: 1, examName: "M1", folderId: 10, subjectId: 1 }, 3, "correct");
  box.recordQuestionAnswered({ examId: 1, examName: "M1", folderId: 10, subjectId: 1 }, 4, "wrong");
  // Phys: 1 correct + 1 wrong → 50%
  box.recordQuestionAnswered({ examId: 2, examName: "P1", folderId: 11, subjectId: 2 }, 1, "correct");
  box.recordQuestionAnswered({ examId: 2, examName: "P1", folderId: 11, subjectId: 2 }, 2, "wrong");

  const report = box.getDayReport(localToday());
  assert.ok(report);
  assert.equal(report.overall.solved, 6);
  assert.equal(report.overall.correct, 4);
  assert.equal(report.overall.accuracy, 67);

  const math = report.subjects.find((s) => String(s.subjectId) === "1");
  const phys = report.subjects.find((s) => String(s.subjectId) === "2");
  assert.ok(math, "math subject present");
  assert.ok(phys, "phys subject present");
  assert.equal(math.solved, 4);
  assert.equal(math.correct, 3);
  assert.equal(math.accuracy, 75);
  assert.equal(phys.solved, 2);
  assert.equal(phys.correct, 1);
  assert.equal(phys.accuracy, 50);
});

test("day report: one subject only", async () => {
  const box = await activityHarness();
  box.createSubject({ id: 1, name: "Math" });
  box.createFolder({ id: 10, name: "F", subjectId: 1, createdAt: "2026-09-24T00:00:00Z" });
  box.recordQuestionAnswered({ examId: 1, examName: "E", folderId: 10, subjectId: 1 }, 1, "correct");
  box.recordQuestionAnswered({ examId: 1, examName: "E", folderId: 10, subjectId: 1 }, 2, "wrong");

  const report = box.getDayReport(localToday());
  const named = report.subjects.filter((s) => s.subjectId != null);
  assert.equal(named.length, 1);
  assert.equal(named[0].accuracy, 50);
});

test("day report: missing subject → uncategorized bucket, no crash", async () => {
  const box = await activityHarness();
  // folder with no subjectId
  box.createFolder({ id: 10, name: "Loose", createdAt: "2026-09-24T00:00:00Z" });
  box.recordQuestionAnswered({ examId: 1, examName: "E", folderId: 10, subjectId: null }, 1, "correct");
  box.recordQuestionAnswered({ examId: 1, examName: "E", folderId: 10, subjectId: null }, 2, "correct");

  const report = box.getDayReport(localToday());
  assert.ok(report);
  const uncat = report.subjects.find((s) => s.subjectId == null);
  assert.ok(uncat, "uncategorized group exists");
  assert.equal(uncat.solved, 2);
  assert.equal(uncat.accuracy, 100);
});

test("day report: re-answer same question does not double-count subjects", async () => {
  const box = await activityHarness();
  box.createSubject({ id: 1, name: "Math" });
  box.createFolder({ id: 10, name: "F", subjectId: 1, createdAt: "2026-09-24T00:00:00Z" });
  const meta = { examId: 1, examName: "E", folderId: 10, subjectId: 1 };
  box.recordQuestionAnswered(meta, 1, "correct");
  box.recordQuestionAnswered(meta, 1, "wrong"); // flip same day

  const report = box.getDayReport(localToday());
  assert.equal(report.overall.solved, 1);
  assert.equal(report.subjects[0].solved, 1);
  assert.equal(report.subjects[0].accuracy, 0); // last outcome wrong
  assert.equal(report.overall.solved, report.subjects[0].solved);
});
