import Modal from "../ui/Modal";
import { useTranslation } from "../../i18n";
import { tagLabel } from "../../services/tagLabel";

/**
 * Shared multi-select tag picker for one question.
 * Reuses the Tags-page assign interaction (.tag-assign-* styles) so Exam
 * and Tags stay one compatible picker — not a second design.
 *
 * Controlled: parent owns selectedIds + onToggle + onConfirm.
 */
export default function QuestionTagPicker({
  open,
  onClose,
  onConfirm,
  onToggle,
  tags = [],
  selectedIds = [],
  subtitle = null,
}) {
  const { t } = useTranslation();
  const selected = (selectedIds || []).map(String);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("tags.assignTitle")}
      subtitle={subtitle}
      size="sm"
    >
      {tags.length === 0 ? (
        <p className="tag-assign-empty">{t("tags.empty.description")}</p>
      ) : (
        <div className="tag-assign-list">
          {tags.map((tag) => {
            const id = String(tag.id);
            const assigned = selected.includes(id);
            return (
              <label key={tag.id} className="tag-assign-row">
                <input
                  type="checkbox"
                  checked={assigned}
                  onChange={() => onToggle?.(id)}
                />
                <span
                  className="filter-dot"
                  style={{ backgroundColor: tag.color || "#4A90E2" }}
                />
                <span>{tagLabel(tag, t)}</span>
              </label>
            );
          })}
        </div>
      )}

      <div className="modal-buttons">
        <button type="button" className="secondary-button" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={() => onConfirm?.(selected)}
        >
          {t("common.confirm")}
        </button>
      </div>
    </Modal>
  );
}
