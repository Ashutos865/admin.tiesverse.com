import { useEffect, useState, useCallback } from 'react';
import { getSignups, approveSignup, rejectSignup, getHRDepartments, resendCredentials, getProvisionedMembers } from '../../apiClient';
import { usePermissions } from '../../context/PermissionContext';

const ROLES = [
  ['intern', 'Intern'], ['member', 'Member'], ['team_lead', 'Team Lead'],
  ['advisory', 'Advisory'], ['hr', 'HR'], ['admin', 'Admin'],
];
const STATUS_LABEL = { otp_pending: 'Awaiting email OTP', verified: 'Ready to approve' };

export default function SignupApprovals() {
  const { hasPermission, isSuperuser } = usePermissions();
  const canManage = isSuperuser || hasPermission('add_onboardingsubmission');   // HR/Admin only
  const [signups, setSignups] = useState([]);
  const [signupUrl, setSignupUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({}); // id -> {role, dept}
  const [busy, setBusy] = useState(null);
  const [depts, setDepts] = useState([]);
  const [resending, setResending] = useState(false);
  const [members, setMembers] = useState([]);
  const [pickedMember, setPickedMember] = useState('');
  const [sendingOne, setSendingOne] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [res, dres, mres] = await Promise.all([
      getSignups().catch(() => ({ signups: [] })),
      getHRDepartments().catch(() => []),
      getProvisionedMembers().catch(() => ({ members: [] })),
    ]);
    setSignups(res?.signups || []);
    setSignupUrl(res?.signup_url || '');
    setDepts((Array.isArray(dres) ? dres : []).map(d => d.name).filter(Boolean));
    setMembers(mres?.members || []);
    setLoading(false);
  }, []);

  const copyUrl = () => {
    navigator.clipboard?.writeText(signupUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };
  useEffect(() => { load(); }, [load]);

  const setField = (id, k, v) => setDraft(d => ({ ...d, [id]: { ...(d[id] || {}), [k]: v } }));
  const addDept = (id, name) => setDraft(d => {
    const cur = d[id]?.depts || [];
    return cur.includes(name) ? d : { ...d, [id]: { ...(d[id] || {}), depts: [...cur, name] } };
  });
  const removeDept = (id, name) => setDraft(d => ({ ...d, [id]: { ...(d[id] || {}), depts: (d[id]?.depts || []).filter(x => x !== name) } }));

  const approve = async (s) => {
    const d = draft[s.id] || {};
    setBusy(s.id);
    const res = await approveSignup(s.id, {
      portal_role: d.role || 'intern',
      assigned_departments: d.depts || [],
    }).catch(() => ({ error: 'Failed' }));
    setBusy(null);
    if (res?.status === 'approved') load();
    else alert(res?.error || 'Could not approve.');
  };

  const resendAll = async () => {
    const ok = window.confirm(
      'Send login details to ALL members?\n\n'
      + 'Passwords are stored encrypted and cannot be read back, so this issues a '
      + 'FRESH password to each member and emails their login ID + new password. '
      + 'Anyone still using an old password will need the new one.'
    );
    if (!ok) return;
    setResending(true);
    const res = await resendCredentials({ all: true }).catch(() => ({ error: 'Failed' }));
    setResending(false);
    if (res?.status === 'ok') {
      const extra = res.skipped ? ` ${res.skipped} skipped (admin/staff or no email).` : '';
      alert(`Login details sent to ${res.sent} member(s).${extra}`);
    } else {
      alert(res?.error || 'Could not send login details.');
    }
  };

  const sendToOne = async () => {
    if (!pickedMember) return;
    const m = members.find(x => String(x.submission_id) === String(pickedMember));
    const ok = window.confirm(
      `Send login details to ${m?.name || 'this member'} (${m?.email || ''})?\n\n`
      + 'This issues a FRESH password and emails their login ID + new password. '
      + 'Their old password (if any) will stop working.'
    );
    if (!ok) return;
    setSendingOne(true);
    const res = await resendCredentials({ submission_id: Number(pickedMember) }).catch(() => ({ error: 'Failed' }));
    setSendingOne(false);
    if (res?.status === 'ok') {
      alert(`Login details sent to ${m?.name || res.username}.`);
      setPickedMember('');
    } else {
      alert(res?.error || 'Could not send login details.');
    }
  };

  const reject = async (s) => {
    if (!window.confirm(`Reject ${s.name}'s signup?`)) return;
    setBusy(s.id);
    await rejectSignup(s.id).catch(() => {});
    setBusy(null);
    load();
  };

  if (!canManage) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '64px 24px', color: 'var(--text-muted)', textAlign: 'center' }}>
        <h2 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.1rem' }}>New Signups</h2>
        <p style={{ margin: 0, maxWidth: 380, fontSize: '0.9rem' }}>You don’t have permission to view this page. Ask an admin if you think this is a mistake.</p>
      </div>
    );
  }

  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <div>
          <h1 style={S.title}>New Signups</h1>
          <p style={S.sub}>People who self-registered via the shared link. Verify, then assign a role + department to create their account.</p>
        </div>
        <div style={S.headActions}>
          <button style={S.sendAll} disabled={resending} onClick={resendAll}>
            {resending ? 'Sending…' : '✉ Send login details to all'}
          </button>
          <button style={S.refresh} onClick={load}>↻ Refresh</button>
        </div>
      </div>

      {signupUrl && (
        <div style={S.linkBar}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={S.linkLbl}>Shared signup link — send this to interns &amp; members</div>
            <div style={S.linkUrl}>{signupUrl}</div>
          </div>
          <button style={S.copyBtn} onClick={copyUrl}>{copied ? 'Copied ✓' : 'Copy link'}</button>
        </div>
      )}

      {members.length > 0 && (
        <div style={S.sendBox}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={S.sendBoxLbl}>Send login details to one member</div>
            <div style={S.sendBoxSub}>Issues a fresh password and emails it to just this person.</div>
          </div>
          <select style={S.memberSelect} value={pickedMember} onChange={e => setPickedMember(e.target.value)}>
            <option value="">Choose a member…</option>
            {members.map(m => (
              <option key={m.submission_id} value={m.submission_id}>
                {m.name} · {m.email} ({m.role})
              </option>
            ))}
          </select>
          <button
            style={{ ...S.sendOne, ...(pickedMember ? {} : S.disabled) }}
            disabled={!pickedMember || sendingOne}
            onClick={sendToOne}
          >
            {sendingOne ? 'Sending…' : 'Send login'}
          </button>
        </div>
      )}

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
                      <select style={S.input} value="" onChange={e => { if (e.target.value) addDept(s.id, e.target.value); }}>
                        <option value="">+ Add department</option>
                        {depts.filter(dn => !(d.depts || []).includes(dn)).map(dn => <option key={dn} value={dn}>{dn}</option>)}
                      </select>
                      {(d.depts || []).length > 0 && (
                        <div style={S.chips}>
                          {d.depts.map(dn => (
                            <span key={dn} style={S.chip}>{dn}<button style={S.chipX} onClick={() => removeDept(s.id, dn)}>×</button></span>
                          ))}
                        </div>
                      )}
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
  headActions: { display: 'flex', gap: 10, flex: 'none', flexWrap: 'wrap' },
  sendAll: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#FE7A00', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, flex: 'none' },
  sendBox: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--card,#fff)', border: '1px solid var(--border,#e5e7eb)', borderRadius: 12, padding: '14px 18px', marginBottom: 18 },
  sendBoxLbl: { fontSize: 13, fontWeight: 700, color: 'var(--text,#111827)' },
  sendBoxSub: { fontSize: 12, color: 'var(--text-muted,#6b7280)', marginTop: 2 },
  memberSelect: { padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border,#e5e7eb)', fontSize: 13, minWidth: 220, maxWidth: '100%', flex: '1 1 220px' },
  sendOne: { padding: '9px 16px', borderRadius: 8, border: '1px solid #FE7A00', background: 'transparent', color: '#c2410c', fontWeight: 700, cursor: 'pointer', fontSize: 13, flex: 'none' },
  linkBar: { display: 'flex', alignItems: 'center', gap: 14, background: '#FE7A0012', border: '1px solid #FE7A0033', borderRadius: 12, padding: '14px 18px', marginBottom: 18 },
  linkLbl: { fontSize: 12, fontWeight: 700, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 },
  linkUrl: { fontSize: 14, color: 'var(--text,#111827)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  copyBtn: { padding: '9px 16px', borderRadius: 8, border: 'none', background: '#FE7A00', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, flex: 'none' },
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
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { display: 'inline-flex', alignItems: 'center', gap: 4, background: '#FE7A0018', color: '#c2410c', borderRadius: 20, padding: '3px 6px 3px 10px', fontSize: 12, fontWeight: 600 },
  chipX: { border: 'none', background: 'transparent', color: '#c2410c', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 2px' },
  actions: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 180 },
  approve: { padding: '10px 14px', borderRadius: 8, border: 'none', background: '#FE7A00', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 },
  reject: { padding: '8px 14px', borderRadius: 8, border: '1px solid #fca5a5', background: 'transparent', color: '#dc2626', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  disabled: { opacity: 0.5, cursor: 'not-allowed' },
  note: { gridColumn: '1 / -1', fontSize: 12, color: '#b45309', margin: 0 },
  muted: { color: 'var(--text-muted,#9ca3af)' },
  empty: { textAlign: 'center', color: 'var(--text-muted,#9ca3af)', padding: 40, background: 'var(--card,#fff)', borderRadius: 12, border: '1px solid var(--border,#e5e7eb)' },
};
