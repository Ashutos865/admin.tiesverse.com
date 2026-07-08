import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicForm, submitPublicForm } from '../../apiClient';
import { mergeTheme } from './formConfig';
import FormFill from './FormFill';

/**
 * Public fill page — anyone with /f/:token can open and submit (no login).
 * Rendered OUTSIDE the app shell (standalone route).
 */
export default function PublicFormPage() {
  const { token } = useParams();
  const [form, setForm] = useState(null);
  const [state, setState] = useState('loading');   // loading | ready | closed | error

  useEffect(() => {
    (async () => {
      const res = await getPublicForm(token).catch(() => ({ error: 'Failed' }));
      if (res?.closed) setState('closed');
      else if (res?.id) { setForm({ ...res, theme: mergeTheme(res.theme) }); setState('ready'); }
      else setState('error');
    })();
  }, [token]);

  if (state === 'loading') return <Center>Loading…</Center>;
  if (state === 'closed') return <Center>This form is no longer accepting responses.</Center>;
  if (state === 'error') return (
    <Center>
      <div style={{ fontSize: 17, fontWeight: 700, color: '#374151', marginBottom: 6 }}>This form isn’t available</div>
      <div>It may not be published yet, or the link is incorrect.</div>
    </Center>
  );

  return <FormFill form={form} submitFn={(answers, identity) => submitPublicForm(token, { answers, ...identity })} askIdentity />;
}

function Center({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 15, background: '#f4f5f7', padding: 20, textAlign: 'center' }}>
      {children}
    </div>
  );
}
