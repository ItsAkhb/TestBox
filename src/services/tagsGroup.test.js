import test from "node:test";
import assert from "node:assert/strict";

import { groupTaggedQuestions, UNKNOWN, UNCATEGORIZED } from "./tagsGroup.js";

const exams = [
  {
    id: "e2",
    name: "Exam 2",
    folderId: "f1",
    createdAt: "2024-02-01T00:00:00.000Z",
  },
  {
    id: "e1",
    name: "Exam 1",
    folderId: "f1",
    createdAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "e3",
    name: "Physics Final",
    folderId: "f2",
    createdAt: "2024-03-01T00:00:00.000Z",
  },
];

const folders = [
  { id: "f1", name: "Algebra Pack", subjectId: "s1" },
  { id: "f2", name: "Waves Pack", subjectId: "s2" },
  { id: "f3", name: "Loose", subjectId: null },
  { id: "f4", name: "Dangling", subjectId: "s-missing" },
];

const subjects = [
  { id: "s1", name: "Mathematics", color: "#2563eb" },
  { id: "s2", name: "Physics", color: "#059669" },
];

const tags = [
  { id: "t1", name: "Hard", color: "#dc2626" },
  { id: "t2", name: "Review", color: "#d97706" },
];

function qmap(obj) {
  return obj;
}

test("group: questions nest under subject → exam", () => {
  const groups = groupTaggedQuestions({
    exams,
    folders,
    subjects,
    tags,
    questionTagsByExam: {
      e1: qmap({ 3: ["t1"], 8: ["t1"] }),
      e2: qmap({ 1: ["t1"] }),
      e3: qmap({ 6: ["t2"] }),
    },
  });

  assert.equal(groups.length, 2);

  const math = groups.find((g) => g.key === "s1");
  const physics = groups.find((g) => g.key === "s2");
  assert.ok(math, "mathematics group");
  assert.ok(physics, "physics group");
  assert.equal(math.name, "Mathematics");
  assert.equal(math.color, "#2563eb");
  assert.equal(math.questionCount, 3);
  assert.equal(physics.questionCount, 1);

  // Newest exam first within subject
  assert.equal(math.exams[0].examId, "e2");
  assert.equal(math.exams[1].examId, "e1");
  assert.equal(math.exams[0].questions[0].questionNumber, "1");
  assert.deepEqual(
    math.exams[1].questions.map((q) => q.questionNumber),
    ["3", "8"]
  );
  assert.equal(physics.exams[0].examName, "Physics Final");
  assert.equal(physics.exams[0].questions[0].questionNumber, "6");
});

test("group: exam maps to correct subject via folder.subjectId", () => {
  const groups = groupTaggedQuestions({
    exams,
    folders,
    subjects,
    tags,
    questionTagsByExam: {
      e1: { 1: ["t1"] },
      e3: { 6: ["t1"] },
    },
  });

  const math = groups.find((g) => g.key === "s1");
  const physics = groups.find((g) => g.key === "s2");
  assert.equal(math.exams[0].examId, "e1");
  assert.equal(physics.exams[0].examId, "e3");
});

test("group: specific tag filter preserves hierarchy", () => {
  const groups = groupTaggedQuestions({
    exams,
    folders,
    subjects,
    tags,
    activeTagId: "t2",
    questionTagsByExam: {
      e1: { 3: ["t1"], 8: ["t2"] },
      e3: { 6: ["t2"] },
    },
  });

  const math = groups.find((g) => g.key === "s1");
  const physics = groups.find((g) => g.key === "s2");
  assert.equal(math.questionCount, 1);
  assert.equal(math.exams[0].questions[0].questionNumber, "8");
  assert.equal(physics.questionCount, 1);
  assert.equal(groups.length, 2);
});

test("group: multi-tag question appears once, not duplicated", () => {
  const groups = groupTaggedQuestions({
    exams: [exams[0]],
    folders,
    subjects,
    tags,
    questionTagsByExam: {
      e2: { 1: ["t1", "t2"] },
    },
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].exams[0].questions.length, 1);
  assert.equal(groups[0].exams[0].questions[0].tags.length, 2);
  assert.equal(groups[0].questionCount, 1);
});

