import { useEffect, useState } from 'react';
import { Trophy, Award, Star } from 'lucide-react';
import { getLeaderboard, getMyLearning } from '../../apiClient';
import './Learn.css';

/* Gamification: members earn points for completing lessons, passing quizzes, and
   earning certificates (computed server-side in /api/learn/leaderboard). */
export default function LearnLeaderboard() {
  const [rows, setRows] = useState([]);
  const [me, setMe] = useState({ points: 0, rank: null, badges: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getLeaderboard(), getMyLearning()]).then(([lb, m]) => {
      setRows(Array.isArray(lb) ? lb : []);
      if (m && !m.error) setMe(m);
    }).finally(() => setLoading(false));
  }, []);

  const medal = (rank) => (rank <= 3 ? ['\u{1F947}', '\u{1F948}', '\u{1F949}'][rank - 1] : rank);

  return (
    <div className="learn-page">
      <header className="learn-heading">
        <div>
          <span className="learn-eyebrow">Gamified learning</span>
          <h1>Leaderboard</h1>
          <p>Points come from completed lessons, passed quizzes, and earned certificates. Keep learning to climb.</p>
        </div>
      </header>

      <section className="learn-metric-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
        <article className="learn-metric-card"><div className="learn-metric-topline"><span className="learn-metric-icon"><Star size={21} /></span></div><p>My points</p><strong>{me.points || 0}</strong></article>
        <article className="learn-metric-card"><div className="learn-metric-topline"><span className="learn-metric-icon"><Trophy size={21} /></span></div><p>My rank</p><strong>{me.rank ? `#${me.rank}` : '--'}</strong></article>
        <article className="learn-metric-card"><div className="learn-metric-topline"><span className="learn-metric-icon"><Award size={21} /></span></div><p>Badges earned</p><strong>{(me.badges || []).filter((b) => b.earned).length}</strong></article>
      </section>

      {(me.badges || []).length > 0 && (
        <div className="learn-panel">
          <div className="learn-panel-heading"><div><h2>Badges</h2><p>Milestones you unlock as you progress</p></div></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {me.badges.map((b) => (
              <span key={b.key} className={`learn-status ${b.earned ? 'is-done' : 'is-locked'}`} style={{ padding: '8px 14px', fontSize: 12 }}>{b.earned ? '★ ' : '○ '}{b.name}</span>
            ))}
          </div>
        </div>
      )}

      <div className="learn-panel" style={{ padding: 0 }}>
        <div className="learn-table-wrap">
          <table className="learn-table">
            <thead><tr><th style={{ width: 60 }}>Rank</th><th>Member</th><th style={{ textAlign: 'right' }}>Points</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={3}><div className="learn-state"><Trophy size={34} /><strong>Loading leaderboard</strong></div></td></tr>
                : rows.length ? rows.map((r) => (
                  <tr key={r.id} style={r.is_me ? { background: 'color-mix(in srgb, var(--primary) 8%, transparent)' } : undefined}>
                    <td style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 800, fontSize: 15 }}>{medal(r.rank)}</td>
                    <td><div className="learn-cell-title"><span className="learn-avatar">{r.name.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase()}</span><strong>{r.name}{r.is_me ? ' (You)' : ''}</strong></div></td>
                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: 'var(--primary)' }}>{r.points}</td>
                  </tr>
                )) : <tr><td colSpan={3}><div className="learn-state"><Trophy size={34} /><strong>No points yet</strong><span>Complete a lesson to get on the board.</span></div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
