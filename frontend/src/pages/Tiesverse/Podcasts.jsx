import { useState, useEffect, useRef } from 'react';
import {
  Mic, Plus, Trash2, Upload, Loader2, Check, X, ArrowUp, ArrowDown, Play, Pause,
} from 'lucide-react';
import {
  getPodcasts, createPodcast, updatePodcast, deletePodcast, uploadPodcastAudio,
} from '../../apiClient';

/* Episode length is stored in seconds and formatted here, so what the site
   shows always matches the file rather than a number typed from memory. */
/** What the listen link points at, said plainly under the field. */
function linkNote(url) {
  const u = String(url || '').trim();
  if (!u) return 'Leave blank only if you are uploading the audio file below.';
  if (!/^https?:\/\//i.test(u)) return 'That does not look like a link — it should start with https://';
  if (/spotify\./i.test(u)) return 'Spotify — the site will show "Listen on Spotify".';
  if (/youtube\.|youtu\.be/i.test(u)) return 'YouTube — the site will show "Watch on YouTube".';
  if (/apple\.|podcasts\.apple/i.test(u)) return 'Apple Podcasts — the site will show "Listen on Apple Podcasts".';
  return 'The site will show "Listen" and open this link.';
}

const fmtLen = (s) => {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
};

export default function Podcasts() {
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [creating, setCreating] = useState(false);

  const say = (m) => { setToast(m); setTimeout(() => setToast(''), 2800); };
  const load = () => getPodcasts()
    .then((r) => setEpisodes(r?.episodes || []))
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const add = async () => {
    const res = await createPodcast({ title: 'Untitled episode' });
    if (res?.error) return say(res.error);
    setCreating(false);
    say('Episode created — add the audio next.');
    load();
  };

  const move = async (ep, dir) => {
    const sorted = [...episodes].sort((a, b) => a.position - b.position);
    const i = sorted.findIndex((e) => e.id === ep.id);
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    // Swap the two positions so the list order is what the site shows.
    await Promise.all([
      updatePodcast(sorted[i].id, { position: sorted[j].position }),
      updatePodcast(sorted[j].id, { position: sorted[i].position }),
    ]);
    load();
  };

  if (loading) {
    return <div style={S.page}><Loader2 size={20} className="spin" /> Loading episodes…</div>;
  }

  return (
    <div style={S.page}>
      {toast && <div style={S.toast}>{toast}</div>}

      <div style={S.head}>
        <div style={{ flex: 1 }}>
          <h1 style={S.h1}>
            <Mic size={22} style={{ verticalAlign: -4, marginRight: 8, color: 'var(--primary)' }} />
            Podcasts
          </h1>
          <p style={S.sub}>
            Episodes for the audio archive on tiesverse.com. Only published episodes
            with audio appear on the site.
          </p>
        </div>
        <button style={S.primary} onClick={add}><Plus size={16} /> New episode</button>
      </div>

      {!episodes.length && (
        <div style={S.empty}>
          <Mic size={30} style={{ color: '#9ca3af' }} />
          <h3 style={{ margin: '12px 0 4px' }}>No episodes yet</h3>
          <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>
            Create one, upload its audio, then publish it. Until then the website
            shows no episode list at all.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gap: 14 }}>
        {[...episodes].sort((a, b) => a.position - b.position).map((ep, i, arr) => (
          <EpisodeCard
            key={ep.id}
            ep={ep}
            first={i === 0}
            last={i === arr.length - 1}
            onMove={(d) => move(ep, d)}
            onChanged={load}
            say={say}
          />
        ))}
      </div>
    </div>
  );
}

function EpisodeCard({ ep, first, last, onMove, onChanged, say }) {
  const [draft, setDraft] = useState(ep);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => { setDraft(ep); setDirty(false); }, [ep]);

  const set = (patch) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); };

  const save = async () => {
    setBusy(true);
    const res = await updatePodcast(ep.id, {
      title: draft.title, episode_label: draft.episode_label, tag: draft.tag,
      description: draft.description, published_at: draft.published_at || '',
      is_featured: draft.is_featured, is_published: draft.is_published,
      // The listen link was missing from this payload, so pasting a URL updated
      // the form and the warning cleared, but Save sent everything except the
      // link — it was silently dropped and the field was empty again on reload.
      listen_url: draft.listen_url || '',
    });
    setBusy(false);
    if (res?.error) return say(res.error);
    setDirty(false);
    say('Saved.');
    onChanged();
  };

  /* Read the duration before uploading: the file is already in the browser, so
     asking it is exact and free. */
  const pickAudio = async (file) => {
    if (!file) return;
    const seconds = await new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const a = new Audio();
      a.preload = 'metadata';
      a.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(a.duration || 0); };
      a.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
      a.src = url;
    });

    setBusy(true); setPct(0);
    const res = await uploadPodcastAudio(ep.id, file, seconds, setPct);
    setBusy(false); setPct(0);
    if (res?.error) return say(res.error);
    say('Audio uploaded.');
    onChanged();
  };

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play(); setPlaying(true); } else { a.pause(); setPlaying(false); }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${ep.title}"? This cannot be undone.`)) return;
    const res = await deletePodcast(ep.id);
    if (res?.error) return say(res.error);
    say('Episode deleted.');
    onChanged();
  };

  return (
    <div style={S.card}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <button style={S.icon} disabled={first} onClick={() => onMove(-1)} title="Move up">
            <ArrowUp size={14} />
          </button>
          <button style={S.icon} disabled={last} onClick={() => onMove(1)} title="Move down">
            <ArrowDown size={14} />
          </button>
        </div>

        <div style={{ flex: 1, display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 150px', gap: 10 }}>
            <input style={S.input} value={draft.episode_label || ''} placeholder="EP.01"
              onChange={(e) => set({ episode_label: e.target.value })} />
            <input style={{ ...S.input, fontWeight: 600 }} value={draft.title || ''} placeholder="Episode title"
              onChange={(e) => set({ title: e.target.value })} />
            <input style={S.input} value={draft.tag || ''} placeholder="Tag (e.g. Strategy)"
              onChange={(e) => set({ tag: e.target.value })} />
          </div>

          <textarea style={{ ...S.input, minHeight: 60, resize: 'vertical' }} value={draft.description || ''}
            placeholder="What this episode covers — shown under the title on the site."
            onChange={(e) => set({ description: e.target.value })} />

          {/* Where the episode actually lives. This is the normal way to
              publish one: the recording is already on Spotify or YouTube,
              and the site sends listeners there rather than trying to carry
              a 45-minute file through this server. */}
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={S.lbl}>Listen link — Spotify, YouTube or Apple</span>
            <input style={S.input} value={draft.listen_url || ''}
              placeholder="https://open.spotify.com/episode/…  or  https://youtu.be/…"
              onChange={(e) => set({ listen_url: e.target.value.trim() })} />
            <span style={{ fontSize: 12, color: '#6b7280' }}>
              {linkNote(draft.listen_url)}
            </span>
          </label>

          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={S.field}>
              <span style={S.lbl}>Published</span>
              <input style={{ ...S.input, width: 150 }} type="date" value={draft.published_at || ''}
                onChange={(e) => set({ published_at: e.target.value })} />
            </label>
            <label style={S.check}>
              <input type="checkbox" checked={Boolean(draft.is_featured)}
                onChange={(e) => set({ is_featured: e.target.checked })} /> Featured
            </label>
            <label style={S.check}>
              <input type="checkbox" checked={Boolean(draft.is_published)}
                onChange={(e) => set({ is_published: e.target.checked })} /> Published
            </label>
            <span style={{ fontSize: 12.5, color: '#6b7280' }}>Length: {fmtLen(ep.duration_seconds)}</span>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {ep.audio_url ? (
              <>
                <button style={S.ghost} onClick={toggle}>
                  {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? 'Pause' : 'Preview'}
                </button>
                <audio ref={audioRef} src={ep.audio_url} onEnded={() => setPlaying(false)} />
              </>
            ) : draft.listen_url ? null : (
              <span style={S.warn}>
                No listen link and no audio — this episode will not appear on the site.
              </span>
            )}

            <input ref={fileRef} type="file" accept="audio/*" style={{ display: 'none' }}
              onChange={(e) => pickAudio(e.target.files?.[0])} />
            <button style={S.ghost} disabled={busy} onClick={() => fileRef.current?.click()}>
              <Upload size={14} /> {ep.audio_url ? 'Replace audio' : 'Upload audio'}
            </button>

            {busy && pct > 0 && (
              <span style={{ fontSize: 12.5, color: '#6b7280' }}>Uploading… {pct}%</span>
            )}

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {dirty && (
                <button style={S.primary} disabled={busy} onClick={save}>
                  <Check size={14} /> Save
                </button>
              )}
              {dirty && (
                <button style={S.ghost} onClick={() => { setDraft(ep); setDirty(false); }}>
                  <X size={14} /> Cancel
                </button>
              )}
              <button style={S.del} onClick={remove} title="Delete episode"><Trash2 size={14} /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const S = {
  page: { padding: '26px 30px', maxWidth: 1040, margin: '0 auto' },
  head: { display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20 },
  h1: { fontSize: 24, fontWeight: 700, margin: 0 },
  sub: { color: '#6b7280', fontSize: 14, margin: '6px 0 0', maxWidth: 640 },
  card: { border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, background: '#fff' },
  empty: {
    border: '1px dashed #e5e7eb', borderRadius: 12, padding: '40px 20px',
    textAlign: 'center', background: '#fafafa', marginBottom: 16,
  },
  input: {
    padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8,
    fontSize: 13.5, width: '100%', fontFamily: 'inherit',
  },
  lbl: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: '#6b7280' },
  field: { display: 'inline-flex', alignItems: 'center', gap: 8 },
  check: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 },
  primary: {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
    background: 'var(--primary,#fe7a00)', color: '#fff', border: 0, borderRadius: 8,
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  ghost: {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px',
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
    fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151',
  },
  icon: {
    width: 28, height: 26, display: 'grid', placeItems: 'center',
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer',
  },
  del: {
    width: 32, height: 32, display: 'grid', placeItems: 'center',
    background: '#fff', border: '1px solid #fecaca', color: '#b91c1c',
    borderRadius: 8, cursor: 'pointer',
  },
  warn: { fontSize: 12.5, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '5px 9px' },
  toast: {
    position: 'fixed', top: 70, right: 24, background: 'var(--primary,#fe7a00)',
    color: '#fff', padding: '10px 16px', borderRadius: 8, zIndex: 4000,
    fontSize: 13, fontWeight: 600,
  },
};
