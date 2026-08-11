import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, Table2, LayoutGrid, Plus, RefreshCw, Search, X, Loader2,
  ChevronLeft, ChevronRight, ExternalLink, Trash2, Filter, User, Archive, RotateCcw,
} from 'lucide-react';
import {
  getContentBoard, createContentItem, updateContentItem, deleteContentItem,
  moveContentItem, rescheduleContentItem, getContentActivity,
  createContentCategory, archiveContentItem, publishContentToMedia,
} from '../../apiClient';
import ContentPanel from './ContentPanel.jsx';

/* Content Calendar — the Content department's planning workspace.

   One dataset, three ways to look at it:
     Table    — every field, for scanning and editing
     Board    — Kanban by production stage; dragging a card moves the stage
     Calendar — month grid keyed on release date; dragging a chip reschedules

   Clicking anything opens the side panel, which is the single place an item is
   edited. Items optionally own a real Task, so assigned work shows up in the
   person's normal task list rather than a second invisible tracker. */

const wrap = { padding: '24px 28px', maxWidth: 1500 };
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
  padding: '8px 11px', borderRadius: 8, border: '1px solid var(--outline-variant)',
  background: 'var(--surface-container-lowest)', color: 'var(--text-main)',
  fontSize: 13, outline: 'none', width: '100%',
};

const STATUS_COLOR = {
  idea: '#7c7267', scripting: '#2563eb', design: '#7c3aed', editing: '#c2410c',
  review: '#b45309', scheduled: '#0891b2', published: '#067a50',
};
const PRIORITY_COLOR = { low: '#7c7267', medium: '#2563eb', high: '#c2410c', urgent: '#b91c1c' };

const iso = (d) => {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};
const fmtDay = (v) => (v ? new Date(v).toLocaleDateString([], { day: 'numeric', month: 'short' }) : '—');
const initials = (n) => (n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');

function Pill({ text, color, title }) {
  return (
    <span title={title} style={{
      fontSize: 11, fontWeight: 800, letterSpacing: '.02em', padding: '3px 8px',
      borderRadius: 20, whiteSpace: 'nowrap',
      color, background: `color-mix(in srgb, ${color} 13%, transparent)`,
    }}>{text}</span>
  );
}

/* One person's face. Uses their real profile picture when they have one and
   falls back to initials — a broken image would otherwise leave a blank hole,
   so a failed load flips back to initials too. */
function Face({ person, size = 24, style }) {
  const [broken, setBroken] = useState(false);
  const src = !broken ? (person.avatar_url || '') : '';
  return (
    <span title={person.name} style={{
      width: size, height: size, borderRadius: '50%', display: 'grid', placeItems: 'center',
      overflow: 'hidden', flex: 'none',
      fontSize: size * 0.38, fontWeight: 800,
      background: 'color-mix(in srgb, var(--primary) 16%, transparent)',
      color: 'var(--primary)', border: '2px solid var(--surface-container-lowest)',
      ...style,
    }}>
      {src
        ? <img src={src} alt="" onError={() => setBroken(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : initials(person.name)}
    </span>
  );
}

function Avatars({ people = [], size = 24 }) {
  if (!people.length) return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>;
  return (
    <span style={{ display: 'inline-flex' }}>
      {people.slice(0, 3).map((p, i) => (
        <Face key={p.id} person={p} size={size} style={{ marginLeft: i ? -7 : 0 }} />
      ))}
      {people.length > 3 && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 5, alignSelf: 'center' }}>
          +{people.length - 3}
        </span>
      )}
    </span>
  );
}

