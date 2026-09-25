import { supabase } from "./supabaseClient";

import {
  getFolders,
  getExams,
  getExamData,
  saveFolders,
  saveExams,
  saveExamData,
  setStorageUser,
  getSubjects,
  saveSubjects,
  getActivity,
  saveActivity,
  getSettings,
  saveSettings,
  getTags,
  saveTags,
  getDeletedIds,
  getDirtyState,
  setDirtySuppression,
  applyDeferredDirtyMarks,
  beginCloudWrite,
  endCloudWrite,
} from "./dataService";

// Cloud→local save* must not self-mark/enqueue (pull writes are not
// local edits). Wraps only the synchronous save call so concurrent
// user saves during network awaits still enqueue.
function cloudSave(fn) {
  beginCloudWrite();
  try {
    return fn();
  } finally {
    endCloudWrite();
  }
}

/* =========================================================
   Schema capability detection
   The cloud schema is migrating incrementally. New features
   (subjects, folder subject assignment, exam type/timer,
   daily activity, settings) sync only when their tables or
   columns exist; otherwise they stay local-only and their
   local state is never destroyed by a cloud round-trip.
   Detection runs once per page load; failures are cached
   conservatively (treated as "missing").
========================================================= */

const schemaCapabilities = {
  probed: false,
  foldersSubjectId: false,
  foldersRev: false,
  examsRev: false,
  examsType: false,
  examsAnswerKey: false,
  examsExamState: false,
  examsStopwatch: false,
  subjectsTable: false,
  activityTable: false,
  settingsTable: false,
  tagsTable: false,
  examsTagIds: false,
  examQuestionsTagIds: false,
};

// Whether this page session has completed at least one cloud→local
// pull for the given user. Scoped by userId so an account/guest switch
// never inherits a stale "already pulled" guard from the previous user.
let sessionHasPulled = false;
let sessionHasPulledUserId = null;

function markSessionPulled(userId) {
  sessionHasPulled = true;
  sessionHasPulledUserId = userId || null;
}

function resetSessionPulledIfUserChanged(userId) {
  if (sessionHasPulled && sessionHasPulledUserId !== (userId || null)) {
    sessionHasPulled = false;
    sessionHasPulledUserId = userId || null;
  }
}

async function columnExists(table, column) {
  try {
    const { error } = await supabase
      .from(table)
      .select(column)
      .limit(1);
    return !error;
  } catch {
    return false;
  }
}

async function tableExists(table) {
  try {
    const { error } = await supabase
      .from(table)
      .select("*")
      .limit(1);
    return !error;
  } catch {
    return false;
  }
}

// Schema capability probe result is cached for a short TTL so a page
// that started offline (probes fail → "missing") recovers when the
// network returns, without re-probing on every single sync cycle.
const SCHEMA_PROBE_TTL_MS = 5 * 60 * 1000;
let schemaProbedAt = 0;

export async function probeSchemaCapabilities({ force = false } = {}) {
  if (
    schemaCapabilities.probed &&
    !force &&
    Date.now() - schemaProbedAt < SCHEMA_PROBE_TTL_MS
  ) {
    return schemaCapabilities;
  }

  const [
    foldersSubjectId,
    foldersRev,
    examsRev,
    examsType,
    examsAnswerKey,
    examsExamState,
    examsStopwatch,
    subjectsTable,
    activityTable,
    settingsTable,
    tagsTable,
    examsTagIds,
    examQuestionsTagIds,
  ] = await Promise.all([
    columnExists("folders", "subject_id"),
    columnExists("folders", "rev"),
    columnExists("exams", "rev"),
    columnExists("exams", "type"),
    columnExists("exams", "answer_key"),
    columnExists("exams", "exam_state"),
    columnExists("exams", "stopwatch_enabled"),
    tableExists("subjects"),
    tableExists("daily_activity"),
    tableExists("user_settings"),
    tableExists("tags"),
    columnExists("exams", "tag_ids"),
    columnExists("exam_questions", "tag_ids"),
  ]);

  schemaCapabilities.foldersSubjectId = foldersSubjectId;
  schemaCapabilities.foldersRev = foldersRev;
  schemaCapabilities.examsRev = examsRev;
  schemaCapabilities.examsType = examsType;
  schemaCapabilities.examsAnswerKey = examsAnswerKey;
  schemaCapabilities.examsExamState = examsExamState;
  schemaCapabilities.examsStopwatch = examsStopwatch;
  schemaCapabilities.subjectsTable = subjectsTable;
  schemaCapabilities.activityTable = activityTable;
  schemaCapabilities.settingsTable = settingsTable;
  schemaCapabilities.tagsTable = tagsTable;
  schemaCapabilities.examsTagIds = examsTagIds;
  schemaCapabilities.examQuestionsTagIds = examQuestionsTagIds;
  schemaCapabilities.probed = true;
  schemaProbedAt = Date.now();

  return schemaCapabilities;
}

function getQuestionNumbers(exam) {
  const count = Number(
    exam.questionCount || 0
  );

  if (
    !Number.isInteger(count) ||
    count < 1
  ) {
    return [];
  }

  const start = exam.customNumbering
    ? Number(exam.startNumber)
    : 1;

  const step =
    exam.customNumbering &&
    exam.useStep
      ? Number(exam.step)
      : 1;

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(step) ||
    step < 1
  ) {
    return [];
  }

  return Array.from(
    { length: count },
    (_, index) =>
      start + index * step
  );
}

// The stopwatch flag only applies to practice exams; exam-type rows
// always persist it as false so the cloud value stays deterministic.
function isExamTypePracticeOnly(exam) {
  return exam.type === "exam";
}

