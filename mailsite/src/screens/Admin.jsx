import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive, Check, Key, Loader2, Pencil, Plus, RotateCcw, Search, Shield,
  UserMinus, UserPlus, Users, X,
} from 'lucide-react';
import {
  adminAddAdmin, adminArchiveMailbox, adminAudit, adminCreateMailbox, adminGrant,
  adminListAdmins, adminListGrants, adminListMailboxes, adminListUsers,
  adminRemoveAdmin, adminRevoke, adminSetPassword, adminUpdateMailbox,
} from '../api/mail.js';
import { Avatar, EmptyState, ErrorNotice, useDelayedFlag } from '../components/common.jsx';
import { relative } from '../lib/format.js';

/* These endpoints return a bare array; a paginated one would wrap it in
   `results`. Accept either rather than guessing wrong on a future change. */
const asList = (res) => (Array.isArray(res) ? res : res?.results || []);

/* Mailbox administration, for anyone who administers mail — a portal superuser
 * or someone appointed on the Administrators tab. Appointing others stays with
 * superusers.
 */
export default function Admin({ me }) {
  const navigate = useNavigate();
  const [boxes, setBoxes] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('mailboxes');
  const [creating, setCreating] = useState(false);
  const [grantsFor, setGrantsFor] = useState(null);
  const [editing, setEditing] = useState(null);
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
          Mailbox administration is limited to mail administrators.
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
        <button className={`tab ${tab === 'admins' ? 'active' : ''}`} onClick={() => setTab('admins')}>
          Administrators
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
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {b.address}
                      {b.owner_name && <> · {b.owner_name}</>}
                      {' · '}{b.daily_send_limit}/day
                    </div>
                  </div>
                  <span className={`chip ${b.kind === 'SHARED' ? 'chip-partnerships' : 'chip-default'}`}>
                    {b.kind === 'SHARED' ? 'Team' : b.kind === 'SYSTEM' ? 'System' : 'Personal'}
                  </span>
                  {b.is_archived && <span className="chip chip-support">Archived</span>}
                  {!b.is_archived && !b.is_active && <span className="chip chip-support">Paused</span>}
                  <button className="btn btn-sm" onClick={() => setEditing(b)}>
                    <Pencil size={13} /> Edit
                  </button>
                  {b.kind === 'SHARED' && (
                    <>
                      <button className="btn btn-sm" onClick={() => setGrantsFor(b)}>
                        <Users size={13} /> Access{b.grant_count ? ` (${b.grant_count})` : ''}
                      </button>
                      <PasswordButton box={b} />
                    </>
                  )}
                  {b.is_archived ? (
                    /* Restoring was impossible from here before — an archived
                       mailbox could only be brought back in the Django admin. */
                    <button className="btn btn-sm"
                      onClick={async () => {
                        await adminUpdateMailbox(b.id, { is_archived: false, is_active: true });
                        load();
                      }}>
                      <RotateCcw size={13} /> Restore
                    </button>
                  ) : (
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
      ) : tab === 'admins' ? (
        <AdminsTab canManage={Boolean(me?.can_manage_admins)} />
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
      {editing && <EditMailbox box={editing} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }} />}
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

/* Editing a mailbox: the name people see, its address, how much it may send,
   whether it is on, and who it belongs to. */
function EditMailbox({ box, onClose, onSaved }) {
  const [displayName, setDisplayName] = useState(box.display_name || '');
  const [local, setLocal] = useState((box.address || '').split('@')[0]);
  const [limit, setLimit] = useState(String(box.daily_send_limit ?? 200));
  const [isActive, setIsActive] = useState(box.is_active !== false);
  const [owner, setOwner] = useState(box.user ? String(box.user) : '');
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    adminListUsers().then((res) => setUsers(res.error ? [] : asList(res)));
  }, []);

  const label = (u) => (`${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username);
  const term = query.trim().toLowerCase();
  const matches = users
    .filter((u) => !term || `${label(u)} ${u.email} ${u.username}`.toLowerCase().includes(term))
    .slice(0, 6);
  const chosen = users.find((u) => String(u.id) === String(owner));

  const save = async () => {
    const n = Number(limit);
    if (!Number.isFinite(n) || n < 1 || n > 10000) {
      setError('Daily limit must be between 1 and 10000.');
      return;
    }
    setBusy(true);
    setError('');
    const payload = {
      display_name: displayName.trim(),
      address: `${local.trim().toLowerCase().split('@')[0]}@mail.tiesverse.com`,
      daily_send_limit: n,
      is_active: isActive,
    };
    // Only send the owner when it actually changed — a PERSONAL box with no
    // owner is unopenable, so blanking it by accident must not be possible.
    if (String(owner || '') !== String(box.user || '')) payload.user = owner || null;
    const res = await adminUpdateMailbox(box.id, payload);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    onSaved();
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-sm" role="dialog" aria-modal="true">
        <div className="modal-head">
          <span style={{ flex: 1 }}>Edit mailbox</span>
          <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={onClose}
            aria-label="Close"><X size={16} /></button>
        </div>
        <div className="modal-body">
          <label style={{ display: 'grid', gap: 6 }}>
            <span className="eyebrow">Display name</span>
            <input className="field" value={displayName} autoFocus
              onChange={(e) => setDisplayName(e.target.value)} placeholder="Nimble Team" />
            <span style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>
              What recipients see in the From line.
            </span>
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span className="eyebrow">Address</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input className="field" value={local}
                onChange={(e) => setLocal(e.target.value)} />
              <span style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                @mail.tiesverse.com
              </span>
            </span>
            {local !== (box.address || '').split('@')[0] && (
              <span style={{ fontSize: 11.5, color: 'var(--warn)' }}>
                Mail sent to the old address will no longer arrive.
              </span>
            )}
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span className="eyebrow">Daily send limit</span>
            <input className="field" type="number" min="1" max="10000" value={limit}
              onChange={(e) => setLimit(e.target.value)} />
            <span style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>
              Messages this mailbox may send per day.
            </span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <input type="checkbox" checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)} />
            <span style={{ fontSize: 13 }}>
              Active
              <span style={{ color: 'var(--muted)' }}> — unticking pauses sending and receiving</span>
            </span>
          </label>

          {box.kind === 'PERSONAL' && (
            <div style={{ display: 'grid', gap: 6, paddingTop: 8, borderTop: '1px solid var(--line-soft)' }}>
              <span className="eyebrow">Belongs to</span>
              {chosen ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <Avatar name={label(chosen)} email={chosen.email} size={28} />
                  <span style={{ flex: 1, fontSize: 13 }} className="truncate">{label(chosen)}</span>
                  <button className="btn btn-sm" onClick={() => { setOwner(''); setQuery(''); }}>
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <span className="search-field">
                    <Search size={15} />
                    <input value={query} onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by name or email…" />
                  </span>
                  {matches.map((u) => (
                    <button key={u.id} className="nav-item" onClick={() => setOwner(String(u.id))}
                      style={{ height: 'auto', padding: '6px 8px' }}>
                      <Avatar name={label(u)} email={u.email} size={24} />
                      <span className="label truncate" style={{ fontSize: 13 }}>
                        {label(u)} <span style={{ color: 'var(--muted)' }}>{u.email}</span>
                      </span>
                    </button>
                  ))}
                </>
              )}
              <span style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>
                Reassigning hands this mailbox and its history to someone else.
              </span>
            </div>
          )}

          <ErrorNotice>{error}</ErrorNotice>
        </div>
        <div className="modal-foot">
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !local.trim()}>
            {busy ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* Who may administer mail. Appointing is portal-superadmin only, so for an
   ordinary mail admin this is a read-only list — shown rather than hidden,
   because knowing who else can reach your mail is not a secret. */
function AdminsTab({ canManage }) {
  const [rows, setRows] = useState(null);
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await adminListAdmins();
    setRows(res.error ? [] : asList(res));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!canManage) return;
    adminListUsers().then((res) => setUsers(res.error ? [] : asList(res)));
  }, [canManage]);

  const label = (u) => (`${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username);
  const already = new Set((rows || []).map((r) => String(r.user)));
  const term = query.trim().toLowerCase();
  const candidates = users
    .filter((u) => !already.has(String(u.id)))
    .filter((u) => !term || `${label(u)} ${u.email} ${u.username}`.toLowerCase().includes(term))
    .slice(0, 6);

  const add = async (u) => {
    setBusy(u.id);
    const res = await adminAddAdmin(u.id);
    setBusy(null);
    if (res.error) setError(res.error);
    else { setError(''); setQuery(''); load(); }
  };

  const remove = async (row) => {
    const ok = window.confirm(
      `Remove mail administration from ${row.user_name}?\n\n`
      + 'They keep any mailboxes they hold — only the ability to administer mail is withdrawn.');
    if (!ok) return;
    setBusy(row.user);
    const res = await adminRemoveAdmin(row.user);
    setBusy(null);
    if (res.error) setError(res.error);
    else { setError(''); load(); }
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="card" style={{ padding: '12px 16px', display: 'grid', gap: 4 }}>
        <strong style={{ fontSize: 13 }}>Mail administration only</strong>
        <span style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55 }}>
          People here can create mailboxes, decide who opens them, and read the
          access log. It gives them nothing outside mail — not finance, not HR,
          not the rest of the portal.
        </span>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {rows === null ? <p className="muted" style={{ padding: 16 }}>Loading…</p>
          : !rows.length ? <EmptyState title="Nobody yet" />
            : rows.map((r) => (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: 11, padding: '11px 16px',
                borderBottom: '1px solid var(--line-soft)',
              }}>
                <Avatar name={r.user_name} email={r.user_email} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }} className="truncate">
                    {r.user_name || `User ${r.user}`}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }} className="truncate">
                    {r.user_email}
                    {r.granted_by_name && <> · appointed by {r.granted_by_name}</>}
                  </div>
                </div>
                <span className={`chip ${r.source === 'superuser' ? 'chip-default' : 'chip-careers'}`}>
                  {r.source === 'superuser' ? 'Superadmin' : 'Mail admin'}
                </span>
                {canManage && r.removable && (
                  <button className="btn btn-sm btn-danger" disabled={busy === r.user}
                    onClick={() => remove(r)}>
                    {busy === r.user ? <Loader2 size={13} className="spin" /> : <UserMinus size={13} />}
                    {' '}Remove
                  </button>
                )}
              </div>
            ))}
      </div>

      {canManage ? (
        <div className="card" style={{ padding: 16, display: 'grid', gap: 8 }}>
          <span className="eyebrow">Appoint someone</span>
          <span className="search-field">
            <Search size={15} />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email…" />
          </span>
          {term && !candidates.length && (
            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
              Nobody matches — or they already administer mail.
            </p>
          )}
          {candidates.map((u) => (
            <button key={u.id} className="nav-item" disabled={busy === u.id}
              onClick={() => add(u)} style={{ height: 'auto', padding: '7px 8px' }}>
              <Avatar name={label(u)} email={u.email} size={26} />
              <span className="label" style={{ minWidth: 0 }}>
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
          <ErrorNotice>{error}</ErrorNotice>
        </div>
      ) : (
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
          Only a portal superadmin can appoint or remove mail administrators.
        </p>
      )}
    </div>
  );
}
