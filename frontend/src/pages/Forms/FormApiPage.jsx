import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getForm, getFormKeys, createFormKey, revokeFormKey, deleteFormKey, API_URL } from '../../apiClient';
import { useMe } from '../../context/MeContext';
import { KeyRound, Copy, Check, Trash2, Ban, Plus, ArrowLeft, Code2, ShieldAlert, X, Loader2 } from 'lucide-react';

const BASE = (id) => `${API_URL}/api/forms/v1/${id}`;

export default function FormApiPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdvisory } = useMe();
  const [form, setForm] = useState(null);
  const [keys, setKeys] = useState([]);
  const [tab, setTab] = useState('keys');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ label: '', scope: 'submit', allowed_origins: '', expires_at: '', single_use: false });
  const [newSecret, setNewSecret] = useState(null);   // { secret, scope } shown once
  const [pwPrompt, setPwPrompt] = useState(null);      // { key, action: 'revoke'|'delete' }
  const [toast, setToast] = useState('');

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2600); };
  const reload = () => getFormKeys(id).then((k) => setKeys(k?.keys || []));

  useEffect(() => {
    if (!isAdvisory) { setLoading(false); return; }
    Promise.all([getForm(id), getFormKeys(id)])
      .then(([f, k]) => { setForm(f?.error ? null : f); setKeys(k?.keys || []); })
      .finally(() => setLoading(false));
  }, [id, isAdvisory]);

  if (!isAdvisory) {
    return (
      <div style={S.denied}>
        <ShieldAlert size={40} color="#dc2626" />
        <h2 style={{ margin: '14px 0 6px' }}>Advisory only</h2>
        <p style={{ color: 'var(--text-muted)', maxWidth: 380, textAlign: 'center' }}>
          Form API keys can only be managed by Advisory. Ask an Advisory member if you need access.
        </p>
        <button style={S.ghost} onClick={() => navigate('/hr/forms')}><ArrowLeft size={15} /> Back to forms</button>
      </div>
    );
  }

  const create = async () => {
    const origins = draft.allowed_origins.split(',').map((s) => s.trim()).filter(Boolean);
    if (!origins.length) return showToast('Add at least one allowed domain.');
    setCreating(true);
    const res = await createFormKey(id, {
      label: draft.label, scope: draft.scope, allowed_origins: origins,
      expires_at: draft.expires_at || null, single_use: draft.single_use,
    });
    setCreating(false);
    if (res?.secret) {
      setNewSecret({ secret: res.secret, scope: res.scope });
      setDraft({ label: '', scope: 'submit', allowed_origins: '', expires_at: '', single_use: false });
      reload();
    } else showToast(res?.error || 'Could not create key.');
  };

  const confirmPw = async (password) => {
    const { key, action } = pwPrompt;
    const fn = action === 'delete' ? deleteFormKey : revokeFormKey;
    const res = await fn(id, key.id, password);
    if (res?.error) return showToast(res.error);
    setPwPrompt(null);
    showToast(action === 'delete' ? 'Key deleted' : 'Key revoked');
    reload();
  };

  const fields = (form?.schema || []).filter((f) => !['heading', 'section', 'paragraph'].includes(f.type));

  return (
    <div style={S.page}>
      {toast && <div style={S.toast}>{toast}</div>}

      <div style={S.head}>
        <button style={S.iconBtn} onClick={() => navigate('/hr/forms')}><ArrowLeft size={18} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={S.h1}>API access</h1>
          <p style={S.sub}>{form?.title || 'Form'} — let another Tiesverse domain submit &amp; read via an origin-locked key.</p>
        </div>
      </div>

      <div style={S.tabs}>
        <button style={{ ...S.tab, ...(tab === 'keys' ? S.tabOn : {}) }} onClick={() => setTab('keys')}><KeyRound size={15} /> API keys</button>
        <button style={{ ...S.tab, ...(tab === 'docs' ? S.tabOn : {}) }} onClick={() => setTab('docs')}><Code2 size={15} /> Integration</button>
      </div>

      {loading ? <p style={{ color: 'var(--text-muted)' }}><Loader2 className="spin" size={16} /> Loading…</p> : tab === 'keys' ? (
        <>
          {/* create */}
          <div style={S.card}>
            <h3 style={S.cardH}>Issue a new key</h3>
            <div style={S.grid}>
              <Field label="Label (who / which site)"><input style={S.input} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. Campaign landing page" /></Field>
              <Field label="Scope">
                <select style={S.input} value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value })}>
                  <option value="submit">Submit only (POST) — safe in a frontend</option>
                  <option value="read">Read only (GET) — keep on a server</option>
                </select>
              </Field>
              <Field label="Allowed domains (comma-separated)" full>
                <input style={S.input} value={draft.allowed_origins} onChange={(e) => setDraft({ ...draft, allowed_origins: e.target.value })} placeholder="https://campaign.tiesverse.com, https://microsite.example.com" />
              </Field>
              <Field label="Expires (optional)"><input type="date" style={S.input} value={draft.expires_at} onChange={(e) => setDraft({ ...draft, expires_at: e.target.value })} /></Field>
              <Field label="Single use">
                <label style={S.check}><input type="checkbox" checked={draft.single_use} onChange={(e) => setDraft({ ...draft, single_use: e.target.checked })} /> Dies after one submission</label>
              </Field>
            </div>
            <button style={S.primary} disabled={creating} onClick={create}>{creating ? <><Loader2 className="spin" size={15} /> Creating…</> : <><Plus size={15} /> Create key</>}</button>
          </div>

          {/* list */}
          <div style={{ display: 'grid', gap: 12 }}>
            {keys.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No keys yet.</p>}
            {keys.map((k) => (
              <div key={k.id} style={S.keyRow}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 14 }}>{k.label || '(no label)'}</strong>
                    <span style={{ ...S.badge, ...(k.scope === 'read' ? S.badgeRead : S.badgeSubmit) }}>{k.scope}</span>
                    <span style={{ ...S.badge, ...statusStyle(k.status) }}>{k.status}</span>
                    {k.single_use && <span style={{ ...S.badge, background: '#eef', color: '#3730a3' }}>single-use</span>}
                  </div>
                  <div style={S.keyMeta}>
                    <code style={S.code}>{k.key_id}…</code> · {(k.allowed_origins || []).join(', ') || 'no domains'} · {k.submissions_count} submissions
                    {k.expires_at && ` · expires ${k.expires_at.slice(0, 10)}`}
                  </div>
                </div>
                {k.status === 'active' && <button style={S.warn} onClick={() => setPwPrompt({ key: k, action: 'revoke' })}><Ban size={14} /> Revoke</button>}
                <button style={S.del} onClick={() => setPwPrompt({ key: k, action: 'delete' })}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <Docs id={id} fields={fields} showToast={showToast} />
      )}

      {newSecret && <SecretModal secret={newSecret.secret} scope={newSecret.scope} onClose={() => setNewSecret(null)} showToast={showToast} />}
      {pwPrompt && <PasswordModal action={pwPrompt.action} onCancel={() => setPwPrompt(null)} onConfirm={confirmPw} />}

      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function Docs({ id, fields, showToast }) {
  const base = BASE(id);
  const fieldIds = fields.map((f) => `"${f.id}": "…"`).join(', ') || '"<field_id>": "value"';
  const submitCurl = `curl -X POST "${base}/submissions/" \\\n  -H "X-Api-Key: YOUR_SUBMIT_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"answers": {${fieldIds}}}'`;
  const submitJs = `fetch("${base}/submissions/", {\n  method: "POST",\n  headers: { "X-Api-Key": "YOUR_SUBMIT_KEY", "Content-Type": "application/json" },\n  body: JSON.stringify({ answers: { ${fieldIds} } })\n}).then(r => r.json()).then(console.log)`;
  const readCurl = `curl "${base}/submissions/?page=1" -H "X-Api-Key: YOUR_READ_KEY"`;
  const schemaCurl = `curl "${base}/schema/" -H "X-Api-Key: YOUR_SUBMIT_KEY"`;

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={S.card}>
        <h3 style={S.cardH}>Your fields</h3>
        <p style={S.docP}>Send answers keyed by <b>field id</b>:</p>
        <table style={S.table}>
          <thead><tr><th style={S.th}>Field id</th><th style={S.th}>Label</th><th style={S.th}>Type</th><th style={S.th}>Required</th></tr></thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.id}><td style={S.td}><code style={S.code}>{f.id}</code></td><td style={S.td}>{f.label}</td><td style={S.td}>{f.type}</td><td style={S.td}>{f.required ? 'yes' : 'no'}</td></tr>
            ))}
            {!fields.length && <tr><td style={S.td} colSpan={4}>This form has no fields yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <Snippet title="Submit a response (submit key)" code={submitCurl} showToast={showToast} note="Include the X-Api-Key header and post from one of the key's allowed domains." />
      <Snippet title="Submit from JavaScript" code={submitJs} showToast={showToast} />
      <Snippet title="Read responses (read key — keep on a server)" code={readCurl} showToast={showToast} />
      <Snippet title="Fetch the field schema" code={schemaCurl} showToast={showToast} />

      <div style={{ ...S.card, background: 'rgba(254,122,0,.06)', border: '1px solid rgba(254,122,0,.25)' }}>
        <h3 style={S.cardH}>Notes</h3>
        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-main)', fontSize: 13.5, lineHeight: 1.7 }}>
          <li>A key only works from the domains you set on it — copying it elsewhere fails.</li>
          <li>Never put a <b>read</b> key in a browser. Submit keys are safe in a frontend because they're domain-locked and POST-only.</li>
          <li>File fields: send the form as <code style={S.code}>multipart/form-data</code> with <code style={S.code}>answers</code> as a JSON string plus each file as its field id.</li>
        </ul>
      </div>
    </div>
  );
}

