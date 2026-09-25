/**
 * Pure Subject → Exam → Question hierarchy for the Tags browser.
 * Derived only from existing storage shapes — no tag model changes.
 */

const UNKNOWN = "__unknown__";
const UNCATEGORIZED = "__uncategorized__";

function idKey(value) {
  return value == null ? "" : String(value);
}

function sortQuestionNumbers(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a).localeCompare(String(b));
}

function sortExamCreatedAtDesc(a, b) {
  const ta = Date.parse(a.createdAt);
  const tb = Date.parse(b.createdAt);
  if (Number.isFinite(ta) && Number.isFinite(tb)) return tb - ta;
  return 0;
}

/**
 * Build nested groups from flat exam/folder/subject lists + questionTags maps.
 *
 * @param {object} input
 * @param {Array} input.exams
 * @param {Array} input.folders
 * @param {Array} input.subjects
 * @param {Array} input.tags
 * @param {Record<string, Record<string, string[]>>} input.questionTagsByExam
 * @param {string} [input.activeTagId] — when set, only questions with that tag
 * @returns {Array<{ key, subjectId, name, color, isUnknown, isUncategorized, questionCount, exams: Array<{ examId, examName, folderName, createdAt, questionCount, questions: Array }> }>}
 */
export function groupTaggedQuestions({
  exams = [],
  folders = [],
  subjects = [],
  tags = [],
  questionTagsByExam = {},
  activeTagId = "",
}) {
  const folderById = new Map(folders.map((f) => [idKey(f.id), f]));
  const subjectById = new Map(subjects.map((s) => [idKey(s.id), s]));
  const tagById = new Map(tags.map((t) => [idKey(t.id), t]));
  const activeKey = activeTagId ? idKey(activeTagId) : "";

  /** @type {Map<string, any>} */
  const subjectGroups = new Map();

  function ensureSubjectGroup(folder) {
    let key;
    let name;
    let color = null;
    let isUnknown = false;
    let isUncategorized = false;

    if (!folder) {
      key = UNKNOWN;
      name = null;
      isUnknown = true;
    } else if (!folder.subjectId) {
      key = UNCATEGORIZED;
      name = null;
      color = null;
      isUncategorized = true;
    } else {
      const subject = subjectById.get(idKey(folder.subjectId));
      if (!subject) {
        key = `${UNKNOWN}:${idKey(folder.subjectId)}`;
        name = null;
        isUnknown = true;
      } else {
        key = idKey(subject.id);
        name = subject.name || null;
        color = subject.color || null;
      }
    }

    let group = subjectGroups.get(key);
    if (!group) {
      group = {
        key,
        subjectId: folder?.subjectId ? idKey(folder.subjectId) : null,
        name,
        color,
        isUnknown,
        isUncategorized,
        questionCount: 0,
        exams: [],
        _examByKey: new Map(),
      };
      subjectGroups.set(key, group);
    }
    return group;
  }

  const sortedExams = [...exams].sort(sortExamCreatedAtDesc);

  sortedExams.forEach((exam) => {
    const map = questionTagsByExam[idKey(exam.id)];
    if (!map || typeof map !== "object") return;

    const folder = folderById.get(idKey(exam.folderId)) || null;

    const entries = [];
    Object.entries(map).forEach(([qNum, tagIds]) => {
      if (!Array.isArray(tagIds) || tagIds.length === 0) return;
      if (activeKey && !tagIds.some((id) => idKey(id) === activeKey)) return;

      const questionTagObjects = tagIds
        .map((id) => tagById.get(idKey(id)))
        .filter(Boolean);

      entries.push({
        examId: exam.id,
        examName: exam.name,
        folderName: folder?.name || "",
        folderId: exam.folderId,
        subjectId: folder?.subjectId ? idKey(folder.subjectId) : null,
        questionNumber: String(qNum),
        tags: questionTagObjects,
        tagIds: tagIds.map(idKey),
        createdAt: exam.createdAt,
      });
    });

    if (entries.length === 0) return;

    const subjectGroup = ensureSubjectGroup(folder);
    entries.sort((a, b) => sortQuestionNumbers(a.questionNumber, b.questionNumber));

    const examKey = idKey(exam.id);
    let examGroup = subjectGroup._examByKey.get(examKey);
    if (!examGroup) {
      examGroup = {
        examId: exam.id,
        examKey,
        examName: exam.name,
        folderName: folder?.name || "",
        createdAt: exam.createdAt,
        questionCount: 0,
        questions: [],
      };
      subjectGroup._examByKey.set(examKey, examGroup);
      subjectGroup.exams.push(examGroup);
    }

    examGroup.questions.push(...entries);
    examGroup.questionCount += entries.length;
    subjectGroup.questionCount += entries.length;
  });

  const groups = [...subjectGroups.values()]
    .filter((group) => group.questionCount > 0)
    .map((group) => ({
      key: group.key,
      subjectId: group.subjectId,
      name: group.name,
      color: group.color,
      isUnknown: group.isUnknown,
      isUncategorized: group.isUncategorized,
      questionCount: group.questionCount,
      exams: [...group.exams].sort(sortExamCreatedAtDesc),
    }));

  // Known subjects first (alpha), then uncategorized, then unknown/orphans last
  groups.sort((a, b) => {
    if (a.isUnknown !== b.isUnknown) return a.isUnknown ? 1 : -1;
    if (a.isUncategorized !== b.isUncategorized) return a.isUncategorized ? 1 : -1;
    if (!a.name && b.name) return -1;
    if (a.name && !b.name) return 1;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  return groups;
}

export { UNKNOWN, UNCATEGORIZED };
