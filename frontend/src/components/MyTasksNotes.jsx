import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTasks } from '../apiClient';
import { useMe } from '../context/MeContext';

// Sticky-note palette + slight rotations for the pinboard look.
const NOTE_COLORS = ['#fff7cc', '#d7ecff', '#d9f8e3', '#ffe0ef', '#e6e0ff', '#ffe8cc'];
const ROT = ['-1.6deg', '1.4deg', '-0.8deg', '1.8deg', '-1.2deg', '0.9deg'];
const PRIORITY = { urgent: '#dc2626', high: '#ea580c', medium: '#ca8a04', low: '#16a34a' };

const cap = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');

export default function MyTasksNotes() {
  const { memberId } = useMe();
  const nav = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!memberId) { setLoading(false); return; }
    let alive = true;
    getTasks({ member: memberId })
      .then((r) => {
        if (!alive) return;
        const list = Array.isArray(r) ? r : (r?.results || []);
        setTasks(list.filter((t) => t.status !== 'done' && t.status !== 'cancelled'));
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [memberId]);

  if (!memberId) return null;   // only members have "my tasks"

  const today = new Date(); today.setHours(0, 0, 0, 0);

  return (
    <section style={{ margin: '0 0 26px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-main, #111827)' }}>📌 My Tasks</h2>
        {!loading && <span style={{ fontSize: 13, color: 'var(--text-muted, #6b7280)' }}>{tasks.length} active</span>}
        <button type="button" onClick={() => nav('/me/tasks')}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--primary, #6366f1)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          Open all →
        </button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted, #6b7280)', fontSize: 13, margin: 0 }}>Loading your tasks…</p>
      ) : tasks.length === 0 ? (
        <div style={{ background: '#fff7cc', color: '#7c6f1f', borderRadius: 6, padding: '18px 22px', transform: 'rotate(-1deg)', maxWidth: 300, fontSize: 14, fontWeight: 600, boxShadow: '0 8px 18px -8px rgba(0,0,0,.3)' }}>
          🎉 No open tasks — you're all caught up!
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 18 }}>
          {tasks.map((t, i) => {
            const bg = NOTE_COLORS[i % NOTE_COLORS.length];
            const overdue = t.due_date && new Date(t.due_date) < today;
            return (
              <button key={t.id} type="button" onClick={() => nav('/me/tasks')}
                style={{
                  position: 'relative', textAlign: 'left', border: 'none', cursor: 'pointer',
                  background: bg, borderRadius: 4, padding: '20px 16px 14px', minHeight: 132,
                  transform: `rotate(${ROT[i % ROT.length]})`,
                  boxShadow: '0 8px 18px -8px rgba(0,0,0,.35)', color: '#3a3a3a',
                  fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                {/* tape */}
                <span style={{ position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%) rotate(-2deg)', width: 60, height: 18, background: 'rgba(255,255,255,.55)', borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,.15)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY[t.priority] || '#999' }} />
                  <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: '#6b6b6b' }}>{t.priority}</span>
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.3 }}>{t.title}</div>
                {(t.progress > 0 || t.estimated_hours) && (
                  <div>
                    <div style={{ height: 5, borderRadius: 999, background: 'rgba(0,0,0,.12)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, t.progress || 0)}%`, background: (t.progress || 0) >= 100 ? '#16a34a' : '#4f46e5' }} />
                    </div>
                    <div style={{ fontSize: 10.5, marginTop: 3, color: '#555' }}>{t.progress || 0}%{t.estimated_hours ? ` · ${t.actual_hours || 0}/${t.estimated_hours}h` : ''}</div>
                  </div>
                )}
                <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                  <span style={{ color: '#555' }}>{cap(t.status)}</span>
                  {t.due_date && <span style={{ fontWeight: 700, color: overdue ? '#dc2626' : '#555' }}>{overdue ? '⚠ ' : ''}{fmtDate(t.due_date)}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
