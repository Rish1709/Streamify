import { useId } from 'react';

/** Labelled input with an associated error message (aria-invalid + aria-describedby). */
export function Field({ label, error, hint, as = 'input', className = '', ...props }) {
  const id = useId();
  const describedBy =
    [error && `${id}-err`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined;
  const Control = as;
  return (
    <div className={`field ${error ? 'field--error' : ''} ${className}`}>
      <label htmlFor={id}>{label}</label>
      <Control
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="field__error">
          {error}
        </p>
      )}
    </div>
  );
}

export function Toggle({ label, checked, onChange, description }) {
  const id = useId();
  return (
    <div className="toggle">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={id}>
        <span className="toggle__track" aria-hidden="true">
          <span className="toggle__thumb" />
        </span>
        <span>
          {label}
          {description && <span className="toggle__desc">{description}</span>}
        </span>
      </label>
    </div>
  );
}
