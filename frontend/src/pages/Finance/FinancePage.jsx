import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Wallet, Repeat, ReceiptText, TrendingUp, Plus, RefreshCw, X,
  Loader2, Check, Ban, IndianRupee, Search, AlertTriangle, ExternalLink, Trash2,
  Tags, Users, UserPlus, UserMinus,
} from 'lucide-react';
import {
  getFinanceBoard, createSubscription, updateSubscription, deleteSubscription,
  createFinanceRequest, approveFinanceRequest, rejectFinanceRequest,
  payFinanceRequest, getFinanceSummary,
  createFinanceCategory, updateFinanceCategory, deleteFinanceCategory,
  getFinanceTeam, setFinanceTeam,
} from '../../apiClient';

/* Finance — the confidential half of the portal.

   Reached only by advisory, the Finance department and superadmins; the sidebar
   link does not exist for anyone else and the API returns 403 regardless.

   Amounts are entered in whatever currency they were bought in and reported in
   INR, using the rate frozen at approval — so a total does not drift as rates
   move. Rows whose rate could not be resolved are shown separately rather than
   folded in as zero. */

const wrap = { padding: '24px 28px', maxWidth: 1400 };
const card = {
  border: '1px solid var(--outline-variant)', borderRadius: 12,
  background: 'var(--surface-container-lowest)',
};
const btn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px',
  borderRadius: 8, border: '1px solid var(--outline-variant)',
  background: 'var(--surface-container-low)', color: 'var(--text-main)',
  fontSize: 13, fontWeight: 700, cursor: 'pointer',
};
const btnPrimary = { ...btn, background: 'var(--primary)', color: '#fff', border: 'none' };
const input = {
  width: '100%', padding: '9px 11px', borderRadius: 8, fontSize: 13,
  border: '1px solid var(--outline-variant)', background: 'var(--surface-container-lowest)',
  color: 'var(--text-main)', outline: 'none',
};
const label = {
  display: 'block', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase',
  letterSpacing: '.05em', color: 'var(--text-muted)', marginBottom: 5,
};
const th = {
  textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 800,
  textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)',
  borderBottom: '1px solid var(--outline-variant)', whiteSpace: 'nowrap',
};
const td = { padding: '11px 12px', fontSize: 13, borderBottom: '1px solid var(--surface-container-low)' };

const STATUS_COLOR = {
  pending: '#b45309', approved: '#2563eb', rejected: '#b91c1c',
  purchased: '#7c3aed', paid: '#067a50', cancelled: '#7c7267',
};

