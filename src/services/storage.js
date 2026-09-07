const STORAGE_PREFIX = "testbox-";

let currentUserId = null;

// Suppresses dirty-marking while cloud code writes local storage
// (uploads stay uploads; cloud→local pulls must not look like edits).
let suppressDirty = false;

export function setDirtySuppression(active) {
  suppressDirty = Boolean(active);
}


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

const CURRENT_BACKUP_VERSION = 2;

function notifyLocalChange() {
  window.dispatchEvent(
    new CustomEvent(
      "testbox-local-change"
    )
  );
}

// =========================================================
// Dirty Tracking (offline-first)
//
// Persistent registry of unsynced local mutations. Survives
// restarts; the sync engine uploads dirty entries then clears
// them. Cloud→local writes set suppressDirty so pulls never
// look like local edits.
// =========================================================

function getDirtyKey() {
  return `${getStoragePrefix()}dirty`;
}

function readDirty() {
  const dirty = readJson(getDirtyKey(), null);
  return dirty && isObject(dirty)
    ? {
        folders: Boolean(dirty.folders),
        exams: Boolean(dirty.exams),
        examData:
          dirty.examData && isObject(dirty.examData)
            ? dirty.examData
            : {},
        subjects: Boolean(dirty.subjects),
        activity:
          dirty.activity && isObject(dirty.activity)
            ? dirty.activity
            : {},
        settings: Boolean(dirty.settings),
        tags: Boolean(dirty.tags),
        deletes: Array.isArray(dirty.deletes) ? dirty.deletes : [],
      }
    : {
        folders: false,
        exams: false,
        examData: {},
        subjects: false,
        activity: {},
        settings: false,
        tags: false,
        deletes: [],
      };
}

function writeDirty(dirty) {
  return writeJson(getDirtyKey(), dirty);
}

function markDirty(section, id = null) {
  if (suppressDirty) return;
  const dirty = readDirty();
  if (section === "deletes") {
    if (!Array.isArray(dirty.deletes)) dirty.deletes = [];
    const signature = `${id.type}:${id.id}`;
    if (!dirty.deletes.some((d) => `${d.type}:${d.id}` === signature)) {
      dirty.deletes.push(id);
    }
  } else if (id == null) {
    dirty[section] = true;
  } else {
    if (!isObject(dirty[section])) dirty[section] = {};
    dirty[section][String(id)] = true;
  }
  writeDirty(dirty);
}

function clearDirty(section, ids = null) {
  const dirty = readDirty();
  if (section === "deletes") {
    dirty.deletes = [];
  } else if (ids == null) {
    dirty[section] = section === "examData" || section === "activity" ? {} : false;
  } else {
    if (!isObject(dirty[section])) dirty[section] = {};
    ids.forEach((id) => delete dirty[section][String(id)]);
  }
  writeDirty(dirty);
}

function hasDirtyChanges() {
  const d = readDirty();
  return (
    d.folders ||
    d.exams ||
    d.subjects ||
    d.settings ||
    d.tags ||
    Object.keys(d.examData).length > 0 ||
    Object.keys(d.activity).length > 0 ||
    d.deletes.length > 0
  );
}

function recordLocalDelete(type, id) {
  if (suppressDirty) return;
  markDirty("deletes", { type, id: String(id) });
  // A local delete also dirties the owning collection so the cloud
  // row for any resurrected/renamed entity is refreshed on next upload.
  const owners = { folder: "folders", exam: "exams", tag: "tags" };
  markDirty(owners[type] || "folders", null);
}

export function getDirtyState() {
  return readDirty();
}

export function hasPendingLocalChanges() {
  return hasDirtyChanges();
}

export function clearDirtySection(section, ids = null) {
  clearDirty(section, ids);
}

const DEFAULT_EXAM_DATA = {
  answers: {},
  correctAnswers: {},
  marked: [],
  unresolved: [],
  questionTags: {},
  results: {},
  note: "",
  answerKey: {},
  examState: null,
};

