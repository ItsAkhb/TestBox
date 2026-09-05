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
  getTags,
  createTag,
  updateTag,
  deleteTag,
  setExamTag,
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

function examMatchesTag(exam, tagId) {
  return (
    Array.isArray(exam.tagIds) &&
    exam.tagIds.some((id) => String(id) === String(tagId))
  );
}

function buildExamGroups(exams, folders, activeTagId, tags) {
  const visible = activeTagId
    ? exams.filter((exam) => examMatchesTag(exam, activeTagId))
    : exams.filter(
        (exam) => Array.isArray(exam.tagIds) && exam.tagIds.length > 0
      );

  const grouped = visible.map((exam) => {
    const folder = folders.find(
      (item) => String(item.id) === String(exam.folderId)
    );
    const examTags = (exam.tagIds || [])
      .map(
        (id) => tags.find((t) => String(t.id) === String(id))
      )
      .filter(Boolean);

    return {
      examId: exam.id,
      examName: exam.name,
      folderId: exam.folderId,
      folderName: folder?.name || "",
      tagIds: Array.isArray(exam.tagIds) ? [...exam.tagIds] : [],
      examTags,
      createdAt: exam.createdAt,
    };
  });

  return grouped.sort((a, b) => {
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

  const [assignExam, setAssignExam] = useState(null);

  function refresh() {
    setExams(getExams());
    setFolders(getFolders());
    setTags(getTags());
  }

  useEffect(() => {
    // One-time migration of legacy marked questions into a tag.
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

  const groups = useMemo(
    () => buildExamGroups(exams, folders, activeTagId, tags),
    [exams, folders, activeTagId, tags]
  );

  const tagUsageCount = useCallback(
    (tagId) =>
      exams.filter((exam) => examMatchesTag(exam, tagId)).length,
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
        ? t("tags.deleteConfirmWithExams", { count })
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

  function toggleAssign(examId, tagId, assign) {
    const ok = setExamTag(examId, tagId, assign);
    if (!ok) {
      showToast(t("tags.assignFailed"), "error");
      return;
    }
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

      {groups.length === 0 ? (

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

        <div className="marked-groups rise-list">

          {groups.map((group) => (

            <div
              key={group.examId}
              className="marked-group"
            >

              <div className="marked-group-header">

                <div className="marked-group-info">

                  <span className="marked-folder">
                    <Icon name="folder" size={14} />

                    <span>
                      {group.folderName || t("tags.noFolder")}
                    </span>
                  </span>

                  <h3>
                    <Icon name="fileText" size={16} />

                    <span>
                      {group.examName}
                    </span>
                  </h3>

                  <div className="tag-chips">
                    {group.examTags.map((tag) => (
                      <span key={tag.id} className="tag-chip">
                        <span
                          className="filter-dot"
                          style={{ backgroundColor: tag.color || "#4A90E2" }}
                        />
                        {tag.name}
                      </span>
                    ))}
                  </div>

                </div>

                <div className="marked-count">

                  <button
                    type="button"
                    className="secondary-button btn-icon-only btn-sm"
                    aria-label={t("tags.assign")}
                    title={t("tags.assign")}
                    onClick={() => setAssignExam(group)}
                  >
                    <Icon name="pen" size={15} />
                  </button>

                </div>

              </div>

              <div className="marked-question-list">

                <Link
                  to={`/exam/${group.examId}`}
                  className="marked-question"
                  title={t("tags.openExam")}
                >
                  <span className="marked-question-star">
                    <Icon name="star" size={14} fill="currentColor" />
                  </span>

                  <span className="marked-question-number">
                    {t("tags.openExam")}
                  </span>

                  <span className="marked-question-arrow">
                    <Icon name="arrowBack" size={14} />
                  </span>

                </Link>

              </div>

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
              {t("common.delete", "Delete")}
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
        open={Boolean(assignExam)}
        onClose={() => setAssignExam(null)}
        title={t("tags.assignTitle")}
        subtitle={assignExam?.examName}
        size="sm"
      >
        {tags.length === 0 ? (
          <p className="tag-assign-empty">{t("tags.empty.description")}</p>
        ) : (
          <div className="tag-assign-list">
            {tags.map((tag) => {
              const assigned = examMatchesTag(assignExam || {}, tag.id);
              return (
                <label key={tag.id} className="tag-assign-row">
                  <input
                    type="checkbox"
                    checked={assigned}
                    onChange={(e) =>
                      toggleAssign(assignExam.examId, tag.id, e.target.checked)
                    }
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
            onClick={() => setAssignExam(null)}
          >
            {t("common.confirm")}
          </button>
        </div>
      </Modal>

    </section>
  );
}

export default Tags;
