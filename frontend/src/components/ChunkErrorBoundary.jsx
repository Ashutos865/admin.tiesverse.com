import { Component } from 'react';

// Catches errors thrown while rendering the lazy route tree — most importantly
// "failed to fetch dynamically imported module" / "Loading chunk failed", which
// happen when a tab running an old build requests a chunk that a new deploy
// replaced. In that case we hard-reload ONCE (guarded so we never loop) to pull
// the fresh index.html + chunks. Any other error shows a small retry card
// instead of a blank screen.
const RELOAD_FLAG = 'chunk-reload-once';

const isChunkError = (err) => {
  const msg = `${err?.message || ''} ${err?.name || ''}`.toLowerCase();
  return (
    msg.includes('dynamically imported module') ||
    msg.includes('loading chunk') ||
    msg.includes('failed to fetch') ||
    msg.includes('importing a module script failed') ||
    err?.name === 'ChunkLoadError'
  );
};

export default class ChunkErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    if (isChunkError(error)) {
      let alreadyReloaded = false;
      try { alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === '1'; } catch { /* ignore */ }
      if (!alreadyReloaded) {
        try { sessionStorage.setItem(RELOAD_FLAG, '1'); } catch { /* ignore */ }
        window.location.reload();
      }
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // A stale-chunk error triggers a reload in componentDidCatch; render nothing
    // (not a broken UI) while that happens.
    if (isChunkError(error)) {
      return (
        <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>
          <div style={{ width: 26, height: 26, border: '3px solid var(--outline-variant)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'route-spin 0.7s linear infinite' }} />
          <style>{'@keyframes route-spin{to{transform:rotate(360deg)}}'}</style>
        </div>
      );
    }

    // Any other render error: a small recoverable card instead of a blank page.
    return (
      <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 380 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 17, color: 'var(--text-main)' }}>Something went wrong on this page</h2>
          <p style={{ margin: '0 0 16px', fontSize: 13.5, color: 'var(--text-muted)' }}>
            Try reloading. If it keeps happening, let the tech team know.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
