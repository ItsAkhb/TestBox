import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

import translations from "../i18n/translations.js";

const rf = (rel) => readFile(new URL(rel, import.meta.url), "utf8");

// Values that cross the vm boundary carry another realm's Array prototype;
// deepStrictEqual rejects those, so normalize first.
const plain = (value) => JSON.parse(JSON.stringify(value));

// Runs storage.js in a sandbox over a shared localStorage map so the
// multi-subject model, updatedAt stamping and settings persistence can be
// exercised for real (same pattern as cloudSync.test.js).
async function storageSandbox(values = {}) {
  const source = (await readFile(new URL("./storage.js", import.meta.url), "utf8")).replace(
    /export /g,
    ""
  );
  const sandbox = vm.createContext({
    console: { error() {}, log() {}, warn() {} },
    localStorage: {
      getItem: (key) => values[key] ?? null,
      setItem: (key, value) => {
        values[key] = value;
      },
      removeItem: (key) => {
        delete values[key];
      },
    },
    window: { dispatchEvent: () => {} },
    CustomEvent: class {
      constructor(type) {
        this.type = type;
      }
    },
  });
  vm.runInContext(source, sandbox);
  sandbox.setStorageUser("beta4-user");
  return { sandbox, values };
}

test("storage: updateFolder and updateExam stamp updatedAt, never createdAt", async () => {
  const { sandbox } = await storageSandbox();

  assert.ok(sandbox.createFolder({ id: 1, name: "F", createdAt: "2026-01-01T00:00:00.000Z" }));
  assert.ok(sandbox.updateFolder(1, { name: "Renamed" }));
  const folder = sandbox.getFolders()[0];
  assert.equal(folder.name, "Renamed");
  assert.equal(folder.createdAt, "2026-01-01T00:00:00.000Z", "created timestamp untouched");
  assert.equal(typeof folder.updatedAt, "string");
  assert.ok(Number.isNaN(Date.parse(folder.updatedAt)) === false, "updatedAt is a real timestamp");
  assert.ok(Date.parse(folder.updatedAt) >= Date.parse(folder.createdAt));

  assert.ok(
    sandbox.createExam({
      id: 5,
      folderId: 1,
      name: "Exam",
      questionCount: 10,
      createdAt: "2026-01-01T00:00:00.000Z",
    })
  );
  assert.ok(sandbox.updateExam(5, { name: "Exam renamed" }));
  const exam = sandbox.getExams().find((e) => String(e.id) === "5");
  assert.equal(exam.name, "Exam renamed");
  assert.equal(exam.createdAt, "2026-01-01T00:00:00.000Z");
  assert.equal(typeof exam.updatedAt, "string");
});

test("storage: multi-subject folders store subjectIds and mirror the primary subjectId", async () => {
  const { sandbox } = await storageSandbox();

  assert.ok(
    sandbox.createFolder({
      id: 10,
      name: "کنکور",
      createdAt: "2026-01-01T00:00:00.000Z",
      subjectIds: [1, 2, 3],
      subjectId: 1,
    })
  );
  assert.equal(sandbox.getFolders()[0].subjectId, 1, "primary mirrors first entry");

  assert.ok(sandbox.updateFolder(10, { subjectIds: [2, 5], subjectId: 2 }));
  assert.equal(sandbox.getFolders()[0].subjectId, 2, "primary follows removal of the old primary");

  assert.ok(sandbox.updateFolder(10, { subjectIds: [], subjectId: null }));
  const emptied = sandbox.getFolders()[0];
  assert.equal(emptied.subjectId, null, "zero subjects is valid");
  assert.deepEqual(plain(emptied.subjectIds), []);

  // Editing subjects never touches exam ownership (promt §17).
  assert.ok(
    sandbox.createExam({
      id: 50,
      folderId: 10,
      name: "Kept",
      questionCount: 5,
      createdAt: "2026-01-02T00:00:00.000Z",
    })
  );
  assert.ok(sandbox.updateFolder(10, { subjectIds: [7], subjectId: 7 }));
  assert.equal(sandbox.getExams().find((e) => String(e.id) === "50").folderId, 10, "exam ownership intact");
});

test("storage: getFolderSubjectIds covers legacy single-subject folders", async () => {
  const { sandbox } = await storageSandbox();

  assert.deepEqual(plain(sandbox.getFolderSubjectIds({ id: 1, subjectId: 7 })), [7], "legacy → [subjectId]");
  assert.deepEqual(plain(sandbox.getFolderSubjectIds({ id: 1, subjectId: null })), []);
  assert.deepEqual(
    plain(sandbox.getFolderSubjectIds({ id: 1, subjectIds: [3, 4], subjectId: 3 })),
    [3, 4]
  );
  assert.deepEqual(plain(sandbox.getFolderSubjectIds({ id: 1, subjectIds: [] })), []);
  assert.deepEqual(plain(sandbox.getFolderSubjectIds(null)), []);
});

