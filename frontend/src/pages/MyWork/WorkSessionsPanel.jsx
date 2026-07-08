import { useState, useEffect, useCallback, useRef } from 'react';
import { getActiveSession, workCheckIn, workCheckOut, getWorkSessions, getTasks } from '../../apiClient';
import { Play, Square, Clock, CheckCircle2, Loader2, ListChecks } from 'lucide-react';

const field = { padding: '9px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--outline-variant)', color: 'var(--text-main)', fontSize: 14, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
const btn = (bg, fg) => ({ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 9, border: bg ? 'none' : '1px solid var(--outline-variant)', background: bg || 'var(--surface-container-low)', color: fg || 'var(--text-main)', cursor: 'pointer', fontSize: 14, fontWeight: 700 });
const panel = { background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 14, padding: 18 };

const fmtDur = (mins) => { const h = Math.floor(mins / 60), m = mins % 60; return h ? `${h}h ${m}m` : `${m}m`; };
const fmtClock = (secs) => { const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; };
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
const fmtTime = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

export default function WorkSessionsPanel({ memberId, showToast }) {
  const [active, setActive] = useState(null);       // open session or null
  const [tasks, setTasks] = useState([]);
  const [selTask, setSelTask] = useState('');
  const [sessions, setSessions] = useState([]);
  const [daily, setDaily] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [note, setNote] = useState('');
  const [completeTask, setCompleteTask] = useState(false);
  const tick = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, t, s] = await Promise.all([
        getActiveSession(memberId),
        getTasks({ member: memberId }),
        getWorkSessions({ member: memberId }),
      ]);
      setActive(a && a.id ? a : null);
      const list = Array.isArray(t) ? t : (t?.results || []);
      setTasks(list.filter((x) => x.status !== 'done' && x.status !== 'cancelled'));
      setSessions(s?.sessions || []);
      setDaily(s?.daily || []);
    } catch (e) { showToast?.(e.message || 'Failed to load', true); }
    setLoading(false);
  }, [memberId, showToast]);
  useEffect(() => { load(); }, [load]);

  // live timer while a session is open
  useEffect(() => {
    if (active?.check_in) {
      const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - new Date(active.check_in).getTime()) / 1000)));
      update();
      tick.current = setInterval(update, 1000);
      return () => clearInterval(tick.current);
    }
    setElapsed(0);
  }, [active]);

  const doCheckIn = async () => {
    setBusy(true);
    try {
      const r = await workCheckIn(selTask ? { task: selTask } : {});
      if (r?.id) { setActive(r); setSelTask(''); showToast?.('Checked in.'); load(); }
      else showToast?.(r?.error || 'Could not check in', true);
    } catch (e) { showToast?.(e.message, true); }
    setBusy(false);
  };
  const doCheckOut = async () => {
    setBusy(true);
    try {
      const r = await workCheckOut({ note, complete_task: completeTask });
      if (r?.id) { setActive(null); setCheckoutOpen(false); setNote(''); setCompleteTask(false); showToast?.('Checked out.'); load(); }
      else showToast?.(r?.error || 'Could not check out', true);
    } catch (e) { showToast?.(e.message, true); }
    setBusy(false);
  };

  const todayKey = new Date().toISOString().slice(0, 10);
  const todaySessions = sessions.filter((s) => s.date === todayKey);
  const todayMins = todaySessions.reduce((a, s) => a + (s.duration_minutes || 0), 0);

  if (loading) return <div style={{ color: 'var(--text-muted)', padding: 20, display: 'flex', gap: 8 }}><Loader2 size={18} className="ma-spin" /> Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Live session / check-in */}
      <div style={{ ...panel, borderTop: `4px solid ${active ? '#16a34a' : 'var(--primary)'}` }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8 }}><Clock size={18} /> Work session</h3>
        {active ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 34, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#16a34a', letterSpacing: '.02em' }}>{fmtClock(elapsed)}</span>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>since {fmtTime(active.check_in)}</span>
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--text-main)', margin: '8px 0 14px' }}>
              {active.task_title ? <>Working on: <strong>{active.task_title}</strong></> : <span style={{ color: 'var(--text-muted)' }}>No task selected</span>}
            </div>
            {!checkoutOpen ? (
              <button onClick={() => { setCompleteTask(false); setCheckoutOpen(true); }} style={btn('#dc2626', '#fff')}><Square size={16} /> Check out</button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 460 }}>
                <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you do this session? (optional)" style={{ ...field, resize: 'vertical' }} />
                {active.task && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--text-main)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={completeTask} onChange={(e) => setCompleteTask(e.target.checked)} />
                    <CheckCircle2 size={15} style={{ color: '#16a34a' }} /> Mark <strong>{active.task_title}</strong> as completed
                  </label>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={doCheckOut} disabled={busy} style={btn('#dc2626', '#fff')}>{busy ? <Loader2 size={15} className="ma-spin" /> : <Square size={15} />} Confirm check out</button>
                  <button onClick={() => setCheckoutOpen(false)} style={btn()}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={selTask} onChange={(e) => setSelTask(e.target.value)} style={{ ...field, width: 'auto', minWidth: 220 }}>
              <option value="">— Start without a task —</option>
              {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}{t.estimated_hours ? ` (${t.actual_hours || 0}/${t.estimated_hours}h)` : ''}</option>)}
            </select>
            <button onClick={doCheckIn} disabled={busy} style={btn('#16a34a', '#fff')}>{busy ? <Loader2 size={15} className="ma-spin" /> : <Play size={16} />} Check in &amp; start</button>
          </div>
        )}
      </div>

      {/* Today */}
      <div style={panel}>
        <h3 style={{ margin: '0 0 10px', fontSize: 15, color: 'var(--text-main)' }}>Today · {todaySessions.length} session{todaySessions.length === 1 ? '' : 's'} · <span style={{ color: 'var(--primary)' }}>{fmtDur(todayMins)}</span></h3>
        {todaySessions.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>No sessions yet today.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {todaySessions.map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--outline-variant)' }}>
                <span style={{ color: 'var(--text-muted)', minWidth: 120 }}>{fmtTime(s.check_in)} → {s.check_out ? fmtTime(s.check_out) : <em style={{ color: '#16a34a' }}>ongoing</em>}</span>
                <span style={{ flex: 1, color: 'var(--text-main)' }}>{s.task_title || '—'}{s.completed_task && <CheckCircle2 size={12} style={{ color: '#16a34a', marginLeft: 6, verticalAlign: -1 }} />}</span>
                <strong style={{ color: 'var(--text-main)' }}>{fmtDur(s.duration_minutes)}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History (per-date rollup) */}
      <div style={panel}>
        <h3 style={{ margin: '0 0 10px', fontSize: 15, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8 }}><ListChecks size={16} /> By day</h3>
        {daily.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>No work sessions logged yet.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {daily.map((d) => (
              <div key={d.date} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '6px 0', borderBottom: '1px solid var(--outline-variant)' }}>
                <span style={{ color: 'var(--text-main)' }}>{fmtDate(d.date)}</span>
                <span style={{ color: 'var(--text-muted)' }}>{d.sessions} session{d.sessions === 1 ? '' : 's'} · <strong style={{ color: 'var(--text-main)' }}>{fmtDur(d.minutes)}</strong></span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
