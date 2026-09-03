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
  getAllActivityDates,
  getSettings,
  saveSettings,
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
  subjectsTable: false,
  activityTable: false,
  settingsTable: false,
};

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
    subjectsTable,
    activityTable,
    settingsTable,
  ] = await Promise.all([
    columnExists("folders", "subject_id"),
    columnExists("exams", "type"),
    columnExists("exams", "answer_key"),
    columnExists("exams", "exam_state"),
    tableExists("subjects"),
    tableExists("daily_activity"),
    tableExists("user_settings"),
  ]);

  schemaCapabilities.foldersSubjectId = foldersSubjectId;
  schemaCapabilities.examsType = examsType;
  schemaCapabilities.examsAnswerKey = examsAnswerKey;
  schemaCapabilities.examsExamState = examsExamState;
  schemaCapabilities.subjectsTable = subjectsTable;
  schemaCapabilities.activityTable = activityTable;
  schemaCapabilities.settingsTable = settingsTable;
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

      const hasData =
        selectedAnswer ||
        correctAnswer ||
        result ||
        isMarked;

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
  userId
) {
  if (!schemaCapabilities.subjectsTable) {
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

// Local activity wins per day (activity days are authored on one device per
// day in practice); remote days not present locally are pulled on download.
async function syncActivity(
  userId
) {
  if (!schemaCapabilities.activityTable) {
    return;
  }

  const dates = getAllActivityDates();

  if (dates.length === 0) {
    return;
  }

  const rows = dates
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
  userId
) {
  if (!schemaCapabilities.settingsTable) {
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

  // Legacy wholesale-prune: only when the dirty registry carries no
  // tombstones for the section (prevents wiping cloud rows on a
  // fresh/offline-seeded device whose local list is incomplete).
  if (dirtyState.deletes.length === 0) {
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

  // New-feature data: subjects, activity, settings (capability-gated)
  await Promise.all([
    syncSubjects(userId),
    syncActivity(userId),
    syncSettings(userId),
  ]);

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
        marked
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
    }
  );

  const examData = {
    answers,

    correctAnswers,

    marked,

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