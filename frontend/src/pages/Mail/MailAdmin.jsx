import { useCallback, useEffect, useState } from 'react';
import {
  Shield, Plus, X, KeyRound, Users, Archive, RefreshCw, Loader2, Mail,
  History, Trash2,
} from 'lucide-react';
import {
  adminListMailboxes, adminCreateMailbox, adminUpdateMailbox, adminArchiveMailbox,
  adminSetMailboxPassword, adminListMailboxGrants, adminGrantMailbox,
  adminRevokeMailbox, adminMailAudit, listPortalUsers,
} from '../../apiClient';

/* Superadmin-only mailbox administration.
   Gated on the is_superuser ROLE, so promoting a colleague to superadmin gives
   them these powers immediately — nothing is tied to a specific account. */

const wrap = { padding: '28px 32px', maxWidth: 1180 };
const card = {
  border: '1px solid var(--outline-variant)', borderRadius: 12,
  background: 'var(--surface-container-lowest)', padding: 16,
};
const btn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
  borderRadius: 8, border: '1px solid var(--outline-variant)',
  background: 'var(--surface-container-low)', color: 'var(--text-main)',
  fontSize: 13, fontWeight: 700, cursor: 'pointer',
};
const btnPrimary = { ...btn, background: 'var(--primary)', color: '#fff', border: 'none' };
const input = {
  padding: '9px 12px', borderRadius: 8, border: '1px solid var(--outline-variant)',
  background: 'var(--surface-container-lowest)', color: 'var(--text-main)',
  fontSize: 13, width: '100%', boxSizing: 'border-box',
};
const label = {
  fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
  letterSpacing: '.04em', marginBottom: 5, display: 'block',
};
const MAIL_DOMAIN = '@mail.tiesverse.com';

