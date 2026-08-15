const STORAGE_PREFIX = "testbox-";

let currentUserId = null;


// =========================================================
// Storage Adapter
// =========================================================

const storageAdapter = {
  getItem(key) {
    return localStorage.getItem(key);
  },

  setItem(key, value) {
    localStorage.setItem(key, value);
  },

  removeItem(key) {
    localStorage.removeItem(key);
  },

  keys() {
    return Object.keys(localStorage);
  },
};

export function setStorageUser(userId) {
  currentUserId = userId;
}

function getStoragePrefix() {
  return currentUserId
    ? `${STORAGE_PREFIX}${currentUserId}-`
    : STORAGE_PREFIX;
}

function getFoldersKey() {
  return `${getStoragePrefix()}folders`;
}

function getExamsKey() {
  return `${getStoragePrefix()}exams`;
}

function getExamDataPrefix() {
  return `${getStoragePrefix()}exam-`;
}

const THEME_KEY = `${STORAGE_PREFIX}theme`;

export const MAX_QUESTIONS = 5000;

const CURRENT_BACKUP_VERSION = 1;

function notifyLocalChange() {
  window.dispatchEvent(
    new CustomEvent(
      "testbox-local-change"
    )
  );  
}

const DEFAULT_EXAM_DATA = {
  answers: {},
  correctAnswers: {},
  marked: [],
  results: {},
  note: "",
};

// =========================================================
// Internal Helpers
// =========================================================

