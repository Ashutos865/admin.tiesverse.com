import { useEffect, useState, useCallback } from 'react';
import { getSignups, approveSignup, rejectSignup } from '../../apiClient';

const ROLES = [
  ['intern', 'Intern'], ['member', 'Member'], ['team_lead', 'Team Lead'],
  ['advisory', 'Advisory'], ['hr', 'HR'], ['admin', 'Admin'],
];
const STATUS_LABEL = { otp_pending: 'Awaiting email OTP', verified: 'Ready to approve' };

export default function SignupApprovals() {
  const [signups, setSignups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({}); // id -> {role, dept}
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getSignups().catch(() => ({ signups: [] }));
    setSignups(res?.signups || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const setField = (id, k, v) => setDraft(d => ({ ...d, [id]: { ...(d[id] || {}), [k]: v } }));

  const approve = async (s) => {
    const d = draft[s.id] || {};
    setBusy(s.id);
    const res = await approveSignup(s.id, {
      portal_role: d.role || 'intern',
      assigned_departments: d.dept || '',
    }).catch(() => ({ error: 'Failed' }));
    setBusy(null);
    if (res?.status === 'approved') load();
    else alert(res?.error || 'Could not approve.');
  };

  const reject = async (s) => {
    if (!window.confirm(`Reject ${s.name}'s signup?`)) return;
    setBusy(s.id);
    await rejectSignup(s.id).catch(() => {});
    setBusy(null);
    load();
  };

  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <div>
          <h1 style={S.title}>New Signups</h1>
          <p style={S.sub}>People who self-registered via the shared link. Verify, then assign a role + department to create their account.</p>
        </div>
        <button style={S.refresh} onClick={load}>↻ Refresh</button>
      </div>

      {loading ? <div style={S.muted}>Loading…</div>
        : signups.length === 0 ? <div style={S.empty}>No pending signups.</div>
        : (
          <div style={S.grid}>
            {signups.map(s => {
              const d = draft[s.id] || {};
              const ready = s.status === 'verified';
              return (
                <div key={s.id} style={S.card}>
                  <div style={S.person}>
                    {s.photo_url
                      ? <img src={s.photo_url} alt="" style={S.avatar} />
                      : <div style={{ ...S.avatar, ...S.avatarPh }}>{(s.name || '?')[0]}</div>}
                    <div>
                      <div style={S.name}>{s.name}</div>
                      <div style={S.email}>{s.email}</div>
                      <span style={{ ...S.badge, ...(ready ? S.badgeOk : S.badgeWait) }}>{STATUS_LABEL[s.status] || s.status}</span>
                    </div>
                  </div>
                  <div style={S.assign}>
                    <label style={S.lbl}>Role
                      <select style={S.input} value={d.role || 'intern'} onChange={e => setField(s.id, 'role', e.target.value)}>
                        {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </label>
                    <label style={S.lbl}>Department(s)
                      <input style={S.input} placeholder="e.g. Content, Tech" value={d.dept || ''} onChange={e => setField(s.id, 'dept', e.target.value)} />
                    </label>
                  </div>
                  <div style={S.actions}>
                    <button style={S.reject} disabled={busy === s.id} onClick={() => reject(s)}>Reject</button>
                    <button style={{ ...S.approve, ...(ready ? {} : S.disabled) }} disabled={!ready || busy === s.id} onClick={() => approve(s)}>
                      {busy === s.id ? 'Working…' : 'Approve & create account'}
                    </button>
                  </div>
                  {!ready && <p style={S.note}>Waiting for them to verify their email before you can approve.</p>}
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}

const S = {
  wrap: { padding: 24, maxWidth: 1000, margin: '0 auto' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 800, margin: 0, color: 'var(--text,#111827)' },
  sub: { color: 'var(--text-muted,#6b7280)', fontSize: 14, marginTop: 4, maxWidth: 620 },
  refresh: { padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border,#e5e7eb)', background: 'transparent', cursor: 'pointer', flex: 'none' },
  grid: { display: 'flex', flexDirection: 'column', gap: 14 },
  card: { background: 'var(--card,#fff)', border: '1px solid var(--border,#e5e7eb)', borderRadius: 12, padding: 18, display: 'grid', gridTemplateColumns: '1.4fr 1.4fr auto', gap: 18, alignItems: 'center' },
  person: { display: 'flex', gap: 12, alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flex: 'none' },
  avatarPh: { background: '#FE7A0022', color: '#FE7A00', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 18 },
  name: { fontWeight: 700, color: 'var(--text,#111827)' },
  email: { fontSize: 13, color: 'var(--text-muted,#6b7280)', margin: '2px 0 6px' },
  badge: { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 },
  badgeOk: { background: '#dcfce7', color: '#16a34a' },
  badgeWait: { background: '#fef3c7', color: '#b45309' },
  assign: { display: 'flex', gap: 10 },
  lbl: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-muted,#6b7280)', flex: 1 },
  input: { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border,#e5e7eb)', fontSize: 13 },
  actions: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 180 },
  approve: { padding: '10px 14px', borderRadius: 8, border: 'none', background: '#FE7A00', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 },
  reject: { padding: '8px 14px', borderRadius: 8, border: '1px solid #fca5a5', background: 'transparent', color: '#dc2626', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  disabled: { opacity: 0.5, cursor: 'not-allowed' },
  note: { gridColumn: '1 / -1', fontSize: 12, color: '#b45309', margin: 0 },
  muted: { color: 'var(--text-muted,#9ca3af)' },
  empty: { textAlign: 'center', color: 'var(--text-muted,#9ca3af)', padding: 40, background: 'var(--card,#fff)', borderRadius: 12, border: '1px solid var(--border,#e5e7eb)' },
};
