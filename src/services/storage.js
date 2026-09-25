const STORAGE_PREFIX = "testbox-";

// Fixed key (not user-prefixed): the queue must survive setStorageUser
// changes and a reload mid-pull. Ops apply to the active user's dirty
// registry when flushed.
const SUPPRESSED_OPS_KEY = `${STORAGE_PREFIX}suppressed-ops`;

let currentUserId = null;

// Suppresses dirty-marking while cloud code writes local storage
// (uploads stay uploads; cloud→local pulls must not look like edits).
let suppressDirty = false;

// Dirty marks recorded while suppression is on (user edits racing a
// cloud pull). Persisted to localStorage so a refresh/process death
// mid-pull cannot drop them; flushed into the durable registry when
// suppression lifts (or on first read after a restart with suppression off).
let suppressedOps = null;

// Depth of cloud→local save* calls only (not the whole pull). While > 0,
// save* must not enqueue/mark — pull writes are not local edits. User
// saves during the same pull have depth 0 and enqueue durably.
let cloudWriteDepth = 0;

export function beginCloudWrite() {
  cloudWriteDepth += 1;
}

export function endCloudWrite() {
  cloudWriteDepth = Math.max(0, cloudWriteDepth - 1);
}

function isValidSuppressedOp(op) {
  if (!op || typeof op !== "object") return false;
  if (op.kind === "delete") {
    return typeof op.type === "string" && op.id != null && op.id !== "";
  }
  if (op.kind === "mark") {
    return typeof op.section === "string" && op.section !== "";
  }
  return false;
}

// Ops with no userId are legacy (pre-stamp) and belong to whoever is
// active now. Stamped ops only apply to their originating account;
// foreign ops are retained until that user returns.
function isCurrentSuppressedOp(op) {
  if (op.userId == null) return true;
  if (currentUserId == null) return false;
  return String(op.userId) === String(currentUserId);
}

function loadSuppressedOps() {
  if (Array.isArray(suppressedOps)) return suppressedOps;
  let raw;
  try {
    const saved = storageAdapter.getItem(SUPPRESSED_OPS_KEY);
    if (saved == null || saved === "") {
      suppressedOps = [];
      return suppressedOps;
    }
    raw = JSON.parse(saved);
  } catch {
    suppressedOps = [];
    removeKey(SUPPRESSED_OPS_KEY);
    return suppressedOps;
  }
  if (!Array.isArray(raw)) {
    suppressedOps = [];
    removeKey(SUPPRESSED_OPS_KEY);
    return suppressedOps;
  }
  suppressedOps = raw.filter(isValidSuppressedOp);
  if (suppressedOps.length !== raw.length) {
    persistSuppressedOps();
  }
  return suppressedOps;
}

function persistSuppressedOps() {
  if (!Array.isArray(suppressedOps) || suppressedOps.length === 0) {
    removeKey(SUPPRESSED_OPS_KEY);
    return true;
  }
  return writeJson(SUPPRESSED_OPS_KEY, suppressedOps);
}

function enqueueSuppressedOp(op) {
  loadSuppressedOps();
  suppressedOps.push({ ...op, userId: currentUserId ?? null });
  persistSuppressedOps();
}

/**
 * After a reload, suppressDirty defaults to false while a queue may
 * still be on disk. Flush before reading pending/dirty state so the
 * next push/scheduler sees mid-pull work without waiting for another pull.
 */
function ensureSuppressedFlushed() {
  loadSuppressedOps();
  if (!suppressDirty && suppressedOps.length > 0) {
    flushSuppressedDirty();
  }
}

export function setDirtySuppression(active) {
  const was = suppressDirty;
  suppressDirty = Boolean(active);
  if (was && !suppressDirty) {
    flushSuppressedDirty();
  }
}

/** Dirty/delete ops still queued for the current user (suppression on or reload). */
export function getSuppressedOpCount() {
  return loadSuppressedOps().filter(isCurrentSuppressedOp).length;
}

