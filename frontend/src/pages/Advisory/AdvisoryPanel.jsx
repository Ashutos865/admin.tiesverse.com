import { useEffect, useState, useCallback } from 'react';
import { useMe } from '../../context/MeContext';
import {
  getAdvisoryTaskOversight, getAdvisoryDailyUpdates,
  getWeeklyUpdates, submitWeeklyUpdate,
} from '../../apiClient';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const fmtDT = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const dept = (arr) => (Array.isArray(arr) ? arr.join(', ') : (arr || ''));

export default function AdvisoryPanel() {
  const { isAdvisory, isLead } = useMe();
  const [tab, setTab] = useState(isAdvisory ? 'tasks' : 'weekly');
  const [tasks, setTasks] = useState([]);
  const [daily, setDaily] = useState([]);
  const [weekly, setWeekly] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    if (isAdvisory) {
      const [t, d, w] = await Promise.all([
        getAdvisoryTaskOversight().catch(() => ({ tasks: [] })),
        getAdvisoryDailyUpdates().catch(() => ({ updates: [] })),
        getWeeklyUpdates().catch(() => ({ updates: [] })),
      ]);
      setTasks(t?.tasks || []);
      setDaily(d?.updates || []);
      setWeekly(w?.updates || []);
    } else {
      const w = await getWeeklyUpdates().catch(() => ({ updates: [] }));
      setWeekly(w?.updates || []);
    }
    setLoading(false);
  }, [isAdvisory]);

  useEffect(() => { load(); }, [load]);

  const tabs = isAdvisory
    ? [['tasks', 'Completed Tasks'], ['daily', 'Daily Updates'], ['weekly', 'Weekly Updates']]
    : [['weekly', 'Weekly Update']];

  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <h1 style={S.title}>Advisory</h1>
        <p style={S.sub}>
          {isAdvisory
            ? 'Org-wide oversight: what was completed, what people did each day, and weekly team updates.'
            : 'Submit your weekly update to Advisory and review your past submissions.'}
        </p>
      </div>

      <div style={S.tabs}>
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ ...S.tab, ...(tab === k ? S.tabOn : {}) }}>{label}</button>
        ))}
        <button onClick={load} style={S.refresh} title="Refresh">↻</button>
      </div>

      {loading && <div style={S.muted}>Loading…</div>}

      {tab === 'tasks' && isAdvisory && (
        <div style={S.card}>
          {tasks.length === 0 ? <div style={S.empty}>No completed tasks yet.</div> : (
            <table style={S.table}>
              <thead><tr>
                {['Task', 'Team Lead', 'Completed by', 'Department', 'Completed', 'Note'].map(h => <th key={h} style={S.th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {tasks.map(t => (
                  <tr key={t.id}>
                    <td style={S.td}><strong>{t.title}</strong>{t.description ? <div style={S.dim}>{t.description}</div> : null}</td>
                    <td style={S.td}>{t.team_lead || '—'}</td>
                    <td style={S.td}>{t.completer || '—'}</td>
                    <td style={S.td}>{dept(t.department)}</td>
                    <td style={S.td}>{fmtDT(t.completed_at)}</td>
                    <td style={S.td}>{t.completion_note || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'daily' && isAdvisory && (
        <div style={S.card}>
          {daily.length === 0 ? <div style={S.empty}>No daily check-out updates yet.</div> : (
            <div style={S.feed}>
              {daily.map(u => (
                <div key={u.id} style={S.feedItem}>
                  <div style={S.feedTop}><strong>{u.member}</strong><span style={S.dim}>{dept(u.department)} · {fmt(u.date)}</span></div>
                  <div style={S.feedBody}>{u.work_report}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'weekly' && (
        <WeeklyTab isAdvisory={isAdvisory} isLead={isLead} weekly={weekly} reload={load} />
      )}
    </div>
  );
}

function WeeklyTab({ isAdvisory, isLead, weekly, reload }) {
  const [form, setForm] = useState({ week_ending: '', summary: '', wins: '', blockers: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const submit = async () => {
    if (!form.week_ending || !form.summary.trim()) { setMsg('Week-ending date and summary are required.'); return; }
    setSaving(true); setMsg('');
    const res = await submitWeeklyUpdate(form).catch(() => ({ error: 'Failed' }));
    setSaving(false);
    if (res && res.id) {
      setMsg('Weekly update submitted ✓');
      setForm({ week_ending: '', summary: '', wins: '', blockers: '' });
      reload();
    } else {
      setMsg((res && (res.detail || res.error)) || 'Could not submit.');
    }
  };

  return (
    <div>
      {(isLead || isAdvisory) && (
        <div style={S.card}>
          <div style={S.formTitle}>Submit a weekly update</div>
          <div style={S.formGrid}>
            <label style={S.lbl}>Week ending
              <input type="date" value={form.week_ending} onChange={e => setForm({ ...form, week_ending: e.target.value })} style={S.input} />
            </label>
            <label style={S.lbl}>Summary — what the team did
              <textarea value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} style={S.area} rows={3} />
            </label>
            <label style={S.lbl}>Key wins
              <textarea value={form.wins} onChange={e => setForm({ ...form, wins: e.target.value })} style={S.area} rows={2} />
            </label>
            <label style={S.lbl}>Blockers / needs attention
              <textarea value={form.blockers} onChange={e => setForm({ ...form, blockers: e.target.value })} style={S.area} rows={2} />
            </label>
          </div>
          <div style={S.formFoot}>
            {msg && <span style={S.msg}>{msg}</span>}
            <button onClick={submit} disabled={saving} style={S.btn}>{saving ? 'Submitting…' : 'Submit to Advisory'}</button>
          </div>
        </div>
      )}

      <div style={S.card}>
        <div style={S.formTitle}>{isAdvisory ? 'All weekly updates' : 'Your submissions'}</div>
        {weekly.length === 0 ? <div style={S.empty}>No weekly updates yet.</div> : (
          <div style={S.feed}>
            {weekly.map(w => (
              <div key={w.id} style={S.feedItem}>
                <div style={S.feedTop}><strong>{w.team_lead}</strong><span style={S.dim}>{dept(w.department)} · week of {fmt(w.week_ending)}</span></div>
                <div style={S.feedBody}>{w.summary}</div>
                {w.wins ? <div style={S.tagRow}><b style={S.win}>Wins:</b> {w.wins}</div> : null}
                {w.blockers ? <div style={S.tagRow}><b style={S.blk}>Blockers:</b> {w.blockers}</div> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const S = {
  wrap: { padding: 24, maxWidth: 1100, margin: '0 auto' },
  head: { marginBottom: 18 },
  title: { fontSize: 24, fontWeight: 800, margin: 0, color: 'var(--text, #111827)' },
  sub: { color: 'var(--text-muted, #6b7280)', fontSize: 14, marginTop: 4 },
  tabs: { display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' },
  tab: { padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border,#e5e7eb)', background: 'transparent', cursor: 'pointer', fontWeight: 600, fontSize: 14, color: 'var(--text-muted,#6b7280)' },
  tabOn: { background: '#fe7a00', color: '#fff', borderColor: '#fe7a00' },
  refresh: { marginLeft: 'auto', width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border,#e5e7eb)', background: 'transparent', cursor: 'pointer', fontSize: 16 },
  card: { background: 'var(--card,#fff)', border: '1px solid var(--border,#e5e7eb)', borderRadius: 12, padding: 16, marginBottom: 16 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid var(--border,#e5e7eb)', color: 'var(--text-muted,#6b7280)', fontWeight: 700, whiteSpace: 'nowrap' },
  td: { padding: '10px', borderBottom: '1px solid var(--border,#f3f4f6)', verticalAlign: 'top', color: 'var(--text,#111827)' },
  dim: { color: 'var(--text-muted,#9ca3af)', fontSize: 12, marginTop: 2 },
  empty: { color: 'var(--text-muted,#9ca3af)', padding: '20px 8px', textAlign: 'center' },
  muted: { color: 'var(--text-muted,#9ca3af)', fontSize: 13, margin: '8px 0' },
  feed: { display: 'flex', flexDirection: 'column', gap: 10 },
  feedItem: { border: '1px solid var(--border,#eef0f3)', borderRadius: 10, padding: 12 },
  feedTop: { display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6, flexWrap: 'wrap' },
  feedBody: { fontSize: 14, color: 'var(--text,#374151)', whiteSpace: 'pre-wrap' },
  tagRow: { fontSize: 13, marginTop: 6, color: 'var(--text,#374151)' },
  win: { color: '#059669' }, blk: { color: '#dc2626' },
  formTitle: { fontWeight: 700, fontSize: 15, marginBottom: 12, color: 'var(--text,#111827)' },
  formGrid: { display: 'flex', flexDirection: 'column', gap: 12 },
  lbl: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600, color: 'var(--text-muted,#6b7280)' },
  input: { padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border,#e5e7eb)', fontSize: 14 },
  area: { padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border,#e5e7eb)', fontSize: 14, fontFamily: 'inherit', resize: 'vertical' },
  formFoot: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 14 },
  msg: { fontSize: 13, color: 'var(--text-muted,#6b7280)' },
  btn: { padding: '10px 20px', borderRadius: 8, border: 'none', background: '#fe7a00', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
};