test("storage: legacy single-subject folder is fully usable and upgrades on edit", async () => {
  const { sandbox } = await storageSandbox();

  assert.ok(
    sandbox.createFolder({
      id: 20,
      name: "Legacy",
      createdAt: "2026-01-01T00:00:00.000Z",
      subjectId: 4,
    })
  );
  const legacy = sandbox.getFolders()[0];
  assert.equal(legacy.subjectId, 4);
  assert.equal(legacy.subjectIds, undefined, "no destructive migration on read");
  assert.deepEqual(plain(sandbox.getFolderSubjectIds(legacy)), [4]);

  assert.ok(sandbox.updateFolder(20, { name: "Legacy renamed" }));
  const afterRename = sandbox.getFolders()[0];
  assert.equal(afterRename.subjectId, 4, "rename keeps the subject relationship");
  assert.deepEqual(plain(sandbox.getFolderSubjectIds(afterRename)), [4]);

  assert.ok(sandbox.updateFolder(20, { subjectIds: [4, 8], subjectId: 4 }));
  const upgraded = sandbox.getFolders()[0];
  assert.equal(upgraded.subjectId, 4);
  assert.deepEqual(plain(upgraded.subjectIds), [4, 8]);
});

test("storage: deleteSubject cleans both subjectIds and legacy subjectId, re-mirroring", async () => {
  const { sandbox } = await storageSandbox();
  assert.ok(sandbox.saveSubjects([{ id: 1, name: "Math" }, { id: 2, name: "Physics" }]));

  assert.ok(
    sandbox.createFolder({
      id: 30,
      name: "Multi",
      createdAt: "2026-01-01T00:00:00.000Z",
      subjectIds: [1, 2],
      subjectId: 1,
    })
  );
  assert.ok(
    sandbox.createFolder({
      id: 31,
      name: "Legacy",
      createdAt: "2026-01-01T00:00:00.000Z",
      subjectId: 1,
    })
  );

  assert.ok(sandbox.deleteSubject(1));

  const multi = sandbox.getFolders().find((f) => String(f.id) === "30");
  assert.deepEqual(plain(multi.subjectIds), [2], "deleted id removed from the array");
  assert.equal(multi.subjectId, 2, "primary re-mirrored to the remaining subject");

  const legacy = sandbox.getFolders().find((f) => String(f.id) === "31");
  assert.equal(legacy.subjectId, null, "legacy primary cleared");
  assert.equal(legacy.subjectIds, undefined);
});

test("storage: sort/view/order preferences persist per user across a reload", async () => {
  const { sandbox, values } = await storageSandbox();

  const ok = sandbox.saveSettings({
    ...sandbox.getSettings(),
    folderSort: "name-asc",
    folderView: "list",
    folderOrder: [3, 1, 2],
    examSorts: { folderA: "created-desc", folderB: "updated-asc" },
    examOrders: { folderA: [2, 1] },
  });
  assert.equal(ok, true);

  const key = Object.keys(values).find(
    (k) => k.includes("beta4-user") && k.endsWith("settings")
  );
  assert.ok(key, "preferences live in the user-scoped settings key");

  // "Reload": a fresh runtime over the same storage.
  const reloaded = await storageSandbox(values);
  const settings = reloaded.sandbox.getSettings();
  assert.equal(settings.folderSort, "name-asc");
  assert.equal(settings.folderView, "list");
  assert.deepEqual(plain(settings.folderOrder), [3, 1, 2]);
  assert.equal(settings.examSorts.folderA, "created-desc", "per-folder exam sort state");
  assert.equal(settings.examSorts.folderB, "updated-asc", "folders keep independent exam sorts");
  assert.deepEqual(plain(settings.examOrders.folderA), [2, 1]);
  assert.equal(settings.language, "fa", "existing settings keys survive alongside new ones");
});

