import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Reorder } from "framer-motion";

import {
  getFolders,
  getExams,
  getExamData,
  createFolder,
  updateFolder,
  deleteFolder,
  getSubjects,
  getFolderSubjectIds,
  getSettings,
  saveSettings,
generateId,} from "../services/dataService";
import {
  sortItems,
  buildCustomOrder,
  mergeVisibleOrder,
  moveItem,
  SORT_MODES,
  DEFAULT_SORT_MODE,
} from "../services/sortOrder";
import { useTranslation } from "../i18n";
import { useToast } from "../context/ToastContext";
import Icon from "../components/ui/Icon";
import Modal from "../components/ui/Modal";
import PageHeader from "../components/ui/PageHeader";
import EmptyState from "../components/ui/EmptyState";
import ConfirmDialog from "../components/ui/ConfirmDialog";

// Sort/view preferences live in the existing per-user settings blob
// (synced as a whole JSON document) — no second persistence mechanism.
function readSortPref() {
  try {
    const value = getSettings()?.folderSort;
    return SORT_MODES.includes(value) ? value : DEFAULT_SORT_MODE;
  } catch {
    return DEFAULT_SORT_MODE;
  }
}

function readViewPref() {
  // v2.2.0: LIST is the default for users with no saved preference;
  // an explicitly saved "card" keeps winning (promt §1).
  try {
    return getSettings()?.folderView === "card" ? "card" : "list";
  } catch {
    return "list";
  }
}

