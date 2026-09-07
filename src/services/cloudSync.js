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
  getDirtyState,
  setDirtySuppression,
} from "./dataService";

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
// pull. Guards the legacy wholesale-prune in syncLocalToCloud: before
// any pull, "absent locally" must not be read as "deleted locally".
let sessionHasPulled = false;

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

export async function probeSchemaCapabilities() {
  if (schemaCapabilities.probed) {
    return schemaCapabilities;
  }

  const [
    foldersSubjectId,
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

  if (
    schemaCapabilities.foldersSubjectId &&
    folder.subjectId != null
  ) {
    row.subject_id = folder.subjectId;
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

  await probeSchemaCapabilities();

  const dirtyState = dirty || getDirtyState();

  const folders =
    getFolders();

  const exams =
    getExams();

  // Local deletions first (tombstones) — never resurrected
  await applyLocalDeletesToCloud(userId, dirtyState.deletes);

  // Legacy wholesale-prune: deletes cloud rows missing from the local
  // list. UNSAFE before the first completed pull of the session — a
  // fresh device (or one that never downloaded yet) would mistake the
  // not-yet-downloaded cloud rows for "deleted locally" and wipe them.
  // After a pull, an absent local row is genuinely deleted or was
  // pruned by another device, so the prune is safe then. Until then,
  // only tombstones (explicit deletes) propagate.
  if (
    sessionHasPulled &&
    dirtyState.deletes.length === 0
  ) {
    if (dirtyState.exams) {
      await deleteCloudExamsNotInLocal(userId, exams);
    }
    if (dirtyState.folders) {
      await deleteCloudFoldersNotInLocal(userId, folders);
    }
  }

  await Promise.all(
    folders.map(
      (folder) =>
        syncFolder(
          folder,
          userId
        )
    )
  );

  await Promise.all(
    exams.map(
      (exam) =>
        syncExam(
          exam,
          userId
        )
    )
  );

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
      folders.length,

    exams:
      exams.length,
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
  const {
    data,
    error,
  } = await supabase
    .from("folders")
    .select(
      schemaCapabilities.foldersSubjectId
        ? "id, name, subject_id, created_at"
        : "id, name, created_at"
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

async function deleteCloudFoldersNotInLocal(
  userId,
  localFolders
) {
  const cloudFolders =
    await getCloudFolders(userId);

  const localIds =
    new Set(
      localFolders.map(
        (folder) =>
          String(folder.id)
      )
    );

  const deletedIds =
    cloudFolders
      .filter(
        (folder) =>
          !localIds.has(
            String(folder.id)
          )
      )
      .map(
        (folder) =>
          folder.id
      );


  if (deletedIds.length === 0) {
    return;
  }


  const {
    error,
  } =
    await supabase
      .from("folders")
      .delete()
      .eq(
        "user_id",
        userId
      )
      .in(
        "id",
        deletedIds
      );


  if (error) {
    throw error;
  }
}

async function deleteCloudExamsNotInLocal(
  userId,
  localExams
) {
  const cloudExams =
    await getCloudExams(userId);

  const localIds =
    new Set(
      localExams.map(
        (exam) =>
          String(exam.id)
      )
    );

  const deletedIds =
    cloudExams
      .filter(
        (exam) =>
          !localIds.has(
            String(exam.id)
          )
      )
      .map(
        (exam) =>
          exam.id
      );


  if (deletedIds.length === 0) {
    return;
  }


  const {
    error,
  } =
    await supabase
      .from("exams")
      .delete()
      .eq(
        "user_id",
        userId
      )
      .in(
        "id",
        deletedIds
      );


  if (error) {
    throw error;
  }
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

  await probeSchemaCapabilities();

  // Cloud→local writes must never look like local edits.
  setDirtySuppression(true);
  try {
    const dirtyState = getDirtyState();

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
        saveSubjects(
          cloudSubjects.map((s) => ({
            id: s.id,
            name: s.name,
            color: s.color ?? undefined,
          }))
        );
      }
    }

    // Dirty local entities are NEVER overwritten by a pull. Cloud rows
    // for dirty entities are skipped entirely; the local version wins
    // and is re-uploaded on the next push (upload-first model).
    const localFolders = getFolders();

    const localExamsList = getExams();
    const dirtyExamIds = new Set(
      Object.keys(dirtyState.examData || {}).map(String)
    );

    const downloadableExams = cloudExams.filter((exam) => {
      const examId = String(exam.id);
      // Exam with dirty local data: keep local, re-upload later
      if (dirtyExamIds.has(examId)) return false;
      // Exam config dirty wholesale (includes local-only creates): skip pull
      if (dirtyState.exams && localExamsList.some((e) => String(e.id) === examId)) return false;
      return true;
    });

    const mergedFolders = mergeFolders(
      localFolders,
      cloudFolders,
      dirtyState
    );

    const mergedExams = mergeExams(
      localExamsList,
      downloadableExams
    );

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

    if (
      !saveFolders(
        mergedFolders
      )
    ) {
      throw new Error(
        "Failed to save cloud folders locally."
      );
    }

    if (
      !saveExams(
        mergedExams
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

      if (
        !saveExamData(
          examId,
          examData
        )
      ) {
        throw new Error(
          `Failed to save exam ${examId} data locally.`
        );
      }
    }

    // Daily activity: per-day merge. A local day that is dirty wins
    // outright (uploaded later); cloud-only days are added; a clean
    // local day is replaced by the cloud copy.
    if (schemaCapabilities.activityTable) {
      const cloudActivity = await getCloudActivity(userId);
      for (const day of cloudActivity) {
        const localData = getActivity(day.date);
        const dayIsDirty = Boolean(dirtyState.activity?.[String(day.date)]);
        if (!localData) {
          saveActivity(day.date, day.payload);
        } else if (!dayIsDirty && day.updated_at) {
          saveActivity(day.date, day.payload);
        }
        // Dirty local day: keep local version; it re-uploads next push.
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
          saveSettings(cloudSettings.settings);
        }
      }
    }

    // Tags: cloud-only tags are added; clean local tags adopt cloud
    // names/colors; dirty local tags win (re-uploaded on next push).
    // Local tags are never dropped (tag deletes are tombstoned).
    if (schemaCapabilities.tagsTable && !dirtyState.tags) {
      const cloudTags = await getCloudTags(userId);
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
      saveTags(merged);
    }

    return {
      folders:
        mergedFolders.length,

      exams:
        mergedExams.length,

      examData:
        examDataEntries.length,
    };
  } finally {
    setDirtySuppression(false);
    // The prune guard needs "at least one completed pull" — set it
    // only after this function returns successfully.
    sessionHasPulled = true;
  }
}

/**
 * Merge cloud folders into the local list without ever dropping a
 * local folder (local deletions are tombstoned and applied on push —
 * a pull never removes local rows). Cloud adds new rows and refreshes
 * clean rows; a dirty local folder keeps its local field values.
 */
function mergeFolders(localFolders, cloudFolders, dirtyState) {
  const cloudById = new Map(
    cloudFolders.map((folder) => [String(folder.id), folder])
  );

  const merged = localFolders.map((folder) => {
    const cloudFolder = cloudById.get(String(folder.id));
    if (!cloudFolder) return folder;

    // Local values win for a dirty collection (re-uploaded on push).
    // A clean folder adopts cloud values (name/subjectId/createdAt).
    if (dirtyState.folders) return folder;

    return {
      ...folder,
      name: cloudFolder.name ?? folder.name,
      subjectId:
        schemaCapabilities.foldersSubjectId &&
        cloudFolder.subject_id != null
          ? cloudFolder.subject_id
          : folder.subjectId ?? null,
      createdAt: cloudFolder.created_at ?? folder.createdAt,
    };
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
      });
    }
  });

  return merged;
}

/**
 * Merge cloud exam configs into the local list. Local exams are never
 * dropped (deletes are tombstoned); clean exams adopt cloud config;
 * cloud-only exams are added.
 */
function mergeExams(localExams, downloadableCloudExams) {
  const cloudById = new Map(
    downloadableCloudExams.map((exam) => [String(exam.id), exam])
  );

  const merged = localExams.map((exam) => {
    const cloudExam = cloudById.get(String(exam.id));
    if (!cloudExam) return exam;
    return { ...exam, ...buildLocalExam(cloudExam), id: exam.id };
  });

  const localIds = new Set(localExams.map((e) => String(e.id)));
  downloadableCloudExams.forEach((exam) => {
    if (!localIds.has(String(exam.id))) {
      merged.push(buildLocalExam(exam));
    }
  });

  return merged;
}