import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  Download,
  MailCheck,
  MailX,
  Pencil,
  RefreshCw,
  Search,
  Users,
  Wallet,
} from 'lucide-react';
import {
  getWebinarMasterSheet,
  getWebinarSourceAnalytics,
  fixMailContactEmail,
  setMailContactStatus,
  syncWebinarPayments,
} from '../../apiClient';
import './MasterSheet.css';

const rupees = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN')}`;

const formatDate = (value) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(parsed);
};

// Common typos seen in the imported list. Only ever used to pre-fill the edit
// box — a suggestion for a human to confirm, never applied on its own.
const DOMAIN_FIXES = [
  [/@gmail\.con$/i, '@gmail.com'],
  [/@gmai\.com$/i, '@gmail.com'],
  [/@gmial\.com$/i, '@gmail.com'],
  [/@gmail\.co$/i, '@gmail.com'],
  [/@gmail\.cm$/i, '@gmail.com'],
  [/@gmil\.com$/i, '@gmail.com'],
  [/@yahoo\.co$/i, '@yahoo.com'],
  [/@hotmail\.co$/i, '@hotmail.com'],
  [/@outlok\.com$/i, '@outlook.com'],
];

const suggestFix = (email) => {
  for (const [pattern, replacement] of DOMAIN_FIXES) {
    if (pattern.test(email)) return email.replace(pattern, replacement);
  }
  return email;
};

const STATUS_TONE = {
  paid: 'success',
  free: 'success',
  refunded: 'muted',
  pending: 'warning',
  failed: 'danger',
};

