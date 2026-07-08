import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getForm, submitForm } from '../../apiClient';
import { mergeTheme } from './formConfig';
import FormFill from './FormFill';

/**
 * Internal fill page — a logged-in member opens /forms/:id and submits.
 * Renders inside the authenticated app shell.
 */
export default function FormFillPage() {
  const { id } = useParams();
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await getForm(id).catch(() => ({ error: 'Failed' }));
      if (res?.id) setForm({ ...res, theme: mergeTheme(res.theme) });
      else setError(res?.error || 'This form is not available.');
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div style={{ padding: 40, color: 'var(--text-muted,#9ca3af)' }}>Loading…</div>;
  if (error) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted,#9ca3af)' }}>{error}</div>;

  return <FormFill form={form} submitFn={(answers) => submitForm(id, { answers })} />;
}