function createDefaultExamData() {
  return {
    answers: {},
    correctAnswers: {},
    marked: [],
    results: {},
    note: "",
  };
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isValidId(value) {
  return (
    (typeof value === "string" &&
      value.trim() !== "") ||
    (typeof value === "number" &&
      Number.isFinite(value))
  );
}

function readJson(key, fallback) {
  try {
    const saved =
      storageAdapter.getItem(key);

    if (!saved) {
      return fallback;
    }

    const parsed = JSON.parse(saved);

    return parsed ?? fallback;
  } catch (error) {
    console.error(
      `Failed to read localStorage key "${key}"`,
      error
    );

    return fallback;
  }
}

function writeJson(key, value) {
  try {
    storageAdapter.setItem(
      key,
      JSON.stringify(value)
    );

    return true;
  } catch (error) {
    console.error(
      `Failed to write localStorage key "${key}"`,
      error
    );

    return false;
  }
}

function removeKey(key) {
  try {
    storageAdapter.removeItem(key);
    return true;
  } catch (error) {
    console.error(
      `Failed to remove localStorage key "${key}"`,
      error
    );

    return false;
  }
}

function getExamDataKey(examId) {
  return `${getExamDataPrefix()}${examId}`;
}

function idsEqual(a, b) {
  return String(a) === String(b);
}

// =========================================================
// Entity Validation
// =========================================================

function isValidFolder(folder) {
  return (
    isObject(folder) &&
    isValidId(folder.id) &&
    typeof folder.name === "string" &&
    folder.name.trim() !== "" &&
    typeof folder.createdAt === "string"
  );
}

function isValidExam(exam) {
  return (
    isObject(exam) &&
    isValidId(exam.id) &&
    isValidId(exam.folderId) &&
    typeof exam.name === "string" &&
    exam.name.trim() !== "" &&
    Number.isInteger(
      Number(exam.questionCount)
    ) &&
    Number(exam.questionCount) >= 1 &&
    Number(exam.questionCount) <=
      MAX_QUESTIONS &&
    typeof exam.createdAt === "string"
  );
}

function validateFolders(folders) {
  return (
    Array.isArray(folders) &&
    folders.every(isValidFolder)
  );
}

function validateExams(exams) {
  return (
    Array.isArray(exams) &&
    exams.every(isValidExam)
  );
}

// =========================================================
// Data Normalization
// =========================================================

function normalizeExamData(data) {
  if (!isObject(data)) {
    return createDefaultExamData();
  }

  return {
    answers:
      isObject(data.answers)
        ? data.answers
        : {},

    correctAnswers:
      isObject(data.correctAnswers)
        ? data.correctAnswers
        : {},

    marked:
      Array.isArray(data.marked)
        ? data.marked
        : [],

    results:
      isObject(data.results)
        ? data.results
        : {},

    note:
      typeof data.note === "string"
        ? data.note
        : "",
  };
}

// =========================================================
// Folders
// =========================================================

export function getFolders() {
  const folders = readJson(
    getFoldersKey(),
    []
  );

  return Array.isArray(folders)
    ? folders
    : [];
}

export function saveFolders(folders) {
  if (!validateFolders(folders)) {
    console.error(
      "Cannot save folders: invalid folder data."
    );

    return false;
  }

  return writeJson(
    getFoldersKey(),
    folders
  );
}

export function createFolder(folder) {
  if (!isValidFolder(folder)) {
    return false;
  }

  const folders = getFolders();

  if (
    folders.some((item) =>
      idsEqual(item.id, folder.id)
    )
  ) {
    return false;
  }

  const saved = saveFolders([
    ...folders,
    folder,
  ]);

  if (saved) {
    notifyLocalChange();
  }

  return saved;
}

export function updateFolder(
  folderId,
  updates
) {
  if (
    !isValidId(folderId) ||
    !isObject(updates)
  ) {
    return false;
  }

  const folders = getFolders();

  const index = folders.findIndex(
    (folder) =>
      idsEqual(
        folder.id,
        folderId
      )
  );

  if (index === -1) {
    return false;
  }

  const updatedFolder = {
    ...folders[index],
    ...updates,
    id: folders[index].id,
  };

  if (!isValidFolder(updatedFolder)) {
    return false;
  }

  const updatedFolders = [
    ...folders,
  ];

  updatedFolders[index] =
    updatedFolder;

  const saved =
    saveFolders(
      updatedFolders
    );

  if (saved) {
    notifyLocalChange();
  }

  return saved;
}

export function deleteFolder(
  folderId
) {
  if (!isValidId(folderId)) {
    return false;
  }

  const folders = getFolders();

  const folderExists =
    folders.some(
      (folder) =>
        idsEqual(
          folder.id,
          folderId
        )
    );

  if (!folderExists) {
    return false;
  }

  const exams = getExams();

  const examsToDelete =
    exams.filter(
      (exam) =>
        idsEqual(
          exam.folderId,
          folderId
        )
    );

  const remainingFolders =
    folders.filter(
      (folder) =>
        !idsEqual(
          folder.id,
          folderId
        )
    );

  const remainingExams =
    exams.filter(
      (exam) =>
        !idsEqual(
          exam.folderId,
          folderId
        )
    );

  if (
    !saveFolders(
      remainingFolders
    )
  ) {
    return false;
  }

  if (
    !saveExams(
      remainingExams
    )
  ) {
    return false;
  }

  for (
    const exam of examsToDelete
  ) {
    removeExamData(exam.id);
  }

  notifyLocalChange();

  return true;
}

export function removeFolders() {
  return removeKey(
    getFoldersKey()
  );
}

// =========================================================
// Exams
// =========================================================

export function getExams() {
  const exams = readJson(
    getExamsKey(),
    []
  );

  return Array.isArray(exams)
    ? exams
    : [];
}

export function saveExams(exams) {
  if (!validateExams(exams)) {
    console.error(
      "Cannot save exams: invalid exam data."
    );

    return false;
  }

  return writeJson(
    getExamsKey(),
    exams
  );
}

export function createExam(exam) {
  if (!isValidExam(exam)) {
    return false;
  }

  const folders =
    getFolders();

  const folderExists =
    folders.some(
      (folder) =>
        idsEqual(
          folder.id,
          exam.folderId
        )
    );

  if (!folderExists) {
    return false;
  }

  const exams = getExams();

  if (
    exams.some((item) =>
      idsEqual(
        item.id,
        exam.id
      )
    )
  ) {
    return false;
  }

  const saved = saveExams([
    ...exams,
    exam,
  ]);

  if (saved) {
    notifyLocalChange();
  }

  return saved;
}

export function updateExam(
  examId,
  updates
) {
  if (
    !isValidId(examId) ||
    !isObject(updates)
  ) {
    return false;
  }

  const exams = getExams();

  const index = exams.findIndex(
    (exam) =>
      idsEqual(
        exam.id,
        examId
      )
  );

  if (index === -1) {
    return false;
  }

  const updatedExam = {
    ...exams[index],
    ...updates,
    id: exams[index].id,
  };

  if (!isValidExam(updatedExam)) {
    return false;
  }

  const folderExists =
    getFolders().some(
      (folder) =>
        idsEqual(
          folder.id,
          updatedExam.folderId
        )
    );

  if (!folderExists) {
    return false;
  }

  const updatedExams = [
    ...exams,
  ];

  updatedExams[index] =
    updatedExam;

  const saved =
    saveExams(
      updatedExams
    );

  if (saved) {
    notifyLocalChange();
  }

  return saved;
}

export function moveExam(
  examId,
  folderId
) {
  if (
    !isValidId(examId) ||
    !isValidId(folderId)
  ) {
    return false;
  }

  return updateExam(
    examId,
    {
      folderId,
    }
  );
}

export function deleteExam(examId) {
  if (!isValidId(examId)) {
    return false;
  }

  const exams = getExams();

  const exists = exams.some(
    (exam) =>
      idsEqual(
        exam.id,
        examId
      )
  );

  if (!exists) {
    return false;
  }

  const updatedExams =
    exams.filter(
      (exam) =>
        !idsEqual(
          exam.id,
          examId
        )
    );

  if (
    !saveExams(
      updatedExams
    )
  ) {
    return false;
  }

  const removed =
    removeExamData(
      examId
    );

  if (removed) {
    notifyLocalChange();
  }

  return removed;
}

export function removeExams() {
  return removeKey(
    getExamsKey()
  );
}

// =========================================================
// Individual Exam Data
// =========================================================

export function getExamData(
  examId
) {
  if (!isValidId(examId)) {
    return createDefaultExamData();
  }

  const data = readJson(
    getExamDataKey(examId),
    DEFAULT_EXAM_DATA
  );

  return normalizeExamData(
    data
  );
}

export function saveExamData(
  examId,
  data
) {
  if (
    !isValidId(examId) ||
    !isObject(data)
  ) {
    return false;
  }

  const examExists =
    getExams().some(
      (exam) =>
        idsEqual(
          exam.id,
          examId
        )
    );

  if (!examExists) {
    return false;
  }

  const normalizedData =
    normalizeExamData(data);

  const saved =
    writeJson(
      getExamDataKey(examId),
      normalizedData
    );

  if (saved) {
    notifyLocalChange();
  }

  return saved;
}

export function removeExamData(
  examId
) {
  if (!isValidId(examId)) {
    return false;
  }

  return removeKey(
    getExamDataKey(examId)
  );
}

// =========================================================
// Backup
// =========================================================

export function createBackup() {
  const folders =
    getFolders();

  const exams =
    getExams();

  const examData = {};

  exams.forEach((exam) => {
    examData[
      `${getExamDataPrefix()}${exam.id}`
    ] = getExamData(
      exam.id
    );
  });

  return {
    app: "TestBox",
    version:
      CURRENT_BACKUP_VERSION,
    createdAt:
      new Date().toISOString(),
    folders,
    exams,
    examData,
  };
}

export function validateBackup(
  backup
) {
  if (!isObject(backup)) {
    return false;
  }

  if (
    backup.app !==
    "TestBox"
  ) {
    return false;
  }

  if (
    !Number.isInteger(
      backup.version
    ) ||
    backup.version < 1 ||
    backup.version >
      CURRENT_BACKUP_VERSION
  ) {
    return false;
  }

  if (
    !validateFolders(
      backup.folders
    )
  ) {
    return false;
  }

  if (
    !validateExams(
      backup.exams
    )
  ) {
    return false;
  }

  if (
    !isObject(
      backup.examData
    )
  ) {
    return false;
  }

  const folderIds =
    new Set(
      backup.folders.map(
        (folder) =>
          String(
            folder.id
          )
      )
    );

  const examIds =
    new Set(
      backup.exams.map(
        (exam) =>
          String(
            exam.id
          )
      )
    );

  const seenExamIds =
    new Set();

  for (
    const exam of
    backup.exams
  ) {
    const examId =
      String(exam.id);

    if (
      seenExamIds.has(
        examId
      )
    ) {
      return false;
    }

    seenExamIds.add(
      examId
    );

    if (
      !folderIds.has(
        String(
          exam.folderId
        )
      )
    ) {
      return false;
    }
  }

  for (
    const [
      key,
      value,
    ] of Object.entries(
      backup.examData
    )
  ) {
    if (
      !key.startsWith(
        getExamDataPrefix()
      )
    ) {
      continue;
    }

    const examId =
      key.slice(
        getExamDataPrefix()
          .length
      );

    if (
      !examIds.has(
        String(examId)
      )
    ) {
      return false;
    }

    if (
      !isObject(value)
    ) {
      return false;
    }
  }

  return true;
}

function migrateBackup(
  backup
) {
  return backup;
}

export function restoreBackup(
  backup
) {
  if (
    !validateBackup(
      backup
    )
  ) {
    return false;
  }

  const migratedBackup =
    migrateBackup(
      backup
    );

  try {
    const cleared =
      clearAll();

    if (!cleared) {
      return false;
    }

    if (
      !writeJson(
        getFoldersKey(),
        migratedBackup.folders
      )
    ) {
      return false;
    }

    if (
      !writeJson(
        getExamsKey(),
        migratedBackup.exams
      )
    ) {
      return false;
    }

    for (
      const [
        key,
        value,
      ] of Object.entries(
        migratedBackup.examData
      )
    ) {
      if (
        !key.startsWith(
          getExamDataPrefix()
        )
      ) {
        continue;
      }

      if (
        !writeJson(
          key,
          value
        )
      ) {
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error(
      "Failed to restore backup",
      error
    );

    return false;
  }
}

// =========================================================
// Clear All TestBox Data
// =========================================================

export function clearAll() {
  try {
    storageAdapter.keys()
      .filter(
        (key) =>
          key.startsWith(
            STORAGE_PREFIX
          ) &&
          key !== THEME_KEY
      )
      .forEach((key) => {
        storageAdapter.removeItem(
          key
        );
      });

    return true;
  } catch (error) {
    console.error(
      "Failed to clear TestBox data",
      error
    );

    return false;
  }
}