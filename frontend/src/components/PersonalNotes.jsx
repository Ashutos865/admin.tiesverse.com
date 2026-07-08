import { useEffect, useState, useRef } from 'react';
import { getMyNotes, createNote, updateNote, deleteNote } from '../apiClient';
import { Plus, X } from 'lucide-react';

const COLORS = ['#fff7cc', '#d7ecff', '#d9f8e3', '#ffe0ef', '#e6e0ff', '#ffe8cc'];
const ROT = ['-1.4deg', '1.2deg', '-0.8deg', '1.6deg', '-1deg', '0.8deg'];

export default function PersonalNotes() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyNotes()
      .then((r) => setNotes(Array.isArray(r) ? r : (r?.results || [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const add = async () => {
    const color = COLORS[notes.length % COLORS.length];
    const res = await createNote({ content: '', color, order: notes.length });
    if (res?.id) setNotes((n) => [...n, res]);
  };
  const patch = async (id, data) => {
    setNotes((n) => n.map((x) => (x.id === id ? { ...x, ...data } : x)));
    await updateNote(id, data).catch(() => {});
  };
  const remove = async (id) => {
    setNotes((n) => n.filter((x) => x.id !== id));
    await deleteNote(id).catch(() => {});
  };

  return (
    <section style={{ margin: '0 0 26px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-main, #111827)' }}>📝 My Notes</h2>
        <span style={{ fontSize: 13, color: 'var(--text-muted, #6b7280)' }}>your private scratchpad</span>
        <button type="button" onClick={add}
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--primary, #6366f1)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          <Plus size={15} /> Add note
        </button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted, #6b7280)', fontSize: 13, margin: 0 }}>Loading…</p>
      ) : notes.length === 0 ? (
        <div style={{ background: '#fff7cc', color: '#7c6f1f', borderRadius: 6, padding: '18px 22px', transform: 'rotate(-1deg)', maxWidth: 340, fontSize: 14, boxShadow: '0 8px 18px -8px rgba(0,0,0,.3)' }}>
          Nothing here yet — click <strong>Add note</strong> to jot down anything for yourself.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 18 }}>
          {notes.map((note, i) => (
            <NoteCard key={note.id} note={note} rot={ROT[i % ROT.length]} onPatch={patch} onRemove={remove} />
          ))}
        </div>
      )}
    </section>
  );
}

function NoteCard({ note, rot, onPatch, onRemove }) {
  const [text, setText] = useState(note.content || '');
  const saved = useRef(note.content || '');
  const [items, setItems] = useState(Array.isArray(note.checklist) ? note.checklist : []);
  const [newItem, setNewItem] = useState('');

  const saveText = () => {
    if (text !== saved.current) { saved.current = text; onPatch(note.id, { content: text }); }
  };
  const saveItems = (next) => { setItems(next); onPatch(note.id, { checklist: next }); };
  const toggle = (i) => saveItems(items.map((it, idx) => (idx === i ? { ...it, done: !it.done } : it)));
  const removeItem = (i) => saveItems(items.filter((_, idx) => idx !== i));
  const addItem = () => {
    const t = newItem.trim();
    if (!t) return;
    saveItems([...items, { text: t, done: false }]);
    setNewItem('');
  };

  return (
    <div style={{ position: 'relative', background: note.color, borderRadius: 4, padding: '22px 14px 12px', minHeight: 150, transform: `rotate(${rot})`, boxShadow: '0 8px 18px -8px rgba(0,0,0,.35)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%) rotate(-2deg)', width: 60, height: 18, background: 'rgba(255,255,255,.55)', borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,.15)' }} />
      <button type="button" onClick={() => onRemove(note.id)} title="Delete note"
        style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,.08)', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#555' }}>
        <X size={13} />
      </button>

      <textarea value={text} onChange={(e) => setText(e.target.value)} onBlur={saveText} placeholder="Write anything…" rows={3}
        style={{ background: 'transparent', border: 'none', resize: 'vertical', outline: 'none', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.45, color: '#3a3a3a', minHeight: 54 }} />

      {/* checklist */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
            <input type="checkbox" checked={!!it.done} onChange={() => toggle(i)} style={{ margin: 0, cursor: 'pointer', accentColor: '#4f46e5' }} />
            <span style={{ flex: 1, color: '#3a3a3a', textDecoration: it.done ? 'line-through' : 'none', opacity: it.done ? 0.55 : 1 }}>{it.text}</span>
            <button type="button" onClick={() => removeItem(i)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8a8a8a', padding: 0, lineHeight: 1 }}><X size={12} /></button>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={13} style={{ color: '#8a8a8a', flexShrink: 0 }} />
          <input value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }} onBlur={addItem} placeholder="add checklist item"
            style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: '1px dashed rgba(0,0,0,.2)', outline: 'none', fontFamily: 'inherit', fontSize: 12.5, color: '#3a3a3a', padding: '2px 0' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 5, marginTop: 'auto' }}>
        {COLORS.map((c) => (
          <button key={c} type="button" onClick={() => onPatch(note.id, { color: c })} title="Colour"
            style={{ width: 16, height: 16, borderRadius: '50%', background: c, border: note.color === c ? '2px solid #555' : '1px solid rgba(0,0,0,.15)', cursor: 'pointer', padding: 0 }} />
        ))}
      </div>
    </div>
  );
}
