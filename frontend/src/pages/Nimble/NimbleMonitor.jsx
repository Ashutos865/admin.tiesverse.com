import { useEffect, useState, useCallback } from 'react';
import {
  Radar, RefreshCw, Plus, Trash2, Download, ArrowRight, ArrowLeft,
  AlertTriangle, CheckCircle2, PauseCircle, PlayCircle, ExternalLink, Play,
} from 'lucide-react';
import {
  getMonitorState, addMonitorChannel, toggleMonitorChannel, deleteMonitorChannel,
  patchMonitorAlert, addMonitorOwnPost, deleteMonitorOwnPost, pollMonitorNow,
  monitorCsvUrl, getApiToken,
} from '../../apiClient';

const wrap = { padding: '28px 32px', maxWidth: 1180 };
const card = { border: '1px solid var(--outline-variant)', borderRadius: 12, padding: 16, background: 'var(--surface-container-lowest)' };
const btn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)', color: 'var(--text-main)', fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const btnPrimary = { ...btn, background: 'var(--primary)', color: '#fff', border: 'none' };
const input = { padding: '9px 12px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-lowest)', color: 'var(--text-main)', fontSize: 13, width: '100%' };
const label = { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4, display: 'block' };

function Stat({ label: l, value, color }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 26, fontWeight: 900, color: color || 'var(--text-main)', fontFamily: 'Hanken Grotesk, sans-serif' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{l}</div>
    </div>
  );
}