export default function ContentCalendar() {
  const [view, setView] = useState('table');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [mine, setMine] = useState(false);
  const [fStatus, setFStatus] = useState('');
  const [fBrand, setFBrand] = useState('');
  // Which category's pill is active at the top of the board ('' = all).
  const [fCategory, setFCategory] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  // Long boards are unreadable in one go; show a slice with an explicit
  // "show all" rather than paginating.
  const [showAll, setShowAll] = useState(false);
  const TOP_N = 12;
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });

  const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 4000); };

  const load = useCallback(async (mineOnly, archived = false) => {
    setLoading(true);
    const res = await getContentBoard(mineOnly, archived);
    if (res && !res.error) setData(res);
    else flash('error', res?.error || 'Could not load the calendar.');
    setLoading(false);
  }, []);

  useEffect(() => { load(mine, showArchived); }, [load, mine, showArchived]);

  const choices = data?.choices || {};
  const canEdit = data?.tier === 'full' || data?.tier === 'member';

  const items = useMemo(() => {
    let list = data?.items || [];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((i) => `${i.title} ${i.brand} ${i.notes}`.toLowerCase().includes(q));
    if (fStatus) list = list.filter((i) => i.status === fStatus);
    if (fBrand) list = list.filter((i) => i.brand === fBrand);
    if (fCategory) list = list.filter((i) => String(i.category) === String(fCategory));
    return list;
  }, [data, search, fStatus, fBrand, fCategory]);

  const categories = data?.categories || [];
  // The slice the views actually render; `items` stays the full filtered set so
  // the counter can say how many are hidden.
  const visibleItems = showAll ? items : items.slice(0, TOP_N);

  const refreshItem = (updated) => {
    setData((d) => (d ? { ...d, items: d.items.map((i) => (i.id === updated.id ? updated : i)) } : d));
    setSelected((s) => (s && s.id === updated.id ? updated : s));
  };

  const onSave = async (id, payload) => {
    const res = id ? await updateContentItem(id, payload) : await createContentItem(payload);
    if (res && !res.error) {
      if (id) refreshItem(res);
      else { setData((d) => ({ ...d, items: [res, ...(d?.items || [])] })); setSelected(res); }
      setCreating(false);
      flash('ok', id ? 'Saved.' : 'Content added.');
      return res;
    }
    flash('error', res?.error || 'Could not save.');
    return null;
  };

  // Creating a category from inside the panel; the new one is merged into
  // local state so the picker shows it immediately.
  const onCreateCategory = async (name) => {
    const res = await createContentCategory({ name });
    if (res && !res.error) {
      setData((d) => (d ? { ...d, categories: [...(d.categories || []), res] } : d));
      return res;
    }
    flash('error', res?.error || 'Could not create the category.');
    return null;
  };

  const onArchive = async (id, restore = false) => {
    const res = await archiveContentItem(id, restore);
    if (res && !res.error) {
      // The item leaves whichever list is on screen, since board and archive
      // are opposite filters of the same data.
      setData((d) => (d ? { ...d, items: d.items.filter((i) => i.id !== id) } : d));
      setSelected(null);
      flash('ok', restore ? 'Restored to the board.' : 'Archived.');
    } else flash('error', res?.error || 'Could not archive.');
  };

  const onPublishMedia = async (id) => {
    const res = await publishContentToMedia(id);
    if (res && !res.error) {
      setData((d) => (d ? {
        ...d,
        items: d.items.map((i) => (i.id === id ? { ...i, media_post_id: res.media_post_id } : i)),
      } : d));
      flash('ok', res.created ? 'Published to the Media page.' : 'Media post updated.');
    } else flash('error', res?.error || 'Could not publish.');
    return res;
  };

  const onDelete = async (id) => {
    if (!window.confirm('Delete this content item? This cannot be undone.')) return;
    const res = await deleteContentItem(id);
    if (res && !res.error) {
      setData((d) => ({ ...d, items: d.items.filter((i) => i.id !== id) }));
      setSelected(null);
      flash('ok', 'Deleted.');
    } else flash('error', res?.error || 'Could not delete.');
  };

  const onMove = async (id, status) => {
    const prev = data.items;
    setData((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, status } : i)) }));
    const res = await moveContentItem(id, { status });
    if (res && !res.error) refreshItem(res);
    else { setData((d) => ({ ...d, items: prev })); flash('error', res?.error || 'Move failed.'); }
  };

  const onReschedule = async (id, date) => {
    const prev = data.items;
    setData((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, release_date: date } : i)) }));
    const res = await rescheduleContentItem(id, date);
    if (res && !res.error) { refreshItem(res); flash('ok', `Moved to ${fmtDay(date)}.`); }
    else { setData((d) => ({ ...d, items: prev })); flash('error', res?.error || 'Reschedule failed.'); }
  };

  return (
    <div style={wrap}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <CalendarDays size={22} style={{ color: 'var(--primary)' }} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-main)' }}>Content Calendar</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            Plan, assign and schedule everything the Content team publishes
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 3, background: 'var(--surface-container-low)', padding: 3, borderRadius: 9 }}>
          {[['table', 'Table', Table2], ['board', 'Board', LayoutGrid], ['calendar', 'Calendar', CalendarDays]]
            .map(([k, label, I]) => (
              <button key={k} onClick={() => setView(k)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px',
                borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                background: view === k ? 'var(--surface-container-lowest)' : 'transparent',
                color: view === k ? 'var(--text-main)' : 'var(--text-muted)',
                boxShadow: view === k ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
              }}><I size={14} /> {label}</button>
            ))}
        </div>
        <button style={btn} onClick={() => load(mine)} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'nm-spin' : ''} />
        </button>
        {canEdit && (
          <button style={btnPrimary} onClick={() => { setCreating(true); setSelected(null); }}>
            <Plus size={15} /> New
          </button>
        )}
      </div>

      {msg && (
        <div style={{
          padding: '9px 13px', borderRadius: 8, marginBottom: 14, fontSize: 13, fontWeight: 600,
          background: msg.type === 'error' ? 'rgba(185,28,28,.1)' : 'rgba(6,122,80,.1)',
          color: msg.type === 'error' ? '#b91c1c' : '#067a50',
        }}>{msg.text}</div>
      )}

      {/* Categories — brands and projects, as pills across the top of the
          board. This is the "group by project" row: one tap narrows every
          view, and the counts say how much work each project is carrying. */}
      {(categories.length > 0 || (data?.archived_count || 0) > 0) && (
        <div className="cc-pills" style={{
          display: 'flex', gap: 8, marginBottom: 12, overflowX: 'auto', paddingBottom: 4,
        }}>
          <button
            type="button" onClick={() => setFCategory('')}
            style={{
              ...btn, flex: 'none', borderRadius: 999, padding: '7px 14px',
              ...(fCategory === '' ? { background: 'var(--primary)', color: '#fff', border: 'none' } : {}),
            }}
          >
            All <span style={{ opacity: .7, marginLeft: 4 }}>{data?.items?.length || 0}</span>
          </button>
          {categories.map((c) => (
            <button
              key={c.id} type="button"
              onClick={() => setFCategory(String(fCategory) === String(c.id) ? '' : String(c.id))}
              style={{
                ...btn, flex: 'none', borderRadius: 999, padding: '7px 14px', whiteSpace: 'nowrap',
                ...(String(fCategory) === String(c.id)
                  ? { background: 'var(--primary)', color: '#fff', border: 'none' } : {}),
              }}
            >
              {c.name}
              <span style={{ opacity: .7, marginLeft: 4 }}>{c.item_count ?? 0}</span>
            </button>
          ))}
          <button
            type="button" onClick={() => { setShowArchived((v) => !v); setShowAll(false); }}
            title="Archived items keep their record but leave the board"
            style={{
              ...btn, flex: 'none', borderRadius: 999, padding: '7px 14px', marginLeft: 'auto',
              ...(showArchived ? { background: 'var(--primary)', color: '#fff', border: 'none' } : {}),
            }}
          >
            <Archive size={13} /> Archive
            {(data?.archived_count || 0) > 0 && (
              <span style={{ opacity: .7, marginLeft: 4 }}>{data.archived_count}</span>
            )}
          </button>
        </div>
      )}

      {/* filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 340 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
          <input style={{ ...input, paddingLeft: 31 }} value={search} placeholder="Search content…"
            onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select style={{ ...input, width: 'auto' }} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">All stages</option>
          {(choices.statuses || []).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {(choices.brands || []).length > 0 && (
          <select style={{ ...input, width: 'auto' }} value={fBrand} onChange={(e) => setFBrand(e.target.value)}>
            <option value="">All brands</option>
            {choices.brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
        <button style={{ ...btn, ...(mine ? { borderColor: 'var(--primary)', color: 'var(--primary)' } : {}) }}
          onClick={() => setMine((m) => !m)}>
          <User size={14} /> Mine
        </button>
        {(search || fStatus || fBrand || mine) && (
          <button style={btn} onClick={() => { setSearch(''); setFStatus(''); setFBrand(''); setMine(false); }}>
            <X size={14} /> Clear
          </button>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          {loading ? '…' : `${items.length} item${items.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {loading && !data ? (
        <div style={{ ...card, padding: 50, textAlign: 'center', color: 'var(--text-muted)' }}>
          <Loader2 size={22} className="nm-spin" /> Loading…
        </div>
      ) : view === 'table' ? (
        <TableView items={visibleItems} onOpen={setSelected} onArchive={onArchive}
          archived={showArchived} canEdit={canEdit} />
      ) : view === 'board' ? (
        <BoardView items={visibleItems} choices={choices} onOpen={setSelected} onMove={onMove} canEdit={canEdit} />
      ) : (
        <MonthView items={items} month={month} setMonth={setMonth}
          onOpen={setSelected} onReschedule={onReschedule} canEdit={canEdit} />
      )}

      {/* Long lists are shown a screenful at a time; the count makes the
          truncation explicit rather than silently hiding work. */}
      {!loading && view !== 'calendar' && items.length > TOP_N && (
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button style={btn} onClick={() => setShowAll((v) => !v)}>
            {showAll
              ? `Show top ${TOP_N}`
              : `Show all ${items.length} (${items.length - TOP_N} more)`}
          </button>
        </div>
      )}

      {(selected || creating) && (
        <ContentPanel
          item={creating ? null : selected}
          choices={choices}
          members={data?.members || []}
          canEdit={canEdit}
          onClose={() => { setSelected(null); setCreating(false); }}
          onSave={onSave}
          onDelete={onDelete}
          loadActivity={getContentActivity}
          categories={categories}
          onCreateCategory={onCreateCategory}
          onPublishMedia={onPublishMedia}
        />
      )}

      <style>{`.nm-spin{animation:nmspin 1s linear infinite}@keyframes nmspin{to{transform:rotate(360deg)}}
        .cc-pills::-webkit-scrollbar{height:0}
        @media(max-width:900px){
          .cc-table{display:none!important}
          .cc-cards{display:flex!important}
        }`}</style>
    </div>
  );
}

