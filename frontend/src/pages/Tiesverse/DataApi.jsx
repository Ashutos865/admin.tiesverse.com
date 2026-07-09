import { useState, useEffect } from 'react';
import {
  getDataStores, createDataStore, getDataStore, updateDataStore, deleteDataStore,
  getStoreRecords, getDataKeys, createDataKey, revokeDataKey, deleteDataKey, API_URL,
} from '../../apiClient';
import { useMe } from '../../context/MeContext';
import {
  Database, KeyRound, Code2, Table2, Plus, Trash2, Ban, Copy, Check, X, ArrowLeft,
  ShieldAlert, Loader2, Settings2,
} from 'lucide-react';

const COL_TYPES = ['text', 'number', 'boolean', 'email', 'url', 'date', 'datetime', 'file'];
const BASE = (slug) => `${API_URL}/api/data/v1/${slug}`;

export default function DataApi() {
  const { isAdvisory } = useMe();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState('');
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2600); };

  const load = () => getDataStores().then((r) => setStores(r?.stores || [])).finally(() => setLoading(false));
  useEffect(() => { if (isAdvisory) load(); else setLoading(false); }, [isAdvisory]);

  if (!isAdvisory) return <Denied />;
  if (openId) return <StoreDetail id={openId} onBack={() => { setOpenId(null); load(); }} showToast={showToast} toast={toast} />;

  return (
    <div style={S.page}>
      {toast && <div style={S.toast}>{toast}</div>}
      <div style={S.head}>
        <div style={{ flex: 1 }}>
          <h1 style={S.h1}><Database size={22} style={{ verticalAlign: -4, marginRight: 8, color: 'var(--primary)' }} />Data API</h1>
          <p style={S.sub}>Standalone data stores. Give any of your frontends an origin-locked key to write &amp; read straight to our database — no backend of their own.</p>
        </div>
        <button style={S.primary} onClick={() => setCreating(true)}><Plus size={16} /> New store</button>
      </div>

      {loading ? <Spinner /> : stores.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No data stores yet. Create one to get an API key.</p>
      ) : (
        <div style={S.grid}>
          {stores.map((s) => (
            <div key={s.id} style={S.storeCard} onClick={() => setOpenId(s.id)}>
              <strong style={{ fontSize: 15, color: 'var(--text-main)' }}>{s.name}</strong>
              {s.description && <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '4px 0 0' }}>{s.description}</p>}
              <div style={S.storeMeta}><code style={S.code}>{s.slug}</code> · {(s.columns || []).length} cols · {s.records} records · {s.keys} keys</div>
            </div>
          ))}
        </div>
      )}

      {creating && <CreateStore onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); showToast('Store created'); }} showToast={showToast} />}
    </div>
  );
}

/* ── create store ─────────────────────────────────────────── */
function CreateStore({ onClose, onCreated, showToast }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [columns, setColumns] = useState([{ key: '', label: '', type: 'text', required: false }]);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) return showToast('A name is required.');
    setBusy(true);
    const res = await createDataStore({ name, description, columns: columns.filter((c) => c.key.trim()) });
    setBusy(false);
    if (res?.id) onCreated(); else showToast(res?.error || 'Could not create store.');
  };
  return (
    <Modal onClose={onClose} wide>
      <h3 style={{ margin: '0 0 14px' }}>New data store</h3>
      <Field label="Name"><input style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Campaign leads" /></Field>
      <Field label="Description (optional)"><input style={S.input} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this store holds" /></Field>
      <label style={S.lbl}>Columns</label>
      <ColumnsEditor columns={columns} onChange={setColumns} />
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
        <button style={S.ghost} onClick={onClose}>Cancel</button>
        <button style={S.primary} disabled={busy} onClick={save}>{busy ? '…' : 'Create store'}</button>
      </div>
    </Modal>
  );
}