function Snippet({ title, code, note, showToast }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); showToast?.('Copied'); };
  return (
    <div style={S.card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ ...S.cardH, margin: 0 }}>{title}</h3>
        <button style={S.copyBtn} onClick={copy}>{copied ? <><Check size={14} color="#10b981" /> Copied</> : <><Copy size={14} /> Copy</>}</button>
      </div>
      {note && <p style={S.docP}>{note}</p>}
      <pre style={S.pre}><code>{code}</code></pre>
    </div>
  );
}

function SecretModal({ secret, scope, onClose, showToast }) {
  const copy = () => { navigator.clipboard?.writeText(secret); showToast('Key copied'); };
  return (
    <Modal onClose={onClose}>
      <h3 style={{ margin: '0 0 6px' }}>Your {scope} key</h3>
      <p style={{ color: '#b45309', fontSize: 13.5, margin: '0 0 14px' }}>Copy it now — it's shown only once and can't be recovered.</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <code style={{ ...S.code, flex: 1, padding: '11px 12px', fontSize: 13, wordBreak: 'break-all' }}>{secret}</code>
        <button style={S.primary} onClick={copy}><Copy size={15} /> Copy</button>
      </div>
      <button style={{ ...S.ghost, marginTop: 16 }} onClick={onClose}>Done</button>
    </Modal>
  );
}