// =========================================================
// Internal Helpers
// =========================================================

function createDefaultExamData() {
  return {
    answers: {},
    correctAnswers: {},
    marked: [],
    unresolved: [],
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

export function getExamDataKey(examId) {
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
    typeof exam.createdAt === "string" &&
    (exam.type === undefined ||
     (typeof exam.type === "string" &&
      (exam.type === "practice" || exam.type === "exam"))) &&
    (exam.timerDuration === undefined ||
     exam.timerDuration === null ||
     (typeof exam.timerDuration === "number" && exam.timerDuration > 0)) &&
    (exam.tagIds === undefined ||
     (Array.isArray(exam.tagIds) &&
      exam.tagIds.every((id) => isValidId(id))))
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

    unresolved:
      Array.isArray(data.unresolved)
        ? data.unresolved
        : [],

    questionTags:
      isObject(data.questionTags)
        ? data.questionTags
        : {},

    results:
      isObject(data.results)
        ? data.results
        : {},

    note:
      typeof data.note === "string"
        ? data.note
        : "",

    answerKey:
      isObject(data.answerKey)
        ? data.answerKey
        : {},

    examState:
      isObject(data.examState) || data.examState === null
        ? data.examState
        : null,
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

  const saved = writeJson(
    getFoldersKey(),
    folders
  );

  if (saved && !suppressDirty) {
    folders.forEach((folder) =>
      markDirty("folders", folder.id)
    );
  }

  return saved;
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

  recordLocalDelete("folder", folderId);

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

  const saved = writeJson(
    getExamsKey(),
    exams
  );

  if (saved && !suppressDirty) {
    exams.forEach((exam) =>
      markDirty("exams", exam.id)
    );
  }

  return saved;
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
    recordLocalDelete("exam", examId);
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
    markDirty("examData", examId);
    // Cloud→local pulls run under dirty suppression; their writes must
    // not re-trigger the sync engine (a pull firing the local-change
    // event would re-arm the sync loop and hammer the cloud forever).
    if (!suppressDirty) {
      notifyLocalChange();
    }
  }

  return saved;
}

export function removeExamData(
  examId
) {
  if (!isValidId(examId)) {
    return false;
  }

  const removed = removeKey(
    getExamDataKey(examId)
  );

  if (removed) {
    markDirty("examData", examId);
  }

  return removed;
}

// =========================================================
// Activity Storage
// =========================================================

// Activity storage - key format: testbox-activity-YYYY-MM-DD
function getActivityKey(dateString) {
  return `${getStoragePrefix()}activity-${dateString}`;
}

export function getActivity(dateString) {
  if (typeof dateString !== "string") return null;
  return readJson(getActivityKey(dateString), null);
}

export function saveActivity(dateString, activityData) {
  if (typeof dateString !== "string" || !isObject(activityData)) return false;
  const saved = writeJson(getActivityKey(dateString), activityData);
  if (saved) markDirty("activity", dateString);
  return saved;
}

export function getActivityRange(startDate, endDate) {
  // Returns array of { date, activity } for each day in range
  const results = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const dateStr = `${y}-${m}-${day}`;
    const activity = getActivity(dateStr);
    if (activity) {
      results.push({ date: dateStr, activity });
    }
  }
  return results;
}

// List every locally stored activity day (for cloud sync)
export function getAllActivityDates() {
  const prefix = `${getStoragePrefix()}activity-`;
  return storageAdapter
    .keys()
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
}

export function getAllActivity() {
  return getAllActivityDates()
    .map((date) => ({ date, data: getActivity(date) }))
    .filter((entry) => entry.data);
}

// =========================================================
// Settings Storage
// =========================================================

const SETTINGS_KEY = `${getStoragePrefix()}settings`;

const DEFAULT_SETTINGS = {
  language: "fa",
  weatherLocation: { lat: 35.6892, lon: 51.3890, name: "Tehran" },
};