/* ₹ with Indian digit grouping (1,20,000 not 120,000). */
const inr = (v) => (v === null || v === undefined || v === '')
  ? '—'
  : `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('en-IN',
  { day: '2-digit', month: 'short', year: '2-digit' }) : '—');

/* Show what "Other" actually was, rather than the bare word. */
const catLabel = (r) => r.custom_category_name
  || ((r.category === 'other' && r.category_other) ? r.category_other
      : String(r.category || '').replace(/_/g, ' '));

function Pill({ text, color }) {
  const c = color || STATUS_COLOR[text] || '#7c7267';
  return (
    <span style={{
      fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 20,
      whiteSpace: 'nowrap', color: c,
      background: `color-mix(in srgb, ${c} 13%, transparent)`,
    }}>{String(text).replace(/_/g, ' ')}</span>
  );
}

function Stat({ label: l, value, sub, accent }) {
  return (
    <div style={{ ...card, padding: 16, flex: 1, minWidth: 175 }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
                    letterSpacing: '.05em', color: 'var(--text-muted)', marginBottom: 7 }}>{l}</div>
      <div style={{ fontSize: 24, fontWeight: 900, fontFamily: "'Google Sans', sans-serif",
                    color: accent || 'var(--text-main)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export default function FinancePage() {
  const [tab, setTab] = useState('requests');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [modal, setModal] = useState(null);   // {kind, row}
  const [search, setSearch] = useState('');

  const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 4500); };

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getFinanceBoard();
    if (res && !res.error) setData(res);
    else flash('error', res?.error || 'Could not load Finance.');
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const canRaise = data?.can_raise;
  const canDecide = data?.can_decide;
  const choices = data?.choices || {};
  const summary = data?.summary || {};

  const filtered = (rows, keys) => {
    const q = search.trim().toLowerCase();
    if (!q) return rows || [];
    return (rows || []).filter((r) => keys.some((k) => String(r[k] || '').toLowerCase().includes(q)));
  };

  const act = async (fn, okMsg) => {
    const res = await fn();
    if (res && !res.error) { flash('ok', okMsg); load(); return true; }
    flash('error', res?.error || 'That did not work.');
    return false;
  };

  const tabs = [
    ['requests', 'Requests', ReceiptText, (data?.requests || []).filter((r) => r.status === 'pending').length],
    ['subscriptions', 'Subscriptions', Repeat, (data?.subscriptions || []).length],
    ['spend', 'Spend', TrendingUp, 0],
    // Only the people who can actually change these see the tabs at all.
    ...(canDecide ? [['categories', 'Categories', Tags, 0]] : []),
    ...(data?.is_superadmin ? [['team', 'Finance team', Users, 0]] : []),
  ];

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <Wallet size={22} style={{ color: 'var(--primary)' }} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-main)' }}>Finance</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            Spending, subscriptions and approvals — visible to advisory and finance only
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button style={btn} onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'fin-spin' : ''} />
        </button>
        {canRaise && (
          <button style={btnPrimary} onClick={() => setModal({ kind: 'request' })}>
            <Plus size={15} /> Raise request
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, margin: '16px 0', flexWrap: 'wrap' }}>
        <Stat label="Paid this year" value={inr(summary.paid_inr)} accent="#067a50"
          sub={`${summary.year || ''}`} />
        <Stat label="Approved, unpaid" value={inr(summary.approved_pending_payment_inr)} accent="#2563eb" />
        <Stat label="Subscriptions / yr" value={inr(summary.subscriptions_yearly_inr)} accent="#7c3aed" />
        <Stat label="Awaiting decision" value={summary.pending_count ?? 0} accent="#b45309"
          sub={summary.unpriced_rows ? `${summary.unpriced_rows} without a rate` : ''} />
      </div>

      {msg && (
        <div style={{
          padding: '9px 13px', borderRadius: 8, marginBottom: 14, fontSize: 13, fontWeight: 600,
          background: msg.type === 'error' ? 'rgba(185,28,28,.1)' : 'rgba(6,122,80,.1)',
          color: msg.type === 'error' ? '#b91c1c' : '#067a50',
        }}>{msg.text}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 3, background: 'var(--surface-container-low)',
                      padding: 3, borderRadius: 9 }}>
          {tabs.map(([k, l, I, n]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px',
              borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
              background: tab === k ? 'var(--surface-container-lowest)' : 'transparent',
              color: tab === k ? 'var(--text-main)' : 'var(--text-muted)',
            }}>
              <I size={14} /> {l}
              {n > 0 && <span style={{ fontSize: 10.5, fontWeight: 800, padding: '1px 6px',
                borderRadius: 20, background: 'var(--primary)', color: '#fff' }}>{n}</span>}
            </button>
          ))}
        </div>
        {!['spend', 'categories', 'team'].includes(tab) && (
          <div style={{ position: 'relative', flex: 1, minWidth: 190, maxWidth: 300 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
            <input style={{ ...input, paddingLeft: 31 }} value={search} placeholder="Search…"
              onChange={(e) => setSearch(e.target.value)} />
          </div>
        )}
        <div style={{ flex: 1 }} />
        {tab === 'subscriptions' && canRaise && (
          <button style={btn} onClick={() => setModal({ kind: 'subscription' })}><Plus size={14} /> Add subscription</button>
        )}
      </div>

      {loading && !data ? (
        <div style={{ ...card, padding: 50, textAlign: 'center', color: 'var(--text-muted)' }}>
          <Loader2 size={22} className="fin-spin" /> Loading…
        </div>
      ) : tab === 'requests' ? (
        <RequestTable rows={filtered(data?.requests, ['title', 'description'])}
          canDecide={canDecide} onOpen={(r) => setModal({ kind: 'decide', row: r })} />
      ) : tab === 'subscriptions' ? (
        <SubTable rows={filtered(data?.subscriptions, ['name', 'vendor'])}
          onDelete={(id) => window.confirm('Delete this subscription?')
            && act(() => deleteSubscription(id), 'Subscription deleted.')} />
      ) : tab === 'categories' ? (
        <CategoriesTab rows={data?.custom_categories || []} onChanged={load} flash={flash} />
      ) : tab === 'team' ? (
        <TeamTab flash={flash} onChanged={load} />
      ) : (
        <SpendView summary={summary} />
      )}

      {modal && (
        <Modal
          modal={modal} choices={choices} members={data?.members || []}
          customCategories={data?.custom_categories || []} canManageCategories={canDecide}
          canDecide={canDecide}
          onClose={() => setModal(null)}
          onSaved={(text) => { setModal(null); flash('ok', text); load(); }}
          onError={(e) => flash('error', e)}
        />
      )}

      <style>{`.fin-spin{animation:finspin 1s linear infinite}@keyframes finspin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ── tables ────────────────────────────────────────────────────────────── */