function buildQuestionRows(
  exam,
  data,
  userId
) {
  const questionNumbers =
    getQuestionNumbers(exam);

  const rows = [];

  questionNumbers.forEach(
    (questionNumber, index) => {
      const selectedAnswer =
        data.answers[
          questionNumber
        ];

      const correctAnswer =
        data.correctAnswers[
          questionNumber
        ];

      const result =
        data.results[
          questionNumber
        ];

      const isMarked =
        data.marked.includes(
          questionNumber
        );

      const isUnresolved =
        Array.isArray(data.unresolved) &&
        data.unresolved.includes(
          questionNumber
        );

      const questionTagIds = Array.isArray(
        data.questionTags?.[String(questionNumber)]
      )
        ? data.questionTags[String(questionNumber)].map(String)
        : [];

      const hasData =
        selectedAnswer ||
        correctAnswer ||
        result ||
        isMarked ||
        isUnresolved ||
        questionTagIds.length > 0;

      if (!hasData) {
        return;
      }

      rows.push({
        user_id: userId,
        exam_id: exam.id,
        question_index: index,
        question_number:
          questionNumber,

        selected_answer:
          selectedAnswer
            ? Number(
                selectedAnswer
              )
            : null,

        status:
          result === "correct" ||
          result === "wrong"
            ? result
            : isUnresolved
              ? "unresolved"
              : "unanswered",

        correct_answer:
          correctAnswer
            ? Number(
                correctAnswer
              )
            : null,

        marked: Boolean(
          isMarked
        ),

        tag_ids: questionTagIds,

        updated_at:
          new Date().toISOString(),
      });
    }
  );

  return rows;
}

async function syncFolder(
  folder,
  userId
) {
  // subject_id syncs only when the column exists (schema migration pending)
  const row = {
    id: folder.id,
    user_id: userId,
    name: folder.name,
    created_at:
      folder.createdAt,
    updated_at:
      new Date().toISOString(),
  };

  if (schemaCapabilities.foldersSubjectId) {
    // Explicitly write NULL when unassigned — omitting the key would
    // leave the previous cloud value stale (unassign never propagated).
    row.subject_id = folder.subjectId ?? null;
  }
  if (schemaCapabilities.foldersRev) {
    row.rev = (Number(folder.rev) || 0) + 1;
  }

  const { error } =
    await supabase
      .from("folders")
      .upsert(
        row,
        {
          onConflict: "id",
        }
      );

  if (error) {
    throw error;
  }
}