test("wiring: Folders page has sort control, view toggle, multi-subject UI and reorder", async () => {
  const source = await rf("../pages/Folders.jsx");

  assert.match(source, /from "framer-motion"/, "drag-and-drop dependency imported");
  assert.match(source, /Reorder\.Group/, "Reorder.Group used for list drag");
  assert.match(source, /onReorder=\{commitOrder\}/, "drag commits a new custom order");
  assert.match(source, /folders-sort-select/, "sort select rendered");
  assert.match(source, /`folders\.sort\.\$\{mode\}`/, "every sort mode gets a localized label");
  assert.match(source, /view-toggle/, "card/list toggle rendered");
  assert.match(source, /aria-pressed/, "toggle exposes pressed state");
  assert.match(source, /const orderedFolders = sortItems\(/, "single ordered list feeds both views");
  assert.ok(
    (source.match(/orderedFolders\.map/g) || []).length >= 2,
    "both card grid and list view render the same ordered list"
  );
  assert.match(source, /className="folder-grid/, "card view present");
  assert.match(source, /className="folder-list/, "list view present");

  assert.match(source, /folderSort: mode/, "sort mode persisted to settings");
  assert.match(source, /folderView: view/, "view preference persisted to settings");
  assert.match(source, /folderOrder: merged/, "custom order persisted to settings");

  assert.match(source, /buildCustomOrder\(/, "canonical order rebuilt before commit");
  assert.match(source, /mergeVisibleOrder\(/, "filtered reorder spliced safely");
  assert.match(source, /moveItem\(/, "accessible up/down reordering");
  assert.match(source, /name="arrowUp"/, "move-up button");
  assert.match(source, /name="arrowDown"/, "move-down button");

  assert.match(source, /subject-select-chips/, "chip multi-select for subjects");
  assert.ok(
    (source.match(/subject-select-chips/g) || []).length >= 2,
    "multi-select used in both create and edit-subjects flows"
  );
  assert.match(source, /aria-pressed=\{selected\}/, "chip selection state is accessible");
  assert.match(source, /getFolderSubjectIds\(/, "membership-based subject handling");
  assert.match(source, /subjectIds: ids/, "create stores the full selection");
  assert.match(source, /handleSubjectsSubmit/, "edit-subjects save path exists");
  assert.match(
    source,
    /updateFolder\(editingSubjectsFolder\.id, \{\s*subjectIds: ids,/,
    "edit saves the complete selection"
  );
  assert.match(source, /\.some\(\s*\(sid\) => String\(sid\) === String\(filterSubject\)/, "filter by any member subject");
});

test("wiring: Folder page sorts exams per folder with its own state", async () => {
  const source = await rf("../pages/Folder.jsx");

  assert.match(source, /folders-sort-select/, "exam sort select rendered");
  assert.match(source, /examSorts/, "per-folder sort modes stored in settings");
  assert.match(source, /examOrders/, "per-folder orders stored in settings");
  assert.match(source, /sorts\[id\]/, "sort mode keyed by this folder's id");
  assert.match(source, /orders\[id\]/, "order keyed by this folder's id");
  assert.match(source, /examSorts: \{ \.\.\.sorts, \[id\]: mode \}/, "writing one folder's mode never touches another");
  assert.match(source, /examOrders: \{ \.\.\.orders, \[id\]: merged \}/, "writing one folder's order never touches another");
  assert.match(source, /from "framer-motion"/, "drag support");
  assert.match(source, /Reorder\.Group/, "exam rows draggable in custom mode");
  assert.match(source, /onReorder=\{commitExamOrder\}/, "exam drag commits custom order");
  assert.match(source, /handleMoveExamOrder\(exam, -1\)/, "up button on exam rows");
  assert.match(source, /handleMoveExamOrder\(exam, 1\)/, "down button on exam rows");
  assert.match(source, /sortItems\(/, "shared sort engine");
});

test("wiring: storage stamps, mirrors and validates the new folder fields", async () => {
  const source = await rf("./storage.js");

  assert.match(source, /export function getFolderSubjectIds/, "public subject-ids reader exported");
  assert.match(source, /function withSubjectMirror\(/, "primary-subject mirror on every write");
  assert.equal(
    (source.match(/updates\.updatedAt !== undefined/g) || []).length,
    2,
    "updateFolder and updateExam both stamp updatedAt"
  );
  assert.match(source, /folder\.subjectIds === undefined/, "validator accepts (optional) subjectIds");
  assert.match(source, /exam\.updatedAt === undefined/, "validator accepts (optional) updatedAt");
  assert.match(source, /f\.subjectIds\.filter\(/, "deleteSubject strips ids from arrays");
});

test("wiring: cloud sync carries real edit timestamps both ways", async () => {
  const source = await rf("./cloudSync.js");

  assert.match(source, /folder\.updatedAt \|\|\s*folder\.createdAt/, "folder push sends the local edit stamp");
  assert.match(source, /exam\.updatedAt \|\|\s*exam\.createdAt/, "exam push sends the local edit stamp");
  assert.match(source, /cloudFolder\.updated_at/, "folder pull adopts the cloud edit stamp");
  assert.match(source, /cloudExam\.updated_at/, "exam pull adopts the cloud edit stamp");
  assert.match(source, /folder\.updated_at/, "cloud-only folder additions keep their stamp");
});

test("wiring: Subjects page counts membership, not just the primary subject", async () => {
  const source = await rf("../pages/Subjects.jsx");
  assert.match(
    source,
    /getFolderSubjectIds\(f\)\.some\(/,
    "a multi-subject folder counts toward every subject"
  );
});

test("i18n: every new Beta 4 key exists in both Persian and English", () => {
  const keys = [
    "folders.sort.label",
    "folders.sort.name-asc",
    "folders.sort.name-desc",
    "folders.sort.created-asc",
    "folders.sort.created-desc",
    "folders.sort.updated-asc",
    "folders.sort.updated-desc",
    "folders.sort.custom",
    "folders.sort.saveFailed",
    "folders.view.label",
    "folders.view.cards",
    "folders.view.list",
    "folders.order.up",
    "folders.order.down",
    "folders.order.hint",
    "folders.subjects.title",
    "folders.subjects.edit",
  ];

  for (const key of keys) {
    assert.ok(
      typeof translations.fa?.[key] === "string" && translations.fa[key].length > 0,
      `fa: ${key}`
    );
    assert.ok(
      typeof translations.en?.[key] === "string" && translations.en[key].length > 0,
      `en: ${key}`
    );
  }
});