function Empty({ children }) {
  return <div style={{ ...card, padding: 46, textAlign: 'center', color: 'var(--text-muted)' }}>{children}</div>;
}

function RequestTable({ rows, canDecide, onOpen }) {
  if (!rows.length) return <Empty>No requests yet.</Empty>;
  return (
    <div style={{ ...card, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 950 }}>
        <thead><tr>
          <th style={th}>Request</th><th style={th}>Raised by</th><th style={th}>Raised</th>
          <th style={th}>Approved</th><th style={th}>Paid</th>
          <th style={th}>Amount</th><th style={th}>In ₹</th><th style={th}>Status</th><th style={th} />
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={{ ...td, fontWeight: 700, color: 'var(--text-main)', maxWidth: 260 }}>
                {r.title}
                <div style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--text-muted)' }}>{catLabel(r)}</div>
              </td>
              <td style={{ ...td, color: 'var(--text-muted)' }}>{r.requested_by_name || '—'}</td>
              <td style={{ ...td, color: 'var(--text-muted)' }}>{fmtDate(r.raised_on)}</td>
              <td style={{ ...td, color: 'var(--text-muted)' }}>{fmtDate(r.approved_on)}</td>
              <td style={{ ...td, color: 'var(--text-muted)' }}>{fmtDate(r.paid_on)}</td>
              <td style={td}>{r.currency} {Number(r.approved_amount ?? r.amount).toLocaleString('en-IN')}</td>
              <td style={{ ...td, fontWeight: 700 }}>
                {inr(r.amount_inr)}
                {r.fx_missing && (
                  <span title="No exchange rate available — excluded from totals"
                    style={{ marginLeft: 5, color: '#b45309' }}><AlertTriangle size={12} /></span>
                )}
              </td>
              <td style={td}><Pill text={r.status} /></td>
              <td style={td}>
                <button style={{ ...btn, padding: '4px 10px', fontSize: 12 }} onClick={() => onOpen(r)}>
                  {canDecide && r.status === 'pending' ? 'Decide' : 'View'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SubTable({ rows, onDelete }) {
  if (!rows.length) return <Empty>No subscriptions recorded yet.</Empty>;
  return (
    <div style={{ ...card, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
        <thead><tr>
          <th style={th}>Subscription</th><th style={th}>Plan</th><th style={th}>Cycle</th>
          <th style={th}>Owner</th><th style={th}>Renews</th>
          <th style={th}>Cost</th><th style={th}>Per year ₹</th><th style={th} />
        </tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td style={{ ...td, fontWeight: 700, color: 'var(--text-main)' }}>{s.name}
                {s.vendor && <div style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--text-muted)' }}>{s.vendor}</div>}
              </td>
              <td style={{ ...td, color: 'var(--text-muted)' }}>{s.plan || '—'}</td>
              <td style={td}><Pill text={s.cycle} color="#7c3aed" /></td>
              <td style={{ ...td, color: 'var(--text-muted)' }}>{s.owner_name || '—'}</td>
              <td style={{ ...td, color: 'var(--text-muted)' }}>{fmtDate(s.renews_on)}</td>
              <td style={td}>{s.currency} {Number(s.amount).toLocaleString('en-IN')}</td>
              <td style={{ ...td, fontWeight: 700 }}>{inr(s.yearly_inr)}</td>
              <td style={td}>
                <button style={{ ...btn, padding: 5, color: '#b91c1c' }} onClick={() => onDelete(s.id)}>
                  <Trash2 size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SpendView({ summary }) {
  const months = summary.months || [];
  const peak = Math.max(1, ...months.map((m) => m.paid_inr || 0));
  const NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return (
    <div style={{ ...card, padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>
        Spend by month · {summary.year}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
        Paid requests only, converted to ₹ at the rate held when each was approved.
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 190 }}>
        {months.map((m) => (
          <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column',
                                      alignItems: 'center', gap: 6 }}>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 700 }}>
              {m.paid_inr ? inr(m.paid_inr) : ''}
            </div>
            <div title={`${NAMES[m.month - 1]}: ${inr(m.paid_inr)} · ${m.count} item(s)`}
              style={{
                width: '100%', borderRadius: '6px 6px 0 0', minHeight: 3,
                height: `${Math.round((m.paid_inr / peak) * 130)}px`,
                background: m.paid_inr
                  ? 'linear-gradient(180deg, var(--primary), color-mix(in srgb, var(--primary) 55%, transparent))'
                  : 'var(--surface-container-low)',
              }} />
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{NAMES[m.month - 1]}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 24, marginTop: 22, paddingTop: 16,
                    borderTop: '1px solid var(--outline-variant)', flexWrap: 'wrap' }}>
        <div><div style={{ ...label, marginBottom: 3 }}>Paid</div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{inr(summary.paid_inr)}</div></div>
        <div><div style={{ ...label, marginBottom: 3 }}>Subscriptions / year</div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{inr(summary.subscriptions_yearly_inr)}</div></div>
        <div><div style={{ ...label, marginBottom: 3 }}>Total committed</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--primary)' }}>
            {inr(summary.total_committed_inr)}</div></div>
        {summary.unpriced_rows > 0 && (
          <div><div style={{ ...label, marginBottom: 3, color: '#b45309' }}>Excluded</div>
            <div style={{ fontSize: 13, color: '#b45309' }}>
              {summary.unpriced_rows} row(s) had no exchange rate</div></div>
        )}
      </div>
    </div>
  );
}

/* ── modals ────────────────────────────────────────────────────────────── */
function Modal({ modal, choices, members, customCategories, canDecide, canManageCategories, onClose, onSaved, onError }) {
  const { kind, row } = modal;
  const [f, setF] = useState(() => ({
    currency: 'INR', category: 'other', cycle: 'monthly', amount: '', ...(row || {}),
  }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const pickable = useMemo(
    () => (customCategories || []).filter((c) => c.is_active || c.id === f.custom_category),
    [customCategories, f.custom_category]);

  const save = async () => {
    setBusy(true);
    let res;
    if (kind === 'request') res = await createFinanceRequest(f);
    else if (kind === 'subscription') res = await createSubscription(f);
    setBusy(false);
    if (res && !res.error) onSaved(kind === 'request' ? 'Request raised.' : 'Saved.');
    else onError(res?.error || 'Could not save.');
  };

  const decide = async (fn, text) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res && !res.error) onSaved(text);
    else onError(res?.error || 'That did not work.');
  };

  const title = { request: 'Raise a purchase request',
                  subscription: 'Add a subscription', decide: row?.title }[kind];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,12,0,.4)', zIndex: 200,
                  display: 'grid', placeItems: 'center', padding: 20 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div style={{ ...card, width: '100%', maxWidth: 560, maxHeight: '90vh',
                    overflowY: 'auto', padding: 22 }}
        onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{title}</div>
          <div style={{ flex: 1 }} />
          <button style={{ ...btn, padding: 6 }} onClick={onClose} disabled={busy}><X size={15} /></button>
        </div>

        {kind === 'decide' ? (
          <DecidePanel row={row} canDecide={canDecide} busy={busy} decide={decide} />
        ) : (
          <>
            <div style={{ marginBottom: 13 }}>
              <label style={label}>{kind === 'request' ? 'What is needed' : 'Name'}</label>
              <input style={input} value={f.title || f.name || ''} autoFocus
                onChange={(e) => setF({ ...f, [kind === 'request' ? 'title' : 'name']: e.target.value })} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 13 }}>
              <div>
                <label style={label}>Amount</label>
                <input style={input} type="number" min="0" step="0.01" value={f.amount}
                  onChange={set('amount')} placeholder="0" />
              </div>
              <div>
                <label style={label}>Currency</label>
                <select style={input} value={f.currency} onChange={set('currency')}>
                  {(choices.currencies || []).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>
            {f.currency !== 'INR' && (
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: -6, marginBottom: 13 }}>
                Converted to ₹ at approval, using that day's rate — the figure is then fixed.
              </div>
            )}

            {kind !== 'subscription' && (
              <div style={{ marginBottom: 13 }}>
                <label style={label}>Category</label>
                {/* Only the categories Finance has defined. The old built-in
                    list was equipment language — Laptop, Monitor, Camera — which
                    stopped making sense once assets left this page. Everything
                    stores as 'other' plus either a category or a note, so no
                    existing row needed rewriting. */}
                <select style={input} value={f.custom_category ? `c${f.custom_category}` : ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setF({
                      ...f, category: 'other',
                      custom_category: v ? Number(v.slice(1)) : null,
                      // Switching to a real category clears the free text, so a
                      // stale note cannot linger behind the chosen name.
                      category_other: v ? '' : (f.category_other || ''),
                    });
                  }}>
                  <option value="">— something else —</option>
                  {/* A switched-off category still has to appear if this row
                      already uses it, or editing would silently drop it. */}
                  {pickable.map((c) => <option key={c.id} value={`c${c.id}`}>{c.name}</option>)}
                </select>
                {!f.custom_category && (
                  <div style={{ marginTop: 8 }}>
                    <input style={input} value={f.category_other || ''}
                      onChange={set('category_other')}
                      placeholder="What is it? e.g. Printer ink, Domain renewal, Event banner" />
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
                      {canManageCategories
                        ? 'Required — or add it under Categories to reuse it later.'
                        : 'Required — so the ledger still makes sense months from now.'}
                    </div>
                  </div>
                )}
              </div>
            )}

            {kind === 'request' && (
              <div style={{ marginBottom: 13 }}>
                <label style={label}>Date raised</label>
                <input style={input} type="date" max={new Date().toISOString().slice(0, 10)}
                  value={f.raised_on || new Date().toISOString().slice(0, 10)}
                  onChange={set('raised_on')} />
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
                  Back-date it if the spend already happened — a foreign amount is then
                  converted at that day's rate, not today's.
                </div>
              </div>
            )}

            {kind === 'subscription' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 13 }}>
                <div>
                  <label style={label}>Billing cycle</label>
                  <select style={input} value={f.cycle} onChange={set('cycle')}>
                    {(choices.cycles || []).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={label}>Renews on</label>
                  <input style={input} type="date" value={f.renews_on || ''} onChange={set('renews_on')} />
                </div>
              </div>
            )}

            {kind === 'request' && (
              <div style={{ marginBottom: 13 }}>
                <label style={label}>Why it is needed</label>
                <textarea style={{ ...input, minHeight: 80, resize: 'vertical' }}
                  value={f.justification || ''} onChange={set('justification')} />
              </div>
            )}

            {kind === 'subscription' && (
              <div style={{ marginBottom: 13 }}>
                <label style={label}>Owner</label>
                <select style={input} value={f.owner || ''}
                  onChange={(e) => setF({ ...f, owner: e.target.value || null })}>
                  <option value="">— nobody —</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
              <button style={btn} onClick={onClose} disabled={busy}>Cancel</button>
              <button style={btnPrimary} onClick={save} disabled={busy || !(f.title || f.name) || !f.amount
                  || (kind !== 'subscription' && !f.custom_category && !(f.category_other || '').trim())}>
                {busy ? <><Loader2 size={14} className="fin-spin" /> Saving…</> : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DecidePanel({ row, canDecide, busy, decide }) {
  const [amount, setAmount] = useState(row.amount);
  const [note, setNote] = useState('');
  const [invoice, setInvoice] = useState('');

  return (
    <>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 16 }}>
        <div>Raised by <b style={{ color: 'var(--text-main)' }}>{row.requested_by_name || '—'}</b> on {fmtDate(row.raised_on)}</div>
        <div>Asking <b style={{ color: 'var(--text-main)' }}>{row.currency} {Number(row.amount).toLocaleString('en-IN')}</b></div>
        {row.approved_on && <div>Approved {fmtDate(row.approved_on)} · {inr(row.amount_inr)}</div>}
        {row.paid_on && <div>Paid {fmtDate(row.paid_on)} {row.invoice_no && `· ${row.invoice_no}`}</div>}
        <div style={{ marginTop: 6 }}><Pill text={row.status} /></div>
      </div>

      {row.justification && (
        <div style={{ ...card, padding: 12, marginBottom: 16, background: 'var(--surface-container-low)' }}>
          <div style={{ ...label, marginBottom: 4 }}>Justification</div>
          <div style={{ fontSize: 13 }}>{row.justification}</div>
        </div>
      )}

      {canDecide && row.status === 'pending' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 13 }}>
            <div><label style={label}>Approve amount ({row.currency})</label>
              <input style={input} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          </div>
          <div style={{ marginBottom: 13 }}>
            <label style={label}>Note</label>
            <input style={input} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button style={{ ...btn, color: '#b91c1c' }} disabled={busy}
              onClick={() => decide(() => rejectFinanceRequest(row.id, { note }), 'Request rejected.')}>
              <Ban size={14} /> Reject
            </button>
            <button style={btnPrimary} disabled={busy}
              onClick={() => decide(() => approveFinanceRequest(row.id, { approved_amount: amount, note }), 'Approved.')}>
              <Check size={14} /> Approve
            </button>
          </div>
        </>
      )}

      {canDecide && ['approved', 'purchased'].includes(row.status) && (
        <>
          <div style={{ marginBottom: 13 }}>
            <label style={label}>Invoice number</label>
            <input style={input} value={invoice} onChange={(e) => setInvoice(e.target.value)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button style={btnPrimary} disabled={busy}
              onClick={() => decide(() => payFinanceRequest(row.id, { invoice_no: invoice }), 'Marked paid.')}>
              <IndianRupee size={14} /> Mark paid
            </button>
          </div>
        </>
      )}

      {!canDecide && (
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          Only the Finance department can approve or reject a request.
        </div>
      )}
    </>
  );
}

