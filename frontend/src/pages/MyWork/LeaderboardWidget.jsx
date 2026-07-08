import { useState, useEffect } from 'react';
import { getWorkLeaderboard } from '../../apiClient';
import { Trophy, AlertTriangle, Loader2, Plane } from 'lucide-react';

const panel = { background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 14, padding: 18 };
const fmtDay = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

// This week's hours leaderboard — worst (fewest hours) first, to nudge the team.
export default function LeaderboardWidget() {
  const [data, setData] = useState(null);
  useEffect(() => { getWorkLeaderboard().then(setData).catch(() => setData({ leaderboard: [] })); }, []);

  if (!data) return <div style={{ ...panel, color: 'var(--text-muted)', display: 'flex', gap: 8 }}><Loader2 size={16} className="ma-spin" /> Loading leaderboard…</div>;
  const rows = data.leaderboard || [];
  const maxH = Math.max(1, ...rows.map((r) => r.hours));

  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8 }}><Trophy size={18} style={{ color: '#f59e0b' }} /> Hours this week</h3>
        {data.week_start && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDay(data.week_start)} – {fmtDay(data.week_end)}</span>}
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)' }}>Sorted least-worked first — leave days don’t count.</p>
      {rows.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No hours logged yet this week.</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {rows.map((r, i) => {
            const worst = i === 0 && r.hours < maxH;
            return (
              <div key={r.member} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 9, background: worst ? '#fef2f2' : 'var(--surface)', border: `1px solid ${worst ? '#fecaca' : 'var(--outline-variant)'}` }}>
                <span style={{ width: 22, textAlign: 'center', fontSize: 12.5, fontWeight: 800, color: worst ? '#dc2626' : 'var(--text-muted)' }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {r.name}
                    {worst && <span style={{ fontSize: 10, fontWeight: 800, color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: 3 }}><AlertTriangle size={11} /> needs to pick up</span>}
                    {r.on_leave_days > 0 && <span title={`${r.on_leave_days} leave day(s)`} style={{ fontSize: 10.5, color: '#2563eb', display: 'inline-flex', alignItems: 'center', gap: 2 }}><Plane size={11} /> {r.on_leave_days}d</span>}
                  </div>
                  <div style={{ height: 5, borderRadius: 5, background: 'var(--outline-variant)', overflow: 'hidden', marginTop: 4 }}>
                    <div style={{ width: `${(r.hours / maxH) * 100}%`, height: '100%', background: worst ? '#dc2626' : 'var(--primary)' }} />
                  </div>
                </div>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-main)', minWidth: 46, textAlign: 'right' }}>{r.hours}h</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