async function syncSubjects(
  userId,
  subjectsDirty
) {
  if (!schemaCapabilities.subjectsTable || !subjectsDirty) {
    return;
  }

  const subjects = getSubjects();

  if (subjects.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("subjects")
    .upsert(
      subjects.map((subject) => ({
        id: subject.id,
        user_id: userId,
        name: subject.name,
        color: subject.color ?? null,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "id" }
    );

  if (error) {
    throw error;
  }
}

// Uploads ONLY the activity days flagged dirty in this sync cycle.
// Uploading every local day unconditionally would (a) waste bandwidth
// on large histories and (b) let a mid-sync dirtied day slip into the
// cleared snapshot and lose its upload.
async function syncActivity(
  userId,
  dirtyActivity
) {
  if (!schemaCapabilities.activityTable) {
    return;
  }

  const dirtyDates = Object.keys(dirtyActivity || {}).filter(
    (date) => dirtyActivity[date]
  );

  if (dirtyDates.length === 0) {
    return;
  }

  const rows = dirtyDates
    .map((date) => {
      const data = getActivity(date);
      if (!data) return null;
      return {
        user_id: userId,
        date,
        payload: data,
        updated_at: new Date().toISOString(),
      };
    })
    .filter(Boolean);

  if (rows.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("daily_activity")
    .upsert(rows, { onConflict: "user_id,date" });

  if (error) {
    throw error;
  }
}

async function syncSettings(
  userId,
  settingsDirty
) {
  // Settings upload only when locally dirty — otherwise a device that
  // never changed settings would push its defaults over cloud values
  // another device deliberately saved.
  if (!schemaCapabilities.settingsTable || !settingsDirty) {
    return;
  }

  const settings = getSettings();

  const { error } = await supabase
    .from("user_settings")
    .upsert(
      {
        user_id: userId,
        settings,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    throw error;
  }
}

// Uploads only locally-dirty tag definitions. Assignments ride on the
// exam rows themselves (tagIds column), so they sync with exams.
async function syncTags(
  userId,
  tagsDirty
) {
  if (!schemaCapabilities.tagsTable || !tagsDirty) {
    return;
  }

  const tags = getTags();

  if (tags.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("tags")
    .upsert(
      tags.map((tag) => ({
        id: tag.id,
        user_id: userId,
        name: tag.name,
        color: tag.color ?? null,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "id" }
    );

  if (error) {
    throw error;
  }
}

async function syncExam(
  exam,
  userId
) {
  const data =
    getExamData(exam.id);

  const row = {
    id: exam.id,
    user_id: userId,
    folder_id:
      exam.folderId,
    name: exam.name,
    question_count:
      exam.questionCount,
    custom_numbering:
      Boolean(
        exam.customNumbering
      ),
    start_number:
      Number(
        exam.startNumber ?? 1
      ),
    end_number:
      Number(
        exam.endNumber ??
          exam.questionCount
      ),
    use_step:
      Boolean(
        exam.useStep
      ),
    step:
      Number(
        exam.step ?? 1
      ),
    negative_marking:
      exam.negativeMarking ??
      true,
    note:
      typeof data.note ===
      "string"
        ? data.note
        : "",
    created_at:
      exam.createdAt,
    updated_at:
      new Date().toISOString(),
  };

  // Exam-mode fields sync only when the columns exist
  if (schemaCapabilities.examsType) {
    row.type = exam.type === "exam" ? "exam" : "practice";
    if (exam.timerDuration != null) {
      row.timer_duration = Number(exam.timerDuration);
    }
    if (schemaCapabilities.examsStopwatch) {
      row.stopwatch_enabled =
        !isExamTypePracticeOnly(exam) &&
        Boolean(exam.stopwatchEnabled);
    }
  }
  if (schemaCapabilities.examsAnswerKey && data.answerKey) {
    row.answer_key = data.answerKey;
  }
  if (schemaCapabilities.examsExamState && data.examState != null) {
    row.exam_state = data.examState;
  }
  if (schemaCapabilities.examsRev) {
    row.rev = (Number(exam.rev) || 0) + 1;
  }

  const { error } =
    await supabase
      .from("exams")
      .upsert(
        row,
        {
          onConflict: "id",
        }
      );

  if (error) {
    throw error;
  }

  const localRows =
    buildQuestionRows(
      exam,
      data,
      userId
    );

  const {
    data: remoteRows,
    error: fetchError,
  } = await supabase
    .from("exam_questions")
    .select(
      "id, question_index"
    )
    .eq("user_id", userId)
    .eq("exam_id", exam.id);

  if (fetchError) {
    throw fetchError;
  }

  const localIndexes =
    new Set(
      localRows.map(
        (row) =>
          row.question_index
      )
    );

  const staleIds =
    (remoteRows || [])
      .filter(
        (row) =>
          !localIndexes.has(
            row.question_index
          )
      )
      .map(
        (row) => row.id
      );

  if (staleIds.length > 0) {
    const {
      error: deleteError,
    } = await supabase
      .from("exam_questions")
      .delete()
      .eq("user_id", userId)
      .eq("exam_id", exam.id)
      .in("id", staleIds);

    if (deleteError) {
      throw deleteError;
    }
  }

  if (localRows.length > 0) {
    const {
      error: questionError,
    } = await supabase
      .from("exam_questions")
      .upsert(
        localRows,
        {
          onConflict:
            "exam_id,question_index",
        }
      );

    if (questionError) {
      throw questionError;
    }
  }
}

/* =========================================================
   Local → Cloud

   Pushes local deletions (tombstones) BEFORE upserts so a
   delete is never resurrected by a concurrent upsert, and so
   a fresh device with empty local storage still propagates
   its predecessor's deletions. Only sections the caller
   passes get uploaded; dirty marks are cleared by the caller
   (CloudSyncManager) after the push completes.
========================================================= */

export async function syncLocalToCloud(
  userId,
  { dirty = null } = {}
) {
  if (!userId) {
    throw new Error(
      "A valid user ID is required."
    );
  }

  setStorageUser(userId);

  resetSessionPulledIfUserChanged(userId);
  await probeSchemaCapabilities();

  const dirtyState = dirty || getDirtyState();

  const folders =
    getFolders();

  const exams =
    getExams();

  // Local deletions first (tombstones) — never resurrected
  await applyLocalDeletesToCloud(userId, dirtyState.deletes);

  // NO wholesale prune: cloud rows missing locally are only removed
  // via explicit tombstones. Counting "absent locally" as deleted
  // wipes other clients' work whenever this device hasn't pulled yet
  // (or when only one section was dirty).

  // Dirty-only upload: a clean section must not overwrite another
  // client's changes (pending-local-wins; equal content is a no-op).
  if (dirtyState.folders) {
    await Promise.all(
      folders.map(
        (folder) =>
          syncFolder(
            folder,
            userId
          )
      )
    );
  }

  // exam_state + question rows ride on the exam row (syncExam). A pure
  // examState/answer edit only dirties examData — without this union,
  // pushAndClearDirty would clear examData having uploaded nothing and
  // the next pull would wipe the local in_progress attempt.
  const examIdsToSync = new Set();
  if (dirtyState.exams) {
    for (const exam of exams) {
      examIdsToSync.add(String(exam.id));
    }
  }
  if (isObject(dirtyState.examData)) {
    for (const examId of Object.keys(dirtyState.examData)) {
      examIdsToSync.add(String(examId));
    }
  }
  if (examIdsToSync.size > 0) {
    await Promise.all(
      exams
        .filter((exam) => examIdsToSync.has(String(exam.id)))
        .map((exam) => syncExam(exam, userId))
    );
  }

  // New-feature data: subjects, activity, settings, tags (capability-gated)
  await Promise.all([
    syncSubjects(userId, dirtyState.subjects),
    syncActivity(userId, dirtyState.activity),
    syncSettings(userId, dirtyState.settings),
    syncTags(userId, dirtyState.tags),
  ]);

  // Tag assignments ride on the full exam row pushed by syncExam — a
  // partial upsert (tag_ids only) would fail the exams UPDATE policy's
  // folder-existence WITH CHECK because folder_id would be missing.
  // syncExam already includes tag_ids when the column exists; nothing
  // extra to push here.

  return {
    folders:
      dirtyState.folders ? folders.length : 0,

    exams:
      dirtyState.exams ? exams.length : 0,
  };
}

async function applyLocalDeletesToCloud(userId, deletes) {
  if (!Array.isArray(deletes) || deletes.length === 0) return;

  const examDeletes = deletes
    .filter((d) => d && d.type === "exam")
    .map((d) => String(d.id));
  const folderDeletes = deletes
    .filter((d) => d && d.type === "folder")
    .map((d) => String(d.id));
  const tagDeletes = deletes
    .filter((d) => d && d.type === "tag")
    .map((d) => String(d.id));
  const subjectDeletes = deletes
    .filter((d) => d && d.type === "subject")
    .map((d) => String(d.id));

  if (subjectDeletes.length > 0 && schemaCapabilities.subjectsTable) {
    const { error } = await supabase
      .from("subjects")
      .delete()
      .eq("user_id", userId)
      .in("id", subjectDeletes);
    if (error) throw error;
  }

  if (examDeletes.length > 0) {
    const { error } = await supabase
      .from("exams")
      .delete()
      .eq("user_id", userId)
      .in("id", examDeletes);
    if (error) throw error;

    const { error: questionError } = await supabase
      .from("exam_questions")
      .delete()
      .eq("user_id", userId)
      .in("exam_id", examDeletes);
    if (questionError) throw questionError;
  }

  if (folderDeletes.length > 0) {
    const { error } = await supabase
      .from("folders")
      .delete()
      .eq("user_id", userId)
      .in("id", folderDeletes);
    if (error) throw error;
  }

  if (tagDeletes.length > 0 && schemaCapabilities.tagsTable) {
    const { error } = await supabase
      .from("tags")
      .delete()
      .eq("user_id", userId)
      .in("id", tagDeletes);
    if (error) throw error;
  }
}

/* =========================================================
   Cloud → Local
========================================================= */

async function getCloudFolders(
  userId
) {
  const folderColumns = ["id", "name", "created_at"];
  if (schemaCapabilities.foldersSubjectId) folderColumns.push("subject_id");
  if (schemaCapabilities.foldersRev) folderColumns.push("rev");

  const {
    data,
    error,
  } = await supabase
    .from("folders")
    .select(folderColumns.join(", "))
    .eq(
      "user_id",
      userId
    )
    .order(
      "created_at",
      {
        ascending: true,
      }
    );

  if (error) {
    throw error;
  }

  return data || [];
}

async function getCloudSubjects(
  userId
) {
  if (!schemaCapabilities.subjectsTable) {
    return [];
  }

  const { data, error } = await supabase
    .from("subjects")
    .select("id, name, color")
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  return data || [];
}

// Merge per day: keep whichever side has more recent updated_at;
// never overwrite a local day with an older cloud copy.
async function getCloudActivity(
  userId
) {
  if (!schemaCapabilities.activityTable) {
    return [];
  }

  const { data, error } = await supabase
    .from("daily_activity")
    .select("date, payload, updated_at")
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  return data || [];
}

async function getCloudSettings(
  userId
) {
  if (!schemaCapabilities.settingsTable) {
    return null;
  }

  const { data, error } = await supabase
    .from("user_settings")
    .select("settings, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function getCloudTags(userId) {
  if (!schemaCapabilities.tagsTable) {
    return [];
  }

  const { data, error } = await supabase
    .from("tags")
    .select("id, name, color")
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  return data || [];
}

async function getCloudExams(
  userId
) {
  const columns = [
    "id",
    "folder_id",
    "name",
    "question_count",
    "custom_numbering",
    "start_number",
    "end_number",
    "use_step",
    "step",
    "negative_marking",
    "note",
    "created_at",
  ];

  if (schemaCapabilities.examsType) {
    columns.push("type", "timer_duration");
    if (schemaCapabilities.examsStopwatch) {
      columns.push("stopwatch_enabled");
    }
  }
  if (schemaCapabilities.examsTagIds) {
    columns.push("tag_ids");
  }
  if (schemaCapabilities.examsAnswerKey) {
    columns.push("answer_key");
  }
  if (schemaCapabilities.examsExamState) {
    columns.push("exam_state");
  }
  if (schemaCapabilities.examsRev) {
    columns.push("rev");
  }

  const {
    data,
    error,
  } = await supabase
    .from("exams")
    .select(
      columns.join(", ")
    )
    .eq(
      "user_id",
      userId
    )
    .order(
      "created_at",
      {
        ascending: true,
      }
    );

  if (error) {
    throw error;
  }

  return data || [];
}

async function getCloudQuestionsForExam(
  userId,
  examId
) {
  const {
    data,
    error,
  } = await supabase
    .from("exam_questions")
    .select(
      `
        question_index,
        question_number,
        selected_answer,
        status,
        correct_answer,
        marked,
        tag_ids
      `
    )
    .eq(
      "user_id",
      userId
    )
    .eq(
      "exam_id",
      examId
    )
    .order(
      "question_index",
      {
        ascending: true,
      }
    );

  if (error) {
    throw error;
  }

  return data || [];
}

function buildLocalExam(
  cloudExam
) {
  const localExam = {
    id: cloudExam.id,

    folderId:
      cloudExam.folder_id,

    name:
      cloudExam.name,

    questionCount:
      cloudExam.question_count,

    customNumbering:
      Boolean(
        cloudExam.custom_numbering
      ),

    startNumber:
      cloudExam.start_number,

    endNumber:
      cloudExam.end_number,

    useStep:
      Boolean(
        cloudExam.use_step
      ),

    step:
      cloudExam.step,

    negativeMarking:
      cloudExam.negative_marking,

    createdAt:
      cloudExam.created_at,
  };

  if (schemaCapabilities.examsType) {
    localExam.type =
      cloudExam.type === "exam" ? "exam" : "practice";
    if (cloudExam.timer_duration != null) {
      localExam.timerDuration = cloudExam.timer_duration;
    }
    if (schemaCapabilities.examsStopwatch) {
      localExam.stopwatchEnabled =
        localExam.type !== "exam" && Boolean(cloudExam.stopwatch_enabled);
    }
  }
  if (schemaCapabilities.examsTagIds && Array.isArray(cloudExam.tag_ids)) {
    localExam.tagIds = cloudExam.tag_ids;
  }
  if (schemaCapabilities.examsRev && cloudExam.rev != null) {
    localExam.rev = Number(cloudExam.rev);
  }

  return localExam;
}

function buildLocalExamData(
  cloudExam,
  questions
) {
  const answers = {};
  const correctAnswers = {};
  const marked = [];
  const unresolved = [];
  const questionTags = {};
  const results = {};

  questions.forEach(
    (question) => {
      const questionNumber =
        question.question_number;

      if (
        question.selected_answer !==
        null
      ) {
        answers[
          questionNumber
        ] = String(
          question.selected_answer
        );
      }

      if (
        question.correct_answer !==
        null
      ) {
        correctAnswers[
          questionNumber
        ] = String(
          question.correct_answer
        );
      }

      if (
        question.marked
      ) {
        marked.push(
          questionNumber
        );
      }

      // Question-level tags (v2.1.1)
      if (
        schemaCapabilities.examQuestionsTagIds &&
        Array.isArray(question.tag_ids) &&
        question.tag_ids.length > 0
      ) {
        questionTags[questionNumber] = question.tag_ids.map(String);
      }

      if (
        question.status ===
          "correct" ||
        question.status ===
          "wrong"
      ) {
        results[
          questionNumber
        ] = question.status;
      }

      // First-class unresolved state (worked-on, no answer given)
      if (
        question.status ===
          "unresolved"
      ) {
        unresolved.push(
          questionNumber
        );
      }
    }
  );

  const examData = {
    answers,

    correctAnswers,

    marked,

    unresolved,

    questionTags,

    results,

    note:
      typeof cloudExam.note ===
      "string"
        ? cloudExam.note
        : "",
  };

  // Restore exam-mode fields when the schema carries them.
  // When it doesn't, they're deliberately omitted here and
  // merged back from local state in syncCloudToLocal so a
  // cloud round-trip never erases the answer key or lifecycle.
  if (schemaCapabilities.examsAnswerKey && cloudExam.answer_key) {
    examData.answerKey = cloudExam.answer_key;
  }
  if (schemaCapabilities.examsExamState && cloudExam.exam_state != null) {
    examData.examState = cloudExam.exam_state;
  }

  return examData;
}

export async function syncCloudToLocal(
  userId
) {
  if (!userId) {
    throw new Error(
      "A valid user ID is required."
    );
  }

  setStorageUser(userId);

  resetSessionPulledIfUserChanged(userId);
  await probeSchemaCapabilities();

  // Cloud→local writes must never look like local edits. The flag is
  // process-global and spans awaits, so local mutations that land
  // DURING a pull are captured via pre/post fingerprints (below) and
  // re-marked dirty rather than silently overwritten.
  setDirtySuppression(true);
  // Dirty marks that must stick even though suppression is on (local
  // mutations that raced this pull). Applied after the flag lifts.
  const deferredDirty = { folders: new Set(), exams: new Set(), examData: new Set() };
  const deferredDeletes = [];
  try {
    const dirtyState = getDirtyState();

    // Snapshot local state before any cloud fetch so concurrent local
    // edits (during network awaits) can be detected and preserved.
    const preFolders = new Map(
      getFolders().map((f) => [String(f.id), JSON.stringify(f)])
    );
    const preExams = new Map(
      getExams().map((e) => [String(e.id), JSON.stringify(e)])
    );
    const preExamData = new Map(
      getExams().map((e) => [String(e.id), JSON.stringify(getExamData(e.id))])
    );

    const [
      cloudFolders,
      cloudExams,
    ] = await Promise.all([
      getCloudFolders(
        userId
      ),
      getCloudExams(
        userId
      ),
    ]);

    // Subjects: cloud is source of truth when the table exists and the
    // local list is clean; otherwise local subjects are preserved.
    if (schemaCapabilities.subjectsTable && !dirtyState.subjects) {
      const cloudSubjects = await getCloudSubjects(userId);
      if (cloudSubjects.length > 0) {
        // Never re-adopt tombstoned subjects (deletion integrity).
        const deletedSubjectIds = new Set(getDeletedIds("subject"));
        const liveSubjects = cloudSubjects.filter(
          (s) => !deletedSubjectIds.has(String(s.id))
        );
        if (liveSubjects.length > 0) {
          cloudSave(() =>
            saveSubjects(
              liveSubjects.map((s) => ({
                id: s.id,
                name: s.name,
                color: s.color ?? undefined,
              }))
            )
          );
        }
      }
    }

    // Dirty local entities are NEVER overwritten by a pull. Cloud rows
    // for dirty entities are skipped entirely; the local version wins
    // and is re-uploaded on the next push (upload-first model).
    // Entities deleted or edited DURING this pull (fingerprint changed
    // vs pre-fetch snapshot) are treated as dirty local wins too.
    const localFoldersNow = getFolders();
    const localExamsNow = getExams();

    const concurrentFolderEdits = new Set();
    localFoldersNow.forEach((f) => {
      const before = preFolders.get(String(f.id));
      if (before !== undefined && before !== JSON.stringify(f)) {
        concurrentFolderEdits.add(String(f.id));
      }
    });
    const concurrentExamEdits = new Set();
    localExamsNow.forEach((e) => {
      const before = preExams.get(String(e.id));
      if (before !== undefined && before !== JSON.stringify(e)) {
        concurrentExamEdits.add(String(e.id));
      }
    });
    // Deletes that landed mid-pull: id existed before fetch, gone now.
    const midPullDeletedFolders = new Set(
      [...preFolders.keys()].filter(
        (id) => !localFoldersNow.some((f) => String(f.id) === id)
      )
    );
    const midPullDeletedExams = new Set(
      [...preExams.keys()].filter(
        (id) => !localExamsNow.some((e) => String(e.id) === id)
      )
    );

    const dirtyExamIds = new Set(
      Object.keys(dirtyState.examData || {}).map(String)
    );
    const deletedExamIds = new Set(getDeletedIds("exam"));

    const downloadableExams = cloudExams.filter((exam) => {
      const examId = String(exam.id);
      // Tombstoned exams are never re-adopted (metadata or questions).
      if (deletedExamIds.has(examId)) return false;
      if (midPullDeletedExams.has(examId)) return false;
      // Exam with dirty local data: keep local, re-upload later
      if (dirtyExamIds.has(examId)) return false;
      // Exam config dirty wholesale (includes local-only creates): skip pull
      if (dirtyState.exams && localExamsNow.some((e) => String(e.id) === examId)) return false;
      if (concurrentExamEdits.has(examId)) return false;
      return true;
    });

    const examDataEntries =
      await Promise.all(
        downloadableExams.map(
          async (exam) => {
            const questions =
              await getCloudQuestionsForExam(
                userId,
                exam.id
              );

            return [
              exam.id,
              buildLocalExamData(
                exam,
                questions
              ),
            ];
          }
        )
      );

    // Re-read AFTER question downloads: local edits/deletes may have
    // landed while questions were in flight.
    const localFoldersAfterQuestions = getFolders();
    const localExamsAfterQuestions = getExams();

    localFoldersAfterQuestions.forEach((f) => {
      const before = preFolders.get(String(f.id));
      if (before !== undefined && before !== JSON.stringify(f)) {
        concurrentFolderEdits.add(String(f.id));
        deferredDirty.folders.add(String(f.id));
      }
    });
    localExamsAfterQuestions.forEach((e) => {
      const before = preExams.get(String(e.id));
      if (before !== undefined && before !== JSON.stringify(e)) {
        concurrentExamEdits.add(String(e.id));
        deferredDirty.exams.add(String(e.id));
      }
    });
    // Deletes during question download: existed in pre-snapshot, gone now.
    [...preFolders.keys()].forEach((id) => {
      if (!localFoldersAfterQuestions.some((f) => String(f.id) === id)) {
        midPullDeletedFolders.add(id);
        deferredDeletes.push({ type: "folder", id });
      }
    });
    [...preExams.keys()].forEach((id) => {
      if (!localExamsAfterQuestions.some((e) => String(e.id) === id)) {
        midPullDeletedExams.add(id);
        deferredDeletes.push({ type: "exam", id });
      }
    });

    // Rebuild merged lists against the post-download local state so a
    // mid-download delete is not resurrected by saveExams/saveFolders.
    const mergedFoldersFinal = mergeFolders(
      localFoldersAfterQuestions,
      cloudFolders,
      dirtyState,
      {
        concurrentFolderEdits,
        midPullDeletedFolders,
        deferredDirty,
        // Absence means "deleted remotely" only when this account's cloud
        // list is non-empty (a complete fetch that still omits the row).
        // An empty list is ambiguous — never-synced local rows would be
        // wiped — so never treat empty as mass remote deletion.
        allowRemoteDelete: cloudFolders.length > 0,
        preFetchIds: new Set(preFolders.keys()),
      }
    );
    const downloadableFinal = downloadableExams.filter(
      (exam) => !midPullDeletedExams.has(String(exam.id))
    );
    const mergedExamsFinal = mergeExams(
      localExamsAfterQuestions,
      downloadableFinal,
      {
        midPullDeletedExams,
        concurrentExamEdits,
        deferredDirty,
        dirtyState,
        allowRemoteDelete: cloudExams.length > 0,
        preFetchIds: new Set(preExams.keys()),
      }
    );

    if (
      !cloudSave(() =>
        saveFolders(
          mergedFoldersFinal
        )
      )
    ) {
      throw new Error(
        "Failed to save cloud folders locally."
      );
    }

    if (
      !cloudSave(() =>
        saveExams(
          mergedExamsFinal
        )
      )
    ) {
      throw new Error(
        "Failed to save cloud exams locally."
      );
    }

    for (
      const [
        examId,
        examData,
      ] of examDataEntries
    ) {
      const idStr = String(examId);
      if (midPullDeletedExams.has(idStr)) continue;

      // Preserve local-only exam fields the cloud schema doesn't carry
      // yet (answer key, exam lifecycle) so a cloud round-trip on the
      // pre-migration schema can't destroy them.
      const existing = getExamData(examId);
      if (!schemaCapabilities.examsAnswerKey && existing?.answerKey) {
        examData.answerKey = existing.answerKey;
      }
      if (!schemaCapabilities.examsExamState && existing?.examState != null) {
        examData.examState = existing.examState;
      }
      // Cloud may have no exam_state (older row, mid-migration, or a
      // push that never landed). Never let that null out a local
      // in_progress attempt — one source of truth stays examState.
      // A cloud "completed" still wins (finishing is terminal).
      if (
        existing?.examState?.status === "in_progress" &&
        examData.examState?.status !== "in_progress" &&
        examData.examState?.status !== "completed"
      ) {
        examData.examState = existing.examState;
      }

      // Local examData edit landed while questions were downloading:
      // keep the local payload and re-mark dirty after suppression lifts.
      const preData = preExamData.get(idStr);
      const postData = JSON.stringify(getExamData(examId));
      const examDataEditedMidPull = preData !== undefined && preData !== postData;

      if (examDataEditedMidPull || dirtyExamIds.has(idStr)) {
        deferredDirty.examData.add(idStr);
        continue;
      }

      if (
        !cloudSave(() =>
          saveExamData(
            examId,
            examData
          )
        )
      ) {
        throw new Error(
          `Failed to save exam ${examId} data locally.`
        );
      }
    }

    // Daily activity: per-day merge. A local day that is dirty wins
    // outright (uploaded later); cloud-only days are added; a clean
    // local day is reconciled PER QUESTION KEY and studySeconds are
    // UNIONED (max) — two devices recording the same day must both
    // contribute instead of the last push wiping the other. This fixes
    // the day-level last-writer-wins data-loss hole.
    if (schemaCapabilities.activityTable) {
      const cloudActivity = await getCloudActivity(userId);
      for (const day of cloudActivity) {
        const localData = getActivity(day.date);
        const dayIsDirty = Boolean(dirtyState.activity?.[String(day.date)]);
        if (!localData) {
          cloudSave(() => saveActivity(day.date, day.payload));
        } else if (dayIsDirty) {
          // Dirty local day wins; it re-uploads on the next push.
        } else {
          const merged = mergeActivityDay(localData, day.payload);
          if (merged) {
            cloudSave(() => saveActivity(day.date, merged));
          }
        }
      }
    }

    // Settings: cloud wins only if locally absent AND clean (settings are
    // cheap to re-derive locally; avoid clobbering a just-changed
    // language/location).
    if (schemaCapabilities.settingsTable && !dirtyState.settings) {
      const cloudSettings = await getCloudSettings(userId);
      if (cloudSettings?.settings) {
        const localSettings = getSettings();
        const isDefault =
          !localSettings ||
          Object.keys(localSettings).length === 0 ||
          (localSettings.language === "fa" &&
            !localSettings.weatherLocation);
        if (isDefault) {
          cloudSave(() => saveSettings(cloudSettings.settings));
        }
      }
    }

    // Tags: cloud-only tags are added; clean local tags adopt cloud
    // names/colors; dirty local tags win (re-uploaded on next push).
    // Local tags are never dropped (tag deletes are tombstoned).
    if (schemaCapabilities.tagsTable && !dirtyState.tags) {
      const deletedTagIds = new Set(getDeletedIds("tag"));
      const cloudTags = (await getCloudTags(userId)).filter(
        (tag) => !deletedTagIds.has(String(tag.id))
      );
      const localTags = getTags();
      const cloudById = new Map(cloudTags.map((t) => [String(t.id), t]));
      const merged = localTags.map((tag) => {
        const cloudTag = cloudById.get(String(tag.id));
        if (!cloudTag) return tag;
        return {
          ...tag,
          name: cloudTag.name ?? tag.name,
          color: cloudTag.color ?? tag.color ?? undefined,
        };
      });
      const localIds = new Set(localTags.map((t) => String(t.id)));
      cloudTags.forEach((tag) => {
        if (!localIds.has(String(tag.id))) {
          merged.push({ id: tag.id, name: tag.name, color: tag.color ?? undefined });
        }
      });
      cloudSave(() => saveTags(merged));
    }

    const result = {
      folders:
        mergedFoldersFinal.length,

      exams:
        mergedExamsFinal.length,

      examData:
        examDataEntries.length,
    };
    // Completed successfully — only now may later logic trust "we've pulled".
    markSessionPulled(userId);
    return result;
  } finally {
    setDirtySuppression(false);
    // Re-apply dirty marks/tombstones for local mutations that raced
    // the pull (suppression blocked markDirty while they ran).
    try {
      applyDeferredDirtyMarks({
        folderIds: [...deferredDirty.folders],
        examIds: [...deferredDirty.exams],
        examDataIds: [...deferredDirty.examData],
        deletes: deferredDeletes,
      });
    } catch {
      // best-effort; next user edit re-arms sync
    }
  }
}

/**
 * Merge cloud folders into the local list without ever dropping a
 * local folder (local deletions are tombstoned and applied on push —
 * a pull never removes local rows). Cloud adds new rows and refreshes
 * clean rows; a dirty local folder keeps its local field values.
 */
/**
 * Reconcile one activity day between local and cloud. Both sides are
 * clean (day not dirty), so neither is "newer" in a meaningful sense —
 * instead of last-writer-wins, merge per question key:
 *   - answeredKeys: union (per-question outcome; local wins on conflict
 *     since the user is sitting here)
 *   - counts: recomputed from the union so they can never double-count
 *   - exams: unioned per examId; per-exam tallies recomputed from the
 *     keys each side contributed
 *   - studySeconds: max (study time is wall-clock union, never additive
 *     across devices — max prevents both loss and double-count)
 * Returns null when nothing changed (caller skips the write).
 */
function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeActivityDay(local, cloud) {
  if (!isObject(local) || !isObject(cloud)) return null;

  const localKeys = local.answeredKeys || {};
  const cloudKeys = cloud.answeredKeys || {};
  const mergedKeys = { ...cloudKeys, ...localKeys };

  const localSig = JSON.stringify(localKeys);
  const cloudSig = JSON.stringify(cloudKeys);
  if (localSig === cloudSig && (local.studySeconds || 0) === (cloud.studySeconds || 0)) {
    return null;
  }

  // Recompute per-exam tallies from the merged keys.
  const examIndex = new Map();
  const ensureExam = (meta) => {
    const id = String(meta.examId);
    if (!examIndex.has(id)) {
      examIndex.set(id, {
        examId: id,
        name: meta.name || "",
        folderId: meta.folderId ?? null,
        subjectId: meta.subjectId ?? null,
        solved: 0,
        correct: 0,
        wrong: 0,
        unanswered: 0,
        unresolved: 0,
        completed: Boolean(meta.completed),
        studySeconds: 0,
      });
    }
    return examIndex.get(id);
  };

  (local.exams || []).forEach(ensureExam);
  (cloud.exams || []).forEach(ensureExam);

  Object.entries(mergedKeys).forEach(([key, outcome]) => {
    const [examId] = key.split(":");
    const entry = examIndex.get(String(examId));
    if (!entry) return;
    entry.solved += 1;
    if (outcome === "correct") entry.correct += 1;
    else if (outcome === "wrong") entry.wrong += 1;
    else if (outcome === "unresolved") entry.unresolved += 1;
    else entry.unanswered += 1;
  });

  const exams = [...examIndex.values()].map((entry) => ({
    ...entry,
    // studySeconds per exam: max of both sides (same union semantics)
    studySeconds: Math.max(
      Number((local.exams || []).find((e) => String(e.examId) === entry.examId)?.studySeconds) || 0,
      Number((cloud.exams || []).find((e) => String(e.examId) === entry.examId)?.studySeconds) || 0
    ),
  }));

  const totals = exams.reduce(
    (acc, e) => ({
      solved: acc.solved + e.solved,
      correct: acc.correct + e.correct,
      wrong: acc.wrong + e.wrong,
      unanswered: acc.unanswered + e.unanswered,
      unresolved: acc.unresolved + e.unresolved,
    }),
    { solved: 0, correct: 0, wrong: 0, unanswered: 0, unresolved: 0 }
  );

  return {
    ...cloud,
    ...totals,
    studySeconds: Math.max(Number(local.studySeconds) || 0, Number(cloud.studySeconds) || 0),
    answeredKeys: mergedKeys,
    exams,
  };
}

function mergeFolders(localFolders, incomingCloudFolders, dirtyState, race = {}) {
  const {
    concurrentFolderEdits = new Set(),
    midPullDeletedFolders = new Set(),
    deferredDirty = null,
    allowRemoteDelete = false,
    preFetchIds = null,
  } = race;
  // Tombstoned folders must never be re-adopted from the cloud — a
  // stale device re-uploading them, or a pull racing the delete push,
  // must not resurrect the deletion.
  const deletedIds = new Set(getDeletedIds("folder"));
  const cloudFolders = incomingCloudFolders.filter(
    (folder) =>
      !deletedIds.has(String(folder.id)) &&
      !midPullDeletedFolders.has(String(folder.id))
  );

  const cloudById = new Map(
    cloudFolders.map((folder) => [String(folder.id), folder])
  );

  const merged = [];
  localFolders.forEach((folder) => {
    const id = String(folder.id);
    const cloudFolder = cloudById.get(id);

    if (!cloudFolder) {
      // Remote deletion adoption: only when the section is clean, the
      // cloud list is trusted, this row existed before the pull (a
      // mid-pull create is local work), and it is not dirty/tombstoned/
      // concurrently edited. Dirty local-only rows stay until pushed.
      const existedBeforePull = preFetchIds == null || preFetchIds.has(id);
      const canAdoptRemoteDelete =
        allowRemoteDelete &&
        existedBeforePull &&
        !dirtyState.folders &&
        !concurrentFolderEdits.has(id) &&
        !midPullDeletedFolders.has(id) &&
        !deletedIds.has(id);
      if (canAdoptRemoteDelete) return;
      merged.push(folder);
      return;
    }

    // Local values win for a dirty collection (re-uploaded on push).
    // Concurrent local edits during this pull also win.
    if (dirtyState.folders || concurrentFolderEdits.has(id)) {
      merged.push(folder);
      return;
    }

    // Rev conflict merge: higher rev wins. Ties fall through to adopt
    // cloud (equal content is a no-op; equal rev means same generation).
    if (schemaCapabilities.foldersRev) {
      const localRev = Number(folder.rev) || 0;
      const cloudRev = Number(cloudFolder.rev) || 0;
      if (localRev > cloudRev) {
        deferredDirty?.folders?.add(id);
        merged.push(folder);
        return;
      }
    }

    merged.push({
      ...folder,
      name: cloudFolder.name ?? folder.name,
      subjectId:
        schemaCapabilities.foldersSubjectId &&
        cloudFolder.subject_id != null
          ? cloudFolder.subject_id
          : folder.subjectId ?? null,
      createdAt: cloudFolder.created_at ?? folder.createdAt,
      ...(schemaCapabilities.foldersRev && cloudFolder.rev != null
        ? { rev: Number(cloudFolder.rev) }
        : {}),
    });
  });

  // Cloud-only folders are additions — always accepted.
  const localIds = new Set(localFolders.map((f) => String(f.id)));
  cloudFolders.forEach((folder) => {
    if (!localIds.has(String(folder.id))) {
      merged.push({
        id: folder.id,
        name: folder.name,
        subjectId:
          schemaCapabilities.foldersSubjectId &&
          folder.subject_id != null
            ? folder.subject_id
            : null,
        createdAt: folder.created_at,
        ...(schemaCapabilities.foldersRev && folder.rev != null
          ? { rev: Number(folder.rev) }
          : {}),
      });
    }
  });

  return merged;
}

/**
 * Merge cloud exam configs into the local list. Local exams are never
 * dropped (deletes are tombstoned); clean exams adopt cloud config;
 * cloud-only exams are added.
 *
 * Conflict merge: when `rev` exists the higher rev wins; concurrent
 * local edits during this pull also keep local values.
 */
function mergeExams(localExams, incomingCloudExams, race = {}) {
  const {
    midPullDeletedExams = new Set(),
    concurrentExamEdits = new Set(),
    deferredDirty = null,
    dirtyState = {},
    allowRemoteDelete = false,
    preFetchIds = null,
  } = race;
  const deletedIds = new Set(getDeletedIds("exam"));
  const downloadableCloudExams = incomingCloudExams.filter(
    (exam) =>
      !deletedIds.has(String(exam.id)) &&
      !midPullDeletedExams.has(String(exam.id))
  );

  const cloudById = new Map(
    downloadableCloudExams.map((exam) => [String(exam.id), exam])
  );

  const merged = [];
  localExams.forEach((exam) => {
    const id = String(exam.id);
    const cloudExam = cloudById.get(id);

    if (!cloudExam) {
      // Remote deletion adoption (same rules as folders).
      const existedBeforePull = preFetchIds == null || preFetchIds.has(id);
      const canAdoptRemoteDelete =
        allowRemoteDelete &&
        existedBeforePull &&
        !dirtyState.exams &&
        !dirtyState.examData?.[id] &&
        !concurrentExamEdits.has(id) &&
        !midPullDeletedExams.has(id) &&
        !deletedIds.has(id);
      if (canAdoptRemoteDelete) return;
      merged.push(exam);
      return;
    }

    if (concurrentExamEdits.has(id)) {
      merged.push(exam);
      return;
    }

    if (schemaCapabilities.examsRev) {
      const localRev = Number(exam.rev) || 0;
      const cloudRev = Number(cloudExam.rev) || 0;
      if (localRev > cloudRev) {
        deferredDirty?.exams?.add(id);
        merged.push(exam);
        return;
      }
    }

    merged.push({ ...exam, ...buildLocalExam(cloudExam), id: exam.id });
  });

  const localIds = new Set(localExams.map((e) => String(e.id)));
  downloadableCloudExams.forEach((exam) => {
    if (!localIds.has(String(exam.id))) {
      merged.push(buildLocalExam(exam));
    }
  });

  return merged;
}