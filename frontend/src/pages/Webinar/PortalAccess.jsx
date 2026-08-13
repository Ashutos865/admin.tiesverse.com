import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, ShieldCheck, Eye, Loader2 } from 'lucide-react';
import { getWebinarAccessGrants, getWebinarMyAccess, setWebinarAccess } from '../../apiClient';

/**
 * Who can do what in the Webinar & Workshop portal.
 *
 * Only a superadmin (or a portal lead, for their own team) can open this.
 * Members of the Webinar or Workshop departments already read everything;
 * this page is for handing out the abilities that change things.
 */

const card = {
  background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)',
  borderRadius: 12, padding: 18, marginBottom: 16,
};
const chip = (on) => ({
  padding: '5px 12px', borderRadius: 20,
  border: `1px solid ${on ? 'var(--primary, #fe7a00)' : 'var(--outline-variant)'}`,
  background: on ? 'var(--primary, #fe7a00)' : 'transparent',
  color: on ? '#fff' : 'var(--text-muted)',
  fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
});
const input = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px 9px 34px', borderRadius: 8,
  border: '1px solid var(--outline-variant)', background: 'var(--surface)',
  color: 'var(--text-main)', fontSize: 14, fontFamily: 'inherit', outline: 'none',
};

export default function PortalAccess() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(true);
  const [caps, setCaps] = useState([]);          // [{key,label}]
  const [members, setMembers] = useState([]);
  const [query, setQuery] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [toast, setToast] = useState('');
  const [onlyWithAccess, setOnlyWithAccess] = useState(false);

  const flash = (m) => { setToast(m); window.setTimeout(() => setToast(''), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    const mine = await getWebinarMyAccess();
    if (!mine?.can_grant) { setAllowed(false); setLoading(false); return; }
    const res = await getWebinarAccessGrants();
    setCaps(res?.all_capabilities || []);
    setMembers(Array.isArray(res?.members) ? res.members : []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (member, key) => {
    const has = member.capabilities.includes(key);
    const next = has
      ? member.capabilities.filter((c) => c !== key)
      : [...member.capabilities, key];
    setSavingId(member.id);
    const res = await setWebinarAccess(member.id, next);
    setSavingId(null);
    if (res?.error) return flash(res.error);
    setMembers((list) => list.map((m) => (m.id === member.id ? { ...m, capabilities: res.capabilities || next } : m)));
    flash(`${member.name}: ${next.length ? `${next.length} permission${next.length > 1 ? 's' : ''}` : 'read-only'}`);
  };

  const revoke = async (member) => {
    if (!window.confirm(`Remove all granted permissions for ${member.name}? They keep read-only access if they are in a portal department.`)) return;
    setSavingId(member.id);
    const res = await setWebinarAccess(member.id, []);
    setSavingId(null);
    if (res?.error) return flash(res.error);
    setMembers((list) => list.map((m) => (m.id === member.id ? { ...m, capabilities: [] } : m)));
    flash(`${member.name} is back to read-only.`);
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => {
      if (onlyWithAccess && !m.capabilities.length && !m.in_portal_dept) return false;
      if (!q) return true;
      return (`${m.name} ${m.email} ${(m.departments || []).join(' ')}`).toLowerCase().includes(q);
    });
  }, [members, query, onlyWithAccess]);

  if (loading) {
    return <div style={{ padding: 32, color: 'var(--text-muted)' }}><Loader2 size={16} style={{ verticalAlign: -3 }} /> Loading access…</div>;
  }

  if (!allowed) {
    return (
      <div style={{ maxWidth: 620, margin: '40px auto', padding: '0 20px' }}>
        <div style={card}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 6px', color: 'var(--text-main)' }}>Not available</h2>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
            Only a superadmin or the portal lead can manage who has access here.
            Ask one of them if you need permissions changed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <ShieldCheck size={22} />
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>Portal Access</h1>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 18px', lineHeight: 1.6, maxWidth: 720 }}>
        Anyone in the <strong>Webinar</strong> or <strong>Workshop</strong> department can already read everything here.
        Use these switches to let someone make changes. Removing every switch returns them to read-only.
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--text-muted)' }} />
          <input style={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, email or department…" />
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyWithAccess} onChange={(e) => setOnlyWithAccess(e.target.checked)} />
          Only people with access
        </label>
      </div>

      {shown.length === 0 && (
        <div style={card}><p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-muted)' }}>No members match that search.</p></div>
      )}

      {shown.map((m) => {
        const granted = m.capabilities.length;
        return (
          <div key={m.id} style={{ ...card, opacity: savingId === m.id ? 0.6 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <strong style={{ fontSize: 14.5, color: 'var(--text-main)' }}>{m.name}</strong>
              {m.email && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.email}</span>}
              {m.in_portal_dept && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                  <Eye size={12} /> READ-ONLY BY DEPARTMENT
                </span>
              )}
              {granted > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary, #fe7a00)' }}>
                  {granted} GRANTED
                </span>
              )}
              <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-muted)' }}>
                {(m.departments || []).join(' · ') || 'No department'}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {caps.filter((c) => c.key !== 'view').map((c) => {
                const on = m.capabilities.includes(c.key);
                return (
                  <button key={c.key} type="button" style={chip(on)} disabled={savingId === m.id}
                    onClick={() => toggle(m, c.key)}>
                    {on ? '✓ ' : ''}{c.label}
                  </button>
                );
              })}
              {granted > 0 && (
                <button type="button" onClick={() => revoke(m)} disabled={savingId === m.id}
                  style={{ ...chip(false), color: '#dc2626', borderColor: '#dc2626' }}>
                  Remove all
                </button>
              )}
            </div>
          </div>
        );
      })}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--text-main)', color: 'var(--surface)', padding: '11px 20px', borderRadius: 10, fontSize: 13.5, fontWeight: 600, zIndex: 60, boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}
