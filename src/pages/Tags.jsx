import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, useLocation } from "react-router-dom";

import {
  getExams,
  getFolders,
  getExamData,
  getTags,
  createTag,
  updateTag,
  deleteTag,
  setQuestionTag,
  migrateMarkedToTags,
} from "../services/dataService";
import { useTranslation } from "../i18n";
import { useToast } from "../context/ToastContext";
import Icon from "../components/ui/Icon";
import Modal from "../components/ui/Modal";
import PageHeader from "../components/ui/PageHeader";
import EmptyArt from "../components/ui/EmptyArt";

const TAG_COLORS = [
  "#2563eb", "#059669", "#d97706", "#dc2626",
  "#7c3aed", "#0891b2", "#db2777", "#65a30d",
];

// Every tagged question of every exam, flattened for the browser list.
function buildTaggedQuestions(exams, folders, activeTagId, tags) {
  const entries = [];

  exams.forEach((exam) => {
    const data = getExamData(exam.id);
    const map = data?.questionTags;
    if (!map || typeof map !== "object") return;

    const folder = folders.find(
      (item) => String(item.id) === String(exam.folderId)
    );

    Object.entries(map).forEach(([qNum, tagIds]) => {
      if (!Array.isArray(tagIds) || tagIds.length === 0) return;
      if (activeTagId && !tagIds.some((id) => String(id) === String(activeTagId))) {
        return;
      }
      const questionTagObjects = tagIds
        .map((id) => tags.find((t) => String(t.id) === String(id)))
        .filter(Boolean);

      entries.push({
        examId: exam.id,
        examName: exam.name,
        folderName: folder?.name || "",
        questionNumber: qNum,
        tags: questionTagObjects,
        createdAt: exam.createdAt,
      });
    });
  });

  return entries.sort((a, b) => {
    const aTime = Date.parse(a.createdAt);
    const bTime = Date.parse(b.createdAt);
    if (Number.isFinite(aTime) && Number.isFinite(bTime)) {
      return bTime - aTime;
    }
    return 0;
  });
}

