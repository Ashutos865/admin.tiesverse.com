import { lazy } from 'react';

// When a new build is deployed, the hashed chunk filenames change. A browser tab
// still running the OLD index.html will try to import() a chunk that no longer
// exists on the server → the dynamic import rejects → the lazy route renders a
// blank page until a manual reload. This wraps lazy() so that:
//   1. a transient import failure is retried once (network blip), and
//   2. if it still fails (the chunk is genuinely gone after a deploy), we do a
//      ONE-TIME hard reload so the tab picks up the fresh index.html + chunks.
//
// The reload is guarded by a sessionStorage flag so we never loop: if the page
// is already the freshest build and the import still fails, we surface the error
// instead of reloading forever.
const RELOAD_FLAG = 'chunk-reload-once';

export default function lazyWithReload(factory) {
  return lazy(() =>
    factory()
      .then((mod) => {
        // Successful load — clear the guard so a future stale-chunk reload can fire.
        try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* ignore */ }
        return mod;
      })
      .catch((err) => {
        // Retry once for a transient failure before deciding it's a stale chunk.
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            factory()
              .then((mod) => {
                try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* ignore */ }
                resolve(mod);
              })
              .catch((err2) => {
                let alreadyReloaded = false;
                try { alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === '1'; } catch { /* ignore */ }
                if (!alreadyReloaded) {
                  try { sessionStorage.setItem(RELOAD_FLAG, '1'); } catch { /* ignore */ }
                  // Fresh index.html + chunk manifest on the next load fixes the 404.
                  window.location.reload();
                  // Return a never-resolving promise so nothing renders before reload.
                  return;
                }
                reject(err2 || err);
              });
          }, 400);
        });
      })
  );
}
