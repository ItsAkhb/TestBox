import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSrc(rel) {
  return readFile(new URL(rel, import.meta.url), "utf8");
}

// =========================================================
// Question tag selector UI (replaces mark-looking control)
// =========================================================

test("tags-ui: Exam renders a dedicated tag control (tag icon, not star)", async () => {
  const exam = await readSrc("../pages/Exam.jsx");
  assert.ok(exam.includes('className={`tag-button'), "tag-button present");
  assert.ok(
    /<Icon\s+name="tag"/.test(exam),
    "tag control uses the tag icon (not star/bookmark)"
  );
  assert.ok(
    exam.includes("openTagPicker"),
    "clicking tag control opens the tag picker"
  );
  assert.ok(
    exam.includes("QuestionTagPicker"),
    "Exam uses the shared QuestionTagPicker"
  );
});

test("tags-ui: legacy mark/star control is fully removed (tags only)", async () => {
  const exam = await readSrc("../pages/Exam.jsx");
  assert.ok(
    !exam.includes("function toggleMark"),
    "toggleMark handler removed"
  );
  assert.ok(
    !/className=\{`mark-button/.test(exam),
    "mark-button no longer rendered"
  );
  assert.ok(
    !exam.includes('name="star"'),
    "no star icon on question rows"
  );
  assert.ok(
    !exam.includes("marked-counter"),
    "marked counter removed from header"
  );
  assert.ok(
    !exam.includes('event.key === "m"'),
    "M keyboard shortcut removed"
  );
  // Tag commit must not go through marked persistence
  const commit = exam.match(/function commitQuestionTags[\s\S]{0,900}/);
  assert.ok(commit, "commitQuestionTags exists");
  assert.ok(
    commit[0].includes("setQuestionTag"),
    "tag persistence uses setQuestionTag"
  );
  assert.ok(
    !commit[0].includes("marked"),
    "tag commit never writes the marked list"
  );
  assert.ok(
    !/toggleMark\s*\(/.test(commit[0]),
    "tag commit never calls toggleMark"
  );
});

test("tags-ui: tag changes re-sync Exam state without clobbering answers", async () => {
  const exam = await readSrc("../pages/Exam.jsx");
  const commit = exam.match(/function commitQuestionTags[\s\S]{0,900}/);
  assert.ok(commit);
  assert.ok(
    commit[0].includes("latestExamDataRef.current = fresh"),
    "storage re-synced into latestExamDataRef after tag write"
  );
  assert.ok(
    commit[0].includes("setExamData(fresh)"),
    "examData state refreshed from storage"
  );
});

test("tags-ui: shared QuestionTagPicker reuses Tags assign interaction", async () => {
  const picker = await readSrc("../components/exam/QuestionTagPicker.jsx");
  assert.ok(picker.includes("tag-assign-list"), "reuses .tag-assign-list");
  assert.ok(picker.includes("tag-assign-row"), "reuses .tag-assign-row");
  assert.ok(picker.includes("tag-assign-empty"), "empty-tag state");
  assert.ok(picker.includes("tags.assignTitle"), "same modal title");
  assert.ok(picker.includes("__marked__") || picker.includes("tagLabel"), "uses shared tagLabel");

  const labelUtil = await readSrc("./tagLabel.js");
  assert.ok(labelUtil.includes("__marked__"), "shared tagLabel localizes __marked__");

  const tagsPage = await readSrc("../pages/Tags.jsx");
  assert.ok(
    tagsPage.includes("QuestionTagPicker"),
    "Tags page uses the same shared picker (no second picker)"
  );
  assert.ok(
    !/function tagLabel\s*\(/.test(tagsPage),
    "Tags page no longer defines a duplicate tagLabel"
  );
});

test("tags-ui: Icon maps the tag icon", async () => {
  const icon = await readSrc("../components/ui/Icon.jsx");
  assert.ok(icon.includes("Tag,"), "lucide Tag imported");
  assert.ok(/tag:\s*Tag\b/.test(icon), "tag key mapped in iconMap");
});

test("tags-ui: i18n keys for tag control exist in fa + en", async () => {
  const i18n = await readSrc("../i18n/translations.js");
  for (const key of [
    "exam.a11y.addTags",
    "exam.a11y.editTags",
    "exam.a11y.tagCount",
    "tags.assignTitle",
    "tags.assignSubtitle",
    "tags.empty.description",
    "tags.marked",
  ]) {
    assert.ok(
      i18n.includes(`"${key}"`),
      `missing i18n key ${key}`
    );
  }
});

// =========================================================
// Folder exam card icons — normal vs practice
// =========================================================

test("exam-card-icon: normal vs practice use distinct icons from exam.type", async () => {
  const folder = await readSrc("../pages/Folder.jsx");
  assert.ok(
    /exam\.type === "exam"\s*\?\s*"fileText"\s*:\s*"bookOpen"/.test(folder),
    "card icon branches on exam.type (source of truth)"
  );
  assert.ok(
    !/exam-list-icon">\s*<Icon name="fileText"/.test(folder),
    "regression: no longer hardcodes fileText for every card"
  );
  assert.ok(
    folder.includes('name={exam.type === "exam" ? "fileText" : "bookOpen"}') ||
      /exam\.type === "exam"\s*\?\s*"fileText"\s*:\s*"bookOpen"/.test(folder),
    "fileText (exam) ≠ bookOpen (practice)"
  );
});

// =========================================================
// Data safety: tags/mark independence (service-level)
// =========================================================

test("tags-ui: setQuestionTag path leaves marked untouched (storage source)", async () => {
  const storage = await readSrc("./storage.js");
  const setQ = storage.match(/export function setQuestionTag[\s\S]{0,500}/);
  assert.ok(setQ, "setQuestionTag exists");
  assert.ok(
    setQ[0].includes("questionTags"),
    "writes only questionTags"
  );
  assert.ok(
    !setQ[0].includes("marked"),
    "setQuestionTag never touches examData.marked"
  );
});

test("tags-ui: answer sheet still gates result actions independently of tags", async () => {
  const exam = await readSrc("../pages/Exam.jsx");
  assert.ok(
    exam.includes("question-result-actions"),
    "practice result actions intact"
  );
  assert.ok(
    exam.includes("disabled={isReviewMode}"),
    "result controls still disabled in review mode"
  );
  // Tag picker is available even when result actions are disabled (review) — metadata
  assert.ok(
    exam.includes("openTagPicker(questionNumber)"),
    "tag picker wired per question row"
  );
});