function fmtDate(v) {
  if (!v) return '';
  try { return new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  catch { return v; }
}

export default function NimbleMonitor() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [msg, setMsg] = useState(null);   // {type, text}
  const [form, setForm] = useState({ name: '', source_handle: '', kind: 'COMPETITOR', priority: 3 });
  const [ownTitle, setOwnTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 4000); };

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getMonitorState();
    if (data && !data.error) setState(data);
    else flash('error', data?.error || 'Failed to load monitor.');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onAddChannel = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.source_handle.trim()) { flash('error', 'Name and YouTube channel ID are required.'); return; }
    setBusy(true);
    const res = await addMonitorChannel({ ...form, source: 'youtube', priority: Number(form.priority) });
    setBusy(false);
    if (res && !res.error && !res.detail) {
      setForm({ name: '', source_handle: '', kind: 'COMPETITOR', priority: 3 });
      flash('ok', 'Channel added.');
      load();
    } else {
      flash('error', res?.source_handle || res?.error || res?.detail || 'Could not add channel.');
    }
  };

  const onToggle = async (ch) => { await toggleMonitorChannel(ch.id, !ch.active); load(); };
  const onDeleteChannel = async (ch) => {
    if (!window.confirm(`Remove "${ch.name}" and its alerts?`)) return;
    await deleteMonitorChannel(ch.id); flash('ok', 'Channel removed.'); load();
  };

  const onMoveAlert = async (alert, status) => { await patchMonitorAlert(alert.id, { status, unread: false }); load(); };

  const onCheckNow = async () => {
    setPolling(true);
    const res = await pollMonitorNow();
    setPolling(false);
    if (res && !res.error) {
      flash('ok', `Checked ${res.checked} channel(s): ${res.new_alerts} new alert(s).`);
      load();
    } else flash('error', res?.error || 'Check failed.');
  };

  const onAddOwn = async (e) => {
    e.preventDefault();
    if (!ownTitle.trim()) return;
    const res = await addMonitorOwnPost({ title: ownTitle.trim(), source: 'youtube' });
    if (res && !res.error) { setOwnTitle(''); flash('ok', 'Own post logged.'); load(); }
    else flash('error', res?.error || 'Could not log own post.');
  };

  const onExportCsv = async () => {
    // authenticated download: fetch with bearer, then save the blob
    try {
      const res = await fetch(monitorCsvUrl(), { headers: { Authorization: `Bearer ${getApiToken()}` } });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'nimble-monitor-export.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch { flash('error', 'Export failed.'); }
  };

  if (loading) return <div style={wrap}><div style={{ color: 'var(--text-muted)' }}>Loading Nimble Monitor…</div></div>;

  const channels = state?.channels || [];
  const alerts = state?.alerts || [];
  const ownPosts = state?.ownPosts || [];
  const report = state?.report || {};
  // Competitor alerts only on the board (exclude our own-channel detections).
  const compAlerts = alerts.filter((a) => a.channel_kind !== 'OWN');
  const openAlerts = compAlerts.filter((a) => a.status === 'OPEN');
  const workingAlerts = compAlerts.filter((a) => a.status === 'WORKING');

  return (
    <div style={wrap}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Radar size={24} color="var(--primary)" />
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-main)' }}>Nimble Monitor</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Competitor YouTube tracker & response board</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btn} onClick={onExportCsv}><Download size={15} /> CSV</button>
          <button style={btnPrimary} onClick={onCheckNow} disabled={polling}>
            <RefreshCw size={15} className={polling ? 'spin' : ''} /> {polling ? 'Checking…' : 'Check now'}
          </button>
        </div>
      </div>

      {msg && (
        <div style={{ margin: '10px 0', padding: '9px 13px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: msg.type === 'ok' ? 'rgba(6,122,80,.12)' : 'rgba(185,28,28,.12)',
          color: msg.type === 'ok' ? '#067a50' : '#b91c1c' }}>{msg.text}</div>
      )}

      {/* report stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, margin: '16px 0' }}>
        <Stat label="Competitor posts (7d)" value={report.competitorPosts ?? 0} />
        <Stat label="Actions taken" value={report.actionsTaken ?? 0} color="#067a50" />
        <Stat label="Missed signals" value={report.missedSignals ?? 0} color="#b91c1c" />
        <Stat label="Our posts (7d)" value={report.ownPosts ?? 0} />
        <Stat label="Action rate" value={`${report.actionRate ?? 0}%`} color={report.actionRate >= 50 ? '#067a50' : '#b45309'} />
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 20 }}>
        Status: <b style={{ color: 'var(--text-main)' }}>{report.performance || '—'}</b> · target action rate {report.targetActionRate ?? 50}%
      </div>

      {/* alert board */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <AlertColumn title="They have posted" icon={<AlertTriangle size={15} color="#b45309" />} alerts={openAlerts}
          action={(a) => <button style={{ ...btn, padding: '5px 10px', fontSize: 12 }} onClick={() => onMoveAlert(a, 'WORKING')}>We're posting <ArrowRight size={13} /></button>} />
        <AlertColumn title="We're posting" icon={<CheckCircle2 size={15} color="#067a50" />} alerts={workingAlerts}
          action={(a) => <button style={{ ...btn, padding: '5px 10px', fontSize: 12 }} onClick={() => onMoveAlert(a, 'OPEN')}><ArrowLeft size={13} /> Back</button>} />
      </div>

      {/* channels + add form */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, alignItems: 'start' }}>
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12, color: 'var(--text-main)' }}>Tracked channels ({channels.length})</div>
          {channels.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>No channels yet — add a YouTube channel ID (UC…) on the right.</div>
          ) : channels.map((ch) => (
            <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--surface-container-low)' }}>
              <Play size={16} color="#ff0000" fill="#ff0000" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {ch.name}
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 5, background: ch.kind === 'OWN' ? 'rgba(6,122,80,.14)' : 'var(--surface-container-low)', color: ch.kind === 'OWN' ? '#067a50' : 'var(--text-muted)' }}>{ch.kind}</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ch.source_handle}{ch.last_error ? ` · ⚠ ${ch.last_error}` : ch.last_checked ? ` · checked ${fmtDate(ch.last_checked)}` : ' · not checked yet'}
                </div>
              </div>
              <button title={ch.active ? 'Pause' : 'Resume'} style={{ ...btn, padding: 6 }} onClick={() => onToggle(ch)}>
                {ch.active ? <PauseCircle size={15} /> : <PlayCircle size={15} color="#067a50" />}
              </button>
              <button title="Remove" style={{ ...btn, padding: 6, color: '#b91c1c' }} onClick={() => onDeleteChannel(ch)}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <form style={card} onSubmit={onAddChannel}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12, color: 'var(--text-main)' }}>Add a YouTube channel</div>
            <div style={{ marginBottom: 10 }}>
              <span style={label}>Display name</span>
              <input style={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Competitor News" />
            </div>
            <div style={{ marginBottom: 10 }}>
              <span style={label}>YouTube channel ID (UC…)</span>
              <input style={input} value={form.source_handle} onChange={(e) => setForm({ ...form, source_handle: e.target.value })} placeholder="UCxxxxxxxxxxxxxxxxxxxxxx or channel URL" />
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <span style={label}>Type</span>
                <select style={input} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  <option value="COMPETITOR">Competitor</option>
                  <option value="OWN">Our own</option>
                </select>
              </div>
              <div style={{ width: 90 }}>
                <span style={label}>Priority</span>
                <select style={input} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <button type="submit" style={{ ...btnPrimary, width: '100%', justifyContent: 'center' }} disabled={busy}>
              <Plus size={15} /> {busy ? 'Adding…' : 'Add channel'}
            </button>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              Tip: find the UC… ID via a channel's “Share → Copy channel ID”, or paste the channel URL.
            </div>
          </form>

          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10, color: 'var(--text-main)' }}>Log our own post</div>
            <form onSubmit={onAddOwn} style={{ display: 'flex', gap: 8 }}>
              <input style={input} value={ownTitle} onChange={(e) => setOwnTitle(e.target.value)} placeholder="Title of the post we published" />
              <button type="submit" style={btnPrimary}><Plus size={15} /></button>
            </form>
            {ownPosts.length > 0 && (
              <div style={{ marginTop: 12 }}>
                {ownPosts.slice(0, 6).map((p) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 12.5, color: 'var(--text-main)' }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtDate(p.published_at)}</span>
                    <button style={{ ...btn, padding: 4, color: '#b91c1c' }} onClick={() => deleteMonitorOwnPost(p.id).then(load)}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`.spin{animation:nm-spin 1s linear infinite}@keyframes nm-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function AlertColumn({ title, icon, alerts, action }) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {icon}
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-main)' }}>{title}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginLeft: 'auto' }}>{alerts.length}</span>
      </div>
      {alerts.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', padding: '8px 0' }}>Nothing here.</div>
      ) : alerts.map((a) => (
        <div key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--surface-container-low)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)', marginBottom: 3 }}>{a.title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text-muted)' }}>
            <span>{a.channel_name}</span>
            <span>·</span>
            <span>{fmtDate(a.published_at)}</span>
            {a.url && <a href={a.url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: 2 }}>open <ExternalLink size={11} /></a>}
            <span style={{ marginLeft: 'auto' }}>{action(a)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