export function getSettings() {
  return readJson(SETTINGS_KEY, DEFAULT_SETTINGS);
}

export function saveSettings(settings) {
  if (!isObject(settings)) return false;
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  const saved = writeJson(SETTINGS_KEY, merged);
  if (saved) markDirty("settings", null);
  return saved;
}

// =========================================================
// Subjects Storage
// =========================================================

function getSubjectsKey() {
  return `${getStoragePrefix()}subjects`;
}

function isValidSubject(subject) {
  return (
    isObject(subject) &&
    isValidId(subject.id) &&
    typeof subject.name === "string" &&
    subject.name.trim() !== ""
  );
}

export function getSubjects() {
  const subjects = readJson(getSubjectsKey(), []);
  return Array.isArray(subjects) ? subjects : [];
}

export function saveSubjects(subjects) {
  if (!Array.isArray(subjects) || !subjects.every(isValidSubject)) {
    return false;
  }
  const saved = writeJson(getSubjectsKey(), subjects);
  if (saved && !suppressDirty) {
    markDirty("subjects", null);
  }
  return saved;
}

export function createSubject(subject) {
  if (!isValidSubject(subject)) return false;
  const subjects = getSubjects();
  if (subjects.some((s) => idsEqual(s.id, subject.id))) return false;
  const saved = saveSubjects([...subjects, subject]);
  if (saved) notifyLocalChange();
  return saved;
}

export function updateSubject(subjectId, updates) {
  if (!isValidId(subjectId) || !isObject(updates)) return false;
  const subjects = getSubjects();
  const index = subjects.findIndex((s) => idsEqual(s.id, subjectId));
  if (index === -1) return false;
  subjects[index] = { ...subjects[index], ...updates, id: subjects[index].id };
  if (!isValidSubject(subjects[index])) return false;
  const saved = saveSubjects(subjects);
  if (saved) notifyLocalChange();
  return saved;
}

// Deleting a subject does NOT delete its folders — they simply become
// unassigned (subjectId: null), preserving all existing data.
export function deleteSubject(subjectId) {
  if (!isValidId(subjectId)) return false;

  const subjects = getSubjects();
  if (!subjects.some((s) => idsEqual(s.id, subjectId))) return false;

  const remaining = subjects.filter((s) => !idsEqual(s.id, subjectId));
  if (!saveSubjects(remaining)) return false;

  // Unassign folders that referenced this subject
  const folders = getFolders();
  const affected = folders.filter(
    (f) => f.subjectId != null && idsEqual(f.subjectId, subjectId)
  );
  if (affected.length > 0) {
    const updatedFolders = folders.map((f) =>
      f.subjectId != null && idsEqual(f.subjectId, subjectId)
        ? { ...f, subjectId: null }
        : f
    );
    saveFolders(updatedFolders);
  }

  markDirty("subjects", subjectId);
  notifyLocalChange();
  return true;
}

// Resolve a subject name by id; returns null when unknown
export function getSubjectById(subjectId) {
  if (!isValidId(subjectId)) return null;
  return (
    getSubjects().find((s) => idsEqual(s.id, subjectId)) || null
  );
}

// =========================================================
// Tags Storage
// A tag is { id, name, color? }. The exam↔tag relationship lives on
// the exam object as `tagIds: [tagId, …]` — stable IDs, no separate
// join records, so exam backup/restore and deletion carry tags along.
// =========================================================

function getTagsKey() {
  return `${getStoragePrefix()}tags`;
}

function isValidTag(tag) {
  return (
    isObject(tag) &&
    isValidId(tag.id) &&
    typeof tag.name === "string" &&
    tag.name.trim() !== ""
  );
}

export function getTags() {
  const tags = readJson(getTagsKey(), []);
  return Array.isArray(tags) ? tags : [];
}

