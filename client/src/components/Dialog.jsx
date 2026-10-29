import { useEffect, useRef } from 'react';
import { Icon } from './Icon.jsx';

/**
 * Modal built on the native <dialog> element, which provides focus trapping,
 * Escape-to-close and an inert background for free.
 */
export function Dialog({ open, onClose, title, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal?.();
    if (!open && el.open) el.close?.();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="dialog-title"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => e.target === ref.current && onClose()}
    >
      {open && (
        <div className="dialog__body">
          <header className="dialog__header">
            <h2 id="dialog-title">{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close dialog">
              <Icon name="x" />
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}
