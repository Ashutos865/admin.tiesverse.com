import { useState, useEffect, useRef } from 'react';
import {
  GraduationCap, Plus, Trash2, Upload, Loader2, ArrowUp, ArrowDown, AlertTriangle, Check, X,
} from 'lucide-react';
import {
  getTalentPool, createTalent, updateTalent, deleteTalent, uploadTalentLogo,
} from '../../apiClient';

const SITE = 'https://www.tiesverse.com';

/* Bundled logos are stored as a site-relative path; uploads are absolute R2
   URLs. Resolve so both preview correctly in the admin. */
const resolve = (url) => (!url ? '' : /^https?:/.test(url) ? url : `${SITE}${url}`);

export default function TalentPool() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState('');
  const [toast, setToast] = useState('');

  const say = (m) => { setToast(m); setTimeout(() => setToast(''), 2800); };
  const load = () => getTalentPool()
    .then((r) => setRows(r?.institutions || []))
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const add = async () => {
    const name = adding.trim();
    if (!name) return say('Type a name first.');
    const res = await createTalent({ name });
    if (res?.error) return say(res.error);
    setAdding('');
    say('Added — upload its logo next.');
    load();
  };

  const move = async (row, dir) => {
    const sorted = [...rows].sort((a, b) => a.position - b.position);
    const i = sorted.findIndex((r) => r.id === row.id);
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    await Promise.all([
      updateTalent(sorted[i].id, { position: sorted[j].position }),
      updateTalent(sorted[j].id, { position: sorted[i].position }),
    ]);
    load();
  };

  const opaque = rows.filter((r) => r.logo_url && !r.has_transparency).length;

  if (loading) {
    return <div style={S.page}><Loader2 size={20} className="spin" /> Loading…</div>;
  }

  return (
    <div style={S.page}>
      {toast && <div style={S.toast}>{toast}</div>}

      <div style={S.head}>
        <div style={{ flex: 1 }}>
          <h1 style={S.h1}>
            <GraduationCap size={22} style={{ verticalAlign: -4, marginRight: 8, color: 'var(--primary)' }} />
            Talent pool
          </h1>
          <p style={S.sub}>
            The institution logos under “Our talent pool” on tiesverse.com/about.
            Use logos with a transparent background — the grid sits on a cream page,
            so a logo with its own white box shows up as a rectangle.
          </p>
        </div>
      </div>

      {opaque > 0 && (
        <div style={S.warnBar}>
          <AlertTriangle size={15} style={{ flex: 'none' }} />
          {opaque === 1
            ? '1 logo has a solid background and will show a box on the page.'
            : `${opaque} logos have a solid background and will show a box on the page.`}
        </div>
      )}

      <div style={S.addRow}>
        <input style={{ ...S.input, flex: 1 }} value={adding} placeholder="Institution name, e.g. IIT Bombay"
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button style={S.primary} onClick={add}><Plus size={16} /> Add institution</button>
      </div>

      {!rows.length && (
        <div style={S.empty}>
          <GraduationCap size={30} style={{ color: '#9ca3af' }} />
          <h3 style={{ margin: '12px 0 4px' }}>No institutions yet</h3>
          <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>
            Add one above, then upload its logo.
          </p>
        </div>
      )}

      <div style={S.grid}>
        {[...rows].sort((a, b) => a.position - b.position).map((row, i, arr) => (
          <Card key={row.id} row={row} first={i === 0} last={i === arr.length - 1}
            onMove={(d) => move(row, d)} onChanged={load} say={say} />
        ))}
      </div>
    </div>
  );
}

