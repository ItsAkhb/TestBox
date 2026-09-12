import { useState } from "react";

import {
  getSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
  getFolders,
generateId,} from "../services/dataService";
import { useTranslation } from "../i18n";
import { useToast } from "../context/ToastContext";
import Icon from "../components/ui/Icon";
import Modal from "../components/ui/Modal";
import PageHeader from "../components/ui/PageHeader";
import EmptyArt from "../components/ui/EmptyArt";

const COLORS = [
  "#2563eb", "#059669", "#d97706", "#dc2626",
  "#7c3aed", "#0891b2", "#db2777", "#65a30d",
];

function Subjects() {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [subjects, setSubjects] = useState(() => getSubjects());
  const [folders, setFolders] = useState(() => getFolders());

  const [showModal, setShowModal] = useState(false);
  const [editingSubject, setEditingSubject] = useState(null);
  const [subjectName, setSubjectName] = useState("");
  const [subjectColor, setSubjectColor] = useState(COLORS[0]);

  function refresh() {
    setSubjects(getSubjects());
    setFolders(getFolders());
  }

  function getFolderCount(subjectId) {
    return folders.filter(
      (f) => f.subjectId != null && String(f.subjectId) === String(subjectId)
    ).length;
  }

  function handleOpenCreate() {
    setEditingSubject(null);
    setSubjectName("");
    setSubjectColor(COLORS[subjects.length % COLORS.length]);
    setShowModal(true);
  }

  function handleOpenEdit(subject) {
    setEditingSubject(subject);
    setSubjectName(subject.name);
    setSubjectColor(subject.color || COLORS[0]);
    setShowModal(true);
  }

  function handleCloseModal() {
    setShowModal(false);
    setEditingSubject(null);
    setSubjectName("");
  }

  function handleSave() {
    const name = subjectName.trim();

    if (!name) {
      showToast(t("subjects.nameRequired"), "warning");
      return;
    }

    if (editingSubject) {
      const updated = updateSubject(editingSubject.id, { name, color: subjectColor });

      if (!updated) {
        showToast(t("subjects.updateFailed"), "error");
        return;
      }

      showToast(t("subjects.updateSuccess"), "success");
    } else {
      const created = createSubject({
        id: generateId(),
        name,
        color: subjectColor,
      });

      if (!created) {
        showToast(t("subjects.createFailed"), "error");
        return;
      }

      showToast(t("subjects.createSuccess"), "success");
    }

    refresh();
    handleCloseModal();
  }

  function handleDelete(subject) {
    const count = getFolderCount(subject.id);
    const message =
      count > 0
        ? t("subjects.deleteConfirmWithFolders", { count })
        : t("subjects.deleteConfirm");

    const ok = window.confirm(message);
    if (!ok) return;

    const deleted = deleteSubject(subject.id);

    if (!deleted) {
      showToast(t("subjects.deleteFailed"), "error");
      return;
    }

    showToast(t("subjects.deleteSuccess"), "success");
    refresh();
  }

  return (
    <section className="page-section">
      <PageHeader
        icon="book"
        title={t("subjects.title")}
        subtitle={t("subjects.subtitle")}
        actions={
          <button className="primary-button" onClick={handleOpenCreate}>
            <Icon name="plus" size={15} />
            {t("subjects.create")}
          </button>
        }
      />

      {subjects.length === 0 ? (
        <div className="empty-state">
          <EmptyArt variant="sheets" />
          <h3>{t("subjects.empty")}</h3>
          <p>{t("subjects.emptyDescription")}</p>
          <button className="primary-button" onClick={handleOpenCreate}>
            <Icon name="plus" size={15} />
            {t("subjects.create")}
          </button>
        </div>
      ) : (
        <div className="subjects-grid rise-list">
          {subjects.map((subject) => (
            <div key={subject.id} className="subject-card">
              <div
                className="subject-color"
                style={{ backgroundColor: subject.color || COLORS[0] }}
              />
              <div className="subject-info">
                <h3>{subject.name}</h3>
                <p>
                  {getFolderCount(subject.id)} {t("subjects.foldersCount")}
                </p>
              </div>
              <div className="subject-actions">
                <button
                  type="button"
                  onClick={() => handleOpenEdit(subject)}
                  aria-label={t("common.edit")}
                  title={t("common.edit")}
                >
                  <Icon name="pen" size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(subject)}
                  aria-label={t("common.delete")}
                  title={t("common.delete")}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={showModal}
        onClose={handleCloseModal}
        title={editingSubject ? t("subjects.editTitle") : t("subjects.createTitle")}
      >
        <label className="modal-label">{t("subjects.name")}</label>
        <input
          className="input-field"
          value={subjectName}
          onChange={(e) => setSubjectName(e.target.value)}
          placeholder={t("subjects.namePlaceholder")}
          autoFocus
        />

        <label className="modal-label">{t("subjects.color")}</label>
        <div className="color-picker">
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`color-option ${subjectColor === color ? "selected" : ""}`}
              style={{ backgroundColor: color }}
              onClick={() => setSubjectColor(color)}
              aria-label={color}
            />
          ))}
        </div>

        <div className="modal-buttons">
          <button type="button" className="secondary-button" onClick={handleCloseModal}>
            {t("common.cancel")}
          </button>
          <button type="button" className="primary-button" onClick={handleSave}>
            {editingSubject ? t("common.save") : t("common.confirm")}
          </button>
        </div>
      </Modal>
    </section>
  );
}

export default Subjects;