function PasswordModal({ action, onCancel, onConfirm }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); await onConfirm(pw); setBusy(false); };
  return (
    <Modal onClose={onCancel}>
      <h3 style={{ margin: '0 0 6px' }}>Confirm with your password</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: 13.5, margin: '0 0 14px' }}>Enter your account password to {action} this key.</p>
      <input type="password" autoFocus style={S.input} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Your password" onKeyDown={(e) => e.key === 'Enter' && pw && go()} />
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
        <button style={S.ghost} onClick={onCancel}>Cancel</button>
        <button style={{ ...S.primary, ...(action === 'delete' ? { background: '#dc2626' } : {}) }} disabled={!pw || busy} onClick={go}>{busy ? '…' : (action === 'delete' ? 'Delete key' : 'Revoke key')}</button>
      </div>
    </Modal>
  );
}

function Modal({ children, onClose }) {
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <button style={S.modalX} onClick={onClose}><X size={16} /></button>
        {children}
      </div>
    </div>
  );
}

const Field = ({ label, children, full }) => (
  <div style={{ gridColumn: full ? '1 / -1' : 'auto' }}>
    <label style={S.lbl}>{label}</label>{children}
  </div>
);

function statusStyle(s) {
  if (s === 'active') return { background: '#dcfce7', color: '#166534' };
  if (s === 'revoked') return { background: '#fee2e2', color: '#991b1b' };
  return { background: '#f3f4f6', color: '#6b7280' };
}

