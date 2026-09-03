import Modal from "./Modal";
import Button from "./Button";

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = "Confirm",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="confirm-message">{message}</p>
      <div className="modal-buttons">
        <Button variant="secondary" onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button variant={variant} onClick={() => { onConfirm(); onClose(); }}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
