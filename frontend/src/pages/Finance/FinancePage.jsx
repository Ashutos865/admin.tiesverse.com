import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Wallet, Package, Repeat, ReceiptText, TrendingUp, Plus, RefreshCw, X,
  Loader2, Check, Ban, IndianRupee, Search, AlertTriangle, ExternalLink, Trash2,
} from 'lucide-react';
import {
  getFinanceBoard, createFinanceAsset, updateFinanceAsset, deleteFinanceAsset,
  createSubscription, updateSubscription, deleteSubscription,
  createFinanceRequest, approveFinanceRequest, rejectFinanceRequest,
  payFinanceRequest, getFinanceSummary,
} from '../../apiClient';

/* Assets & Finance — the confidential half of the portal.

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
  in_stock: '#2563eb', assigned: '#067a50', repair: '#b45309',
  retired: '#7c7267', lost: '#b91c1c',
};

/* ₹ with Indian digit grouping (1,20,000 not 120,000). */
const inr = (v) => (v === null || v === undefined || v === '')
  ? '—'
  : `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('en-IN',
  { day: '2-digit', month: 'short', year: '2-digit' }) : '—');

/* Show what "Other" actually was, rather than the bare word. */
const catLabel = (r) => (r.category === 'other' && r.category_other)
  ? r.category_other : String(r.category || '').replace(/_/g, ' ');

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
      <div style={{ fontSize: 24, fontWeight: 900, fontFamily: 'Hanken Grotesk, sans-serif',
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
    else flash('error', res?.error || 'Could not load Assets & Finance.');
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
    ['assets', 'Assets', Package, (data?.assets || []).length],
    ['subscriptions', 'Subscriptions', Repeat, (data?.subscriptions || []).length],
    ['spend', 'Spend', TrendingUp, 0],
  ];

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <Wallet size={22} style={{ color: 'var(--primary)' }} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-main)' }}>Assets & Finance</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            Equipment, subscriptions and spending — visible to advisory and finance only
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
        {tab !== 'spend' && (
          <div style={{ position: 'relative', flex: 1, minWidth: 190, maxWidth: 300 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
            <input style={{ ...input, paddingLeft: 31 }} value={search} placeholder="Search…"
              onChange={(e) => setSearch(e.target.value)} />
          </div>
        )}
        <div style={{ flex: 1 }} />
        {tab === 'assets' && canRaise && (
          <button style={btn} onClick={() => setModal({ kind: 'asset' })}><Plus size={14} /> Add asset</button>
        )}
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
      ) : tab === 'assets' ? (
        <AssetTable rows={filtered(data?.assets, ['name', 'serial', 'vendor'])}
          onDelete={(id) => window.confirm('Delete this asset?')
            && act(() => deleteFinanceAsset(id), 'Asset deleted.')} />
      ) : tab === 'subscriptions' ? (
        <SubTable rows={filtered(data?.subscriptions, ['name', 'vendor'])}
          onDelete={(id) => window.confirm('Delete this subscription?')
            && act(() => deleteSubscription(id), 'Subscription deleted.')} />
      ) : (
        <SpendView summary={summary} />
      )}

      {modal && (
        <Modal
          modal={modal} choices={choices} members={data?.members || []}
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

function AssetTable({ rows, onDelete }) {
  if (!rows.length) return <Empty>No assets recorded yet.</Empty>;
  return (
    <div style={{ ...card, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
        <thead><tr>
          <th style={th}>Asset</th><th style={th}>Category</th><th style={th}>Serial</th>
          <th style={th}>Assigned to</th><th style={th}>Bought</th>
          <th style={th}>Cost</th><th style={th}>In ₹</th><th style={th}>Status</th><th style={th} />
        </tr></thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td style={{ ...td, fontWeight: 700, color: 'var(--text-main)' }}>{a.name}
                {a.vendor && <div style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--text-muted)' }}>{a.vendor}</div>}
              </td>
              <td style={{ ...td, color: 'var(--text-muted)' }}>{catLabel(a)}</td>
              <td style={{ ...td, color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                {a.serial || '—'}
              </td>
              <td style={{ ...td, color: 'var(--text-muted)' }}>{a.assigned_to_name || '—'}</td>
              <td style={{ ...td, color: 'var(--text-muted)' }}>{fmtDate(a.purchase_date)}</td>
              <td style={td}>{a.currency} {Number(a.amount).toLocaleString('en-IN')}</td>
              <td style={{ ...td, fontWeight: 700 }}>{inr(a.amount_inr)}</td>
              <td style={td}><Pill text={a.status} /></td>
              <td style={td}>
                <button style={{ ...btn, padding: 5, color: '#b91c1c' }} onClick={() => onDelete(a.id)}>
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
function Modal({ modal, choices, members, canDecide, onClose, onSaved, onError }) {
  const { kind, row } = modal;
  const [f, setF] = useState(() => ({
    currency: 'INR', category: 'other', cycle: 'monthly', condition: 'good',
    status: 'in_stock', amount: '', ...(row || {}),
  }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    setBusy(true);
    let res;
    if (kind === 'request') res = await createFinanceRequest(f);
    else if (kind === 'asset') res = await createFinanceAsset(f);
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

  const title = { request: 'Raise a purchase request', asset: 'Add an asset',
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
                <select style={input} value={f.category} onChange={set('category')}>
                  {(choices.categories || []).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                {/* "Other" on its own tells a future reader nothing, so say what
                    it was. The API requires this too, not just the form. */}
                {f.category === 'other' && (
                  <div style={{ marginTop: 8 }}>
                    <input style={input} value={f.category_other || ''}
                      onChange={set('category_other')} autoFocus
                      placeholder="What is it? e.g. Printer ink, Domain renewal, Event banner" />
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
                      Required — so the ledger still makes sense months from now.
                    </div>
                  </div>
                )}
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

            {kind === 'asset' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 13 }}>
                <div><label style={label}>Serial</label>
                  <input style={input} value={f.serial || ''} onChange={set('serial')} /></div>
                <div><label style={label}>Purchased on</label>
                  <input style={input} type="date" value={f.purchase_date || ''} onChange={set('purchase_date')} /></div>
              </div>
            )}

            {kind === 'request' && (
              <div style={{ marginBottom: 13 }}>
                <label style={label}>Why it is needed</label>
                <textarea style={{ ...input, minHeight: 80, resize: 'vertical' }}
                  value={f.justification || ''} onChange={set('justification')} />
              </div>
            )}

            {(kind === 'asset' || kind === 'subscription') && (
              <div style={{ marginBottom: 13 }}>
                <label style={label}>{kind === 'asset' ? 'Assigned to' : 'Owner'}</label>
                <select style={input} value={f.assigned_to || f.owner || ''}
                  onChange={(e) => setF({ ...f, [kind === 'asset' ? 'assigned_to' : 'owner']: e.target.value || null })}>
                  <option value="">— nobody —</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
              <button style={btn} onClick={onClose} disabled={busy}>Cancel</button>
              <button style={btnPrimary} onClick={save} disabled={busy || !(f.title || f.name) || !f.amount
                  || (f.category === 'other' && kind !== 'subscription' && !(f.category_other || '').trim())}>
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