export default function MailAdmin() {
  const [boxes, setBoxes] = useState(null);
  const [users, setUsers] = useState([]);
  const [creating, setCreating] = useState(null);
  const [grantsFor, setGrantsFor] = useState(null);
  const [pwdFor, setPwdFor] = useState(null);
  const [auditRows, setAuditRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 4500); };

  const load = useCallback(async () => {
    const res = await adminListMailboxes();
    if (res && !res.error) setBoxes(res.results || res);
    else { setBoxes([]); flash('error', res?.error || 'Could not load mailboxes.'); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    listPortalUsers().then((r) => { if (r && !r.error) setUsers(r.results || r || []); })
      .catch(() => {});
  }, []);

  const onCreate = async (e) => {
    e.preventDefault();
    const local = (creating.local || '').trim().toLowerCase();
    if (!local) { flash('error', 'Enter the address name.'); return; }
    setBusy(true);
    const res = await adminCreateMailbox({
      address: `${local}${MAIL_DOMAIN}`,
      kind: creating.kind,
      display_name: creating.display_name || '',
      user: creating.kind === 'PERSONAL' ? (creating.user || null) : null,
      daily_send_limit: Number(creating.daily_send_limit) || 200,
    });
    setBusy(false);
    if (res && !res.error) { setCreating(null); flash('ok', `Created ${res.address}.`); load(); }
    else flash('error', res?.error || res?.address?.[0] || 'Could not create the mailbox.');
  };

  const onArchive = async (b) => {
    if (!window.confirm(`Archive ${b.address}? It stops sending/receiving but the history is kept.`)) return;
    const res = await adminArchiveMailbox(b.id);
    if (res && !res.error) { flash('ok', 'Mailbox archived.'); load(); }
    else flash('error', res?.error || 'Could not archive.');
  };

  const onToggleActive = async (b) => {
    const res = await adminUpdateMailbox(b.id, { is_active: !b.is_active, is_archived: false });
    if (res && !res.error) load();
    else flash('error', res?.error || 'Could not update.');
  };

  const openAudit = async () => {
    setAuditRows('loading');
    const res = await adminMailAudit();
    setAuditRows(res && !res.error ? res : []);
  };

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <Shield size={22} style={{ color: 'var(--primary)' }} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-main)' }}>Manage mailboxes</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            Create and control every {MAIL_DOMAIN} address
          </div>
        </div>
        <button style={btn} onClick={openAudit}><History size={14} /> Audit log</button>
        <button style={btn} onClick={load}><RefreshCw size={14} /> Refresh</button>
        <button style={btnPrimary} onClick={() => setCreating({ kind: 'PERSONAL', daily_send_limit: 200 })}>
          <Plus size={15} /> New mailbox
        </button>
      </div>

      {msg && (
        <div style={{
          marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: msg.type === 'error' ? 'rgba(185,28,28,.1)' : 'rgba(6,122,80,.1)',
          color: msg.type === 'error' ? '#b91c1c' : '#067a50',
        }}>{msg.text}</div>
      )}

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        {boxes === null ? (
          <div style={{ padding: 36, textAlign: 'center', color: 'var(--text-muted)' }}>
            <Loader2 size={18} className="spin" /> Loading…
          </div>
        ) : boxes.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13.5 }}>
            No mailboxes yet. Create the first one — e.g. <b>ashutosh{MAIL_DOMAIN}</b>.
          </div>
        ) : boxes.map((b) => (
          <div key={b.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
            borderBottom: '1px solid var(--surface-container-low)', flexWrap: 'wrap',
            opacity: b.is_archived ? 0.55 : 1,
          }}>
            <Mail size={16} style={{ color: 'var(--text-muted)' }} />
            <div style={{ flex: 1, minWidth: 210 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-main)' }}>
                {b.address}
                <span style={{
                  marginLeft: 8, fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 5,
                  background: b.kind === 'SHARED' ? 'rgba(180,83,9,.14)' : 'color-mix(in srgb, var(--primary) 12%, transparent)',
                  color: b.kind === 'SHARED' ? '#b45309' : 'var(--primary)',
                }}>{b.kind}</span>
                {b.is_archived && <span style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--text-muted)' }}>ARCHIVED</span>}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                {b.display_name || '—'}{b.owner_name ? ` · ${b.owner_name}` : ''}
                {b.kind === 'SHARED' ? ` · ${b.grant_count} with access` : ''}
                {b.has_access_password ? ' · password set' : ''}
                {` · cap ${b.daily_send_limit}/day`}
              </div>
            </div>
            {b.kind === 'SHARED' && (
              <>
                <button style={btn} onClick={() => setGrantsFor(b)}><Users size={13} /> Access</button>
                <button style={btn} onClick={() => setPwdFor(b)}><KeyRound size={13} /> Password</button>
              </>
            )}
            <button style={btn} onClick={() => onToggleActive(b)}>
              {b.is_active ? 'Pause' : 'Activate'}
            </button>
            {!b.is_archived && (
              <button style={{ ...btn, color: '#b91c1c' }} onClick={() => onArchive(b)}>
                <Archive size={13} />
              </button>
            )}
          </div>
        ))}
      </div>

      {creating && (
        <Modal onClose={() => setCreating(null)} title="New mailbox">
          <form onSubmit={onCreate}>
            <div style={{ marginBottom: 10 }}>
              <label style={label}>Type</label>
              <select style={input} value={creating.kind}
                onChange={(e) => setCreating({ ...creating, kind: e.target.value })}>
                <option value="PERSONAL">Personal — one person's mailbox</option>
                <option value="SHARED">Shared — a team mailbox (e.g. nimble@)</option>
              </select>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={label}>Address</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input style={input} value={creating.local || ''} placeholder="ashutosh"
                  onChange={(e) => setCreating({ ...creating, local: e.target.value })} required />
                <span style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {MAIL_DOMAIN}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Lowercase letters, digits, dot, underscore, hyphen.
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={label}>Display name</label>
              <input style={input} value={creating.display_name || ''} placeholder="Ashutosh Patra"
                onChange={(e) => setCreating({ ...creating, display_name: e.target.value })} />
            </div>
            {creating.kind === 'PERSONAL' && (
              <div style={{ marginBottom: 10 }}>
                <label style={label}>Portal account (who can open it)</label>
                <select style={input} value={creating.user || ''}
                  onChange={(e) => setCreating({ ...creating, user: e.target.value })}>
                  <option value="">— select a user —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.username}{u.email ? ` (${u.email})` : ''}</option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              <label style={label}>Daily send limit</label>
              <input style={input} type="number" min="1" value={creating.daily_send_limit}
                onChange={(e) => setCreating({ ...creating, daily_send_limit: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" style={btn} onClick={() => setCreating(null)}>Cancel</button>
              <button type="submit" style={btnPrimary} disabled={busy}>
                {busy ? 'Creating…' : 'Create mailbox'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {grantsFor && (
        <GrantsModal box={grantsFor} users={users} onClose={() => { setGrantsFor(null); load(); }}
          flash={flash} />
      )}

      {pwdFor && (
        <PasswordModal box={pwdFor} onClose={() => { setPwdFor(null); load(); }} flash={flash} />
      )}

      {auditRows !== null && (
        <Modal onClose={() => setAuditRows(null)} title="Mail audit log" wide>
          {auditRows === 'loading' ? (
            <div style={{ color: 'var(--text-muted)' }}><Loader2 size={16} className="spin" /> Loading…</div>
          ) : auditRows.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nothing recorded yet.</div>
          ) : auditRows.map((r) => (
            <div key={r.id} style={{
              fontSize: 12.5, padding: '7px 0', borderBottom: '1px solid var(--surface-container-low)',
              color: 'var(--text-main)',
            }}>
              <b>{r.actor_name}</b> · {r.action} {r.mailbox_address ? `· ${r.mailbox_address}` : ''}
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {r.note} — {new Date(r.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </Modal>
      )}

      <style>{`.spin{animation:tm-spin 1s linear infinite}@keyframes tm-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function Modal({ title, children, onClose, wide }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 200,
      display: 'grid', placeItems: 'center', padding: 20,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        ...card, width: '100%', maxWidth: wide ? 720 : 480, maxHeight: '88vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-main)' }}>{title}</div>
          <div style={{ flex: 1 }} />
          <button style={{ ...btn, padding: 6 }} onClick={onClose}><X size={15} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function GrantsModal({ box, users, onClose, flash }) {
  const [rows, setRows] = useState(null);
  const [pick, setPick] = useState('');

  const load = useCallback(async () => {
    const res = await adminListMailboxGrants(box.id);
    setRows(res && !res.error ? res : []);
  }, [box.id]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!pick) return;
    const res = await adminGrantMailbox(box.id, pick);
    if (res && !res.error) { setPick(''); load(); }
    else flash('error', res?.error || 'Could not grant access.');
  };
  const remove = async (userId) => {
    const res = await adminRevokeMailbox(box.id, userId);
    if (res && !res.error) load();
    else flash('error', res?.error || 'Could not revoke.');
  };

  return (
    <Modal title={`Access — ${box.address}`} onClose={onClose}>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12 }}>
        Everyone listed here can read this mailbox and send from it. Each send is
        recorded against the person who sent it.
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <select style={input} value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">— add a person —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.username}{u.email ? ` (${u.email})` : ''}</option>
          ))}
        </select>
        <button style={btnPrimary} onClick={add} disabled={!pick}><Plus size={14} /></button>
      </div>
      {rows === null ? <div style={{ color: 'var(--text-muted)' }}>Loading…</div>
        : rows.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nobody has access yet.</div>
        : rows.map((r) => (
          <div key={r.id} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0',
            borderBottom: '1px solid var(--surface-container-low)', fontSize: 13,
          }}>
            <span style={{ flex: 1, color: 'var(--text-main)' }}>{r.user_name || `User ${r.user}`}</span>
            <button style={{ ...btn, padding: 5, color: '#b91c1c' }} onClick={() => remove(r.user)}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
    </Modal>
  );
}

function PasswordModal({ box, onClose, flash }) {
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (clear) => {
    setBusy(true);
    const res = await adminSetMailboxPassword(box.id, clear ? '' : pwd);
    setBusy(false);
    if (res && !res.error) { flash('ok', clear ? 'Password cleared.' : 'Password set.'); onClose(); }
    else flash('error', res?.error || 'Could not set the password.');
  };

  return (
    <Modal title={`Team password — ${box.address}`} onClose={onClose}>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
        Setting a password lets the team sign in to <b>this mailbox only</b> at
        mail.tiesverse.com, without needing a portal account. Clearing it disables
        that sign-in. It is stored hashed and can be rotated any time.
      </div>
      <label style={label}>New password</label>
      <input style={input} type="text" value={pwd} onChange={(e) => setPwd(e.target.value)}
        placeholder="at least 8 characters" />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        {box.has_access_password && (
          <button style={{ ...btn, color: '#b91c1c' }} onClick={() => save(true)} disabled={busy}>
            Clear password
          </button>
        )}
        <button style={btn} onClick={onClose} disabled={busy}>Cancel</button>
        <button style={btnPrimary} onClick={() => save(false)} disabled={busy || pwd.length < 8}>
          {busy ? 'Saving…' : 'Set password'}
        </button>
      </div>
    </Modal>
  );
}
