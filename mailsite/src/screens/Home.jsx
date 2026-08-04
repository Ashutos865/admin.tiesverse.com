import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Inbox, PenSquare, Send, Sparkles, Users } from 'lucide-react';
import { listMessages } from '../api/mail.js';
import { Avatar, EmptyState, ListSkeleton, useDelayedFlag } from '../components/common.jsx';
import { nameOf, shortDate } from '../lib/format.js';

/* The dashboard from the design. Everything shown is real mail data.
 *
 * Tasks, the calendar and SLA are part of the design but not yet connected to
 * anything, so they say so plainly instead of displaying invented figures — a
 * dashboard that lies is worse than one that admits a gap.
 */
export default function Home({ me, counts, onCompose }) {
  const navigate = useNavigate();
  const boxes = me?.mailboxes || [];
  const primary = boxes.find((b) => b.kind !== 'SHARED') || boxes[0];
  const [unread, setUnread] = useState(null);
  const [loading, setLoading] = useState(true);
  const showSkeleton = useDelayedFlag(loading);

  useEffect(() => {
    let alive = true;
    if (!primary) { setLoading(false); return undefined; }
    setLoading(true);
    listMessages({ mailbox: primary.id, folder: 'inbox', filter: 'unread' }).then((res) => {
      if (!alive) return;
      setUnread(res.error ? [] : (res.messages || []));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [primary?.id]);

  const totals = useMemo(() => {
    const all = counts?.mailboxes || {};
    const sum = (k) => Object.values(all).reduce((n, m) => n + (m[k] || 0), 0);
    return {
      unread: counts?.total_unread || 0,
      scheduled: sum('scheduled'),
      drafts: sum('drafts'),
      sentToday: sum('sent_today'),
    };
  }, [counts]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = (me?.user?.name || primary?.display_name || '').split(' ')[0] || 'there';

  return (
    <div style={{ overflowY: 'auto', padding: '22px 24px 40px' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-.02em' }}>
            {greeting}, {firstName}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--muted)' }}>
            {totals.unread > 0
              ? `${totals.unread} message${totals.unread === 1 ? '' : 's'} waiting across TIES Mail.`
              : 'Nothing unread — you are all caught up.'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={onCompose}>
          <PenSquare size={15} /> New message
        </button>
      </header>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', marginBottom: 20 }}>
        <StatTile label="Unread" value={totals.unread} caption={`across ${boxes.length} mailbox${boxes.length === 1 ? '' : 'es'}`} />
        <StatTile label="Sent today" value={totals.sentToday} caption="in the last 24 hours" />
        <StatTile label="Scheduled" value={totals.scheduled} caption="waiting to go out" />
        <StatTile label="Drafts" value={totals.drafts} caption="unfinished" />
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)' }}>
        <section className="card">
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line-soft)',
                        display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, flex: 1 }}>Needs your attention</h2>
            {primary && (
              <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/m/${primary.id}/inbox`)}>
                View inbox
              </button>
            )}
          </div>
          {loading ? (showSkeleton ? <ListSkeleton rows={4} /> : <div style={{ height: 200 }} />)
            : !unread?.length ? (
              <EmptyState icon={<Inbox size={26} style={{ color: 'var(--muted-2)' }} />}
                title="You're all caught up">
                Nothing unread right now.
              </EmptyState>
            ) : (
              <ul>
                {unread.slice(0, 6).map((m) => (
                  <li key={m.id}>
                    <button className="msg-row" style={{ borderBottom: '1px solid var(--line-soft)' }}
                      onClick={() => navigate(`/m/${m.mailbox}/inbox/${m.id}`)}>
                      <Avatar name={nameOf(m.peer)} email={m.peer} size={36} />
                      <span className="msg-main">
                        <span className="msg-from">{nameOf(m.peer) || m.peer}</span>
                        <span className="msg-subject truncate">{m.subject || '(no subject)'}</span>
                        <span className="msg-snippet truncate">{m.snippet}</span>
                      </span>
                      <span className="msg-side"><span className="msg-time">{shortDate(m.created_at)}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </section>

        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <section className="card" style={{ padding: 16 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>Your mailboxes</h2>
            <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
              {boxes.map((b) => {
                const c = counts?.mailboxes?.[String(b.id)] || {};
                const cap = b.daily_send_limit || 200;
                const used = Math.min(100, Math.round(((c.sent_today || 0) / cap) * 100));
                return (
                  <button key={b.id} onClick={() => navigate(`/m/${b.id}/inbox`)}
                    style={{ display: 'grid', gap: 6, textAlign: 'left' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {b.kind === 'SHARED' ? <Users size={14} style={{ color: 'var(--muted)' }} />
                        : <Inbox size={14} style={{ color: 'var(--muted)' }} />}
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }} className="truncate">
                        {b.display_name || b.address.split('@')[0]}
                      </span>
                      <span style={{ fontSize: 12, color: c.inbox_unread ? 'var(--accent)' : 'var(--muted-2)',
                                     fontWeight: 600 }}>
                        {c.inbox_unread || 0} unread
                      </span>
                    </span>
                    <span style={{ height: 4, borderRadius: 2, background: 'var(--line-soft)', display: 'block' }}>
                      <span style={{ display: 'block', height: '100%', width: `${used}%`,
                                     borderRadius: 2, background: 'var(--accent)' }} />
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>
                      {c.sent_today || 0} of {cap} sent today
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Designed, not yet connected. Said out loud rather than filled with
              numbers that would look real. */}
          <section className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <CalendarDays size={15} style={{ color: 'var(--muted)' }} />
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, flex: 1 }}>Today</h2>
              <span className="chip chip-default">Not connected yet</span>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>
              Tasks, meetings and SLA health will appear here once they are wired
              to the task tracker and calendar.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, caption }) {
  return (
    <div className="card stat-tile">
      <span className="eyebrow">{label}</span>
      <span className="stat-value">{value}</span>
      <span className="stat-caption">{caption}</span>
    </div>
  );
}