function ColumnsEditor({ columns, onChange }) {
  const set = (i, patch) => onChange(columns.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const add = () => onChange([...columns, { key: '', label: '', type: 'text', required: false }]);
  const del = (i) => onChange(columns.filter((_, j) => j !== i));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {columns.map((c, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px auto auto', gap: 8, alignItems: 'center' }}>
          <input style={S.input} value={c.key} onChange={(e) => set(i, { key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })} placeholder="key (e.g. email)" />
          <input style={S.input} value={c.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Label" />
          <select style={S.input} value={c.type} onChange={(e) => set(i, { type: e.target.value })}>{COL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          <label style={{ ...S.check, paddingTop: 0, fontSize: 12 }}><input type="checkbox" checked={c.required} onChange={(e) => set(i, { required: e.target.checked })} /> req</label>
          <button style={S.del} onClick={() => del(i)}><Trash2 size={14} /></button>
        </div>
      ))}
      <button style={{ ...S.ghost, alignSelf: 'flex-start' }} onClick={add}><Plus size={14} /> Add column</button>
    </div>
  );
}

/* ── store detail ─────────────────────────────────────────── */
function StoreDetail({ id, onBack, showToast, toast }) {
  const [store, setStore] = useState(null);
  const [keys, setKeys] = useState([]);
  const [tab, setTab] = useState('keys');
  const [loading, setLoading] = useState(true);
  const reloadKeys = () => getDataKeys(id).then((k) => setKeys(k?.keys || []));
  useEffect(() => {
    Promise.all([getDataStore(id), getDataKeys(id)]).then(([s, k]) => { setStore(s?.error ? null : s); setKeys(k?.keys || []); }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={S.page}><Spinner /></div>;
  if (!store) return <div style={S.page}><p>Store not found.</p><button style={S.ghost} onClick={onBack}><ArrowLeft size={15} /> Back</button></div>;

  return (
    <div style={S.page}>
      {toast && <div style={S.toast}>{toast}</div>}
      <div style={S.head}>
        <button style={S.iconBtn} onClick={onBack}><ArrowLeft size={18} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={S.h1}>{store.name}</h1>
          <p style={S.sub}><code style={S.code}>{store.slug}</code> — {(store.columns || []).length} columns</p>
        </div>
      </div>
      <div style={S.tabs}>
        {[['keys', 'API keys', KeyRound], ['records', 'Records', Table2], ['columns', 'Columns', Settings2], ['docs', 'Integration', Code2]].map(([k, label, Icon]) => (
          <button key={k} style={{ ...S.tab, ...(tab === k ? S.tabOn : {}) }} onClick={() => setTab(k)}><Icon size={15} /> {label}</button>
        ))}
      </div>

      {tab === 'keys' && <KeysTab id={id} keys={keys} reload={reloadKeys} showToast={showToast} />}
      {tab === 'records' && <RecordsTab id={id} columns={store.columns || []} />}
      {tab === 'columns' && <ColumnsTab store={store} onSaved={(s) => { setStore(s); showToast('Columns saved'); }} showToast={showToast} />}
      {tab === 'docs' && <Docs store={store} showToast={showToast} />}
    </div>
  );
}

function KeysTab({ id, keys, reload, showToast }) {
  const [draft, setDraft] = useState({ label: '', scope: 'submit', allowed_origins: '', expires_at: '', single_use: false });
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState(null);
  const [pwPrompt, setPwPrompt] = useState(null);
  const create = async () => {
    const origins = draft.allowed_origins.split(',').map((s) => s.trim()).filter(Boolean);
    if (!origins.length) return showToast('Add at least one allowed domain.');
    setBusy(true);
    const res = await createDataKey(id, { ...draft, allowed_origins: origins, expires_at: draft.expires_at || null });
    setBusy(false);
    if (res?.secret) { setSecret({ secret: res.secret, scope: res.scope }); setDraft({ label: '', scope: 'submit', allowed_origins: '', expires_at: '', single_use: false }); reload(); }
    else showToast(res?.error || 'Could not create key.');
  };
  const confirmPw = async (password) => {
    const { key, action } = pwPrompt;
    const fn = action === 'delete' ? deleteDataKey : revokeDataKey;
    const res = await fn(id, key.id, password);
    if (res?.error) return showToast(res.error);
    setPwPrompt(null); showToast(action === 'delete' ? 'Key deleted' : 'Key revoked'); reload();
  };
  return (
    <>
      <div style={S.card}>
        <h3 style={S.cardH}>Issue a key</h3>
        <div style={S.grid2}>
          <Field label="Label (who / which site)"><input style={S.input} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Campaign landing page" /></Field>
          <Field label="Scope"><select style={S.input} value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value })}><option value="submit">Write (POST) — safe in a frontend</option><option value="read">Read (GET) — keep on a server</option></select></Field>
          <Field label="Allowed domains (comma-separated)" full><input style={S.input} value={draft.allowed_origins} onChange={(e) => setDraft({ ...draft, allowed_origins: e.target.value })} placeholder="https://campaign.tiesverse.com" /></Field>
          <Field label="Expires (optional)"><input type="date" style={S.input} value={draft.expires_at} onChange={(e) => setDraft({ ...draft, expires_at: e.target.value })} /></Field>
          <Field label="Single use"><label style={S.check}><input type="checkbox" checked={draft.single_use} onChange={(e) => setDraft({ ...draft, single_use: e.target.checked })} /> Dies after one write</label></Field>
        </div>
        <button style={S.primary} disabled={busy} onClick={create}>{busy ? '…' : <><Plus size={15} /> Create key</>}</button>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {keys.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No keys yet.</p>}
        {keys.map((k) => (
          <div key={k.id} style={S.keyRow}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 14 }}>{k.label || '(no label)'}</strong>
                <span style={{ ...S.badge, ...(k.scope === 'read' ? S.badgeRead : S.badgeSubmit) }}>{k.scope === 'read' ? 'read' : 'write'}</span>
                <span style={{ ...S.badge, ...statusStyle(k.status) }}>{k.status}</span>
                {k.single_use && <span style={{ ...S.badge, background: '#eef', color: '#3730a3' }}>single-use</span>}
              </div>
              <div style={S.keyMeta}><code style={S.code}>{k.key_id}…</code> · {(k.allowed_origins || []).join(', ') || 'no domains'} · {k.records_count} writes{k.expires_at && ` · expires ${k.expires_at.slice(0, 10)}`}</div>
            </div>
            {k.status === 'active' && <button style={S.warn} onClick={() => setPwPrompt({ key: k, action: 'revoke' })}><Ban size={14} /> Revoke</button>}
            <button style={S.del} onClick={() => setPwPrompt({ key: k, action: 'delete' })}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      {secret && <SecretModal secret={secret.secret} scope={secret.scope} onClose={() => setSecret(null)} showToast={showToast} />}
      {pwPrompt && <PasswordModal action={pwPrompt.action} onCancel={() => setPwPrompt(null)} onConfirm={confirmPw} />}
    </>
  );
}

function RecordsTab({ id, columns }) {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  useEffect(() => { getStoreRecords(id, page).then(setData); }, [id, page]);
  if (!data) return <Spinner />;
  const cols = columns.length ? columns.map((c) => c.key) : (data.results[0] ? Object.keys(data.results[0].data) : []);
  return (
    <div style={S.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h3 style={{ ...S.cardH, margin: 0 }}>{data.count} records</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={S.ghost} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <button style={S.ghost} disabled={page * data.page_size >= data.count} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={S.table}>
          <thead><tr><th style={S.th}>#</th>{cols.map((c) => <th key={c} style={S.th}>{c}</th>)}<th style={S.th}>when</th></tr></thead>
          <tbody>
            {data.results.map((r) => (
              <tr key={r.id}><td style={S.td}>{r.id}</td>{cols.map((c) => <td key={c} style={S.td}>{fmt(r.data[c])}</td>)}<td style={S.td}>{r.created_at.slice(0, 16).replace('T', ' ')}</td></tr>
            ))}
            {!data.results.length && <tr><td style={S.td} colSpan={cols.length + 2}>No records yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ColumnsTab({ store, onSaved, showToast }) {
  const [columns, setColumns] = useState(store.columns?.length ? store.columns : [{ key: '', label: '', type: 'text', required: false }]);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const res = await updateDataStore(store.id, { columns: columns.filter((c) => c.key.trim()) });
    setBusy(false);
    if (res?.id) onSaved(res); else showToast(res?.error || 'Could not save.');
  };
  return (
    <div style={S.card}>
      <h3 style={S.cardH}>Columns</h3>
      <p style={S.docP}>The API validates every write against these. Existing records aren't changed.</p>
      <ColumnsEditor columns={columns} onChange={setColumns} />
      <button style={{ ...S.primary, marginTop: 16 }} disabled={busy} onClick={save}>{busy ? '…' : 'Save columns'}</button>
    </div>
  );
}

function Docs({ store, showToast }) {
  const base = BASE(store.slug);
  const example = (store.columns || []).filter((c) => c.type !== 'file').map((c) => `"${c.key}": ${sampleVal(c.type)}`).join(', ') || '"field": "value"';
  const writeCurl = `curl -X POST "${base}/records/" \\\n  -H "X-Api-Key: YOUR_WRITE_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"data": {${example}}}'`;
  const writeJs = `fetch("${base}/records/", {\n  method: "POST",\n  headers: { "X-Api-Key": "YOUR_WRITE_KEY", "Content-Type": "application/json" },\n  body: JSON.stringify({ data: { ${example} } })\n}).then(r => r.json()).then(console.log)`;
  const readCurl = `curl "${base}/records/?page=1" -H "X-Api-Key: YOUR_READ_KEY"`;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={S.card}>
        <h3 style={S.cardH}>Columns</h3>
        <table style={S.table}>
          <thead><tr><th style={S.th}>Key</th><th style={S.th}>Type</th><th style={S.th}>Required</th></tr></thead>
          <tbody>{(store.columns || []).map((c) => <tr key={c.key}><td style={S.td}><code style={S.code}>{c.key}</code></td><td style={S.td}>{c.type}</td><td style={S.td}>{c.required ? 'yes' : 'no'}</td></tr>)}
            {!(store.columns || []).length && <tr><td style={S.td} colSpan={3}>No columns defined — add some in the Columns tab.</td></tr>}</tbody>
        </table>
      </div>
      <Snippet title="Write a record (write key)" code={writeCurl} showToast={showToast} note="POST from one of the key's allowed domains." />
      <Snippet title="Write from JavaScript" code={writeJs} showToast={showToast} />
      <Snippet title="Read records (read key — keep on a server)" code={readCurl} showToast={showToast} />
      <div style={{ ...S.card, background: 'rgba(254,122,0,.06)', border: '1px solid rgba(254,122,0,.25)' }}>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7, color: 'var(--text-main)' }}>
          <li>A key only works from the domains set on it — copies elsewhere fail.</li>
          <li>Never put a <b>read</b> key in a browser. Write keys are safe in a frontend (domain-locked, POST-only).</li>
          <li>File columns: send <code style={S.code}>multipart/form-data</code> with <code style={S.code}>data</code> as a JSON string plus each file as its column key.</li>
        </ul>
      </div>
    </div>
  );
}

/* ── shared bits ──────────────────────────────────────────── */
function Snippet({ title, code, note, showToast }) {
  const [c, setC] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(code); setC(true); setTimeout(() => setC(false), 1500); showToast?.('Copied'); };
  return (
    <div style={S.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ ...S.cardH, margin: 0 }}>{title}</h3>
        <button style={S.copyBtn} onClick={copy}>{c ? <><Check size={14} color="#10b981" /> Copied</> : <><Copy size={14} /> Copy</>}</button>
      </div>
      {note && <p style={S.docP}>{note}</p>}
      <pre style={S.pre}><code>{code}</code></pre>
    </div>
  );
}

function SecretModal({ secret, scope, onClose, showToast }) {
  return (
    <Modal onClose={onClose}>
      <h3 style={{ margin: '0 0 6px' }}>Your {scope === 'read' ? 'read' : 'write'} key</h3>
      <p style={{ color: '#b45309', fontSize: 13.5, margin: '0 0 14px' }}>Copy it now — shown once only, can't be recovered.</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <code style={{ ...S.code, flex: 1, padding: '11px 12px', fontSize: 13, wordBreak: 'break-all' }}>{secret}</code>
        <button style={S.primary} onClick={() => { navigator.clipboard?.writeText(secret); showToast('Key copied'); }}><Copy size={15} /> Copy</button>
      </div>
      <button style={{ ...S.ghost, marginTop: 16 }} onClick={onClose}>Done</button>
    </Modal>
  );
}

function PasswordModal({ action, onCancel, onConfirm }) {
  const [pw, setPw] = useState(''); const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); await onConfirm(pw); setBusy(false); };
  return (
    <Modal onClose={onCancel}>
      <h3 style={{ margin: '0 0 6px' }}>Confirm with your password</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: 13.5, margin: '0 0 14px' }}>Enter your account password to {action} this key.</p>
      <input type="password" autoFocus style={S.input} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Your password" onKeyDown={(e) => e.key === 'Enter' && pw && go()} />
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
        <button style={S.ghost} onClick={onCancel}>Cancel</button>
        <button style={{ ...S.primary, ...(action === 'delete' ? { background: '#dc2626' } : {}) }} disabled={!pw || busy} onClick={go}>{busy ? '…' : (action === 'delete' ? 'Delete' : 'Revoke')}</button>
      </div>
    </Modal>
  );
}

