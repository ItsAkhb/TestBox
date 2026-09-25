import { useRef, useState } from "react";
import Modal from "./Modal";
import Button from "./Button";
import { useTranslation } from "../../i18n";

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
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  // Ref mirrors `pending` so rapid clicks are rejected synchronously,
  // before React flushes a re-render.
  const pendingRef = useRef(false);

  // Reset while rendering on close (React's recommended alternative to
  // a setState-in-effect), so the dialog reopens clean every time.
  // pendingRef is not touched here — it is only true mid-flight inside
  // handleConfirm, which always clears it before settling.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) {
      setPending(false);
      setError("");
    }
  }

  function requestClose() {
    // While an async confirm is in flight the dialog must not close
    // (overlay click, ESC, close button, cancel) — the action may still
    // resolve or fail, and closing would strand it.
    if (pendingRef.current) return;
    setError("");
    onClose();
  }

  async function handleConfirm() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
      await onConfirm();
      pendingRef.current = false;
      setPending(false);
      onClose();
    } catch (err) {
      // Keep the dialog open and surface the failure instead of
      // letting it disappear into the console.
      pendingRef.current = false;
      setPending(false);
      setError(err?.message || t("common.actionFailed"));
    }
  }

  return (
    <Modal open={open} onClose={requestClose} title={title} size="sm">
      <p className="confirm-message">{message}</p>

      {error && (
        <p className="confirm-error" role="alert">
          {error}
        </p>
      )}

      <div className="modal-buttons">
        <Button variant="secondary" onClick={requestClose} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button
          variant={variant}
          onClick={handleConfirm}
          loading={pending}
          disabled={pending}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