/* ── table ─────────────────────────────────────────────────────────────── */
function TableView({ items, onOpen, onArchive, archived = false, canEdit = false }) {
  const th = {
    textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 800,
    textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)',
    borderBottom: '1px solid var(--outline-variant)', whiteSpace: 'nowrap',
  };
  const td = { padding: '11px 12px', fontSize: 13, borderBottom: '1px solid var(--surface-container-low)' };

  if (!items.length) {
    return <div style={{ ...card, padding: 50, textAlign: 'center', color: 'var(--text-muted)' }}>
      {archived
        ? 'Nothing archived yet.'
        : <>No content yet. Click <b>New</b> to plan the first piece.</>}
    </div>;
  }
  return (
    <>
    {/* Phone: a table with ten columns is unusable at 390px, so the same rows
        render as cards. One tap opens the panel, exactly as the row does. */}
    <div className="cc-cards" style={{ display: 'none', flexDirection: 'column', gap: 10 }}>
      {items.map((i) => (
        <div key={i.id} onClick={() => onOpen(i)} style={{ ...card, padding: 14, cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <strong style={{ fontSize: 14.5, lineHeight: 1.35, color: 'var(--text-main)' }}>{i.title}</strong>
            <Pill text={i.status} color={STATUS_COLOR[i.status] || '#7c7267'} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 9 }}>
            {i.category_detail?.name && (
              <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--primary)' }}>
                {i.category_detail.name}
              </span>
            )}
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{i.content_type}</span>
            {i.release_date && (
              <span style={{ fontSize: 12, color: 'var(--text-main)', fontWeight: 600 }}>
                {fmtDay(i.release_date)}
              </span>
            )}
            {i.is_overdue && (
              <span style={{ fontSize: 10.5, fontWeight: 800, color: '#b91c1c' }}>OVERDUE</span>
            )}
          </div>
          {(i.content_assignees_detail?.length > 0 || i.editor_assignees_detail?.length > 0
            || i.graphics_assignees_detail?.length > 0) && (
            <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
              <Avatars people={i.content_assignees_detail} />
              <Avatars people={i.editor_assignees_detail} />
              <Avatars people={i.graphics_assignees_detail} />
            </div>
          )}
          {canEdit && onArchive && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onArchive(i.id, archived); }}
              style={{
                marginTop: 12, minHeight: 40, width: '100%', borderRadius: 8, fontSize: 12.5,
                fontWeight: 700, border: '1px solid var(--outline-variant)',
                background: 'var(--surface-container-low)', color: 'var(--text-muted)', cursor: 'pointer',
              }}
            >
              {archived ? 'Restore to board' : 'Archive'}
            </button>
          )}
        </div>
      ))}
    </div>

    <div className="cc-table" style={{ ...card, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1050 }}>
        <thead>
          <tr>
            <th style={th}>Content</th><th style={th}>Category</th><th style={th}>Type</th>
            <th style={th}>Stage</th><th style={th}>Writer</th><th style={th}>Editor</th><th style={th}>Graphics</th>
            <th style={th}>Due</th><th style={th}>Release</th><th style={th}>Platforms</th>
            <th style={th}>Priority</th>
            {canEdit && onArchive && <th style={th} />}
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} onClick={() => onOpen(i)} style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-container-low)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
              <td style={{ ...td, fontWeight: 700, color: 'var(--text-main)', maxWidth: 300 }}>
                {i.title}
                {i.is_overdue && <span style={{ marginLeft: 7, fontSize: 10.5, fontWeight: 800, color: '#b91c1c' }}>OVERDUE</span>}
              </td>
              <td style={{ ...td, color: 'var(--text-muted)' }}>{i.category_detail?.name || i.brand || '—'}</td>
              <td style={{ ...td, color: 'var(--text-muted)' }}>{i.content_type}</td>
              <td style={td}><Pill text={i.status} color={STATUS_COLOR[i.status] || '#7c7267'} /></td>
              <td style={td}><Avatars people={i.content_assignees_detail} /></td>
              <td style={td}><Avatars people={i.editor_assignees_detail} /></td>
              <td style={td}><Avatars people={i.graphics_assignees_detail} /></td>
              <td style={{ ...td, color: i.is_overdue ? '#b91c1c' : 'var(--text-muted)', fontWeight: i.is_overdue ? 700 : 400 }}>
                {fmtDay(i.due_date)}
              </td>
              <td style={{ ...td, color: 'var(--text-main)', fontWeight: 600 }}>{fmtDay(i.release_date)}</td>
              <td style={{ ...td, color: 'var(--text-muted)', fontSize: 12 }}>
                {(i.platforms || []).join(', ') || '—'}
              </td>
              <td style={td}><Pill text={i.priority} color={PRIORITY_COLOR[i.priority] || '#7c7267'} /></td>
              {canEdit && onArchive && (
                <td style={td}>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onArchive(i.id, archived); }}
                    title={archived ? 'Restore to the board' : 'Archive (keeps the record)'}
                    style={{
                      border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)',
                      color: 'var(--text-muted)', borderRadius: 7, padding: '5px 9px',
                      fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    {archived ? 'Restore' : 'Archive'}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

/* ── kanban ────────────────────────────────────────────────────────────── */
function BoardView({ items, choices, onOpen, onMove, canEdit }) {
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const cols = choices.statuses || [];

  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
      {cols.map((col) => {
        const colItems = items.filter((i) => i.status === col.value);
        const hot = overCol === col.value;
        return (
          <div key={col.value}
            onDragOver={(e) => { if (canEdit) { e.preventDefault(); setOverCol(col.value); } }}
            onDragLeave={() => setOverCol((c) => (c === col.value ? null : c))}
            onDrop={(e) => {
              e.preventDefault(); setOverCol(null);
              if (canEdit && dragId) onMove(dragId, col.value);
              setDragId(null);
            }}
            style={{
              ...card, minWidth: 250, width: 250, flex: 'none', padding: 10,
              background: hot ? 'color-mix(in srgb, var(--primary) 7%, var(--surface-container-lowest))'
                              : 'var(--surface-container-lowest)',
              outline: hot ? '2px dashed var(--primary)' : 'none',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10, padding: '0 3px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[col.value] }} />
              <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-main)' }}>{col.label}</span>
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginLeft: 'auto' }}>{colItems.length}</span>
            </div>
            {colItems.map((i) => (
              <div key={i.id}
                draggable={canEdit}
                onDragStart={(e) => {
                  // Firefox ignores a drag that carries no data.
                  try { e.dataTransfer.setData('text/plain', String(i.id)); } catch { /* ignore */ }
                  e.dataTransfer.effectAllowed = 'move';
                  setDragId(i.id);
                }}
                onDragEnd={() => { setDragId(null); setOverCol(null); }}
                onClick={() => onOpen(i)}
                style={{
                  border: '1px solid var(--outline-variant)', borderRadius: 9, padding: 10,
                  marginBottom: 8, background: 'var(--surface-container-low)',
                  cursor: canEdit ? 'grab' : 'pointer', opacity: dragId === i.id ? 0.45 : 1,
                }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', marginBottom: 6, lineHeight: 1.35 }}>
                  {i.title}
                </div>
                {i.brand && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 6 }}>{i.brand}</div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Avatars people={[...(i.content_assignees_detail || []), ...(i.graphics_assignees_detail || [])]} size={21} />
                  <div style={{ flex: 1 }} />
                  {i.release_date && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtDay(i.release_date)}</span>
                  )}
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[i.priority] }} />
                </div>
              </div>
            ))}
            {!colItems.length && (
              <div style={{ padding: '18px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                {hot ? 'Drop here' : '—'}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── month calendar ────────────────────────────────────────────────────── */
function MonthView({ items, month, setMonth, onOpen, onReschedule, canEdit }) {
  const [dragId, setDragId] = useState(null);
  const [overDay, setOverDay] = useState(null);

  const y = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(y, m, 1);
  const pad = first.getDay();
  const days = new Date(y, m + 1, 0).getDate();

  const byDay = useMemo(() => {
    const map = {};
    items.forEach((i) => {
      if (!i.release_date) return;
      (map[i.release_date] = map[i.release_date] || []).push(i);
    });
    return map;
  }, [items]);

  const cells = [];
  for (let i = 0; i < pad; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(y, m, d));
  const todayKey = iso(new Date());
  const unscheduled = items.filter((i) => !i.release_date);

  return (
    <>
      <div style={{ ...card, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button style={btn} onClick={() => setMonth(new Date(y, m - 1, 1))}><ChevronLeft size={15} /></button>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-main)', minWidth: 150, textAlign: 'center' }}>
            {month.toLocaleDateString([], { month: 'long', year: 'numeric' })}
          </div>
          <button style={btn} onClick={() => setMonth(new Date(y, m + 1, 1))}><ChevronRight size={15} /></button>
          <button style={btn} onClick={() => { const d = new Date(); d.setDate(1); setMonth(d); }}>Today</button>
          {canEdit && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
              Drag an item to another day to reschedule
            </span>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 1, background: 'var(--outline-variant)' }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} style={{
              padding: '7px 4px', textAlign: 'center', fontSize: 11, fontWeight: 800,
              color: 'var(--text-muted)', background: 'var(--surface-container-low)',
            }}>{d}</div>
          ))}
          {cells.map((date, idx) => {
            const key = date ? iso(date) : `pad-${idx}`;
            const dayItems = date ? (byDay[key] || []) : [];
            const isToday = date && key === todayKey;
            const hot = overDay === key;
            return (
              <div key={key}
                onDragOver={(e) => { if (canEdit && date) { e.preventDefault(); setOverDay(key); } }}
                onDragLeave={() => setOverDay((k) => (k === key ? null : k))}
                onDrop={(e) => {
                  e.preventDefault(); setOverDay(null);
                  if (canEdit && date && dragId) onReschedule(dragId, key);
                  setDragId(null);
                }}
                style={{
                  minHeight: 104, padding: 6, background: !date ? 'var(--surface-container-low)'
                    : hot ? 'color-mix(in srgb, var(--primary) 10%, var(--surface-container-lowest))'
                    : 'var(--surface-container-lowest)',
                  outline: hot ? '2px dashed var(--primary)' : 'none', outlineOffset: -2,
                }}>
                {date && (
                  <div style={{
                    fontSize: 11.5, fontWeight: isToday ? 900 : 600, marginBottom: 5,
                    color: isToday ? 'var(--primary)' : 'var(--text-muted)',
                  }}>{date.getDate()}</div>
                )}
                {dayItems.slice(0, 3).map((i) => (
                  <div key={i.id}
                    draggable={canEdit}
                    onDragStart={(e) => { try { e.dataTransfer.setData('text/plain', String(i.id)); } catch { /* ignore */ } e.dataTransfer.effectAllowed = 'move'; setDragId(i.id); }}
                    onDragEnd={() => { setDragId(null); setOverDay(null); }}
                    onClick={() => onOpen(i)}
                    title={i.title}
                    style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 6px', borderRadius: 5,
                      marginBottom: 3, cursor: canEdit ? 'grab' : 'pointer',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      opacity: dragId === i.id ? 0.45 : 1,
                      color: STATUS_COLOR[i.status] || '#7c7267',
                      background: `color-mix(in srgb, ${STATUS_COLOR[i.status] || '#7c7267'} 14%, transparent)`,
                    }}>{i.title}</div>
                ))}
                {dayItems.length > 3 && (
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)', paddingLeft: 4 }}>
                    +{dayItems.length - 3} more
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {unscheduled.length > 0 && (
        <div style={{ ...card, padding: 12, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 8,
                        textTransform: 'uppercase', letterSpacing: '.04em' }}>
            No release date ({unscheduled.length}) — drag onto a day to schedule
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {unscheduled.map((i) => (
              <div key={i.id}
                draggable={canEdit}
                onDragStart={(e) => { try { e.dataTransfer.setData('text/plain', String(i.id)); } catch { /* ignore */ } e.dataTransfer.effectAllowed = 'move'; setDragId(i.id); }}
                onDragEnd={() => setDragId(null)}
                onClick={() => onOpen(i)}
                style={{
                  fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 7,
                  cursor: canEdit ? 'grab' : 'pointer', opacity: dragId === i.id ? 0.45 : 1,
                  border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)',
                  color: 'var(--text-main)',
                }}>{i.title}</div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export { STATUS_COLOR, PRIORITY_COLOR, Pill, Avatars, Face, fmtDay, iso, btn, btnPrimary, input, card };