function readOrderPref() {
  try {
    const value = getSettings()?.folderOrder;
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function Folders() {
  const { t, language } = useTranslation();
  const { showToast } = useToast();
  const locale = language === "en" ? "en" : "fa";

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

  const [selectedSubjectIds, setSelectedSubjectIds] =
    useState([]);

  const [filterSubject, setFilterSubject] =
    useState("all");

  const [folderSort, setFolderSort] = useState(readSortPref);
  const [folderView, setFolderView] = useState(readViewPref);
  const [folderOrder, setFolderOrder] = useState(readOrderPref);

  // v2.2.0 §2: manual order is locked until the user starts an explicit
  // edit session. Reorders stay in memory until Save; Cancel restores
  // the snapshot and navigating away simply discards (state-only), so
  // normal browsing can never change the order.
  const [orderEditing, setOrderEditing] = useState(false);
  const [orderSnapshot, setOrderSnapshot] = useState([]);

  const [renamingFolder, setRenamingFolder] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [deletingFolderId, setDeletingFolderId] = useState(null);

  const [editingSubjectsFolder, setEditingSubjectsFolder] = useState(null);
  const [editSubjectIds, setEditSubjectIds] = useState([]);

  function refreshFolders() {
    setFolders(getFolders());
    setSubjects(getSubjects());
  }

  function persistFolderPrefs(patch) {
    try {
      const ok = saveSettings({ ...getSettings(), ...patch });
      if (!ok) showToast(t("folders.sort.saveFailed"), "error");
      return ok;
    } catch {
      showToast(t("folders.sort.saveFailed"), "error");
      return false;
    }
  }

  function handleSortChange(event) {
    const mode = event.target.value;
    if (!SORT_MODES.includes(mode)) return;
    setFolderSort(mode);
    persistFolderPrefs({ folderSort: mode });
  }

  function handleViewChange(view) {
    if (view !== "card" && view !== "list") return;
    setFolderView(view);
    persistFolderPrefs({ folderView: view });
  }

  // Persists a new visible sequence into the global custom order.
  // Hidden (filtered-out) folders keep their slots — reordering can
  // only ever change ordering (promt §4). While an edit session is
  // open the merge only updates in-memory state (promt §2 — Save is
  // what writes it to settings).
  function commitOrder(newVisible) {
    const canonical = buildCustomOrder(folders, folderOrder);
    const merged = mergeVisibleOrder(
      canonical,
      orderedFolders.map((f) => String(f.id)),
      newVisible.map((f) => String(f.id))
    );
    setFolderOrder(merged);
    if (!orderEditing) {
      persistFolderPrefs({ folderOrder: merged });
    }
  }

  function handleStartOrderEdit() {
    setOrderSnapshot(folderOrder);
    setOrderEditing(true);
  }

  function handleSaveOrderEdit() {
    // Rebuild against current folders so ids created/deleted mid-edit
    // are appended/pruned before the order is persisted.
    const canonical = buildCustomOrder(folders, folderOrder);
    setFolderOrder(canonical);
    persistFolderPrefs({ folderOrder: canonical });
    setOrderEditing(false);
  }

  function handleCancelOrderEdit() {
    setFolderOrder(orderSnapshot);
    setOrderEditing(false);
  }

  function handleMoveFolder(folder, delta) {
    const from = orderedFolders.findIndex(
      (f) => String(f.id) === String(folder.id)
    );
    if (from === -1) return;
    const to = from + delta;
    if (to < 0 || to >= orderedFolders.length) return;
    commitOrder(moveItem(orderedFolders, from, to));
  }

  function handleCreateFolder() {
    const name = folderName.trim();

    if (!name) {
      showToast(t("folders.create.noName"), "warning");
      return;
    }

    const ids = selectedSubjectIds.filter((sid) =>
      subjects.some((s) => String(s.id) === sid)
    );

    const newFolder = {
      id: generateId(),
      name,
      subjectIds: ids,
      subjectId: ids.length > 0 ? ids[0] : null,
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
    setSelectedSubjectIds([]);
    setShowModal(false);
  }

  function toggleCreateSubject(subjectId) {
    setSelectedSubjectIds((prev) =>
      prev.includes(subjectId)
        ? prev.filter((sid) => sid !== subjectId)
        : [...prev, subjectId]
    );
  }

  function handleOpenSubjects(folder) {
    setEditingSubjectsFolder(folder);
    setEditSubjectIds(getFolderSubjectIds(folder).map(String));
  }

  function toggleEditSubject(subjectId) {
    setEditSubjectIds((prev) =>
      prev.includes(subjectId)
        ? prev.filter((sid) => sid !== subjectId)
        : [...prev, subjectId]
    );
  }

  function handleSubjectsSubmit() {
    if (!editingSubjectsFolder) return;

    const ids = editSubjectIds.filter((sid) =>
      subjects.some((s) => String(s.id) === sid)
    );

    const updated = updateFolder(editingSubjectsFolder.id, {
      subjectIds: ids,
      subjectId: ids.length > 0 ? ids[0] : null,
    });

    setEditingSubjectsFolder(null);
    setEditSubjectIds([]);

    if (!updated) {
      showToast(t("folders.subject.assignFailed"), "error");
      return;
    }

    refreshFolders();
  }

  function handleDeleteFolder(id) {
    setDeletingFolderId(id);
  }

  function confirmDeleteFolder() {
    const id = deletingFolderId;
    setDeletingFolderId(null);
    if (!id) return;

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

  const subjectById = {};
  subjects.forEach((s) => {
    subjectById[String(s.id)] = s;
  });

  const visibleFolders =
    filterSubject === "all"
      ? folders
      : filterSubject === "none"
        ? folders.filter((f) => getFolderSubjectIds(f).length === 0)
        : folders.filter((f) =>
            getFolderSubjectIds(f).some(
              (sid) => String(sid) === String(filterSubject)
            )
          );

  // Sorting applies after filtering; both views render this same list so
  // Card/List can never disagree (promt §14).
  const orderedFolders = sortItems(
    visibleFolders,
    folderSort,
    folderOrder,
    locale
  );

  // Answered/total + exam count per folder across its exams → card
  // progress hairlines and list-view metadata
  const folderProgress = useMemo(() => {
    const map = {};
    for (const f of folders)
      map[String(f.id)] = { answered: 0, total: 0, count: 0 };
    let exams;
    try {
      exams = getExams() || [];
    } catch {
      exams = [];
    }
    for (const exam of exams) {
      const fid = String(exam.folderId);
      if (!map[fid]) map[fid] = { answered: 0, total: 0, count: 0 };
      map[fid].count += 1;
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

  function folderPercent(folderId) {
    const prog = folderProgress[String(folderId)] || {
      answered: 0,
      total: 0,
      count: 0,
    };
    return prog.total > 0
      ? Math.min(Math.round((prog.answered / prog.total) * 100), 100)
      : 0;
  }

  // Compact subject chips shared by card footer and list rows; caps at 3
  // + an overflow counter so many subjects never inflate the card (§10).
  function subjectChips(folder, max = 3) {
    const ids = getFolderSubjectIds(folder);
    if (ids.length === 0) return null;
    const shown = ids
      .slice(0, max)
      .map((sid) => subjectById[String(sid)])
      .filter(Boolean);
    return (
      <>
        {shown.map((subject) => (
          <span key={subject.id} className="subject-chip">
            <span
              className="filter-dot"
              style={{
                backgroundColor: subject.color || "#4A90E2",
              }}
              aria-hidden="true"
            />
            {subject.name}
          </span>
        ))}
        {ids.length > max && (
          <span className="subject-chip is-more">
            +{ids.length - max}
          </span>
        )}
      </>
    );
  }

  function actionButtons(folder, index) {
    return (
      <>
        {folderSort === "custom" && orderEditing && (
          <>
            <button
              type="button"
              onClick={() => handleMoveFolder(folder, -1)}
              disabled={index === 0}
              aria-label={t("folders.order.up")}
              title={t("folders.order.up")}
            >
              <Icon name="arrowUp" size={16} />
            </button>

            <button
              type="button"
              onClick={() => handleMoveFolder(folder, 1)}
              disabled={index === orderedFolders.length - 1}
              aria-label={t("folders.order.down")}
              title={t("folders.order.down")}
            >
              <Icon name="arrowDown" size={16} />
            </button>
          </>
        )}

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
      </>
    );
  }

  function cardInner(folder, index) {
    const pct = folderPercent(folder.id);
    const folderSubjectIds = getFolderSubjectIds(folder);
    const subjectColor =
      subjectById[String(folderSubjectIds[0])]?.color || null;

    return (
      <>
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
          {actionButtons(folder, index)}
        </div>

        {subjects.length > 0 && (
          <div className="folder-subject-row">
            <button
              type="button"
              className="folder-subjects-button"
              onClick={() => handleOpenSubjects(folder)}
              aria-label={t("folders.subjects.edit")}
              title={t("folders.subjects.edit")}
            >
              {folderSubjectIds.length === 0 ? (
                <span className="subject-chip is-empty">
                  {t("folders.subject.none")}
                </span>
              ) : (
                subjectChips(folder, 3)
              )}
            </button>
          </div>
        )}

        {pct > 0 && (
          <span className="folder-progress" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </span>
        )}
      </>
    );
  }

  function rowInner(folder, index) {
    const prog = folderProgress[String(folder.id)] || {
      answered: 0,
      total: 0,
      count: 0,
    };
    const pct = folderPercent(folder.id);
    const folderSubjectIds = getFolderSubjectIds(folder);

    return (
      <>
        <Link
          to={`/folder/${folder.id}`}
          className="folder-list-main"
        >
          <span className="folder-list-name" title={folder.name}>
            {folder.name}
          </span>

          <span className="folder-list-meta">
            <span>
              {prog.count} {t("folder.examsCount")}
            </span>
            {prog.total > 0 && (
              <>
                <span className="meta-dot">•</span>
                <span>{pct}%</span>
              </>
            )}
          </span>
        </Link>

        {subjects.length > 0 && (
          <button
            type="button"
            className="folder-list-subjects folder-subjects-button"
            onClick={() => handleOpenSubjects(folder)}
            aria-label={t("folders.subjects.edit")}
            title={t("folders.subjects.edit")}
          >
            {folderSubjectIds.length === 0 ? (
              <span className="subject-chip is-empty">
                {t("folders.subject.none")}
              </span>
            ) : (
              subjectChips(folder, 3)
            )}
          </button>
        )}

        <div className="folder-list-actions">
          {actionButtons(folder, index)}
        </div>
      </>
    );
  }

  const hasFolders = folders.length > 0;

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

      {hasFolders && (
        <div className="folders-toolbar">
          <label className="folders-sort">
            <span className="folders-sort-label">
              {t("folders.sort.label")}
            </span>
            <select
              className="folders-sort-select"
              value={folderSort}
              onChange={handleSortChange}
              disabled={orderEditing}
              aria-label={t("folders.sort.label")}
            >
              {SORT_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {t(`folders.sort.${mode}`)}
                </option>
              ))}
            </select>
          </label>

          {folderSort === "custom" && (
            <div className="folders-order-actions">
              {orderEditing ? (
                <>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={handleSaveOrderEdit}
                  >
                    {t("folders.order.save")}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleCancelOrderEdit}
                  >
                    {t("common.cancel")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleStartOrderEdit}
                >
                  {t("folders.order.edit")}
                </button>
              )}
            </div>
          )}

          <div
            className="view-toggle"
            role="group"
            aria-label={t("folders.view.label")}
          >
            <button
              type="button"
              className={folderView === "card" ? "active" : ""}
              aria-pressed={folderView === "card"}
              aria-label={t("folders.view.cards")}
              title={t("folders.view.cards")}
              disabled={orderEditing}
              onClick={() => handleViewChange("card")}
            >
              <Icon name="grid" size={16} />
            </button>
            <button
              type="button"
              className={folderView === "list" ? "active" : ""}
              aria-pressed={folderView === "list"}
              aria-label={t("folders.view.list")}
              title={t("folders.view.list")}
              disabled={orderEditing}
              onClick={() => handleViewChange("list")}
            >
              <Icon name="list" size={16} />
            </button>
          </div>
        </div>
      )}

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

      {orderedFolders.length === 0 ? (
        folders.length === 0 ? (
          <EmptyState
            icon={<Icon name="folder" size={26} />}
            title={t("folders.empty.title")}
            description={t("folders.empty.description")}
            action={{
              label: t("folders.new"),
              onClick: () => setShowModal(true),
            }}
          />
        ) : (
          <div className="empty-state">
            <div className="empty-icon">
              <Icon name="folder" size={26} />
            </div>
            <h3>{t("folders.empty.filtered")}</h3>
            <p>{t("folders.empty.description")}</p>
          </div>
        )
      ) : folderView === "list" ? (
        folderSort === "custom" && orderEditing ? (
          <Reorder.Group
            as="div"
            axis="y"
            className="folder-list rise-list"
            values={orderedFolders}
            onReorder={commitOrder}
          >
            {orderedFolders.map((folder, index) => (
              <Reorder.Item
                as="div"
                key={folder.id}
                value={folder}
                className="folder-list-row is-reorderable"
              >
                {rowInner(folder, index)}
              </Reorder.Item>
            ))}
          </Reorder.Group>
        ) : (
          <div className="folder-list rise-list">
            {orderedFolders.map((folder, index) => (
              <div key={folder.id} className="folder-list-row">
                {rowInner(folder, index)}
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="folder-grid rise-list">
          {orderedFolders.map((folder, index) => (
            <div
              key={folder.id}
              className="folder-card"
            >
              {cardInner(folder, index)}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(editingSubjectsFolder)}
        onClose={() => {
          setEditingSubjectsFolder(null);
          setEditSubjectIds([]);
        }}
        title={t("folders.subjects.title")}
      >
        <label className="modal-label">
          {editingSubjectsFolder?.name}
        </label>

        <div
          className="subject-select-chips"
          role="group"
          aria-label={t("folders.subjects.title")}
        >
          {subjects.map((subject) => {
            const selected = editSubjectIds.includes(String(subject.id));
            return (
              <button
                key={subject.id}
                type="button"
                className={`filter-chip ${selected ? "active" : ""}`}
                aria-pressed={selected}
                onClick={() => toggleEditSubject(String(subject.id))}
              >
                <span
                  className="filter-dot"
                  style={{ backgroundColor: subject.color || "#4A90E2" }}
                  aria-hidden="true"
                />
                {subject.name}
              </button>
            );
          })}
        </div>

        <div className="modal-buttons">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setEditingSubjectsFolder(null);
              setEditSubjectIds([]);
            }}
          >
            {t("folders.create.cancel")}
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={handleSubjectsSubmit}
          >
            {t("common.save")}
          </button>
        </div>
      </Modal>

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
          dir="auto"
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
          dir="auto"
        />

        {subjects.length > 0 && (
          <>
            <label className="modal-label">
              {t("folders.subject.label")}
            </label>

            <div
              className="subject-select-chips"
              role="group"
              aria-label={t("folders.subject.label")}
            >
              {subjects.map((subject) => {
                const selected = selectedSubjectIds.includes(
                  String(subject.id)
                );
                return (
                  <button
                    key={subject.id}
                    type="button"
                    className={`filter-chip ${selected ? "active" : ""}`}
                    aria-pressed={selected}
                    onClick={() => toggleCreateSubject(String(subject.id))}
                  >
                    <span
                      className="filter-dot"
                      style={{ backgroundColor: subject.color || "#4A90E2" }}
                      aria-hidden="true"
                    />
                    {subject.name}
                  </button>
                );
              })}
            </div>
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

      <ConfirmDialog
        open={Boolean(deletingFolderId)}
        onClose={() => setDeletingFolderId(null)}
        onConfirm={confirmDeleteFolder}
        title={t("common.delete")}
        message={t("folders.delete.confirm")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
      />
    </section>
  );
}

export default Folders;
