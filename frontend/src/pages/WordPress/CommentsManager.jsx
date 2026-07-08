import { useState, useEffect, useCallback } from 'react';
import { wpGet, wpCreate, wpUpdate, wpDelete, qs, stripHtml } from './wpApi';
import { Check, X, MessageSquare, Trash2, Ban, CornerUpLeft, Loader2, Send } from 'lucide-react';

const btn = (bg, fg, brd) => ({ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 7, border: brd || '1px solid var(--outline-variant)', background: bg || 'var(--surface-container-low)', color: fg || 'var(--text-main)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 });

export default function CommentsManager() {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('hold');
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);
  const showToast = (m, err) => { setToast({ m, err }); setTimeout(() => setToast(null), 2600); };

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await wpGet(`/comments${qs({ per_page: 100, status: filter, orderby: 'date', order: 'desc' })}`); setComments(data || []); }
    catch (e) { showToast(e.message, true); }
    setLoading(false);
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (c, status) => {
    setBusy(c.id);
    try { await wpUpdate(`/comments/${c.id}`, { status }); showToast('Updated.'); load(); }
    catch (e) { showToast(e.message, true); }
    setBusy(null);
  };
  const trash = async (c) => {
    if (!window.confirm('Move this comment to Trash?')) return;
    setBusy(c.id);
    try { await wpDelete(`/comments/${c.id}${qs({ force: false })}`); showToast('Trashed.'); load(); }
    catch (e) { showToast(e.message, true); }
    setBusy(null);
  };
  const reply = async (c) => {
    if (!replyText.trim()) return;
    setBusy(c.id);
    try { await wpCreate('/comments', { post: c.post, parent: c.id, content: replyText, status: 'approve' }); showToast('Reply posted.'); setReplyTo(null); setReplyText(''); load(); }
    catch (e) { showToast(e.message, true); }
    setBusy(null);
  };

  const TABS = [['hold', 'Pending'], ['approve', 'Approved'], ['spam', 'Spam'], ['trash', 'Trash']];

  return (
    <div style={{ padding: '26px 24px' }}>
      <h1 style={{ margin: '0 0 16px', fontSize: 21, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 10 }}><MessageSquare size={21} /> Comments</h1>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map(([v, l]) => <button key={v} onClick={() => setFilter(v)} style={btn(filter === v ? 'var(--primary)' : '', filter === v ? '#fff' : '')}>{l}</button>)}
      </div>

      {loading ? <div style={{ color: 'var(--text-muted)', padding: 20, display: 'flex', gap: 8, alignItems: 'center' }}><Loader2 size={18} className="ma-spin" /> Loading…</div>
        : comments.length === 0 ? <p style={{ color: 'var(--text-muted)', padding: 16 }}>No {filter === 'hold' ? 'pending' : filter} comments.</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {comments.map(c => (
                <div key={c.id} style={{ background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 10, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 13, color: 'var(--text-main)' }}><strong>{c.author_name || 'Anonymous'}</strong> <span style={{ color: 'var(--text-muted)' }}>· {new Date(c.date).toLocaleString()}</span></div>
                    <div style={{ fontSize: 11.5, padding: '2px 8px', borderRadius: 999, background: c.status === 'approved' ? '#dcfce7' : '#fef3c7', color: c.status === 'approved' ? '#166534' : '#92400e' }}>{c.status}</div>
                  </div>
                  <div style={{ fontSize: 13.5, color: 'var(--text-main)', margin: '8px 0', lineHeight: 1.5 }}>{stripHtml(c.content?.rendered)}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {c.status !== 'approved' && <button onClick={() => setStatus(c, 'approve')} disabled={busy === c.id} style={btn('#dcfce7', '#166534', '1px solid #bbf7d0')}><Check size={13} /> Approve</button>}
                    {c.status === 'approved' && <button onClick={() => setStatus(c, 'hold')} disabled={busy === c.id} style={btn()}><X size={13} /> Unapprove</button>}
                    <button onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); setReplyText(''); }} style={btn()}><CornerUpLeft size={13} /> Reply</button>
                    {c.status !== 'spam' && <button onClick={() => setStatus(c, 'spam')} disabled={busy === c.id} style={btn()}><Ban size={13} /> Spam</button>}
                    <button onClick={() => trash(c)} disabled={busy === c.id} style={{ ...btn(), color: '#dc2626' }}><Trash2 size={13} /> Trash</button>
                  </div>
                  {replyTo === c.id && (
                    <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                      <input autoFocus value={replyText} onChange={e => setReplyText(e.target.value)} onKeyDown={e => e.key === 'Enter' && reply(c)} placeholder="Write a reply…" style={{ flex: 1, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface)', color: 'var(--text-main)', fontSize: 13 }} />
                      <button onClick={() => reply(c)} disabled={busy === c.id || !replyText.trim()} style={btn('var(--primary)', '#fff', 'none')}>{busy === c.id ? <Loader2 size={13} className="ma-spin" /> : <Send size={13} />} Send</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
      {toast && <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', background: toast.err ? '#dc2626' : '#16a34a', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13.5, zIndex: 1000 }}>{toast.m}</div>}
    </div>
  );
}