const Modal = ({ children, onClose, wide }) => (
  <div style={S.overlay} onClick={onClose}>
    <div style={{ ...S.modal, maxWidth: wide ? 620 : 460 }} onClick={(e) => e.stopPropagation()}>
      <button style={S.modalX} onClick={onClose}><X size={16} /></button>{children}
    </div>
  </div>
);
const Field = ({ label, children, full }) => <div style={{ gridColumn: full ? '1 / -1' : 'auto', marginBottom: 12 }}><label style={S.lbl}>{label}</label>{children}</div>;
const Denied = () => (
  <div style={S.denied}><ShieldAlert size={40} color="#dc2626" /><h2 style={{ margin: '14px 0 6px' }}>Advisory only</h2>
    <p style={{ color: 'var(--text-muted)', maxWidth: 380, textAlign: 'center' }}>The Data API is managed by Advisory only.</p></div>
);
const Spinner = () => <p style={{ color: 'var(--text-muted)' }}><Loader2 className="spin" size={16} style={{ verticalAlign: -3 }} /> Loading… <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style></p>;

const fmt = (v) => (v && typeof v === 'object') ? (v.name || JSON.stringify(v)) : String(v ?? '');
const sampleVal = (t) => t === 'number' ? '123' : t === 'boolean' ? 'true' : t === 'email' ? '"a@b.com"' : '"…"';
function statusStyle(s) { return s === 'active' ? { background: '#dcfce7', color: '#166534' } : s === 'revoked' ? { background: '#fee2e2', color: '#991b1b' } : { background: '#f3f4f6', color: '#6b7280' }; }