test("group: multi-tag question counts once under a selected tag view", () => {
  const groups = groupTaggedQuestions({
    exams: [exams[0]],
    folders,
    subjects,
    tags,
    activeTagId: "t1",
    questionTagsByExam: {
      e2: { 1: ["t1", "t2"] },
    },
  });

  assert.equal(groups[0].exams[0].questions.length, 1);
  assert.equal(groups[0].questionCount, 1);
});

test("group: empty groups are omitted", () => {
  const groups = groupTaggedQuestions({
    exams,
    folders,
    subjects,
    tags,
    questionTagsByExam: {
      e1: {},
      e2: { 1: [] },
      e3: {},
    },
  });

  assert.equal(groups.length, 0);
});

test("group: missing subject → unknown group (dangling subjectId)", () => {
  const orphanExams = [
    { id: "e9", name: "Orphan Exam", folderId: "f4", createdAt: "2024-01-01T00:00:00.000Z" },
  ];
  const groups = groupTaggedQuestions({
    exams: orphanExams,
    folders,
    subjects,
    tags,
    questionTagsByExam: { e9: { 1: ["t1"] } },
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].isUnknown, true);
  assert.equal(groups[0].key.startsWith(UNKNOWN), true);
  assert.equal(groups[0].questionCount, 1);
  assert.equal(groups[0].exams[0].questions[0].questionNumber, "1");
});

test("group: missing folder → unknown subject group", () => {
  const orphanExams = [
    { id: "e8", name: "No Folder", folderId: "f-gone", createdAt: "2024-01-01T00:00:00.000Z" },
  ];
  const groups = groupTaggedQuestions({
    exams: orphanExams,
    folders,
    subjects,
    tags,
    questionTagsByExam: { e8: { 5: ["t1"] } },
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].isUnknown, true);
  assert.equal(groups[0].key, UNKNOWN);
});

test("group: folder without subject → uncategorized", () => {
  const looseExams = [
    { id: "e7", name: "Loose Exam", folderId: "f3", createdAt: "2024-01-01T00:00:00.000Z" },
  ];
  const groups = groupTaggedQuestions({
    exams: looseExams,
    folders,
    subjects,
    tags,
    questionTagsByExam: { e7: { 2: ["t1"] } },
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].isUncategorized, true);
  assert.equal(groups[0].key, UNCATEGORIZED);
});

test("group: custom question numbering order preserved numerically", () => {
  const groups = groupTaggedQuestions({
    exams: [exams[0]],
    folders,
    subjects,
    tags,
    questionTagsByExam: {
      e2: { "9": ["t1"], "5": ["t1"], "7": ["t1"] },
    },
  });

  assert.deepEqual(
    groups[0].exams[0].questions.map((q) => q.questionNumber),
    ["5", "7", "9"]
  );
});

test("group: resolved tag objects attached for chips", () => {
  const groups = groupTaggedQuestions({
    exams: [exams[0]],
    folders,
    subjects,
    tags,
    questionTagsByExam: { e2: { 1: ["t1", "missing"] } },
  });

  const q = groups[0].exams[0].questions[0];
  assert.equal(q.tags.length, 1);
  assert.equal(q.tags[0].name, "Hard");
  assert.deepEqual(q.tagIds, ["t1", "missing"]);
});

test("group: all-tags view is one hierarchy, not concatenated flat tag lists", () => {
  const groups = groupTaggedQuestions({
    exams,
    folders,
    subjects,
    tags,
    questionTagsByExam: {
      e1: { 1: ["t1"] },
      e3: { 1: ["t2"] },
    },
  });

  assert.equal(groups.length, 2);
  assert.ok(groups.every((g) => g.exams.length >= 1));
  // each question once
  const flatCount = groups.reduce(
    (n, g) => n + g.exams.reduce((m, e) => m + e.questions.length, 0),
    0
  );
  assert.equal(flatCount, 2);
});