function flushSuppressedDirty() {
  loadSuppressedOps();
  // Dequeue one-by-one: apply succeeds → drop from memory+disk before the
  // next op, so a crash mid-flush neither loses un-applied ops nor re-applies
  // completed ones (re-applying a delete would bump generation incorrectly).
  // Foreign-account ops are skipped and retained until that user returns.
  let i = 0;
  while (i < suppressedOps.length) {
    const op = suppressedOps[i];
    if (!isCurrentSuppressedOp(op)) {
      i += 1;
      continue;
    }
    let ok;
    try {
      ok = op.kind === "delete"
        ? applyDeleteOp(op.type, op.id, op.deletedAt)
        : applyMarkOp(op.section, op.id);
    } catch {
      ok = false;
    }
    if (!ok) {
      persistSuppressedOps();
      return;
    }
    suppressedOps.splice(i, 1);
    persistSuppressedOps();
  }
}


// =========================================================
// Atomic multi-key mutations
// When IndexedDB is available, multi-store writes (entity + dirty +
// tombstone) run in ONE transaction so a crash can never leave a
// half-applied mutation. Falls back to sequential localStorage writes
// when IDB is unavailable (tests, SSR, very old browsers).
// =========================================================

/**
 * Run `fn` as an atomic mutation when IDB is available; otherwise run
 * it directly (localStorage path is inherently non-atomic, but every
 * helper validates before writing).
 */