const S = {
  page: { padding: '26px 30px', maxWidth: 1000, margin: '0 auto' },
  denied: { minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'fixed', top: 70, right: 24, background: 'var(--primary,#fe7a00)', color: '#fff', padding: '10px 16px', borderRadius: 8, zIndex: 4000, fontSize: 13, fontWeight: 600 },
  head: { display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20 },
  h1: { margin: 0, fontSize: 23, fontWeight: 800, color: 'var(--text-main)' },
  sub: { margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13.5, maxWidth: 620 },
  iconBtn: { border: '1px solid var(--outline-variant,#e5e7eb)', background: 'var(--surface,#fff)', borderRadius: 10, padding: 8, cursor: 'pointer', color: 'var(--text-main)' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 },
  storeCard: { border: '1px solid var(--outline-variant,#e5e7eb)', borderRadius: 14, padding: 16, background: 'var(--surface,#fff)', cursor: 'pointer' },
  storeMeta: { fontSize: 12, color: 'var(--text-muted)', marginTop: 10 },
  tabs: { display: 'flex', gap: 6, borderBottom: '1px solid var(--outline-variant,#e5e7eb)', marginBottom: 20, flexWrap: 'wrap' },
  tab: { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '2px solid transparent' },
  tabOn: { color: 'var(--primary,#fe7a00)', borderBottomColor: 'var(--primary,#fe7a00)' },
  card: { background: 'var(--surface-container-low,#fff)', border: '1px solid var(--outline-variant,#e5e7eb)', borderRadius: 14, padding: 20, marginBottom: 16 },
  cardH: { margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-main)' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, columnGap: 14, marginBottom: 8 },
  lbl: { display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 },
  input: { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--outline-variant,#e5e7eb)', background: 'var(--surface,#fff)', color: 'var(--text-main)', fontSize: 14, outline: 'none' },
  check: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--text-main)', paddingTop: 9 },
  primary: { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 9, border: 'none', background: 'var(--primary,#fe7a00)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  ghost: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 9, border: '1px solid var(--outline-variant,#e5e7eb)', background: 'transparent', color: 'var(--text-main)', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
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
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--outline-variant,#e5e7eb)', color: 'var(--text-muted)', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' },
  td: { padding: '8px 10px', borderBottom: '1px solid var(--outline-variant,#f1f1f1)', color: 'var(--text-main)', whiteSpace: 'nowrap' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,20,25,.55)', display: 'grid', placeItems: 'center', zIndex: 5000, padding: 20 },
  modal: { position: 'relative', background: 'var(--surface,#fff)', borderRadius: 16, padding: 26, width: '100%', boxShadow: '0 30px 70px rgba(0,0,0,.3)', maxHeight: '90vh', overflowY: 'auto' },
  modalX: { position: 'absolute', top: 12, right: 12, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' },
};
