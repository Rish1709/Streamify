import { useEffect, useId, useRef, useState } from 'react';

/**
 * Accessible popup menu (WAI-ARIA menu button pattern): Enter/Space/ArrowDown opens,
 * arrow keys move between items, Escape closes and returns focus to the button.
 * `items`: [{ label, onSelect, disabled? }] or { divider: true } / { heading }.
 */
export function Menu({
  buttonLabel,
  buttonContent,
  buttonClassName = 'icon-btn',
  items,
  align = 'right',
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuId = useId();

  const itemEls = () => [
    ...(rootRef.current?.querySelectorAll('[role="menuitem"]:not([disabled])') ?? []),
  ];

  useEffect(() => {
    if (!open) return;
    itemEls()[0]?.focus();
    const onDocClick = (e) => !rootRef.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const onMenuKey = (e) => {
    const els = itemEls();
    const i = els.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      els[(i + 1) % els.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      els[(i - 1 + els.length) % els.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      els[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      els.at(-1)?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  return (
    <div className="menu" ref={rootRef}>
      <button
        ref={buttonRef}
        className={buttonClassName}
        aria-label={buttonLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {buttonContent}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className={`menu__list menu__list--${align}`}
          onKeyDown={onMenuKey}
        >
          {items.map((item, i) =>
            item.divider ? (
              <div key={i} role="separator" className="menu__divider" />
            ) : item.heading ? (
              <div key={i} className="menu__heading" role="presentation">
                {item.heading}
              </div>
            ) : (
              <button
                key={i}
                role="menuitem"
                tabIndex={-1}
                className="menu__item"
                disabled={item.disabled}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