export function saveTags(tags) {
  if (!Array.isArray(tags) || !tags.every(isValidTag)) {
    return false;
  }
  const saved = writeJson(getTagsKey(), tags);
  if (saved && !suppressDirty) {
    markDirty("tags", null);
  }
  return saved;
}

export function createTag(tag) {
  if (!isValidTag(tag)) return false;
  const tags = getTags();
  if (tags.some((t) => idsEqual(t.id, tag.id))) return false;
  const saved = saveTags([...tags, tag]);
  if (saved) notifyLocalChange();
  return saved;
}

export function updateTag(tagId, updates) {
  if (!isValidId(tagId) || !isObject(updates)) return false;
  const tags = getTags();
  const index = tags.findIndex((t) => idsEqual(t.id, tagId));
  if (index === -1) return false;
  tags[index] = { ...tags[index], ...updates, id: tags[index].id };
  if (!isValidTag(tags[index])) return false;
  const saved = saveTags(tags);
  if (saved) notifyLocalChange();
  return saved;
}

// Deleting a tag removes it from every exam's tagIds (assignments are
// dropped, exams and their data are untouched).
export function deleteTag(tagId) {
  if (!isValidId(tagId)) return false;

  const tags = getTags();
  if (!tags.some((t) => idsEqual(t.id, tagId))) return false;

  const remaining = tags.filter((t) => !idsEqual(t.id, tagId));
  if (!saveTags(remaining)) return false;

  // Strip the deleted tag from every question's tag list.
  const exams = getExams();
  exams.forEach((exam) => {
    const data = readJson(getExamDataKey(exam.id), null);
    if (!data || !isObject(data) || !isObject(data.questionTags)) return;
    let changed = false;
    const map = {};
    Object.entries(data.questionTags).forEach(([key, list]) => {
      if (!Array.isArray(list)) return;
      const filtered = list.filter((id) => !idsEqual(id, tagId));
      if (filtered.length !== list.length) changed = true;
      if (filtered.length > 0) map[key] = filtered;
    });
    if (changed) {
      writeJson(getExamDataKey(exam.id), { ...data, questionTags: map });
      markDirty("examData", exam.id);
    }
  });

  recordLocalDelete("tag", tagId);
  notifyLocalChange();
  return true;
}

// Assign/unassign a tag on an exam; idempotent.
// ---- Question-level tags ----
// Tags belong to QUESTIONS: examData.questionTags maps
// { "<questionNumber>": [tagId, …] }. The old exam-level tagIds and the
// legacy marked list migrate into this shape once (below).

export function getQuestionTags(examId, questionNumber) {
  const data = getExamData(examId);
  const list = data.questionTags?.[String(questionNumber)];
  return Array.isArray(list) ? list : [];
}

export function setQuestionTag(examId, questionNumber, tagId, assigned) {
  if (!isValidId(examId) || !isValidId(tagId)) return false;
  const data = getExamData(examId);
  const map = isObject(data.questionTags) ? { ...data.questionTags } : {};
  const key = String(questionNumber);
  const current = Array.isArray(map[key]) ? [...map[key]] : [];
  const has = current.some((tid) => idsEqual(tid, tagId));

  let next;
  if (assigned && !has) {
    next = [...current, tagId];
  } else if (!assigned && has) {
    next = current.filter((tid) => !idsEqual(tid, tagId));
  } else {
    return true;
  }

  if (next.length > 0) {
    map[key] = next;
  } else {
    delete map[key];
  }

  const saved = saveExamData(examId, { ...data, questionTags: map });
  return saved;
}

