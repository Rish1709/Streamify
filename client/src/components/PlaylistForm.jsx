import { useState } from 'react';
import { Field, Toggle } from './Field.jsx';
import { Spinner } from './States.jsx';

/** Create/edit form shared by the library and playlist pages. */
export function PlaylistForm({
  initial = { name: '', description: '', isPublic: false },
  submitLabel,
  onSubmit,
  onCancel,
}) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!values.name.trim()) {
      setErrors({ name: 'Name is required' });
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await onSubmit({
        ...values,
        name: values.name.trim(),
        description: values.description.trim(),
      });
    } catch (err) {
      setErrors(err.fieldErrors?.() ?? {});
      setFormError(err.message);
      setSaving(false);
    }
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      {formError && (
        <p className="form__error" role="alert">
          {formError}
        </p>
      )}
      <Field
        label="Name"
        value={values.name}
        maxLength={80}
        required
        autoFocus
        error={errors.name}
        onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
      />
      <Field
        label="Description"
        as="textarea"
        rows={3}
        maxLength={300}
        value={values.description}
        error={errors.description}
        hint={`${values.description.length}/300`}
        onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
      />
      <Toggle
        label="Public playlist"
        description="Anyone with the link can view it. Only you can edit."
        checked={values.isPublic}
        onChange={(isPublic) => setValues((v) => ({ ...v, isPublic }))}
      />
      <div className="form__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn--primary" disabled={saving}>
          {saving ? <Spinner size={16} label="Saving" /> : submitLabel}
        </button>
      </div>
    </form>
  );
}
