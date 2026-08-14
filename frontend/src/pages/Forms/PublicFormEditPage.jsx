import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicFormResponse, updatePublicFormResponse } from '../../apiClient';
import { mergeTheme } from './formConfig';
import FormFill from './FormFill';

/**
 * Reopening one response from the private link in its receipt email.
 *
 * The link only exists when the form's admin allowed editing, and it stops
 * working as soon as the form stops accepting responses, so nobody can rewrite
 * an answer after the reading has started. The token identifies exactly one
 * response, so this page can never show anybody else's.
 */
export default function PublicFormEditPage() {
  const { token, editToken } = useParams();
  const [form, setForm] = useState(null);
  const [answers, setAnswers] = useState(null);
  const [state, setState] = useState('loading');   // loading | ready | gone
  const [message, setMessage] = useState('');

  useEffect(() => { document.title = 'Edit your response · Forms'; }, []);

  useEffect(() => {
    (async () => {
      const res = await getPublicFormResponse(token, editToken).catch(() => ({ error: 'Failed' }));
      if (res?.form?.id) {
        setForm({ ...res.form, theme: mergeTheme(res.form.theme) });
        setAnswers(res.answers || {});
        setState('ready');
      } else {
        setMessage(res?.error || 'This link is not valid.');
        setState('gone');
      }
    })();
  }, [token, editToken]);

  if (state === 'loading') return <Center>Loading your response…</Center>;
  if (state === 'gone') {
    return (
      <Center>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#374151', marginBottom: 6 }}>This link no longer works</div>
        <div>{message}</div>
        <div style={{ marginTop: 8, fontSize: 13.5, color: '#9aa1ab' }}>
          Your original response is safe. Contact whoever sent you the form if you need it changed.
        </div>
      </Center>
    );
  }

  return (
    <FormFill
      form={form}
      initialValues={answers}
      askIdentity={false}
      editing
      submitFn={(vals) => updatePublicFormResponse(token, editToken, { answers: vals })}
    />
  );
}

function Center({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 15, background: '#f4f5f7', padding: 20, textAlign: 'center' }}>
      {children}
    </div>
  );
}
