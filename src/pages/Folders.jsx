import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  getFolders,
  getExams,
  getExamData,
  createFolder,
  updateFolder,
  deleteFolder,
  getSubjects,
generateId,} from "../services/dataService";
import { useTranslation } from "../i18n";
import { useToast } from "../context/ToastContext";
import Icon from "../components/ui/Icon";
import Modal from "../components/ui/Modal";
import PageHeader from "../components/ui/PageHeader";

function Folders() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [folders, setFolders] = useState(() => {
    return getFolders();
  });

  const [subjects, setSubjects] = useState(() => {
    return getSubjects();
  });

  const [showModal, setShowModal] =
    useState(false);

  const [folderName, setFolderName] =
    useState("");

  const [selectedSubjectId, setSelectedSubjectId] =
    useState("");

  const [filterSubject, setFilterSubject] =
    useState("all");

  const [renamingFolder, setRenamingFolder] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [showRenameModal, setShowRenameModal] = useState(false);

  function refreshFolders() {
    setFolders(getFolders());
    setSubjects(getSubjects());
  }

  function handleCreateFolder() {
    const name = folderName.trim();

    if (!name) {
      showToast(t("folders.create.noName"), "warning");
      return;
    }

    const newFolder = {
      id: generateId(),
      name,
      subjectId: selectedSubjectId ? selectedSubjectId : null,
      createdAt:
        new Date().toISOString(),
    };

    const saved =
      createFolder(newFolder);

    if (!saved) {
      showToast(t("folders.create.failed"), "error");
      return;
    }

    refreshFolders();

    setFolderName("");
    setSelectedSubjectId("");
    setShowModal(false);
  }

  function handleDeleteFolder(id) {
    const ok = window.confirm(
      t("folders.delete.confirm")
    );

    if (!ok) {
      return;
    }

    const deleted =
      deleteFolder(id);

    if (!deleted) {
      showToast(
        t("folders.delete.failed"),
        "error"
      );
      return;
    }

    refreshFolders();
  }

  function handleRenameFolder(folder) {
    // Modal instead of window.prompt: prompt() is not supported in
    // Electron (throws) and blocks IME input on some WebViews — the
    // rename dialog must accept Persian/English text everywhere.
    setRenamingFolder(folder);
    setRenameValue(folder.name);
    setShowRenameModal(true);
  }

  function handleRenameSubmit() {
    const newName = renameValue.trim();

    if (!newName || !renamingFolder) {
      setShowRenameModal(false);
      setRenamingFolder(null);
      return;
    }

    const updated =
      updateFolder(
        renamingFolder.id,
        {
          name: newName,
        }
      );

    setShowRenameModal(false);
    setRenamingFolder(null);

    if (!updated) {
      showToast(
        t("folders.rename.failed"),
        "error"
      );
      return;
    }

    refreshFolders();
  }

  function handleAssignSubject(folder, subjectId) {
    const updated = updateFolder(folder.id, {
      subjectId: subjectId || null,
    });

    if (!updated) {
      showToast(t("folders.subject.assignFailed"), "error");
      return;
    }

    refreshFolders();
  }

  const subjectById = {};
  subjects.forEach((s) => {
    subjectById[String(s.id)] = s;
  });

  const visibleFolders =
    filterSubject === "all"
      ? folders
      : filterSubject === "none"
        ? folders.filter((f) => f.subjectId == null)
        : folders.filter(
            (f) =>
              f.subjectId != null &&
              String(f.subjectId) === String(filterSubject)
          );

  // Answered/total per folder across its exams → card progress hairlines
  const folderProgress = useMemo(() => {
    const map = {};
    for (const f of folders) map[String(f.id)] = { answered: 0, total: 0 };
    let exams;
    try {
      exams = getExams() || [];
    } catch {
      exams = [];
    }
    for (const exam of exams) {
      const fid = String(exam.folderId);
      if (!map[fid]) map[fid] = { answered: 0, total: 0 };
      map[fid].total += Number(exam.questionCount) || 0;
      try {
        const ed = getExamData(exam.id);
        if (ed?.answers) map[fid].answered += Object.keys(ed.answers).length;
      } catch {
        // ignore unreadable records
      }
    }
    return map;
  }, [folders]);

  return (
    <section className="page-section">

      <PageHeader
        icon="folder"
        title={t("folders.title")}
        subtitle={t("folders.subtitle")}
        actions={
          <button
            className="primary-button"
            onClick={() =>
              setShowModal(true)
            }
          >
            <Icon name="plus" size={15} />
            {t("folders.new")}
          </button>
        }
      />

      {subjects.length > 0 && (
        <div className="folders-subject-filter">

          <button
            type="button"
            className={`filter-chip ${filterSubject === "all" ? "active" : ""}`}
            onClick={() => setFilterSubject("all")}
          >
            {t("folders.filter.all")}
          </button>

          {subjects.map((subject) => (
            <button
              key={subject.id}
              type="button"
              className={`filter-chip ${filterSubject === String(subject.id) ? "active" : ""}`}
              onClick={() => setFilterSubject(String(subject.id))}
            >
              <span
                className="filter-dot"
                style={{ backgroundColor: subject.color || "#4A90E2" }}
              />
              {subject.name}
            </button>
          ))}

          <button
            type="button"
            className={`filter-chip ${filterSubject === "none" ? "active" : ""}`}
            onClick={() => setFilterSubject("none")}
          >
            {t("folders.filter.none")}
          </button>

        </div>
      )}

      {visibleFolders.length === 0 ? (

        <div className="empty-state">

          <div className="empty-icon">
            <Icon name="folder" size={26} />
          </div>

          <h3>
            {folders.length === 0
              ? t("folders.empty.title")
              : t("folders.empty.filtered")}
          </h3>

          <p>
            {t("folders.empty.description")}
          </p>

        </div>

      ) : (

        <div className="folder-grid rise-list">

          {visibleFolders.map((folder) => {

            const folderSubject =
              folder.subjectId != null
                ? subjectById[String(folder.subjectId)]
                : null;

            const prog = folderProgress[String(folder.id)] || { answered: 0, total: 0 };
            const pct = prog.total > 0 ? Math.min(Math.round((prog.answered / prog.total) * 100), 100) : 0;
            const subjectColor = folderSubject?.color || null;

            return (

              <div
                key={folder.id}
                className="folder-card"
              >

                <Link
                  to={`/folder/${folder.id}`}
                  className="folder-main"
                >

                  <div
                    className={`folder-icon ${subjectColor ? "is-tinted" : ""}`}
                    style={subjectColor ? {
                      background: `color-mix(in srgb, ${subjectColor} 13%, transparent)`,
                      color: subjectColor,
                      boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${subjectColor} 32%, transparent)`,
                    } : undefined}
                  >
                    <Icon name="folder" size={22} />
                  </div>

                  <div className="folder-info">

                    <h3 title={folder.name}>
                      {folder.name}
                    </h3>

                  </div>

                </Link>

                <div className="folder-actions">

                  <button
                    type="button"
                    onClick={() =>
                      handleRenameFolder(
                        folder
                      )
                    }
                    aria-label={t("common.edit")}
                  >
                    <Icon name="pen" size={16} />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleDeleteFolder(
                        folder.id
                      )
                    }
                    aria-label={t("common.delete")}
                  >
                    <Icon name="trash" size={16} />
                  </button>

                </div>

                {subjects.length > 0 && (
                  <div className="folder-subject-row">
                    <span
                      className="filter-dot"
                      style={{ backgroundColor: folderSubject?.color || "var(--border-hover)" }}
                      aria-hidden="true"
                    />
                    <select
                      className="folder-subject-select"
                      value={
                        folder.subjectId != null
                          ? String(folder.subjectId)
                          : ""
                      }
                      onChange={(event) =>
                        handleAssignSubject(folder, event.target.value)
                      }
                      aria-label={t("folders.subject.assign")}
                      title={folderSubject?.name || t("folders.subject.assign")}
                    >
                      <option value="">
                        {t("folders.subject.none")}
                      </option>
                      {subjects.map((subject) => (
                        <option key={subject.id} value={String(subject.id)}>
                          {subject.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {pct > 0 && (
                  <span className="folder-progress" aria-hidden="true">
                    <span style={{ width: `${pct}%` }} />
                  </span>
                )}

              </div>

            );
          })}

        </div>

      )}

      <Modal
        open={showRenameModal}
        onClose={() => {
          setShowRenameModal(false);
          setRenamingFolder(null);
        }}
        title={t("folders.rename.title")}
      >
        <label className="modal-label">
          {t("folders.create.nameLabel")}
        </label>

        <input
          className="input-field"
          value={renameValue}
          onChange={(event) => setRenameValue(event.target.value)}
          placeholder={t("folders.create.namePlaceholder")}
          autoFocus
        />

        <div className="modal-buttons">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setShowRenameModal(false);
              setRenamingFolder(null);
            }}
          >
            {t("folders.create.cancel")}
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={handleRenameSubmit}
          >
            {t("common.save")}
          </button>
        </div>
      </Modal>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={t("folders.create.title")}
      >
        <label className="modal-label">
          {t("folders.create.nameLabel")}
        </label>

        <input
          className="input-field"
          value={folderName}
          onChange={(event) =>
            setFolderName(
              event.target.value
            )
          }
          placeholder={t("folders.create.namePlaceholder")}
        />

        {subjects.length > 0 && (
          <>
            <label className="modal-label">
              {t("folders.subject.label")}
            </label>

            <select
              className="modal-select"
              value={selectedSubjectId}
              onChange={(event) =>
                setSelectedSubjectId(event.target.value)
              }
            >
              <option value="">
                {t("folders.subject.none")}
              </option>
              {subjects.map((subject) => (
                <option key={subject.id} value={String(subject.id)}>
                  {subject.name}
                </option>
              ))}
            </select>
          </>
        )}

        <div className="modal-buttons">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setShowModal(false)}
          >
            {t("folders.create.cancel")}
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={handleCreateFolder}
          >
            {t("folders.create.submit")}
          </button>
        </div>
      </Modal>
    </section>
  );
}

export default Folders;