export async function atomicMutation(operations) {
  try {
    const { idbAtomicMutate } = await import("./idb.js");
    if (typeof indexedDB !== "undefined") {
      await idbAtomicMutate(operations);
      return true;
    }
  } catch {
    // IDB unavailable — fall through to sync path
  }
  // Caller already applied side effects via its own helpers; this is a
  // coordination point for future IDB-backed entity stores.
  return true;
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

const CURRENT_BACKUP_VERSION = 3;

function notifyLocalChange() {
  window.dispatchEvent(
    new CustomEvent(
      "testbox-local-change"
    )
  );
}

// Collision-resistant local entity ID. Cloud columns are bigint, so
// UUID text is not an option without rewriting every table and every
// existing user's IDs. Instead: millisecond * 4096 + a random tail,
// with a per-session monotonic bump so ids never repeat within a
// session (even in a tight creation loop). The magnitude (~7e15) stays
// inside Number.MAX_SAFE_INTEGER so all arithmetic is exact integer.
// Two devices creating in the same millisecond collide with p≈1/4096
// (vs ~certain for same-millisecond Date.now()); legacy Date.now()
// IDs (~1.8e12) are ~4096x smaller than new ones (~7e15) so old and
// new can never collide. Strictly increasing within a session.
let lastGeneratedId = 0;
export function generateId() {
  const rand =
    (typeof crypto !== "undefined" && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint32Array(1))[0]
      : Math.floor(Math.random() * 0x100000000)) % 4096;
  let id = Date.now() * 4096 + rand;
  if (id <= lastGeneratedId) id = lastGeneratedId + 1;
  lastGeneratedId = id;
  return id;
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

// Tombstone retention: a delete stays recorded until ALL known devices
// have acked it, approximated by a 7-day TTL. Clearing on first push
// let a device that was offline during the delete window re-upload the
// row and resurrect it.
const TOMBSTONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function applyMarkOp(section, id = null) {
  const dirty = readDirty();
  if (id == null) {
    dirty[section] = true;
  } else {
    if (!isObject(dirty[section])) dirty[section] = {};
    dirty[section][String(id)] = true;
  }
  return writeDirty(dirty);
}

function applyDeleteOp(type, id, deletedAt) {
  const dirty = readDirty();
  if (!Array.isArray(dirty.deletes)) dirty.deletes = [];
  const signature = `${type}:${id}`;
  const existing = dirty.deletes.find((d) => `${d.type}:${d.id}` === signature);
  if (existing) {
    if (deletedAt) existing.deletedAt = deletedAt;
    // Re-delete after a recreate is NEW pending work: bump generation
    // so an older push snapshot (same id, older generation) cannot ack it.
    existing.generation = (Number(existing.generation) || 0) + 1;
    delete existing.pushedAt;
  } else {
    dirty.deletes.push({
      type,
      id: String(id),
      deletedAt: deletedAt || Date.now(),
      generation: 0,
    });
  }
  return writeDirty(dirty);
}

/**
 * Record pending sync work. Returns true when the mark is durable
 * (written or safely queued during pull suppression). A false return
 * means the caller MUST NOT report the mutation as successfully
 * persisted for sync — the entity write alone is not enough.
 */
function markDirty(section, id = null) {
  if (suppressDirty) {
    enqueueSuppressedOp({ kind: "mark", section, id });
    return true;
  }
  if (section === "deletes") {
    return applyDeleteOp(id.type, id.id, id.deletedAt);
  }
  return applyMarkOp(section, id);
}

function clearDirty(section, ids = null) {
  const dirty = readDirty();
  if (section === "deletes") {
    if (ids == null) {
      dirty.deletes = [];
    } else {
      const idSet = new Set(ids.map(String));
      dirty.deletes = (dirty.deletes || []).filter((d) => !idSet.has(String(d.id)));
    }
  } else if (ids == null) {
    dirty[section] = section === "examData" || section === "activity" ? {} : false;
  } else {
    if (!isObject(dirty[section])) dirty[section] = {};
    ids.forEach((id) => delete dirty[section][String(id)]);
  }
  writeDirty(dirty);
}

// Drop ACKED tombstones older than the TTL measured from acknowledgement
// (not from deletion). An unacked delete never expires — a device offline
// for weeks must still push it and keep filtering pulls. After ack, the
// tombstone only needs to outlive other devices' pull windows.
function pruneExpiredTombstones(dirty) {
  if (!Array.isArray(dirty.deletes)) return dirty;
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  const kept = dirty.deletes.filter((d) => {
    if (!d.pushedAt) return true;
    const at = Number(d.pushedAt) || 0;
    return at === 0 || at > cutoff;
  });
  if (kept.length !== dirty.deletes.length) {
    dirty.deletes = kept;
    writeDirty(dirty);
  }
  return dirty;
}

function hasDirtyChanges() {
  ensureSuppressedFlushed();
  // Ops queued during pull suppression are pending work too — the
  // scheduler and UI must see them before the flush runs. Only the
  // current account's ops count as pending for this user.
  if (loadSuppressedOps().some(isCurrentSuppressedOp)) return true;
  const d = readDirty();
  pruneExpiredTombstones(d);
  return hasDirtyChangesInner(d);
}

/**
 * "Syncable" pending changes: real dirty sections, or tombstones that
 * still need a delete pushed (never pushed = no deletedAt ack marker —
 * we keep a pushedAt ack so the UI can report "synced" while tombstones
 * continue filtering pulls).
 */
function hasDirtyChangesInner(d) {
  return (
    d.folders ||
    d.exams ||
    d.subjects ||
    d.settings ||
    d.tags ||
    Object.keys(d.examData).length > 0 ||
    Object.keys(d.activity).length > 0 ||
    (d.deletes || []).some((t) => !t.pushedAt)
  );
}

/**
 * Acknowledge the exact tombstones present in `snapshot` (the deletes
 * list captured before a push started). Only entries whose type+id+
 * deletedAt still match the live tombstone are acked — a delete that
 * landed mid-push, or a re-delete of the same id, stays pending so the
 * next cycle retries it. Empty/omitted snapshots ack nothing.
 */
export function markTombstonesPushed(snapshot) {
  if (!Array.isArray(snapshot) || snapshot.length === 0) return;
  const dirty = readDirty();
  pruneExpiredTombstones(dirty);
  const now = Date.now();
  let changed = false;
  for (const snap of snapshot) {
    if (!snap || snap.type == null || snap.id == null) continue;
    const sig = `${snap.type}:${snap.id}`;
    const current = (dirty.deletes || []).find(
      (d) => `${d.type}:${d.id}` === sig
    );
    if (!current) continue;
    if (String(current.deletedAt) !== String(snap.deletedAt)) continue;
    if ((Number(current.generation) || 0) !== (Number(snap.generation) || 0)) continue;
    if (!current.pushedAt) {
      current.pushedAt = now;
      changed = true;
    }
  }
  if (changed) writeDirty(dirty);
}

/**
 * Record deletion intent (tombstone + owning collection dirty) durably.
 * Returns true when the intent is durable (written, or queued during
 * pull suppression). Composite deletes MUST call this and check the
 * result BEFORE any multi-key destructive entity removal.
 *
 * Non-suppressed path writes tombstone + owner mark in ONE dirty-registry
 * write so the intent cannot half-land across two setItem calls.
 */
function recordLocalDelete(type, id) {
  const deletedAt = Date.now();
  const owners = { folder: "folders", exam: "exams", tag: "tags", subject: "subjects" };
  const ownerSection = owners[type] || "folders";
  if (suppressDirty) {
    enqueueSuppressedOp({ kind: "delete", type, id: String(id), deletedAt });
    enqueueSuppressedOp({ kind: "mark", section: ownerSection, id: null });
    return true;
  }
  const dirty = readDirty();
  if (!Array.isArray(dirty.deletes)) dirty.deletes = [];
  const signature = `${type}:${id}`;
  const existing = dirty.deletes.find((d) => `${d.type}:${d.id}` === signature);
  if (existing) {
    existing.deletedAt = deletedAt;
    // Re-delete after a recreate is NEW pending work: bump generation
    // so an older push snapshot (same id, older generation) cannot ack it.
    existing.generation = (Number(existing.generation) || 0) + 1;
    delete existing.pushedAt;
  } else {
    dirty.deletes.push({
      type,
      id: String(id),
      deletedAt,
      generation: 0,
    });
  }
  dirty[ownerSection] = true;
  return writeDirty(dirty);
}

/** Tombstoned ids per type — pull filters use this to avoid resurrection. */
export function getDeletedIds(type) {
  const dirty = readDirty();
  pruneExpiredTombstones(dirty);
  return (dirty.deletes || [])
    .filter((d) => d.type === type)
    .map((d) => String(d.id));
}

export function getDirtyState() {
  ensureSuppressedFlushed();
  return readDirty();
}

export function hasPendingLocalChanges() {
  return hasDirtyChanges();
}

export function clearDirtySection(section, ids = null) {
  clearDirty(section, ids);
}

/**
 * Re-apply dirty marks and tombstones for local mutations that raced a
 * cloud pull (suppression was on while they ran). Called by the sync
 * engine only after setDirtySuppression(false).
 */
export function applyDeferredDirtyMarks({ folderIds = [], examIds = [], examDataIds = [], deletes = [] } = {}) {
  if (suppressDirty) return;
  const dirty = readDirty();
  let changed = false;
  folderIds.forEach(() => {
    if (!dirty.folders) {
      dirty.folders = true;
      changed = true;
    }
  });
  examIds.forEach(() => {
    if (!dirty.exams) {
      dirty.exams = true;
      changed = true;
    }
  });
  examDataIds.forEach((id) => {
    if (!isObject(dirty.examData)) dirty.examData = {};
    const key = String(id);
    if (!dirty.examData[key]) {
      dirty.examData[key] = true;
      changed = true;
    }
  });
  if (Array.isArray(deletes) && deletes.length > 0) {
    if (!Array.isArray(dirty.deletes)) dirty.deletes = [];
    for (const del of deletes) {
      if (!del || del.type == null || del.id == null) continue;
      const sig = `${del.type}:${del.id}`;
      const exists = dirty.deletes.some((t) => `${t.type}:${t.id}` === sig);
      if (!exists) {
        dirty.deletes.push({ type: del.type, id: String(del.id), deletedAt: Date.now() });
        changed = true;
      }
    }
  }
  if (changed) writeDirty(dirty);
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
    questionTags: {},
    results: {},
    note: "",
    answerKey: {},
    examState: null,
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

  // Durable pending state BEFORE the entity write when not suppressed.
  // A successful entity write without a durable dirty mark is the
  // silent-loss bug; fail closed if the dirty write fails.
  // Pull writes (cloudWriteDepth > 0) must NOT self-mark. User saves
  // during suppression (depth 0) enqueue via markDirty so they survive
  // process death mid-pull.
  if (!suppressDirty || cloudWriteDepth === 0) {
    for (const folder of folders) {
      if (!markDirty("folders", folder.id)) {
        console.error("Cannot save folders: dirty write failed.");
        return false;
      }
    }
  }

  return writeJson(getFoldersKey(), folders);
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

  // Deletion intent BEFORE any multi-key destructive write: a crash after
  // this point leaves tombstones so a later pull cannot resurrect rows.
  if (!recordLocalDelete("folder", folderId)) {
    console.error("Cannot delete folder: intent write failed.");
    return false;
  }
  for (const exam of examsToDelete) {
    if (!recordLocalDelete("exam", exam.id)) {
      console.error("Cannot delete folder: child exam intent write failed.");
      return false;
    }
  }

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
    // Child exams are already tombstoned above; removeExamData is dirty-first.
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

  if (!suppressDirty || cloudWriteDepth === 0) {
    for (const exam of exams) {
      if (!markDirty("exams", exam.id)) {
        console.error("Cannot save exams: dirty write failed.");
        return false;
      }
    }
  }

  return writeJson(getExamsKey(), exams);
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

  // Intent before destructive list/examData writes.
  if (!recordLocalDelete("exam", examId)) {
    console.error("Cannot delete exam: intent write failed.");
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

  if ((!suppressDirty || cloudWriteDepth === 0) && !markDirty("examData", examId)) {
    console.error("Cannot save exam data: dirty write failed.");
    return false;
  }

  const saved = writeJson(
    getExamDataKey(examId),
    normalizedData
  );

  if (saved && !suppressDirty) {
    // Cloud→local pulls run under dirty suppression; their writes must
    // not re-trigger the sync engine (a pull firing the local-change
    // event would re-arm the sync loop and hammer the cloud forever).
    // User saves mid-pull also skip notify — durability is the queue;
    // flush + fingerprint cover discovery after suppression lifts.
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

  // Dirty intent BEFORE removing the entity; fail closed if the mark fails.
  if (!markDirty("examData", examId)) {
    console.error("Cannot remove exam data: dirty write failed.");
    return false;
  }

  return removeKey(
    getExamDataKey(examId)
  );
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
  if ((!suppressDirty || cloudWriteDepth === 0) && !markDirty("activity", dateString)) return false;
  return writeJson(getActivityKey(dateString), activityData);
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

function getSettingsKey() {
  return `${getStoragePrefix()}settings`;
}

const DEFAULT_SETTINGS = {
  language: "fa",
  weatherLocation: { lat: 35.6892, lon: 51.3890, name: "Tehran" },
  defaultNegativeMarking: true,
  defaultExamType: "practice",
};

export function getSettings() {
  return readJson(getSettingsKey(), DEFAULT_SETTINGS);
}

export function saveSettings(settings) {
  if (!isObject(settings)) return false;
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  if ((!suppressDirty || cloudWriteDepth === 0) && !markDirty("settings", null)) return false;
  return writeJson(getSettingsKey(), merged);
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
  if ((!suppressDirty || cloudWriteDepth === 0) && !markDirty("subjects", null)) {
    console.error("Cannot save subjects: dirty write failed.");
    return false;
  }
  return writeJson(getSubjectsKey(), subjects);
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

  // Intent before multi-key subject/folder writes.
  if (!recordLocalDelete("subject", subjectId)) {
    console.error("Cannot delete subject: intent write failed.");
    return false;
  }

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
  if ((!suppressDirty || cloudWriteDepth === 0) && !markDirty("tags", null)) {
    console.error("Cannot save tags: dirty write failed.");
    return false;
  }
  return writeJson(getTagsKey(), tags);
}

function findDuplicateName(tags, name, excludeId = null) {
  const needle = String(name).trim().toLowerCase();
  return tags.some(
    (t) =>
      (excludeId == null || !idsEqual(t.id, excludeId)) &&
      typeof t.name === "string" &&
      t.name.trim().toLowerCase() === needle
  );
}

export function createTag(tag) {
  if (!isValidTag(tag)) return false;
  const tags = getTags();
  if (tags.some((t) => idsEqual(t.id, tag.id))) return false;
  if (findDuplicateName(tags, tag.name)) return false;
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
  if (findDuplicateName(tags, tags[index].name, tagId)) return false;
  const saved = saveTags(tags);
  if (saved) notifyLocalChange();
  return saved;
}

// Deleting a tag removes it from every exam's tagIds and from every
// examData.questionTags assignment (exam bodies/answers are untouched).
export function deleteTag(tagId) {
  if (!isValidId(tagId)) return false;

  const tags = getTags();
  if (!tags.some((t) => idsEqual(t.id, tagId))) return false;

  // 1. Deletion intent BEFORE any entity mutation.
  if (!recordLocalDelete("tag", tagId)) {
    console.error("Cannot delete tag: intent write failed.");
    return false;
  }

  // 2. Dirty-first for every exam row and examData row that will change —
  //    mark all before any write so a mid-loop dirty failure cannot leave
  //    a half-stripped set with no pending sync.
  const exams = getExams();
  const examDataPlans = [];
  const examPlans = [];
  for (const exam of exams) {
    if (Array.isArray(exam.tagIds) && exam.tagIds.some((id) => idsEqual(id, tagId))) {
      if (!markDirty("exams", exam.id)) {
        console.error("Cannot delete tag: exams dirty write failed.");
        return false;
      }
      examPlans.push({
        exam,
        data: { ...exam, tagIds: exam.tagIds.filter((id) => !idsEqual(id, tagId)) },
      });
    }

    const data = readJson(getExamDataKey(exam.id), null);
    if (!data || !isObject(data) || !isObject(data.questionTags)) continue;
    let changed = false;
    const map = {};
    Object.entries(data.questionTags).forEach(([key, list]) => {
      if (!Array.isArray(list)) return;
      const filtered = list.filter((id) => !idsEqual(id, tagId));
      if (filtered.length !== list.length) changed = true;
      if (filtered.length > 0) map[key] = filtered;
    });
    if (!changed) continue;
    if (!markDirty("examData", exam.id)) {
      console.error("Cannot delete tag: examData dirty write failed.");
      return false;
    }
    examDataPlans.push({ examId: exam.id, data: { ...data, questionTags: map } });
  }

  // 3. Entity writes (saveTags is dirty-first for the tags list).
  const remaining = tags.filter((t) => !idsEqual(t.id, tagId));
  if (!saveTags(remaining)) return false;

  if (examPlans.length > 0) {
    const nextExams = exams.map((exam) => {
      const plan = examPlans.find((p) => idsEqual(p.exam.id, exam.id));
      return plan ? plan.data : exam;
    });
    if (!saveExams(nextExams)) {
      console.error("Cannot delete tag: exams write failed.");
      return false;
    }
  }

  for (const plan of examDataPlans) {
    if (!writeJson(getExamDataKey(plan.examId), plan.data)) {
      console.error("Cannot delete tag: examData write failed.");
      return false;
    }
  }

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
  const existingTagIds = new Set(tags.map((t) => String(t.id)));
  const existingExamTagIds = (exam) =>
    Array.isArray(exam.tagIds)
      ? exam.tagIds.filter((id) => existingTagIds.has(String(id)))
      : [];

  // Lazily create __marked__ only when a marked question actually needs it.
  let markedTag = tags.find((t) => t.name === "__marked__");
  const ensureMarkedTag = () => {
    if (markedTag) return true;
    markedTag = { id: generateId(), name: "__marked__" };
    if (!saveTags([...getTags(), markedTag])) {
      console.error("Cannot migrate marked questions: tag save failed.");
      markedTag = null;
      return false;
    }
    return true;
  };

  let dirtyFailed = false;
  exams.forEach((exam) => {
    const data = readJson(getExamDataKey(exam.id), null);
    if (!data || !isObject(data)) return;

    const map = isObject(data.questionTags) ? { ...data.questionTags } : {};
    const hasMarked =
      Array.isArray(data.marked) && data.marked.length > 0;
    const liveExamTagIds = existingExamTagIds(exam);
    let changed = false;

    // 1. Legacy marked questions → __marked__ tag, then clear the legacy list
    //    so only tags remain after migration.
    if (hasMarked) {
      if (!ensureMarkedTag()) {
        dirtyFailed = true;
        return;
      }
      data.marked.forEach((q) => {
        const key = String(q);
        const list = Array.isArray(map[key]) ? [...map[key]] : [];
        if (!list.some((tid) => idsEqual(tid, markedTag.id))) {
          list.push(markedTag.id);
          map[key] = list;
          changed = true;
        }
      });
      data.marked = [];
      changed = true;
    }

    // 2. Exam-level tagIds → every question of the exam gets them
    //    (v2.1.0 semantics: the tag applied to the whole exam).
    //    Skip ids that no longer exist in getTags() so a deleted tag
    //    cannot be resurrected by a re-run after flag loss.
    if (liveExamTagIds.length > 0) {
      const count = Number(exam.questionCount) || 0;
      for (let q = 1; q <= count; q += 1) {
        const key = String(q);
        const list = Array.isArray(map[key]) ? [...map[key]] : [];
        liveExamTagIds.forEach((tid) => {
          if (!list.some((x) => idsEqual(x, tid))) {
            list.push(tid);
            changed = true;
          }
        });
        if (changed) map[key] = list;
      }
    }

    if (changed) {
      // Dirty-first: never rewrite examData without a durable pending mark.
      if (!markDirty("examData", exam.id)) {
        console.error("Cannot migrate marked questions: dirty write failed.");
        dirtyFailed = true;
        return;
      }
      if (!writeJson(getExamDataKey(exam.id), {
        ...data,
        questionTags: map,
        marked: [],
      })) {
        dirtyFailed = true;
        return;
      }
      migratedAny = true;
    }
  });

  // Fail closed: a dirty/write failure must not mark the migration
  // complete — the next run has to retry the unmigrated exams.
  if (dirtyFailed) {
    return migratedAny;
  }
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
    // v3: daily activity — without it a restore loses the calendar,
    // statistics and all study time (the only complete escape hatch
    // must cover everything).
    activity: getAllActivity().map(({ date, data }) => ({ date, data })),
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

export function restoreBackup(backup) {
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

  // Snapshot BEFORE any destructive write so a mid-restore failure can
  // roll back to the pre-restore dataset instead of leaving a hole.
  const snapshot = createBackup();
  const snapshotKey = `${STORAGE_PREFIX}restore-snapshot`;
  if (!writeJson(snapshotKey, snapshot)) {
    return false;
  }

  const applyDataset = (data) => {
    if (!writeJson(getFoldersKey(), data.folders)) return false;
    if (!writeJson(getExamsKey(), data.exams)) return false;
    for (const [key, value] of Object.entries(data.examData || {})) {
      if (!key.startsWith(getExamDataPrefix())) continue;
      if (!writeJson(key, value)) return false;
    }
    if (Array.isArray(data.subjects)) {
      writeJson(getSubjectsKey(), data.subjects);
    }
    if (Array.isArray(data.tags)) {
      writeJson(getTagsKey(), data.tags);
    }
    if (Array.isArray(data.activity)) {
      for (const { date, data: day } of data.activity) {
        if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && isObject(day)) {
          writeJson(getActivityKey(date), day);
        }
      }
    }
    return true;
  };

  try {
    // 1) Clear only AFTER the snapshot is durable.
    if (!clearAll()) {
      throw new Error("clearAll failed");
    }

    // 2) Write the restored dataset.
    if (!applyDataset(migratedBackup)) {
      throw new Error("write failed");
    }

    // 3) Verify the critical lists round-trip before declaring success.
    if (JSON.stringify(getFolders()) !== JSON.stringify(migratedBackup.folders)) {
      throw new Error("folders verify failed");
    }
    if (JSON.stringify(getExams()) !== JSON.stringify(migratedBackup.exams)) {
      throw new Error("exams verify failed");
    }

    const restoredActivity = {};
    if (
      Array.isArray(migratedBackup.activity) &&
      migratedBackup.activity.length > 0
    ) {
      migratedBackup.activity.forEach(({ date }) => {
        if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
          restoredActivity[date] = true;
        }
      });
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
      activity: restoredActivity,
      settings: false,
      tags: Boolean(
        Array.isArray(migratedBackup.tags) && migratedBackup.tags.length > 0
      ),
      deletes: [],
    });

    removeKey(snapshotKey);
    return true;
  } catch (error) {
    console.error(
      "Failed to restore backup — rolling back",
      error
    );
    // Roll back to the pre-restore snapshot so a failed restore never
    // leaves the user with a half-wiped dataset.
    try {
      clearAll();
      applyDataset(snapshot);
      writeDirty({
        folders: true,
        exams: true,
        examData: {},
        subjects: true,
        activity: {},
        settings: false,
        tags: false,
        deletes: [],
      });
    } catch (rollbackError) {
      console.error("Restore rollback also failed", rollbackError);
    }
    removeKey(snapshotKey);
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