export default function MasterSheet() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ ledger_rows: 0, people: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [expanded, setExpanded] = useState(new Set());
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState('');
  const [sources, setSources] = useState([]);
  const [mailStatus, setMailStatus] = useState('all');
  const [statusCounts, setStatusCounts] = useState({});
  const [busyEmail, setBusyEmail] = useState('');
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState({ pages: 1, count: 0 });
  const [editing, setEditing] = useState('');     // email being corrected
  const [draftEmail, setDraftEmail] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Filtering and search happen on the server so they cover everyone, not
      // just the rows this page happens to be holding.
      const response = await getWebinarMasterSheet({
        page,
        per_page: 100,
        ...(mailStatus !== 'all' ? { mail_status: mailStatus } : {}),
        ...(query.trim() ? { q: query.trim() } : {}),
      });
      if (response?.error) {
        setError(response.error);
        setRows([]);
      } else {
        setRows(Array.isArray(response?.rows) ? response.rows : []);
        setMeta({
          ledger_rows: response?.ledger_rows || 0,
          people: response?.people || 0,
          mailable: response?.mailable || 0,
        });
        setStatusCounts(response?.status_counts || {});
        setPageInfo({
          pages: response?.pages || 1,
          count: response?.count || 0,
        });
      }
    } catch (requestError) {
      setError(requestError.message || 'Unable to load the master sheet.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, mailStatus, query]);

  const loadSources = useCallback(async () => {
    try {
      const response = await getWebinarSourceAnalytics();
      setSources(Array.isArray(response?.sources) ? response.sources : []);
    } catch {
      setSources([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSources(); }, [loadSources]);
  // A search that kept the old page number would show an empty page 7 of 2.
  useEffect(() => { setPage(1); }, [mailStatus, query]);
  // Typing fires a request per keystroke otherwise, and each one re-groups the
  // whole ledger server-side.
  useEffect(() => {
    const t = setTimeout(() => setQuery(queryInput), 350);
    return () => clearTimeout(t);
  }, [queryInput]);

  // Recovering a payment changes what the sheet should show, so reload after.
  const runSync = async () => {
    setSyncing(true);
    setSyncNote('');
    try {
      const result = await syncWebinarPayments(false);
      if (result?.error) {
        setSyncNote(`Could not sync: ${result.error}`);
      } else {
        const found = result?.recovered_count || 0;
        setSyncNote(
          found
            ? `Recovered ${found} payment${found === 1 ? '' : 's'} Razorpay had taken but we had not recorded.`
            : `Checked ${result?.checked || 0} unsettled order${result?.checked === 1 ? '' : 's'} — nothing was missing.`,
        );
        if (found) await load();
      }
    } catch (syncError) {
      setSyncNote(syncError.message || 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  // Optimistic, then reconciled: the row updates at once so the click feels
  // immediate, and a failure puts it back rather than lying about the result.
  const changeMailStatus = async (email, next) => {
    setBusyEmail(email);
    const before = rows;
    setRows((prev) => prev.map((p) => (p.email === email
      ? { ...p, mail_status: next, can_email: next === 'active' } : p)));
    try {
      const res = await setMailContactStatus(email, next);
      if (res?.error) {
        setRows(before);
        setSyncNote(`Could not change ${email}: ${res.error}`);
      } else {
        setStatusCounts((prev) => {
          const was = before.find((p) => p.email === email)?.mail_status || 'active';
          const out = { ...prev };
          out[was] = Math.max(0, (out[was] || 1) - 1);
          out[next] = (out[next] || 0) + 1;
          return out;
        });
        setSyncNote(next === 'active'
          ? `${email} will receive emails again.`
          : `${email} will no longer receive marketing emails.`);
      }
    } catch (err) {
      setRows(before);
      setSyncNote(err.message || 'Could not change that contact.');
    } finally {
      setBusyEmail('');
    }
  };

  const saveEmail = async (oldEmail) => {
    const next = draftEmail.trim().toLowerCase();
    if (!next || next === oldEmail) { setEditing(''); return; }
    setBusyEmail(oldEmail);
    try {
      const res = await fixMailContactEmail(oldEmail, next);
      if (res?.error) {
        setSyncNote(`Could not update: ${res.error}`);
      } else {
        setRows((prev) => prev.map((p) => (p.email === oldEmail
          ? { ...p, email: next, mail_status: 'active', can_email: true }
          : p)));
        setStatusCounts((prev) => ({
          ...prev,
          bounced: Math.max(0, (prev.bounced || 1) - 1),
          active: (prev.active || 0) + 1,
        }));
        setSyncNote(`${oldEmail} corrected to ${next} — they can be emailed again.`);
      }
    } catch (err) {
      setSyncNote(err.message || 'Could not update that address.');
    } finally {
      setBusyEmail('');
      setEditing('');
    }
  };

  const toggle = (email) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const filtered = useMemo(() => rows.filter((person) => {
      // Search and mail-status are applied server-side; only the payment
      // filter is local, because it reads per-event data already in hand.
      if (status !== 'all'
          && !(person.events || []).some((e) => e.status === status)) return false;
    return true;
  }), [rows, status]);

  const totals = useMemo(() => ({
    people: rows.length,
    paid: rows.filter((p) => p.paid_count > 0).length,
    revenue: rows.reduce((sum, p) => sum + (p.total_paid_paise || 0), 0),
    duplicates: Math.max(0, (meta.ledger_rows || 0) - rows.length),
  }), [rows, meta]);

  // Exports everyone, not the page on screen: a file that silently contained
  // 100 of 1,104 people would be worse than no export at all.
  const exportCsv = async () => {
    let all = filtered;
    if (pageInfo.count > rows.length) {
      const res = await getWebinarMasterSheet({
        page: 1,
        per_page: 500,
        ...(mailStatus !== 'all' ? { mail_status: mailStatus } : {}),
        ...(query.trim() ? { q: query.trim() } : {}),
      });
      all = Array.isArray(res?.rows) ? res.rows : filtered;
      let p = 2;
      while (res?.pages && p <= res.pages && p <= 20) {
        const more = await getWebinarMasterSheet({
          page: p,
          per_page: 500,
          ...(mailStatus !== 'all' ? { mail_status: mailStatus } : {}),
          ...(query.trim() ? { q: query.trim() } : {}),
        });
        all = all.concat(Array.isArray(more?.rows) ? more.rows : []);
        p += 1;
      }
    }
    exportRows(all);
  };

  const exportRows = (source) => {
    const head = ['Name', 'Email', 'Phone', 'City', 'Country', 'Webinars',
      'Registrations', 'Paid', 'Total paid', 'Source', 'First seen', 'Last seen'];
    const lines = [head.join(',')];
    source.forEach((p) => {
      lines.push([
        p.name, p.email, p.phone, p.city, p.country,
        (p.events || []).map((e) => e.event_title).join(' | '),
        p.registration_count, p.paid_count,
        (p.total_paid_paise || 0) / 100,
        p.utm_source, formatDate(p.first_seen), formatDate(p.last_seen),
      ].map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `master-sheet-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="ms-page">
      <header className="ms-header">
        <div>
          <h1>Master sheet</h1>
          <p>
            Everyone who has ever registered, one row per person. Someone who
            registered three times appears once, with all three webinars attached.
          </p>
        </div>
        <div className="ms-header-actions">
          <button type="button" className="ms-btn" onClick={exportCsv}
                  disabled={!filtered.length}>
            <Download size={15} /> Export CSV
          </button>
          <button type="button" className="ms-btn" onClick={runSync} disabled={syncing}>
            <Wallet size={15} className={syncing ? 'ms-spin' : ''} />
            {syncing ? 'Checking Razorpay…' : 'Sync payments'}
          </button>
          <button type="button" className="ms-btn ms-btn-primary" onClick={load}
                  disabled={loading}>
            <RefreshCw size={15} className={loading ? 'ms-spin' : ''} /> Refresh
          </button>
        </div>
      </header>

      {syncNote && (
        <div className="ms-note">
          <BadgeCheck size={15} /> {syncNote}
        </div>
      )}

      <div className="ms-stats">
        <div className="ms-stat">
          <span className="ms-stat-label"><Users size={14} /> People</span>
          <strong>{totals.people}</strong>
        </div>
        <div className="ms-stat">
          <span className="ms-stat-label">Paid at least once</span>
          <strong>{totals.paid}</strong>
        </div>
        <div className="ms-stat">
          <span className="ms-stat-label">Total received</span>
          <strong>{rupees(totals.revenue)}</strong>
        </div>
        <div className="ms-stat" title="Registration rows the ledger holds beyond the number of real people — repeat sign-ups and retried payments.">
          <span className="ms-stat-label">Duplicate rows collapsed</span>
          <strong>{totals.duplicates}</strong>
        </div>
      </div>

      {sources.length > 0 && (
        <section className="ms-sources">
          <header className="ms-sources-head">
            <h2>Where registrations come from</h2>
            <p>
              Sign-ups tell you which links get clicked. Paid customers tell you
              which links are worth the effort — they are rarely the same list.
            </p>
          </header>
          <div className="ms-sources-grid">
            {sources.map((row) => {
              const best = row.conversion >= 60 && row.paid > 0;
              const dead = row.paid === 0 && row.registrations > 1;
              return (
                <div className={`ms-source ${best ? 'is-best' : ''} ${dead ? 'is-dead' : ''}`}
                     key={row.source}>
                  <div className="ms-source-name">{row.source}</div>
                  <div className="ms-source-nums">
                    <span title="People who registered through this link">
                      <strong>{row.people}</strong> registered
                    </span>
                    <span title="Of those, how many paid">
                      <strong>{row.paid}</strong> paid
                    </span>
                  </div>
                  <div className="ms-source-bar">
                    <div className="ms-source-fill"
                         style={{ width: `${Math.min(100, row.conversion)}%` }} />
                  </div>
                  <div className="ms-source-foot">
                    <span>{row.conversion}% convert</span>
                    <strong>₹{Number(row.revenue || 0).toLocaleString('en-IN')}</strong>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="ms-tabs">
        {[
          ['all', 'Everyone', meta.people],
          ['active', 'Can be emailed', statusCounts.active || 0],
          ['unsubscribed', 'Unsubscribed', statusCounts.unsubscribed || 0],
          ['bounced', 'Bad address', statusCounts.bounced || 0],
          ['junk', 'Junk', statusCounts.junk || 0],
        ].map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            className={`ms-tab ${mailStatus === value ? 'is-on' : ''}`}
            onClick={() => setMailStatus(value)}
          >
            {label} <span className="ms-tab-count">{count}</span>
          </button>
        ))}
      </div>

      <div className="ms-toolbar">
        <label className="ms-search">
          <Search size={15} />
          <input
            type="search"
            value={queryInput}
            placeholder="Search name, email or phone"
            onChange={(event) => setQueryInput(event.target.value)}
          />
        </label>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="refunded">Refunded</option>
          <option value="free">Free</option>
        </select>
      </div>

      {error && (
        <div className="ms-error"><AlertTriangle size={16} /> {error}</div>
      )}

      {loading ? (
        <div className="ms-empty">Loading…</div>
      ) : !filtered.length ? (
        <div className="ms-empty">No one matches that search.</div>
      ) : (
        <div className="ms-table-wrap">
          <table className="ms-table">
            <thead>
              <tr>
                <th aria-label="Expand" />
                <th>Person</th>
                <th>Phone</th>
                <th>Location</th>
                <th>Webinars</th>
                <th>Paid</th>
                <th>Source</th>
                <th>Mailing</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((person) => {
                const open = expanded.has(person.email);
                const repeat = (person.attempts || 0) > (person.registration_count || 0);
                return [
                  <tr key={person.email}
                      className={`ms-row ${open ? 'is-open' : ''}`}
                      onClick={() => toggle(person.email)}>
                    <td className="ms-chevron">
                      {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </td>
                    <td>
                      <div className="ms-name">{person.name || '—'}</div>
                      {editing === person.email ? (
                        <div className="ms-edit" onClick={(e) => e.stopPropagation()}>
                          <input
                            className="ms-edit-input"
                            value={draftEmail}
                            autoFocus
                            onChange={(e) => setDraftEmail(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEmail(person.email);
                              if (e.key === 'Escape') setEditing('');
                            }}
                          />
                          <button type="button" className="ms-mini"
                                  disabled={busyEmail === person.email}
                                  onClick={() => saveEmail(person.email)}>Save</button>
                          <button type="button" className="ms-mini ms-mini-off"
                                  onClick={() => setEditing('')}>Cancel</button>
                        </div>
                      ) : (
                        <div className="ms-email">
                          {person.email}
                          {person.mail_status === 'bounced' && (
                            <button
                              type="button"
                              className="ms-fix"
                              title="Correct this address"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditing(person.email);
                                setDraftEmail(suggestFix(person.email));
                              }}
                            >
                              <Pencil size={11} /> fix
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td>{person.phone || '—'}</td>
                    <td>
                      {[person.city, person.country].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td>
                      <span className="ms-pill">{person.registration_count}</span>
                      {repeat && (
                        <span className="ms-pill ms-pill-warn"
                              title={`${person.attempts} registration attempts in total — retries after a failed payment.`}>
                          {person.attempts} attempts
                        </span>
                      )}
                    </td>
                    <td>
                      {person.total_paid_paise
                        ? <strong>{rupees(person.total_paid_paise)}</strong>
                        : <span className="ms-muted">—</span>}
                    </td>
                    <td className="ms-muted">{person.utm_source || 'direct'}</td>
                    <td onClick={(event) => event.stopPropagation()}>
                      {person.mail_status === 'active' ? (
                        <button
                          type="button"
                          className="ms-mini"
                          disabled={busyEmail === person.email}
                          title="Stop sending marketing email to this person"
                          onClick={() => changeMailStatus(person.email, 'unsubscribed')}
                        >
                          <MailCheck size={13} /> Subscribed
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="ms-mini ms-mini-off"
                          disabled={busyEmail === person.email}
                          title={person.mail_status_reason || 'Put this person back on the list'}
                          onClick={() => changeMailStatus(person.email, 'active')}
                        >
                          <MailX size={13} /> {person.mail_status === 'bounced'
                            ? 'Bad address' : person.mail_status === 'junk'
                            ? 'Junk' : 'Unsubscribed'}
                        </button>
                      )}
                    </td>
                    <td className="ms-muted">{formatDate(person.last_seen)}</td>
                  </tr>,
                  open && (
                    <tr key={`${person.email}-detail`} className="ms-detail-row">
                      <td />
                      <td colSpan={8}>
                        <div className="ms-detail">
                          {(person.events || []).map((event) => (
                            <div className="ms-event" key={event.event_key}>
                              <div className="ms-event-main">
                                <span className="ms-event-title">
                                  {event.event_title || event.event_key}
                                </span>
                                <span className={`ms-tag ms-tag-${STATUS_TONE[event.status] || 'muted'}`}>
                                  {event.status || 'registered'}
                                </span>
                                {event.attempts > 1 && (
                                  <span className="ms-tag ms-tag-warning">
                                    {event.attempts} attempts
                                  </span>
                                )}
                                {event.attended && (
                                  <span className="ms-tag ms-tag-success">attended</span>
                                )}
                              </div>
                              <div className="ms-event-meta">
                                {event.event_date || formatDate(event.registered_at)}
                                {event.amount_paise
                                  ? ` · ${rupees(event.amount_paise)}` : ''}
                                {event.certificate_id
                                  ? ` · certificate ${event.certificate_id}` : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      {pageInfo.pages > 1 && (
        <div className="ms-pager">
          <button type="button" className="ms-btn" disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </button>
          <span className="ms-pager-info">
            Page {page} of {pageInfo.pages}
            <span className="ms-muted"> · {pageInfo.count} people</span>
          </span>
          <button type="button" className="ms-btn"
                  disabled={page >= pageInfo.pages || loading}
                  onClick={() => setPage((p) => Math.min(pageInfo.pages, p + 1))}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
