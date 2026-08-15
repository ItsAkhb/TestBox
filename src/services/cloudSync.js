import { supabase } from "./supabaseClient";

import {
  getFolders,
  getExams,
  getExamData,
  saveFolders,
  saveExams,
  saveExamData,
  setStorageUser,
} from "./dataService";

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
  const { error } =
    await supabase
      .from("folders")
      .upsert(
        {
          id: folder.id,
          user_id: userId,
          name: folder.name,
          created_at:
            folder.createdAt,
          updated_at:
            new Date().toISOString(),
        },
        {
          onConflict: "id",
        }
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

  const { error } =
    await supabase
      .from("exams")
      .upsert(
        {
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
        },
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
========================================================= */

export async function syncLocalToCloud(
  userId
) {
  if (!userId) {
    throw new Error(
      "A valid user ID is required."
    );
  }

  setStorageUser(userId);

  const folders =
    getFolders();


  const exams =
    getExams();



  await deleteCloudExamsNotInLocal(
    userId,
    exams
  );


  await deleteCloudFoldersNotInLocal(
    userId,
    folders
  );



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



  return {
    folders:
      folders.length,

    exams:
      exams.length,
  };
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
      "id, name, created_at"
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
  const {
    data,
    error,
  } = await supabase
    .from("exams")
    .select(
      `
        id,
        folder_id,
        name,
        question_count,
        custom_numbering,
        start_number,
        end_number,
        use_step,
        step,
        negative_marking,
        note,
        created_at
      `
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
  return {
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

  return {
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

  const localFolders =
    cloudFolders.map(
      (folder) => ({
        id: folder.id,

        name: folder.name,

        createdAt:
          folder.created_at,
      })
    );

  const localExams =
    cloudExams.map(
      buildLocalExam
    );

  const examDataEntries =
    await Promise.all(
      cloudExams.map(
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
      localFolders
    )
  ) {
    throw new Error(
      "Failed to save cloud folders locally."
    );
  }

  if (
    !saveExams(
      localExams
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

  return {
    folders:
      localFolders.length,

    exams:
      localExams.length,

    examData:
      examDataEntries.length,
  };
}