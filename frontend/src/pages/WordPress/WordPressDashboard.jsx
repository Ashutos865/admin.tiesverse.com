import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { wpGet, qs, stripHtml } from './wpApi';
import { FileText, File, Image, Tag, MessageSquare, Users, ExternalLink, Loader2, Globe, RefreshCw } from 'lucide-react';

const WP_ADMIN = 'https://ties.tiesverse.com/wp-admin';

const card = { background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', borderRadius: 12, padding: 18 };

function Stat({ icon: Icon, label, value, color, onClick }) {
  return (
    <button onClick={onClick} style={{ ...card, textAlign: 'left', cursor: onClick ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 44, height: 44, borderRadius: 10, background: color + '22', color, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon size={22} /></div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-main)', lineHeight: 1 }}>{value ?? '—'}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
      </div>
    </button>
  );
}

export default function WordPressDashboard() {
  const nav = useNavigate();
  const [counts, setCounts] = useState({});
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = async () => {
    setLoading(true); setErr('');
    try {
      const [posts, pages, media, cats, tags, comments, users, recentPosts] = await Promise.all([
        wpGet(`/posts${qs({ per_page: 1, status: 'publish,draft,pending,future,private' })}`),
        wpGet(`/pages${qs({ per_page: 1, status: 'publish,draft,pending,private' })}`),
        wpGet(`/media${qs({ per_page: 1 })}`),
        wpGet(`/categories${qs({ per_page: 1 })}`),
        wpGet(`/tags${qs({ per_page: 1 })}`),
        wpGet(`/comments${qs({ per_page: 1, status: 'approve,hold' })}`),
        wpGet(`/users${qs({ per_page: 1 })}`),
        wpGet(`/posts${qs({ per_page: 5, status: 'publish,draft,pending', orderby: 'modified', _fields: 'id,title,status,modified,link' })}`),
      ]);
      setCounts({
        posts: posts.total, pages: pages.total, media: media.total,
        categories: cats.total, tags: tags.total, comments: comments.total, users: users.total,
      });
      setRecent(recentPosts.data || []);
    } catch (e) { setErr(e.message || 'Could not reach WordPress.'); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  return (
    <div style={{ padding: '28px 26px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 10 }}><Globe size={22} /> WordPress — TIES</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13.5 }}>Manage your website content at <strong>ties.tiesverse.com</strong> — right from here.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)', color: 'var(--text-main)', cursor: 'pointer', fontSize: 13 }}><RefreshCw size={14} /> Refresh</button>
          <a href={WP_ADMIN} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)', color: 'var(--text-main)', textDecoration: 'none', fontSize: 13 }}><ExternalLink size={14} /> Open wp-admin</a>
        </div>
      </div>

      {err && <div style={{ ...card, borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c', marginBottom: 16 }}>{err} <button onClick={load} style={{ marginLeft: 8, textDecoration: 'underline', background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer' }}>Retry</button></div>}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', padding: 30 }}><Loader2 size={18} className="ma-spin" /> Loading your site…</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14, marginBottom: 24 }}>
            <Stat icon={FileText} label="Posts" value={counts.posts} color="#3b82f6" onClick={() => nav('/wordpress/posts')} />
            <Stat icon={File} label="Pages" value={counts.pages} color="#8b5cf6" onClick={() => nav('/wordpress/pages')} />
            <Stat icon={Image} label="Media" value={counts.media} color="#10b981" onClick={() => nav('/wordpress/media')} />
            <Stat icon={Tag} label="Categories" value={counts.categories} color="#f59e0b" onClick={() => nav('/wordpress/taxonomies')} />
            <Stat icon={Tag} label="Tags" value={counts.tags} color="#f97316" onClick={() => nav('/wordpress/taxonomies')} />
            <Stat icon={MessageSquare} label="Comments" value={counts.comments} color="#ec4899" onClick={() => nav('/wordpress/comments')} />
            <Stat icon={Users} label="Users" value={counts.users} color="#6366f1" onClick={() => nav('/wordpress/users')} />
          </div>

          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 15, color: 'var(--text-main)' }}>Recently updated posts</h2>
              <button onClick={() => nav('/wordpress/posts')} style={{ fontSize: 12.5, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}>Manage all →</button>
            </div>
            {recent.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No posts yet.</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {recent.map(p => (
                  <button key={p.id} onClick={() => nav(`/wordpress/posts?edit=${p.id}`)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 8px', borderRadius: 8, background: 'transparent', border: 'none', borderBottom: '1px solid var(--outline-variant)', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ color: 'var(--text-main)', fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stripHtml(p.title?.rendered) || '(no title)'}</span>
                    <span style={{ fontSize: 11.5, padding: '2px 8px', borderRadius: 999, flexShrink: 0, background: p.status === 'publish' ? '#dcfce7' : '#fef3c7', color: p.status === 'publish' ? '#166534' : '#92400e' }}>{p.status}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