// One-time migration (v2.1.0 → v2.1.1): exam-level tag assignments and
// the legacy "marked" list become question tags. Marked questions get a
// stable "Marked"-equivalent tag (__marked__ by name, resolved by i18n
// at display time). Existing data is only ever moved, never deleted.
export function migrateMarkedToTags() {
  const MIGRATION_KEY = `${getStoragePrefix()}tags-question-migrated`;
  if (readJson(MIGRATION_KEY, false) === true) return false;

  let migratedAny = false;
  const exams = getExams();
  const tags = getTags();

  let markedTag = tags.find((t) => t.name === "__marked__");
  if (!markedTag) {
    markedTag = { id: Date.now(), name: "__marked__" };
    saveTags([...tags, markedTag]);
  }

  exams.forEach((exam) => {
    const data = readJson(getExamDataKey(exam.id), null);
    if (!data || !isObject(data)) return;

    const map = isObject(data.questionTags) ? { ...data.questionTags } : {};

    // 1. Legacy marked questions → __marked__ tag
    if (Array.isArray(data.marked)) {
      data.marked.forEach((q) => {
        const key = String(q);
        const list = Array.isArray(map[key]) ? [...map[key]] : [];
        if (!list.some((tid) => idsEqual(tid, markedTag.id))) {
          list.push(markedTag.id);
          map[key] = list;
        }
      });
    }

    // 2. Exam-level tagIds → every question of the exam gets them
    //    (v2.1.0 semantics: the tag applied to the whole exam).
    if (Array.isArray(exam.tagIds) && exam.tagIds.length > 0) {
      const count = Number(exam.questionCount) || 0;
      for (let q = 1; q <= count; q += 1) {
        const key = String(q);
        const list = Array.isArray(map[key]) ? [...map[key]] : [];
        exam.tagIds.forEach((tid) => {
          if (!list.some((x) => idsEqual(x, tid))) list.push(tid);
        });
        map[key] = list;
      }
    }

    if (Object.keys(map).length > 0) {
      writeJson(getExamDataKey(exam.id), { ...data, questionTags: map });
      markDirty("examData", exam.id);
      migratedAny = true;
    }
  });

  writeJson(MIGRATION_KEY, true);
  return migratedAny;
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
    subjects: getSubjects(),
    tags: getTags(),
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
  if (backup.version === 1) {
    // v1 -> v2: add type, answerKey, and examState to exam data
    const migratedBackup = {
      ...backup,
      version: 2,
    };

    // Add type: "practice" to exams that don't have it
    migratedBackup.exams = backup.exams.map(exam => ({
      ...exam,
      type: exam.type || "practice",
    }));

    // Add answerKey and examState to exam data
    migratedBackup.examData = {};
    for (const [key, value] of Object.entries(backup.examData)) {
      migratedBackup.examData[key] = {
        ...value,
        answerKey: isObject(value?.answerKey) ? value.answerKey : {},
        examState: isObject(value?.examState) || value?.examState === null ? value.examState : null,
      };
    }

    return migratedBackup;
  }

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

    // Restore subjects (optional field — older backups may not have it)
    if (
      Array.isArray(migratedBackup.subjects) &&
      migratedBackup.subjects.length > 0
    ) {
      writeJson(getSubjectsKey(), migratedBackup.subjects);
    }

    // Restore tags (optional field — older backups may not have it)
    if (
      Array.isArray(migratedBackup.tags) &&
      migratedBackup.tags.length > 0
    ) {
      writeJson(getTagsKey(), migratedBackup.tags);
    }

    // A restore replaces the whole local dataset: every entity is now
    // unsynced and must re-upload on the next sync.
    writeDirty({
      folders: true,
      exams: true,
      examData: Object.fromEntries(
        Object.keys(migratedBackup.examData).map((key) => [
          key.slice(getExamDataPrefix().length),
          true,
        ])
      ),
      subjects: true,
      activity: {},
      settings: false,
      tags: Boolean(
        Array.isArray(migratedBackup.tags) && migratedBackup.tags.length > 0
      ),
      deletes: [],
    });

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

    // Also clear activity and settings keys
    storageAdapter.keys()
      .filter(
        (key) =>
          key.startsWith(
            STORAGE_PREFIX
          ) && (
            key.includes("-activity-") ||
            key.endsWith("-settings") ||
            key.endsWith("-subjects")
          )
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