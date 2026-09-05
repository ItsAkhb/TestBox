import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import Icon from "./Icon";

export default function Modal({ open, onClose, title, subtitle, size = "md", children }) {
  const modalRef = useRef(null);
  const previousFocus = useRef(null);
  // Each open cycle gets a fresh key: re-opening while a previous
  // instance's exit animation is still running must not reuse the same
  // AnimatePresence child key, or the exiting element never completes
  // and a pointer-events: auto ghost overlay blocks the whole page.
  // The counter advances only on the closed→open transition — not on
  // every open render (keystrokes would otherwise remount the modal).
  const openCountRef = useRef(0);
  const wasOpenRef = useRef(false);
  if (open && !wasOpenRef.current) {
    openCountRef.current += 1;
  }
  wasOpenRef.current = open;

  useEffect(() => {
    if (open) {
      previousFocus.current = document.activeElement;
      const timer = setTimeout(() => {
        // Focus the first focusable field inside the modal (an input, if
        // present) instead of the container — focusing the container
        // would steal focus from an autoFocus input and swallow the
        // user's first keystrokes.
        const focusable = modalRef.current?.querySelectorAll(
          'input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])'
        );
        const firstField = modalRef.current?.querySelector("input, textarea, select");
        if (firstField && document.activeElement !== firstField) {
          firstField.focus();
        } else if (!firstField) {
          (focusable?.[0] || modalRef.current)?.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
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
          key={`modal-${openCountRef.current}`}
          className="modal-overlay"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            ref={modalRef}
            className={`modal modal-${size}`}
            onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
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