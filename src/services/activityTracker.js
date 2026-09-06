import {
  getActivity,
  saveActivity,
  getFolders,
  getSubjects,
} from "./dataService.js";
import { toLocalDateString, fromLocalDateString, todayLocal } from "../utils/date.js";

// =========================================================
// Daily Activity Model
//
// Shape stored under `testbox-activity-YYYY-MM-DD`:
// {
//   solved: N, correct: N, wrong: N, unanswered: N, unresolved: N,
//   studySeconds: N,  // accumulated practice-stopwatch running time (additive)
//   answeredKeys: { "<examId>:<questionNumber>": outcome, ... },  // dedup per day
//   exams: [{ examId, name, folderId, subjectId, solved, correct, wrong, unanswered, unresolved, completed, studySeconds }]
// }
//
// `subjects` is derived at read time (getDayReport) from the folder/subject
// registry — not stored — so renames never corrupt history.
// =========================================================

function getTodayString() {
  return todayLocal();
}

function getOrCreateToday() {
  const today = getTodayString();
  const existing = getActivity(today);
  if (existing && isObject(existing)) {
    if (!existing.answeredKeys) existing.answeredKeys = {};
    if (!Array.isArray(existing.exams)) existing.exams = [];
    if (!Number.isFinite(Number(existing.studySeconds))) existing.studySeconds = 0;
    // Legacy day records predate the unresolved tally — backfill it so
    // applyCount never computes on undefined.
    if (!Number.isFinite(Number(existing.unresolved))) existing.unresolved = 0;
    return { date: today, data: existing };
  }
  return {
    date: today,
    data: {
      solved: 0,
      correct: 0,
      wrong: 0,
      unanswered: 0,
      unresolved: 0,
      studySeconds: 0,
      answeredKeys: {},
      exams: [],
    },
  };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function ensureExamEntry(data, examMeta) {
  let examEntry = data.exams.find(
    (e) => String(e.examId) === String(examMeta.examId)
  );
  if (!examEntry) {
    examEntry = {
      examId: String(examMeta.examId),
      name: examMeta.examName || "",
      folderId: examMeta.folderId ?? null,
      subjectId: examMeta.subjectId ?? null,
      solved: 0,
      correct: 0,
      wrong: 0,
      unanswered: 0,
      unresolved: 0,
      completed: false,
      studySeconds: 0,
    };
    data.exams.push(examEntry);
  }
  // Keep metadata fresh (folder/subject may have been reassigned)
  if (examMeta.examName) examEntry.name = examMeta.examName;
  if (examMeta.folderId != null) examEntry.folderId = examMeta.folderId;
  if (examMeta.subjectId !== undefined && examMeta.subjectId !== null) {
    examEntry.subjectId = examMeta.subjectId;
  }
  return examEntry;
}

function applyCount(data, examEntry, field) {
  data[field] += 1;
  examEntry[field] += 1;
}

/**
 * Record a question being answered (or re-answered).
 * The FIRST answer of a given question on a given day counts toward "solved".
 * Changing the answer updates the correct/wrong/unanswered tally instead of
 * double counting. Re-renders/navigation are safe: activity is only recorded
 * when this function is explicitly invoked by a user action handler.
 *
 * examMeta: { examId, examName, folderId, subjectId }
 * questionNumber: number
 * outcome: "correct" | "wrong" | "unanswered" | "unresolved"
 */
export function recordQuestionAnswered(examMeta, questionNumber, outcome) {
  if (!examMeta || examMeta.examId == null) return;

  const { date, data } = getOrCreateToday();

  const key = `${examMeta.examId}:${questionNumber}`;
  const isNew = !data.answeredKeys[key];

  const examEntry = ensureExamEntry(data, examMeta);

  if (isNew) {
    data.answeredKeys[key] = true;
    data.solved += 1;
    examEntry.solved += 1;
  } else {
    // Re-answer: subtract the previous outcome's tally so totals stay accurate
    // (the previous outcome for this question today is unknown post-refresh,
    // so we simply count the new outcome as a correction when it changes).
  }

  // Determine previous outcome at question level is not tracked individually;
  // to keep totals consistent we track per-question outcome in the key map:
  // answeredKeys stores the outcome: { "<examId>:<qNum>": "correct"|"wrong"|"unanswered" }
  const previousOutcome = isNew ? null : data.answeredKeys[key];
  if (!isNew && previousOutcome === outcome) {
    // No effective change; avoid inflating tallies
    saveActivity(date, data);
    return;
  }

  if (!isNew && previousOutcome) {
    // Roll back the previous outcome
    if (previousOutcome === "correct") {
      data.correct = Math.max(0, data.correct - 1);
      examEntry.correct = Math.max(0, examEntry.correct - 1);
    } else if (previousOutcome === "wrong") {
      data.wrong = Math.max(0, data.wrong - 1);
      examEntry.wrong = Math.max(0, examEntry.wrong - 1);
    } else if (previousOutcome === "unresolved") {
      data.unresolved = Math.max(0, (data.unresolved || 0) - 1);
      examEntry.unresolved = Math.max(0, (examEntry.unresolved || 0) - 1);
    } else {
      data.unanswered = Math.max(0, data.unanswered - 1);
      examEntry.unanswered = Math.max(0, examEntry.unanswered - 1);
    }
  }

  // Apply the new outcome
  if (outcome === "correct") {
    applyCount(data, examEntry, "correct");
  } else if (outcome === "wrong") {
    applyCount(data, examEntry, "wrong");
  } else if (outcome === "unresolved") {
    // Unresolved counts toward solved (worked-on) but never toward
    // correct/wrong — it neither raises nor distorts accuracy.
    applyCount(data, examEntry, "unresolved");
  } else {
    applyCount(data, examEntry, "unanswered");
  }

  data.answeredKeys[key] = outcome;

  saveActivity(date, data);
}

/**
 * Record an exam being completed. Marks the exam entry as completed and
 * replaces its stats with the authoritative final numbers (idempotent:
 * calling twice with the same stats does not double count).
 *
 * examMeta: { examId, examName, folderId, subjectId }
 * stats: { correct, wrong, unanswered, total, ungraded? }
 * "solved" counts graded questions only (correct+wrong+unanswered among
 * key-covered questions) so partial answer keys don't inflate daily totals.
 */
export function recordExamCompleted(examMeta, stats) {
  if (!examMeta || examMeta.examId == null || !isObject(stats)) return;

  const { date, data } = getOrCreateToday();

  const examEntry = ensureExamEntry(data, examMeta);

  const prev = {
    solved: examEntry.solved || 0,
    correct: examEntry.correct || 0,
    wrong: examEntry.wrong || 0,
    unanswered: examEntry.unanswered || 0,
    unresolved: examEntry.unresolved || 0,
  };

  const ungraded = Number(stats.ungraded) || 0;
  const statsGraded = Number(stats.graded);
  const solved = Number.isFinite(statsGraded)
    ? statsGraded
    : Math.max(0, (Number(stats.total) || 0) - ungraded);

  const next = {
    solved,
    correct: Number(stats.correct) || 0,
    wrong: Number(stats.wrong) || 0,
    unanswered: Number(stats.unanswered) || 0,
    unresolved: Number(stats.unresolved) || 0,
  };

  // Roll back the exam's previous contribution, then apply final stats
  data.solved = Math.max(0, (data.solved || 0) - prev.solved + next.solved);
  data.correct = Math.max(0, (data.correct || 0) - prev.correct + next.correct);
  data.wrong = Math.max(0, (data.wrong || 0) - prev.wrong + next.wrong);
  data.unanswered = Math.max(
    0,
    (data.unanswered || 0) - prev.unanswered + next.unanswered
  );
  data.unresolved = Math.max(
    0,
    (data.unresolved || 0) - (prev.unresolved || 0) + next.unresolved
  );

  examEntry.solved = next.solved;
  examEntry.correct = next.correct;
  examEntry.wrong = next.wrong;
  examEntry.unanswered = next.unanswered;
  examEntry.unresolved = next.unresolved;
  examEntry.completed = true;

  saveActivity(date, data);
}

/**
 * Record practice-stopwatch running time. Purely additive: each call adds
 * one already-measured delta (whole seconds) to today's totals and to the
 * exam's entry. There is intentionally no recompute-and-set path, so
 * re-renders, refreshes, pauses, resets, and re-opens can never duplicate
 * or destroy recorded time — only genuinely new running time is added.
 * Sub-second remainders are dropped per flush (bounded, documented).
 *
 * examMeta: { examId, examName, folderId, subjectId }
 * deltaMs: measured running time since the previous flush
 */
export function recordStudyTime(examMeta, deltaMs) {
  if (!examMeta || examMeta.examId == null) return;
  const seconds = Math.floor(Number(deltaMs) / 1000);
  if (!Number.isFinite(seconds) || seconds <= 0) return;

  const { date, data } = getOrCreateToday();
  const examEntry = ensureExamEntry(data, examMeta);

  data.studySeconds = (Number(data.studySeconds) || 0) + seconds;
  examEntry.studySeconds = (Number(examEntry.studySeconds) || 0) + seconds;

  saveActivity(date, data);
}

export function getTodayActivity() {
  return getActivity(getTodayString());
}

export function getActivityForDate(dateStr) {
  return getActivity(dateStr);
}

/**
 * Build a detailed, subject-aware report for one day.
 * Resolves subject/folder names from the live registry; activity records
 * only store IDs. Legacy records without folder/subject metadata degrade
 * gracefully into "Uncategorized".
 */
export function getDayReport(dateStr) {
  const raw = getActivity(dateStr);
  if (!raw || !isObject(raw)) return null;

  const overall = {
    solved: raw.solved || 0,
    correct: raw.correct || 0,
    wrong: raw.wrong || 0,
    unanswered: raw.unanswered || 0,
    unresolved: raw.unresolved || 0,
    studySeconds: raw.studySeconds || 0,
    accuracy:
      raw.solved > 0 ? Math.round((raw.correct / raw.solved) * 100) : 0,
    completedExams: (raw.exams || []).filter((e) => e.completed).length,
    activeSets: (raw.exams || []).length,
  };

  const folders = getFolders();
  const folderMap = {};
  folders.forEach((f) => {
    folderMap[String(f.id)] = f;
  });

  const subjects = getSubjects();
  const subjectMap = {};
  subjects.forEach((s) => {
    subjectMap[String(s.id)] = s;
  });

  const subjectGroups = {};
  const uncategorized = {
    subjectId: null,
    subjectName: null, // resolved by caller via i18n
    color: null,
    solved: 0,
    correct: 0,
    wrong: 0,
    accuracy: 0,
    folders: {},
  };

  (raw.exams || []).forEach((exam) => {
    const folder =
      exam.folderId != null ? folderMap[String(exam.folderId)] : null;

    // Prefer the folder's CURRENT subject assignment so reassigning a folder
    // re-files its historical activity; fall back to the subject recorded
    // at activity time (folder may have been deleted since).
    const subjectId =
      folder && folder.subjectId != null
        ? String(folder.subjectId)
        : exam.subjectId != null
          ? String(exam.subjectId)
          : null;

    const subject = subjectId ? subjectMap[subjectId] : null;

    const group =
      subjectId && subject
        ? subjectGroups[subjectId] ||
          (subjectGroups[subjectId] = {
            subjectId: subjectId,
            subjectName: subject.name,
            color: subject.color || null,
            solved: 0,
            correct: 0,
            wrong: 0,
            accuracy: 0,
            folders: {},
          })
        : uncategorized;

    group.solved += exam.solved || 0;
    group.correct += exam.correct || 0;
    group.wrong += exam.wrong || 0;

    const folderKey =
      exam.folderId != null ? String(exam.folderId) : "none";
    const folderGroup =
      group.folders[folderKey] ||
      (group.folders[folderKey] = {
        folderId: exam.folderId ?? null,
        folderName:
          (folder && folder.name) || null, // resolved by caller via i18n
        exams: [],
      });

    folderGroup.exams.push({
      examId: exam.examId,
      name: exam.name,
      solved: exam.solved || 0,
      correct: exam.correct || 0,
      wrong: exam.wrong || 0,
      unanswered: exam.unanswered || 0,
      unresolved: exam.unresolved || 0,
      studySeconds: exam.studySeconds || 0,
      completed: !!exam.completed,
    });
  });

  const subjectList = Object.values(subjectGroups);
  if (uncategorized.solved > 0 || uncategorized.folders.length !== undefined) {
    const uncatFolders = Object.values(uncategorized.folders);
    if (uncategorized.solved > 0 || uncatFolders.length > 0) {
      subjectList.push({ ...uncategorized, folders: uncatFolders });
    }
  }

  subjectList.forEach((s) => {
    s.accuracy =
      s.solved > 0 ? Math.round((s.correct / s.solved) * 100) : 0;
    s.folders = Object.values(s.folders);
    s.folders.forEach((f) => {
      f.solved = f.exams.reduce((sum, e) => sum + e.solved, 0);
      f.correct = f.exams.reduce((sum, e) => sum + e.correct, 0);
      f.wrong = f.exams.reduce((sum, e) => sum + e.wrong, 0);
    });
  });

  return {
    date: dateStr,
    overall,
    subjects: subjectList,
    exams: raw.exams || [],
  };
}

export function getStreak() {
  let streak = 0;
  const todayStr = getTodayString();

  for (let i = 0; i < 365; i++) {
    const dateStr = i === 0 ? todayStr : shiftDate(todayStr, -i);
    const activity = getActivity(dateStr);

    if (activity && activity.solved > 0) {
      streak += 1;
    } else if (i > 0) {
      break;
    } else {
      // Today empty: continue counting from yesterday before giving up
      continue;
    }
  }

  return streak;
}

function shiftDate(dateStr, days) {
  const d = fromLocalDateString(dateStr);
  if (!d) return dateStr;
  d.setDate(d.getDate() + days);
  return toLocalDateString(d);
}

export function getActivityForDateRange(startDate, endDate) {
  const results = [];
  let cursor = startDate;
  let guard = 0;

  while (cursor && cursor <= endDate && guard < 1000) {
    const activity = getActivity(cursor);
    results.push({
      date: cursor,
      hasActivity: !!(activity && activity.solved > 0),
      solved: activity?.solved || 0,
      correct: activity?.correct || 0,
      wrong: activity?.wrong || 0,
      unresolved: activity?.unresolved || 0,
      studySeconds: activity?.studySeconds || 0,
      accuracy:
        activity && activity.solved > 0
          ? Math.round((activity.correct / activity.solved) * 100)
          : 0,
    });
    cursor = shiftDate(cursor, 1);
    guard += 1;
  }

  return results;
}

export function getMonthlySummary(year, month) {
  const start = toLocalDateString(new Date(year, month, 1));
  const end = toLocalDateString(new Date(year, month + 1, 0));
  const days = getActivityForDateRange(start, end);

  const activeDays = days.filter((d) => d.hasActivity);
  const totalSolved = activeDays.reduce((sum, d) => sum + d.solved, 0);
  const totalCorrect = activeDays.reduce((sum, d) => sum + d.correct, 0);
  const totalWrong = activeDays.reduce((sum, d) => sum + d.wrong, 0);
  const totalUnresolved = days.reduce((sum, d) => sum + (d.unresolved || 0), 0);
  // Study time sums over ALL days in range (a timing-only day with zero
  // solved still counts); active-day/streak semantics are unchanged.
  const totalStudySeconds = days.reduce((sum, d) => sum + (d.studySeconds || 0), 0);

  return {
    totalSolved,
    totalCorrect,
    totalWrong,
    totalUnresolved,
    totalStudySeconds,
    activeDays: activeDays.length,
    accuracy:
      totalSolved > 0 ? Math.round((totalCorrect / totalSolved) * 100) : 0,
    days,
  };
}
