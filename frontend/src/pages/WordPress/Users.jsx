import { useState, useEffect } from 'react';
import { wpGet, qs } from './wpApi';
import { Users as UsersIcon, Loader2, ExternalLink } from 'lucide-react';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    wpGet(`/users${qs({ per_page: 100, context: 'edit', _fields: 'id,name,slug,email,roles,url,avatar_urls' })}`)
      .then(r => setUsers(r.data || []))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: '26px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 21, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 10 }}><UsersIcon size={21} /> Users</h1>
        <a href="https://ties.tiesverse.com/wp-admin/users.php" target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)', color: 'var(--text-main)', textDecoration: 'none', fontSize: 13 }}><ExternalLink size={14} /> Add / edit users in wp-admin</a>
      </div>
      {err && <div style={{ padding: 14, borderRadius: 10, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', marginBottom: 14 }}>{err}</div>}
      {loading ? <div style={{ color: 'var(--text-muted)', padding: 20, display: 'flex', gap: 8, alignItems: 'center' }}><Loader2 size={18} className="ma-spin" /> Loading…</div> : (
        <div style={{ border: '1px solid var(--outline-variant)', borderRadius: 10, overflow: 'hidden' }}>
          {users.map((u, i) => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: i ? '1px solid var(--outline-variant)' : 'none', background: 'var(--surface-container-low)' }}>
              {u.avatar_urls?.['48'] && <img src={u.avatar_urls['48']} alt="" style={{ width: 36, height: 36, borderRadius: '50%' }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: 14 }}>{u.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.email || u.slug}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(u.roles || []).map(r => <span key={r} style={{ fontSize: 11.5, padding: '2px 9px', borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--outline-variant)', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{r}</span>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
