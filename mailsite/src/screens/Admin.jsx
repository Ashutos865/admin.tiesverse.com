import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive, Check, Key, Loader2, Plus, Search, Shield, UserMinus, UserPlus, Users, X,
} from 'lucide-react';
import {
  adminArchiveMailbox, adminAudit, adminCreateMailbox, adminGrant, adminListGrants,
  adminListMailboxes, adminListUsers, adminRevoke, adminSetPassword,
} from '../api/mail.js';
import { Avatar, EmptyState, ErrorNotice, useDelayedFlag } from '../components/common.jsx';
import { relative } from '../lib/format.js';

/* These endpoints return a bare array; a paginated one would wrap it in
   `results`. Accept either rather than guessing wrong on a future change. */
const asList = (res) => (Array.isArray(res) ? res : res?.results || []);

/* Mailbox administration, for superadmins only.
 *
 * The same endpoints the admin panel has always used — this simply puts them
 * where the mail lives, so managing a mailbox does not mean switching sites.
 */
export default function Admin({ me }) {
  const navigate = useNavigate();
  const [boxes, setBoxes] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('mailboxes');
  const [creating, setCreating] = useState(false);
  const [grantsFor, setGrantsFor] = useState(null);
  const [audit, setAudit] = useState(null);
  const loading = boxes === null;
  const showSkeleton = useDelayedFlag(loading);

  const load = useCallback(async () => {
    const res = await adminListMailboxes();
    if (res.error) { setError(res.error); setBoxes([]); return; }
    setBoxes(asList(res));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (tab !== 'audit') return;
    adminAudit().then((res) => setAudit(res.error ? [] : asList(res)));
  }, [tab]);

  if (!me?.is_superadmin) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 24 }}>
        <EmptyState icon={<Shield size={28} style={{ color: 'var(--muted-2)' }} />}
          title="Not available"
          action={<button className="btn" onClick={() => navigate('/')}>Back to mail</button>}>
          Mailbox administration is limited to superadmins.
        </EmptyState>
      </div>
    );
  }

  return (
    <div style={{ overflowY: 'auto', padding: '22px 24px 40px' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-.02em' }}>
            Mailbox administration
          </h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--muted)' }}>
            Create mailboxes, decide who can open them, and review who has looked at what.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={15} /> New mailbox
        </button>
      </header>

      <div className="tabs" style={{ marginBottom: 14 }}>
        <button className={`tab ${tab === 'mailboxes' ? 'active' : ''}`} onClick={() => setTab('mailboxes')}>
          Mailboxes
        </button>
        <button className={`tab ${tab === 'audit' ? 'active' : ''}`} onClick={() => setTab('audit')}>
          Access log
        </button>
      </div>

      <ErrorNotice onRetry={load}>{error}</ErrorNotice>

      {tab === 'mailboxes' ? (
        loading ? (showSkeleton ? <p className="muted">Loading…</p> : null)
          : !boxes.length ? (
            <EmptyState title="No mailboxes yet">Create the first one to get started.</EmptyState>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              {boxes.map((b) => (
                <div key={b.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  borderBottom: '1px solid var(--line-soft)', flexWrap: 'wrap',
                }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                      {b.display_name || b.address.split('@')[0]}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{b.address}</div>
                  </div>
                  <span className={`chip ${b.kind === 'SHARED' ? 'chip-partnerships' : 'chip-default'}`}>
                    {b.kind === 'SHARED' ? 'Team' : b.kind === 'SYSTEM' ? 'System' : 'Personal'}
                  </span>
                  {b.is_archived && <span className="chip chip-support">Archived</span>}
                  {b.kind === 'SHARED' && (
                    <>
                      <button className="btn btn-sm" onClick={() => setGrantsFor(b)}>
                        <Users size={13} /> Access{b.grant_count ? ` (${b.grant_count})` : ''}
                      </button>
                      <PasswordButton box={b} />
                    </>
                  )}
                  {!b.is_archived && (
                    <button className="btn btn-sm btn-danger"
                      onClick={async () => {
                        if (!window.confirm(`Archive ${b.address}? It stops receiving mail but nothing is deleted.`)) return;
                        await adminArchiveMailbox(b.id);
                        load();
                      }}>
                      <Archive size={13} /> Archive
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          {audit === null ? <p className="muted" style={{ padding: 16 }}>Loading…</p>
            : !audit.length ? (
              <EmptyState title="Nothing logged yet">
                Every time a superadmin opens a mailbox that is not their own, it appears here.
              </EmptyState>
            ) : audit.slice(0, 200).map((row) => (
              <div key={row.id} style={{
                display: 'flex', gap: 12, alignItems: 'baseline', padding: '10px 16px',
                borderBottom: '1px solid var(--line-soft)', fontSize: 13,
              }}>
                <strong style={{ minWidth: 130 }}>{row.actor_name}</strong>
                <span style={{ color: 'var(--muted)', minWidth: 120 }}>
                  {row.action.replace(/_/g, ' ')}
                </span>
                <span style={{ flex: 1, color: 'var(--ink-2)' }} className="truncate">
                  {row.note || row.mailbox_address}
                </span>
                <span style={{ color: 'var(--muted-2)', fontSize: 11.5, whiteSpace: 'nowrap' }}>
                  {relative(row.created_at)}
                </span>
              </div>
            ))}
        </div>
      )}

      {creating && <CreateMailbox onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
      {grantsFor && <GrantsModal box={grantsFor} onClose={() => { setGrantsFor(null); load(); }} />}
    </div>
  );
}

function PasswordButton({ box }) {
  const [busy, setBusy] = useState(false);
  return (
    <button className="btn btn-sm" disabled={busy}
      onClick={async () => {
        const pw = window.prompt(`Set a sign-in password for ${box.address}\n\nLeave empty to remove it.`);
        if (pw === null) return;
        if (pw && pw.length < 8) { window.alert('Use at least 8 characters.'); return; }
        setBusy(true);
        const res = await adminSetPassword(box.id, pw);
        setBusy(false);
        window.alert(res.error || (pw ? 'Password set.' : 'Password removed.'));
      }}>
      {busy ? <Loader2 size={13} className="spin" /> : <Key size={13} />} Password
    </button>
  );
}

function CreateMailbox({ onClose, onCreated }) {
  const [address, setAddress] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [kind, setKind] = useState('PERSONAL');
  const [owner, setOwner] = useState('');
  const [users, setUsers] = useState([]);
  const [ownerQuery, setOwnerQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    adminListUsers().then((res) => setUsers(res.error ? [] : asList(res)));
  }, []);

  const label = (u) => (`${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username);
  const term = ownerQuery.trim().toLowerCase();
  const matches = users
    .filter((u) => !term || `${label(u)} ${u.email} ${u.username}`.toLowerCase().includes(term))
    .slice(0, 6);
  const chosen = users.find((u) => String(u.id) === String(owner));

  const submit = async () => {
    setBusy(true);
    setError('');
    const local = address.trim().toLowerCase().split('@')[0];
    const res = await adminCreateMailbox({
      address: `${local}@mail.tiesverse.com`,
      display_name: displayName.trim(),
      kind,
      // A personal box needs its owner now: without one nobody can open it.
      ...(kind === 'PERSONAL' && owner ? { user: owner } : {}),
    });
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    onCreated();
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-sm" role="dialog" aria-modal="true">
        <div className="modal-head">
          <span style={{ flex: 1 }}>New mailbox</span>
          <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <label style={{ display: 'grid', gap: 6 }}>
            <span className="eyebrow">Address</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input className="field" value={address} autoFocus
                onChange={(e) => setAddress(e.target.value)} placeholder="name" />
              <span style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                @mail.tiesverse.com
              </span>
            </span>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span className="eyebrow">Display name</span>
            <input className="field" value={displayName}
              onChange={(e) => setDisplayName(e.target.value)} placeholder="Diya Moze" />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span className="eyebrow">Kind</span>
            <select className="field" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="PERSONAL">Personal — one member</option>
              <option value="SHARED">Team — several members</option>
            </select>
          </label>

          {kind === 'PERSONAL' ? (
            <div style={{ display: 'grid', gap: 6 }}>
              <span className="eyebrow">Belongs to</span>
              {chosen ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <Avatar name={label(chosen)} email={chosen.email} size={28} />
                  <span style={{ flex: 1, fontSize: 13 }}>{label(chosen)}</span>
                  <button className="btn btn-sm" onClick={() => { setOwner(''); setOwnerQuery(''); }}>
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <span className="search-field">
                    <Search size={15} />
                    <input value={ownerQuery} onChange={(e) => setOwnerQuery(e.target.value)}
                      placeholder="Search by name or email…" />
                  </span>
                  {matches.map((u) => (
                    <button key={u.id} className="nav-item" onClick={() => setOwner(u.id)}
                      style={{ height: 'auto', padding: '6px 8px' }}>
                      <Avatar name={label(u)} email={u.email} size={24} />
                      <span className="label truncate" style={{ fontSize: 13 }}>
                        {label(u)} <span style={{ color: 'var(--muted)' }}>{u.email}</span>
                      </span>
                    </button>
                  ))}
                </>
              )}
            </div>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
              You will choose who can open this team mailbox once it exists.
            </p>
          )}

          <ErrorNotice>{error}</ErrorNotice>
        </div>
        <div className="modal-foot">
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit}
            disabled={busy || !address.trim() || (kind === 'PERSONAL' && !owner)}>
            {busy ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Create
          </button>
        </div>
      </div>
    </div>
  );
}

function GrantsModal({ box, onClose }) {
  const [grants, setGrants] = useState(null);
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    const res = await adminListGrants(box.id);
    setGrants(res.error ? [] : asList(res));
  }, [box.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    adminListUsers().then((res) => setUsers(res.error ? [] : asList(res)));
  }, []);

  const granted = new Set((grants || []).map((g) => String(g.user)));
  const term = query.trim().toLowerCase();
  const candidates = users
    .filter((u) => !granted.has(String(u.id)))
    .filter((u) => !term
      || `${u.username} ${u.email} ${u.first_name || ''} ${u.last_name || ''}`
        .toLowerCase().includes(term))
    .slice(0, 8);

  const label = (u) => {
    const full = `${u.first_name || ''} ${u.last_name || ''}`.trim();
    return full || u.username;
  };

  const add = async (user) => {
    setBusy(user.id);
    const res = await adminGrant(box.id, user.id);
    setBusy(null);
    if (res.error) setError(res.error);
    else { setError(''); setQuery(''); load(); }
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-sm" role="dialog" aria-modal="true">
        <div className="modal-head">
          <span style={{ flex: 1 }}>Who can open this mailbox</span>
          <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={onClose}
            aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>
            Anyone listed here can read and send from <strong>{box.address}</strong>.
          </p>

          {grants === null ? <p className="muted">Loading…</p>
            : !grants.length ? (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Nobody yet — this mailbox can only be opened with its password.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {grants.map((g) => (
                  <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <Avatar name={g.user_name} email={g.user_name} size={28} />
                    <span style={{ flex: 1, fontSize: 13 }} className="truncate">
                      {g.user_name || `User ${g.user}`}
                    </span>
                    <button className="btn btn-sm btn-danger"
                      onClick={async () => { await adminRevoke(box.id, g.user); load(); }}>
                      <UserMinus size={13} /> Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

          <div style={{ paddingTop: 10, borderTop: '1px solid var(--line-soft)', display: 'grid', gap: 8 }}>
            <span className="eyebrow">Give access to</span>
            <span className="search-field">
              <Search size={15} />
              <input value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or email…" />
            </span>
            {term && !candidates.length && (
              <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
                Nobody matches — or they already have access.
              </p>
            )}
            {candidates.map((u) => (
              <button key={u.id} onClick={() => add(u)} disabled={busy === u.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '7px 8px',
                  borderRadius: 'var(--r-control)', textAlign: 'left',
                }}
                className="nav-item">
                <Avatar name={label(u)} email={u.email} size={26} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }} className="truncate">
                    {label(u)}
                  </span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }} className="truncate">
                    {u.email || u.username}
                  </span>
                </span>
                {busy === u.id ? <Loader2 size={14} className="spin" /> : <UserPlus size={14} />}
              </button>
            ))}
          </div>

          <ErrorNotice>{error}</ErrorNotice>
        </div>
      </div>
    </div>
  );
}