/* ── Categories ────────────────────────────────────────────────────────────
   The built-in category list cannot cover everything a growing team spends on,
   so Finance defines its own. Deleting one that is already in use is refused by
   the API rather than silently orphaning rows, and the count is shown here so
   nobody is surprised by that. */
function CategoriesTab({ rows, onChanged, flash }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    const res = await createFinanceCategory({ name: n, description: desc.trim() });
    setBusy(false);
    if (res && !res.error) { setName(''); setDesc(''); flash('ok', `“${n}” added.`); onChanged(); }
    else flash('error', res?.error || 'Could not add that category.');
  };

  const remove = async (c) => {
    if (c.in_use) {
      flash('error', `“${c.name}” is used by ${c.in_use} row${c.in_use === 1 ? '' : 's'} — `
        + 'turn it off instead of deleting it.');
      return;
    }
    if (!window.confirm(`Delete “${c.name}”?`)) return;
    const res = await deleteFinanceCategory(c.id);
    if (res && !res.error) { flash('ok', 'Category deleted.'); onChanged(); }
    else flash('error', res?.error || 'Could not delete that.');
  };

  const toggle = async (c) => {
    const res = await updateFinanceCategory(c.id, { is_active: !c.is_active });
    if (res && !res.error) { flash('ok', c.is_active ? 'Hidden from the picker.' : 'Back in the picker.'); onChanged(); }
    else flash('error', res?.error || 'Could not update that.');
  };

  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ ...card, padding: 16, width: 300, flexShrink: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 12, color: 'var(--text-main)' }}>
          New category
        </div>
        <label style={label}>Name</label>
        <input style={{ ...input, marginBottom: 11 }} value={name} placeholder="e.g. Travel"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()} />
        <label style={label}>Description <span style={{ fontWeight: 500, textTransform: 'none' }}>(optional)</span></label>
        <input style={{ ...input, marginBottom: 13 }} value={desc} placeholder="Flights, trains, cabs"
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button style={{ ...btnPrimary, width: '100%', justifyContent: 'center' }}
          onClick={add} disabled={busy || !name.trim()}>
          {busy ? <Loader2 size={14} className="fin-spin" /> : <Plus size={15} />} Add category
        </button>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.5 }}>
          These appear in the category dropdown alongside the built-in ones, for
          requests.
        </div>
      </div>

      <div style={{ ...card, flex: 1, minWidth: 340, overflow: 'hidden' }}>
        {(rows || []).length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No categories of your own yet — the built-in list is all that shows in the picker.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Category</th><th style={th}>Used by</th>
              <th style={th}>In picker</th><th style={th} />
            </tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} style={{ opacity: c.is_active ? 1 : 0.55 }}>
                  <td style={td}>
                    <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{c.name}</div>
                    {c.description && (
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{c.description}</div>
                    )}
                  </td>
                  <td style={{ ...td, color: 'var(--text-muted)' }}>
                    {c.in_use ? `${c.in_use} row${c.in_use === 1 ? '' : 's'}` : '—'}
                  </td>
                  <td style={td}>
                    <button style={{ ...btn, padding: '5px 10px', fontSize: 12 }} onClick={() => toggle(c)}>
                      {c.is_active ? 'Shown' : 'Hidden'}
                    </button>
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <button title={c.in_use ? 'In use — cannot delete' : 'Delete'}
                      style={{ ...btn, padding: '5px 8px', color: c.in_use ? 'var(--text-muted)' : '#b91c1c' }}
                      onClick={() => remove(c)}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ── Finance team ──────────────────────────────────────────────────────────
   Superadmin only. Finance is a restricted department: it does not appear in
   the HR department dropdown at all, so this screen is the only way in or out
   of it. Adding someone here gives them approval rights and sight of every
   amount, which is why the confirmation is explicit. */
