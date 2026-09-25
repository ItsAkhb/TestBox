import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";

import {
  getExams,
  getFolders,
  getSubjects,
  getExamData,
  getTags,
  createTag,
  updateTag,
  deleteTag,
  saveExamData,
  migrateMarkedToTags,
  generateId,
} from "../services/dataService";
import { groupTaggedQuestions } from "../services/tagsGroup";
import { useTranslation } from "../i18n";
import { useToast } from "../context/ToastContext";
import Icon from "../components/ui/Icon";
import Modal from "../components/ui/Modal";
import PageHeader from "../components/ui/PageHeader";
import EmptyArt from "../components/ui/EmptyArt";
import EmptyState from "../components/ui/EmptyState";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import QuestionTagPicker from "../components/exam/QuestionTagPicker";
import { tagLabel } from "../services/tagLabel";

const TAG_COLORS = [
  "#2563eb", "#059669", "#d97706", "#dc2626",
  "#7c3aed", "#0891b2", "#db2777", "#65a30d",
];

function Tags() {
  const location = useLocation();
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [exams, setExams] = useState(() => getExams());
  const [folders, setFolders] = useState(() => getFolders());
  const [subjects, setSubjects] = useState(() => getSubjects());
  const [tags, setTags] = useState(() => getTags());
  const [activeTagId, setActiveTagId] = useState("");
  const [collapsedSubjects, setCollapsedSubjects] = useState(() => new Set());
  const [collapsedExams, setCollapsedExams] = useState(() => new Set());

  const [showTagModal, setShowTagModal] = useState(false);
  const [editingTag, setEditingTag] = useState(null);
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState(TAG_COLORS[0]);

  const [assignQuestion, setAssignQuestion] = useState(null);
  const [questionTagIds, setQuestionTagIds] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const savingRef = useRef(false);

  const refreshLists = useCallback(() => {
    setExams(getExams());
    setFolders(getFolders());
    setSubjects(getSubjects());
    setTags(getTags());
  }, []);

  useEffect(() => {
    migrateMarkedToTags();
    refreshLists();
  }, [refreshLists]);

  useEffect(() => {
    refreshLists();
  }, [location.pathname, location.key, refreshLists]);

  const refresh = refreshLists;

  const groups = useMemo(() => {
    const questionTagsByExam = {};
    exams.forEach((exam) => {
      const map = getExamData(exam.id)?.questionTags;
      if (map && typeof map === "object") {
        questionTagsByExam[String(exam.id)] = map;
      }
    });
    return groupTaggedQuestions({
      exams,
      folders,
      subjects,
      tags,
      questionTagsByExam,
      activeTagId,
    });
    // getExamData reads live storage; lists drive recompute
  }, [exams, folders, subjects, tags, activeTagId]);

  const totalCount = useMemo(
    () => groups.reduce((sum, g) => sum + g.questionCount, 0),
    [groups]
  );

  const toggleSubject = useCallback((key) => {
    setCollapsedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleExam = useCallback((examKey) => {
    setCollapsedExams((prev) => {
      const next = new Set(prev);
      if (next.has(examKey)) next.delete(examKey);
      else next.add(examKey);
      return next;
    });
  }, []);

  const tagUsageCount = useCallback(
    (tagId) => {
      let count = 0;
      exams.forEach((exam) => {
        const map = getExamData(exam.id)?.questionTags;
        if (!map) return;
        Object.values(map).forEach((list) => {
          if (Array.isArray(list) && list.some((id) => String(id) === String(tagId))) {
            count += 1;
          }
        });
      });
      return count;
    },
    [exams]
  );

  function handleOpenCreate() {
    setEditingTag(null);
    setTagName("");
    setTagColor(TAG_COLORS[tags.length % TAG_COLORS.length]);
    setShowTagModal(true);
  }

  function handleOpenEdit(tag) {
    setEditingTag(tag);
    setTagName(tag.name);
    setTagColor(tag.color || TAG_COLORS[0]);
    setShowTagModal(true);
  }

  function handleCloseModal() {
    setShowTagModal(false);
    setEditingTag(null);
    setTagName("");
    savingRef.current = false;
  }

  function handleSave() {
    if (savingRef.current) return;

    const name = tagName.trim();

    if (!name) {
      showToast(t("tags.nameRequired"), "warning");
      return;
    }

    savingRef.current = true;
    try {
      if (editingTag) {
        const updated = updateTag(editingTag.id, { name, color: tagColor });

        if (!updated) {
          showToast(
            getTags().some(
              (tag) =>
                String(tag.id) !== String(editingTag.id) &&
                tag.name.trim().toLowerCase() === name.toLowerCase()
            )
              ? t("tags.nameTaken")
              : t("tags.updateFailed"),
            "error"
          );
          return;
        }

        showToast(t("tags.updateSuccess"), "success");
      } else {
        const created = createTag({
          id: generateId(),
          name,
          color: tagColor,
        });

        if (!created) {
          showToast(
            getTags().some(
              (tag) => tag.name.trim().toLowerCase() === name.toLowerCase()
            )
              ? t("tags.nameTaken")
              : t("tags.createFailed"),
            "error"
          );
          return;
        }

        showToast(t("tags.createSuccess"), "success");
      }

      refresh();
      handleCloseModal();
    } finally {
      savingRef.current = false;
    }
  }

  function handleDelete(tag) {
    const count = tagUsageCount(tag.id);
    const message =
      count > 0
        ? t("tags.deleteConfirmWithQuestions", { count })
        : t("tags.deleteConfirm");

    setDeleteTarget({ tag, message });
  }

  function confirmDelete() {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target) return;

    const deleted = deleteTag(target.tag.id);

    if (!deleted) {
      showToast(t("tags.deleteFailed"), "error");
      return;
    }

    if (String(activeTagId) === String(target.tag.id)) {
      setActiveTagId("");
    }

    showToast(t("tags.deleteSuccess"), "success");
    refresh();
  }

  function openAssign(entry) {
    setAssignQuestion(entry);
    setQuestionTagIds(
      entry.tags.map((tag) => String(tag.id))
    );
  }

  function handleAssignSave() {
    if (!assignQuestion || savingRef.current) return;

    savingRef.current = true;
    try {
      const examId = assignQuestion.examId;
      const questionNumber = String(assignQuestion.questionNumber);
      const data = getExamData(examId);
      const map = { ...(data.questionTags || {}) };
      const nextIds = [...new Set(questionTagIds.map(String))];

      if (nextIds.length > 0) {
        map[questionNumber] = nextIds;
      } else {
        delete map[questionNumber];
      }

      const ok = saveExamData(examId, { ...data, questionTags: map });
      if (!ok) {
        showToast(t("tags.assignFailed"), "error");
        return;
      }

      setAssignQuestion(null);
      setQuestionTagIds([]);
      refresh();
    } finally {
      savingRef.current = false;
    }
  }

  return (
    <section className="page-section marked-page">

      <PageHeader
        icon="tag"
        tone="warm"
        title={t("tags.title")}
        subtitle={t("tags.subtitle")}
        actions={
          <button className="primary-button" onClick={handleOpenCreate}>
            <Icon name="plus" size={15} />
            {t("tags.create")}
          </button>
        }
      />

      {tags.length > 0 && (
        <div className="folders-subject-filter">
          <button
            type="button"
            className={`filter-chip ${activeTagId === "" ? "active" : ""}`}
            onClick={() => setActiveTagId("")}
          >
            {t("tags.filter.all")}
          </button>

          {tags.map((tag) => (
            <span key={tag.id} className="tag-filter-chip-wrap">
              <button
                type="button"
                className={`filter-chip ${String(activeTagId) === String(tag.id) ? "active" : ""}`}
                onClick={() =>
                  setActiveTagId((prev) =>
                    String(prev) === String(tag.id) ? "" : tag.id
                  )
                }
              >
                <span
                  className="filter-dot"
                  style={{ backgroundColor: tag.color || "#4A90E2" }}
                />
                {tagLabel(tag, t)}
              </button>
              <button
                type="button"
                className="tag-chip-edit"
                aria-label={t("tags.editTag", { name: tagLabel(tag, t) })}
                title={t("tags.editTag", { name: tagLabel(tag, t) })}
                onClick={() => handleOpenEdit(tag)}
              >
                <Icon name="pen" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {totalCount === 0 ? (
        tags.length === 0 ? (
          <EmptyState
            icon={<EmptyArt variant="sheets" />}
            title={t("tags.empty.title")}
            description={t("tags.empty.description")}
            action={{
              label: t("tags.create"),
              onClick: handleOpenCreate,
            }}
          />
        ) : (
          <div className="empty-state marked-empty-state">
            <EmptyArt variant="sheets" />
            <h3>{t("tags.empty.title")}</h3>
            <p>{t("tags.empty.description")}</p>
          </div>
        )
      ) : (
        <div className="tagged-groups rise-list">
          {groups.map((group) => {
            const subjectOpen = !collapsedSubjects.has(group.key);
            const subjectLabel = group.isUnknown
              ? t("tags.unknownSubject")
              : group.isUncategorized
                ? t("subjects.uncategorized")
                : group.name;

            return (
              <div key={group.key} className="tagged-subject-group">
                <button
                  type="button"
                  className="tagged-group-header"
                  aria-expanded={subjectOpen}
                  onClick={() => toggleSubject(group.key)}
                >
                  <span className="tagged-group-title">
                    <span
                      className={`filter-dot${group.isUnknown ? " is-unknown" : ""}`}
                      style={
                        group.color
                          ? { backgroundColor: group.color }
                          : undefined
                      }
                    />
                    <span className="tagged-group-name">{subjectLabel}</span>
                  </span>
                  <span className="tagged-group-meta">
                    <span className="tagged-group-count">
                      {t("tags.groupCount", { count: group.questionCount })}
                    </span>
                    <span
                      className={`tagged-expand-icon${subjectOpen ? " open" : ""}`}
                      aria-hidden="true"
                    >
                      <Icon name="chevronDown" size={16} />
                    </span>
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {subjectOpen && (
                    <motion.div
                      key="subject-body"
                      className="tagged-group-body-wrap"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <div className="tagged-group-body">
                        {group.exams.map((examGroup) => {
                          const examOpen = !collapsedExams.has(examGroup.examKey);
                          const examLabel =
                            examGroup.examName || t("tags.unknownExam");

                          return (
                            <div
                              key={examGroup.examKey}
                              className="tagged-exam-group"
                            >
                              <button
                                type="button"
                                className="tagged-exam-header"
                                aria-expanded={examOpen}
                                onClick={() => toggleExam(examGroup.examKey)}
                              >
                                <span className="tagged-group-title">
                                  <Icon name="fileText" size={14} />
                                  <span className="tagged-group-name">
                                    {examLabel}
                                  </span>
                                  {examGroup.folderName && (
                                    <span className="tagged-exam-folder">
                                      <Icon name="folder" size={12} />
                                      {examGroup.folderName}
                                    </span>
                                  )}
                                </span>
                                <span className="tagged-group-meta">
                                  <span className="tagged-group-count num">
                                    {examGroup.questionCount}
                                  </span>
                                  <span
                                    className={`tagged-expand-icon${examOpen ? " open" : ""}`}
                                    aria-hidden="true"
                                  >
                                    <Icon name="chevronDown" size={14} />
                                  </span>
                                </span>
                              </button>

                              <AnimatePresence initial={false}>
                                {examOpen && (
                                  <motion.div
                                    key="exam-body"
                                    className="tagged-group-body-wrap"
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{
                                      duration: 0.2,
                                      ease: [0.16, 1, 0.3, 1],
                                    }}
                                  >
                                    <div className="tagged-question-list">
                                      {examGroup.questions.map((entry) => (
                                        <div
                                          key={`${entry.examId}-${entry.questionNumber}`}
                                          className="tagged-question-row"
                                        >
                                          <Link
                                            to={`/exam/${entry.examId}?question=${entry.questionNumber}`}
                                            className="tagged-question-main"
                                          >
                                            <span className="tagged-question-number num">
                                              {entry.questionNumber}
                                            </span>
                                          </Link>

                                          <div className="tagged-question-tags">
                                            {entry.tags.map((tag) => (
                                              <span
                                                key={tag.id}
                                                className="tag-chip"
                                              >
                                                <span
                                                  className="filter-dot"
                                                  style={{
                                                    backgroundColor:
                                                      tag.color || "#4A90E2",
                                                  }}
                                                />
                                                {tagLabel(tag, t)}
                                              </span>
                                            ))}
                                          </div>

                                          <button
                                            type="button"
                                            className="secondary-button btn-icon-only btn-sm"
                                            aria-label={t("tags.assign")}
                                            title={t("tags.assign")}
                                            onClick={() => openAssign(entry)}
                                          >
                                            <Icon name="pen" size={14} />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={showTagModal}
        onClose={handleCloseModal}
        title={editingTag ? t("tags.editTitle") : t("tags.createTitle")}
      >
        <label className="modal-label">{t("tags.name")}</label>
        <input
          className="input-field"
          value={tagName}
          onChange={(e) => setTagName(e.target.value)}
          placeholder={t("tags.namePlaceholder")}
          autoFocus
        />

        <label className="modal-label">{t("tags.color")}</label>
        <div className="color-picker">
          {TAG_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`color-option ${tagColor === color ? "selected" : ""}`}
              style={{ backgroundColor: color }}
              onClick={() => setTagColor(color)}
              aria-label={color}
            />
          ))}
        </div>

        <div className="modal-buttons">
          {editingTag && (
            <button
              type="button"
              className="danger-button"
              onClick={() => {
                handleCloseModal();
                handleDelete(editingTag);
              }}
            >
              {t("common.delete")}
            </button>
          )}
          <button type="button" className="secondary-button" onClick={handleCloseModal}>
            {t("common.cancel")}
          </button>
          <button type="button" className="primary-button" onClick={handleSave}>
            {editingTag ? t("common.save") : t("common.confirm")}
          </button>
        </div>
      </Modal>

      <QuestionTagPicker
        open={Boolean(assignQuestion)}
        onClose={() => {
          setAssignQuestion(null);
          setQuestionTagIds([]);
        }}
        onConfirm={() => handleAssignSave()}
        onToggle={(tagId) => {
          setQuestionTagIds((prev) =>
            prev.some((id) => String(id) === String(tagId))
              ? prev.filter((id) => String(id) !== String(tagId))
              : [...prev, String(tagId)]
          );
        }}
        tags={tags}
        selectedIds={questionTagIds}
          subtitle={
            assignQuestion
              ? t("tags.assignSubtitle", {
                  exam: assignQuestion.examName,
                  q: assignQuestion.questionNumber,
                })
              : null
          }
        />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title={t("common.delete")}
        message={deleteTarget?.message || ""}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
      />

    </section>
  );
}

export default Tags;