function Tags() {
  const location = useLocation();
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [exams, setExams] = useState(() => getExams());
  const [folders, setFolders] = useState(() => getFolders());
  const [tags, setTags] = useState(() => getTags());
  const [activeTagId, setActiveTagId] = useState("");

  const [showTagModal, setShowTagModal] = useState(false);
  const [editingTag, setEditingTag] = useState(null);
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState(TAG_COLORS[0]);

  const [assignQuestion, setAssignQuestion] = useState(null);
  const [questionTagIds, setQuestionTagIds] = useState([]);

  useEffect(() => {
    migrateMarkedToTags();
    setExams(getExams());
    setFolders(getFolders());
    setTags(getTags());
  }, []);

  useEffect(() => {
    setExams(getExams());
    setFolders(getFolders());
    setTags(getTags());
  }, [location.pathname, location.key]);

  const refresh = useCallback(() => {
    setExams(getExams());
    setFolders(getFolders());
    setTags(getTags());
  }, []);

  const entries = useMemo(
    () => buildTaggedQuestions(exams, folders, activeTagId, tags),
    // getExamData reads live storage; exams/folders/tags drive recompute
    [exams, folders, activeTagId, tags]
  );

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
  }

  function handleSave() {
    const name = tagName.trim();

    if (!name) {
      showToast(t("tags.nameRequired"), "warning");
      return;
    }

    if (editingTag) {
      const updated = updateTag(editingTag.id, { name, color: tagColor });

      if (!updated) {
        showToast(t("tags.updateFailed"), "error");
        return;
      }

      showToast(t("tags.updateSuccess"), "success");
    } else {
      const created = createTag({
        id: Date.now(),
        name,
        color: tagColor,
      });

      if (!created) {
        showToast(t("tags.createFailed"), "error");
        return;
      }

      showToast(t("tags.createSuccess"), "success");
    }

    refresh();
    handleCloseModal();
  }

  function handleDelete(tag) {
    const count = tagUsageCount(tag.id);
    const message =
      count > 0
        ? t("tags.deleteConfirmWithQuestions", { count })
        : t("tags.deleteConfirm");

    const ok = window.confirm(message);
    if (!ok) return;

    const deleted = deleteTag(tag.id);

    if (!deleted) {
      showToast(t("tags.deleteFailed"), "error");
      return;
    }

    if (String(activeTagId) === String(tag.id)) {
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

  function toggleAssignTag(tagId) {
    setQuestionTagIds((prev) =>
      prev.some((id) => String(id) === String(tagId))
        ? prev.filter((id) => String(id) !== String(tagId))
        : [...prev, String(tagId)]
    );
  }

  function handleAssignSave() {
    if (!assignQuestion) return;

    const examId = assignQuestion.examId;
    const questionNumber = assignQuestion.questionNumber;

    // Compute the diff between the saved list and the edited list.
    const savedIds = assignQuestion.tags.map((tag) => String(tag.id));
    const tagsNow = getTags();

    let failed = false;
    tagsNow.forEach((tag) => {
      const idStr = String(tag.id);
      const wasAssigned = savedIds.includes(idStr);
      const nowAssigned = questionTagIds.includes(idStr);
      if (wasAssigned !== nowAssigned) {
        const ok = setQuestionTag(examId, questionNumber, tag.id, nowAssigned);
        if (!ok) failed = true;
      }
    });

    if (failed) {
      showToast(t("tags.assignFailed"), "error");
    }

    setAssignQuestion(null);
    setQuestionTagIds([]);
    refresh();
  }

  return (
    <section className="page-section marked-page">

      <PageHeader
        icon="star"
        iconFilled
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
                {tag.name}
              </button>
              <button
                type="button"
                className="tag-chip-edit"
                aria-label={t("tags.editTag", { name: tag.name })}
                title={t("tags.editTag", { name: tag.name })}
                onClick={() => handleOpenEdit(tag)}
              >
                <Icon name="pen" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {entries.length === 0 ? (

        <div className="empty-state marked-empty-state">

          <EmptyArt variant="star" />

          <h3>
            {t("tags.empty.title")}
          </h3>

          <p>
            {t("tags.empty.description")}
          </p>

        </div>

      ) : (

        <div className="tagged-question-list rise-list">

          {entries.map((entry) => (

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

                <span className="tagged-question-exam">
                  <Icon name="fileText" size={14} />
                  {entry.examName}
                </span>

                {entry.folderName && (
                  <span className="tagged-question-folder">
                    <Icon name="folder" size={13} />
                    {entry.folderName}
                  </span>
                )}
              </Link>

              <div className="tagged-question-tags">
                {entry.tags.map((tag) => (
                  <span key={tag.id} className="tag-chip">
                    <span
                      className="filter-dot"
                      style={{ backgroundColor: tag.color || "#4A90E2" }}
                    />
                    {tag.name}
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

      <Modal
        open={Boolean(assignQuestion)}
        onClose={() => {
          setAssignQuestion(null);
          setQuestionTagIds([]);
        }}
        title={t("tags.assignTitle")}
        subtitle={
          assignQuestion
            ? t("tags.assignSubtitle", {
                exam: assignQuestion.examName,
                q: assignQuestion.questionNumber,
              })
            : null
        }
        size="sm"
      >
        {tags.length === 0 ? (
          <p className="tag-assign-empty">{t("tags.empty.description")}</p>
        ) : (
          <div className="tag-assign-list">
            {tags.map((tag) => {
              const assigned = questionTagIds.includes(String(tag.id));
              return (
                <label key={tag.id} className="tag-assign-row">
                  <input
                    type="checkbox"
                    checked={assigned}
                    onChange={() => toggleAssignTag(tag.id)}
                  />
                  <span
                    className="filter-dot"
                    style={{ backgroundColor: tag.color || "#4A90E2" }}
                  />
                  <span>{tag.name}</span>
                </label>
              );
            })}
          </div>
        )}

        <div className="modal-buttons">
          <button
            type="button"
            className="primary-button"
            onClick={handleAssignSave}
          >
            {t("common.confirm")}
          </button>
        </div>
      </Modal>

    </section>
  );
}

export default Tags;