const S = {
  page: { padding: '26px 30px', maxWidth: 960, margin: '0 auto' },
  denied: { minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 },
  toast: { position: 'fixed', top: 70, right: 24, background: 'var(--primary,#fe7a00)', color: '#fff', padding: '10px 16px', borderRadius: 8, zIndex: 4000, fontSize: 13, fontWeight: 600 },
  head: { display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18 },
  h1: { margin: 0, fontSize: 23, fontWeight: 800, color: 'var(--text-main)' },
  sub: { margin: '3px 0 0', color: 'var(--text-muted)', fontSize: 13.5 },
  iconBtn: { border: '1px solid var(--outline-variant,#e5e7eb)', background: 'var(--surface,#fff)', borderRadius: 10, padding: 8, cursor: 'pointer', color: 'var(--text-main)' },
  tabs: { display: 'flex', gap: 6, borderBottom: '1px solid var(--outline-variant,#e5e7eb)', marginBottom: 20 },
  tab: { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '2px solid transparent' },
  tabOn: { color: 'var(--primary,#fe7a00)', borderBottomColor: 'var(--primary,#fe7a00)' },
  card: { background: 'var(--surface-container-low,#fff)', border: '1px solid var(--outline-variant,#e5e7eb)', borderRadius: 14, padding: 20, marginBottom: 16 },
  cardH: { margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-main)' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 },
  lbl: { display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 },
  input: { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--outline-variant,#e5e7eb)', background: 'var(--surface,#fff)', color: 'var(--text-main)', fontSize: 14, outline: 'none' },
  check: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--text-main)', paddingTop: 9 },
  primary: { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 9, border: 'none', background: 'var(--primary,#fe7a00)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  ghost: { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9, border: '1px solid var(--outline-variant,#e5e7eb)', background: 'transparent', color: 'var(--text-main)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer' },
  keyRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', border: '1px solid var(--outline-variant,#e5e7eb)', borderRadius: 12, background: 'var(--surface,#fff)' },
  keyMeta: { fontSize: 12, color: 'var(--text-muted)', marginTop: 5 },
  badge: { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', padding: '3px 8px', borderRadius: 20 },
  badgeSubmit: { background: '#e0f2fe', color: '#075985' },
  badgeRead: { background: '#fef9c3', color: '#854d0e' },
  warn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' },
  del: { padding: 8, borderRadius: 8, border: '1px solid var(--outline-variant,#e5e7eb)', background: '#fff', color: '#dc2626', cursor: 'pointer' },
  copyBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 8, border: '1px solid var(--outline-variant,#e5e7eb)', background: 'var(--surface,#fff)', color: 'var(--text-main)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' },
  code: { background: 'var(--surface-hover,#f3f4f6)', borderRadius: 5, padding: '2px 6px', fontSize: 12.5, fontFamily: 'ui-monospace, Menlo, monospace', color: 'var(--text-main)' },
  pre: { margin: 0, background: '#0f172a', color: '#e2e8f0', padding: 16, borderRadius: 10, overflowX: 'auto', fontSize: 12.5, lineHeight: 1.6, fontFamily: 'ui-monospace, Menlo, monospace' },
  docP: { color: 'var(--text-muted)', fontSize: 13, margin: '0 0 10px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--outline-variant,#e5e7eb)', color: 'var(--text-muted)', fontWeight: 600, fontSize: 12 },
  td: { padding: '8px 10px', borderBottom: '1px solid var(--outline-variant,#f1f1f1)', color: 'var(--text-main)' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,20,25,.55)', display: 'grid', placeItems: 'center', zIndex: 5000, padding: 20 },
  modal: { position: 'relative', background: 'var(--surface,#fff)', borderRadius: 16, padding: 26, width: '100%', maxWidth: 460, boxShadow: '0 30px 70px rgba(0,0,0,.3)' },
  modalX: { position: 'absolute', top: 12, right: 12, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' },
};