function TeamTab({ flash, onChanged }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getFinanceTeam();
    if (res && !res.error) setState(res);
    else flash('error', res?.error || 'Could not load the Finance team.');
    setLoading(false);
  }, [flash]);
  useEffect(() => { load(); }, [load]);

  const change = async (m, action) => {
    const msg = action === 'add'
      ? `Give ${m.candidate_name} Finance access?\n\nThey will see every amount in the `
        + 'system and be able to approve and reject spending.'
      : `Remove ${m.candidate_name} from Finance?\n\nThey will immediately lose sight of all amounts.`;
    if (!window.confirm(msg)) return;
    setBusyId(m.id);
    const res = await setFinanceTeam(m.id, action);
    setBusyId(null);
    if (res && !res.error) {
      flash('ok', action === 'add' ? `${m.candidate_name} added to Finance.`
                                   : `${m.candidate_name} removed from Finance.`);
      load(); onChanged();
    } else flash('error', res?.error || 'That did not work.');
  };

  if (loading && !state) {
    return (
      <div style={{ ...card, padding: 50, textAlign: 'center', color: 'var(--text-muted)' }}>
        <Loader2 size={22} className="fin-spin" /> Loading…
      </div>
    );
  }

  const term = q.trim().toLowerCase();
  const candidates = (state?.candidates || []).filter(
    (m) => !term || `${m.candidate_name} ${m.candidate_email} ${m.crew_id || ''}`.toLowerCase().includes(term));

  const Row = ({ m, action }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px',
      borderBottom: '1px solid var(--surface-container-low)',
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
        background: 'var(--surface-container-low)', display: 'grid', placeItems: 'center',
        fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', overflow: 'hidden',
      }}>
        {m.avatar_url
          ? <img src={m.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : (m.candidate_name || '?').charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {m.candidate_name}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {m.crew_id ? `${m.crew_id} · ` : ''}{m.candidate_email}
        </div>
      </div>
      <button style={{ ...btn, padding: '6px 11px', fontSize: 12,
                       ...(action === 'add' ? {} : { color: '#b91c1c' }) }}
        disabled={busyId === m.id} onClick={() => change(m, action)}>
        {busyId === m.id ? <Loader2 size={13} className="fin-spin" />
          : action === 'add' ? <UserPlus size={13} /> : <UserMinus size={13} />}
        {action === 'add' ? 'Add' : 'Remove'}
      </button>
    </div>
  );

  return (
    <div>
      <div style={{
        display: 'flex', gap: 9, alignItems: 'flex-start', padding: '11px 13px', marginBottom: 14,
        borderRadius: 10, background: 'rgba(180,83,9,.08)', color: '#b45309', fontSize: 12.5,
      }}>
        <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          Finance is a hidden department — it does not appear in the HR department list, and
          only you can change who is in it. Members here approve spending and see every amount.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ ...card, flex: 1, minWidth: 300, overflow: 'hidden' }}>
          <div style={{ padding: '11px 13px', borderBottom: '1px solid var(--outline-variant)',
                        fontSize: 12.5, fontWeight: 800, color: 'var(--text-main)' }}>
            In Finance ({(state?.members || []).length})
          </div>
          {(state?.members || []).length === 0 ? (
            <div style={{ padding: 34, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Nobody yet. Until someone is added, only you can approve spending.
            </div>
          ) : state.members.map((m) => <Row key={m.id} m={m} action="remove" />)}
        </div>

        <div style={{ ...card, flex: 1, minWidth: 300, overflow: 'hidden' }}>
          <div style={{ padding: '9px 13px', borderBottom: '1px solid var(--outline-variant)' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
              <input style={{ ...input, paddingLeft: 31 }} value={q} placeholder="Search everyone else…"
                onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {candidates.length === 0 ? (
              <div style={{ padding: 34, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                {term ? 'Nobody matches that.' : 'No other active members.'}
              </div>
            ) : candidates.map((m) => <Row key={m.id} m={m} action="add" />)}
          </div>
        </div>
      </div>
    </div>
  );
}
