import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTasks } from '../apiClient';
import { useMe } from '../context/MeContext';

const STATUS = { todo: 'To Do', in_progress: 'In Progress', review: 'In Review', done: 'Done', cancelled: 'Cancelled' };
const SCOLOR = { todo: '#6b7280', in_progress: '#2563eb', review: '#a16207', done: '#16a34a', cancelled: '#9ca3af' };
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');

// Team-lead view: the tasks YOU assigned, grouped by who you gave them to.
export default function AssignedByMe() {
  const { isLead, memberId } = useMe();
  const nav = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!memberId) { setLoading(false); return; }
    getTasks({ assigned_by: memberId })
      .then((r) => {
        const list = Array.isArray(r) ? r : (r?.results || []);
        setTasks(list.filter((t) => t.status !== 'cancelled'));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [memberId]);

  if (!isLead || !memberId || loading || tasks.length === 0) return null;

  const groups = {};
  tasks.forEach((t) => {
    const who = t.assigned_to_name || t.assigned_to_department || 'Unassigned';
    (groups[who] = groups[who] || []).push(t);
  });
  const people = Object.keys(groups).length;

  return (
    <section style={{ margin: '0 0 26px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-main, #111827)' }}>🧑‍🏫 Tasks I Assigned</h2>
        <span style={{ fontSize: 13, color: 'var(--text-muted, #6b7280)' }}>{tasks.length} across {people} {people === 1 ? 'person' : 'people'}</span>
        <button type="button" onClick={() => nav('/hr/tasks')}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--primary, #6366f1)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          Open board →
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {Object.entries(groups).map(([who, its]) => (
          <div key={who} style={{ background: 'var(--surface-container-low, #fff)', border: '1px solid var(--outline-variant, #e5e7eb)', borderRadius: 12, padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-main)', marginBottom: 8 }}>
              {who} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {its.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {its.slice(0, 5).map((t) => (
                <div key={t.id} style={{ fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                    <span style={{ color: SCOLOR[t.status], fontWeight: 600, fontSize: 11, flexShrink: 0 }}>{STATUS[t.status] || t.status}</span>
                  </div>
                  {(t.progress > 0 || t.due_date) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                      {t.progress > 0 && (
                        <div style={{ flex: 1, height: 4, borderRadius: 999, background: 'var(--outline-variant)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(100, t.progress)}%`, background: t.progress >= 100 ? '#16a34a' : 'var(--primary)' }} />
                        </div>
                      )}
                      {t.due_date && <span style={{ fontSize: 10.5, color: 'var(--text-muted)', flexShrink: 0 }}>{fmtDate(t.due_date)}</span>}
                    </div>
                  )}
                </div>
              ))}
              {its.length > 5 && <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>+{its.length - 5} more</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
