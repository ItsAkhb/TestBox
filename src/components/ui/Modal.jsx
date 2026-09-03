import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import Icon from "./Icon";

export default function Modal({ open, onClose, title, subtitle, size = "md", children }) {
  const modalRef = useRef(null);
  const previousFocus = useRef(null);

  useEffect(() => {
    if (open) {
      previousFocus.current = document.activeElement;
      setTimeout(() => modalRef.current?.focus(), 50);
    } else if (previousFocus.current) {
      previousFocus.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-overlay"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            ref={modalRef}
            className={`modal modal-${size}`}
            onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
          >
            {(title || onClose) && (
              <div className="modal-header">
                <div>
                  {title && <h2>{title}</h2>}
                  {subtitle && <p>{subtitle}</p>}
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={onClose}
                  aria-label="Close"
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
            )}
            <div className="modal-body">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}