function Card({ row, first, last, onMove, onChanged, say }) {
  const [name, setName] = useState(row.name);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { setName(row.name); }, [row.name]);

  const rename = async () => {
    if (name.trim() === row.name || !name.trim()) return setName(row.name);
    const res = await updateTalent(row.id, { name: name.trim() });
    if (res?.error) { setName(row.name); return say(res.error); }
    say('Renamed.');
    onChanged();
  };

  const pick = async (file) => {
    if (!file) return;
    setBusy(true);
    const res = await uploadTalentLogo(row.id, file);
    setBusy(false);
    if (res?.error) return say(res.error);
    say(res.has_transparency
      ? 'Logo uploaded.'
      : 'Uploaded — but this logo has a solid background, so it will show a box.');
    onChanged();
  };

  const remove = async () => {
    if (!window.confirm(`Remove ${row.name} from the talent pool?`)) return;
    const res = await deleteTalent(row.id);
    if (res?.error) return say(res.error);
    say('Removed.');
    onChanged();
  };

  const togglePublished = async () => {
    const res = await updateTalent(row.id, { is_published: !row.is_published });
    if (res?.error) return say(res.error);
    onChanged();
  };

  return (
    <div style={{ ...S.card, ...(row.is_published ? null : S.cardOff) }}>
      {/* Checkerboard behind the logo makes a solid background obvious at a glance. */}
      <div style={S.stage}>
        {row.logo_url
          ? <img src={resolve(row.logo_url)} alt={row.name} style={S.logo} />
          : <span style={S.noLogo}>No logo</span>}
      </div>

      {row.logo_url && !row.has_transparency && (
        <span style={S.warnPill}><AlertTriangle size={11} /> solid background</span>
      )}

      <input style={S.name} value={name} onChange={(e) => setName(e.target.value)}
        onBlur={rename} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />

      <div style={S.actions}>
        <input ref={fileRef} type="file" accept="image/png,image/webp,image/svg+xml,image/*"
          style={{ display: 'none' }} onChange={(e) => pick(e.target.files?.[0])} />
        <button style={S.ghost} disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? <Loader2 size={13} className="spin" /> : <Upload size={13} />}
          {row.logo_url ? 'Replace' : 'Logo'}
        </button>
        <button style={S.icon} disabled={first} onClick={() => onMove(-1)} title="Move left">
          <ArrowUp size={13} style={{ transform: 'rotate(-90deg)' }} />
        </button>
        <button style={S.icon} disabled={last} onClick={() => onMove(1)} title="Move right">
          <ArrowDown size={13} style={{ transform: 'rotate(-90deg)' }} />
        </button>
        <button style={S.icon} onClick={togglePublished}
          title={row.is_published ? 'Hide from the website' : 'Show on the website'}>
          {row.is_published ? <Check size={13} /> : <X size={13} />}
        </button>
        <button style={S.del} onClick={remove} title="Remove"><Trash2 size={13} /></button>
      </div>
    </div>
  );
}

const CHECKER =
  'repeating-conic-gradient(#f3f4f6 0% 25%, #ffffff 0% 50%) 50% / 14px 14px';

const S = {
  page: { padding: '26px 30px', maxWidth: 1100, margin: '0 auto' },
  head: { display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  h1: { fontSize: 24, fontWeight: 700, margin: 0 },
  sub: { color: '#6b7280', fontSize: 14, margin: '6px 0 0', maxWidth: 660, lineHeight: 1.5 },
  warnBar: {
    display: 'flex', alignItems: 'center', gap: 8, background: '#fffbeb',
    border: '1px solid #fde68a', color: '#92400e', borderRadius: 8,
    padding: '9px 12px', fontSize: 13, marginBottom: 16,
  },
  addRow: { display: 'flex', gap: 10, marginBottom: 20 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14 },
  card: {
    border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff',
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  cardOff: { opacity: 0.5, borderStyle: 'dashed' },
  stage: {
    height: 96, borderRadius: 8, background: CHECKER,
    display: 'grid', placeItems: 'center', padding: 10, border: '1px solid #f3f4f6',
  },
  logo: { maxWidth: '100%', maxHeight: 76, objectFit: 'contain' },
  noLogo: { fontSize: 12, color: '#9ca3af' },
  warnPill: {
    display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    fontSize: 10.5, fontWeight: 700, background: '#fffbeb', color: '#b45309',
    border: '1px solid #fde68a', borderRadius: 999, padding: '2px 8px',
  },
  name: {
    border: '1px solid transparent', borderRadius: 6, padding: '5px 7px', fontSize: 13,
    fontWeight: 600, fontFamily: 'inherit', width: '100%', background: '#fafafa',
  },
  actions: { display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' },
  input: { padding: '9px 11px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' },
  primary: {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 15px',
    background: 'var(--primary,#fe7a00)', color: '#fff', border: 0, borderRadius: 8,
    fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  ghost: {
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px',
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 7,
    fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#374151',
  },
  icon: {
    width: 26, height: 26, display: 'grid', placeItems: 'center', background: '#fff',
    border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', color: '#374151',
  },
  del: {
    width: 26, height: 26, display: 'grid', placeItems: 'center', background: '#fff',
    border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 6, cursor: 'pointer',
    marginLeft: 'auto',
  },
  empty: {
    border: '1px dashed #e5e7eb', borderRadius: 12, padding: '40px 20px',
    textAlign: 'center', background: '#fafafa',
  },
  toast: {
    position: 'fixed', top: 70, right: 24, background: 'var(--primary,#fe7a00)',
    color: '#fff', padding: '10px 16px', borderRadius: 8, zIndex: 4000,
    fontSize: 13, fontWeight: 600, maxWidth: 380,
  },
};
