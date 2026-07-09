"""Seed website image slots into R2 + the SiteImage table from bundled defaults.

For each seedable slot (tiesverse_app.site_image_slots.SEED_FILES) we fetch its
bundled image from the live site (https://tiesverse.com/work/<file>), convert to
WebP (same pipeline as a manual admin upload), store it at site-images/<key>.webp
in R2, and upsert a SiteImage row pointing at the public proxy URL. Auto slots
(Insights/Engagements nav rows) are seeded 'auto' so live content keeps leading;
everything else is 'manual' so the image shows. Idempotent (update_or_create).

    python manage.py seed_site_images                 # only slots not already set
    python manage.py seed_site_images --force         # re-import every seedable slot
    python manage.py seed_site_images --only nav      # nav-* keys only
    python manage.py seed_site_images --only page     # non-nav keys only
"""
import io
import urllib.request

from django.core.cache import cache
from django.core.management.base import BaseCommand
from django.utils import timezone

from tiesverse_app.models import SiteImage
from tiesverse_app.site_image_slots import SEED_FILES, SEED_AUTO

WORK_BASE = 'https://tiesverse.com/work/'
ADMIN_BASE = 'https://admin.tiesverse.com'


class Command(BaseCommand):
    help = 'Import bundled website images into R2 + SiteImage.'

    def add_arguments(self, parser):
        parser.add_argument('--force', action='store_true',
                            help='Re-import even slots that already have an image.')
        parser.add_argument('--only', choices=['nav', 'page'], default=None,
                            help='Limit to nav-* keys or non-nav keys.')

    def handle(self, *args, **opts):
        from tiesverse_app.media_views import to_webp
        from career_app.providers import R2Storage

        force, only = opts['force'], opts['only']
        items = {
            k: f for k, f in SEED_FILES.items()
            if only is None
            or (only == 'nav' and k.startswith('nav-'))
            or (only == 'page' and not k.startswith('nav-'))
        }
        storage = R2Storage()
        existing = {s.key: s for s in SiteImage.objects.filter(key__in=list(items))}
        done = skipped = failed = 0

        for key, filename in items.items():
            cur = existing.get(key)
            if cur and cur.image_url and not force:
                self.stdout.write(f'  - {key}: already set - skip')
                skipped += 1
                continue
            src = WORK_BASE + filename
            try:
                req = urllib.request.Request(src, headers={'User-Agent': 'ties-seed/1.0'})
                with urllib.request.urlopen(req, timeout=45) as resp:  # noqa: S310 — fixed trusted host
                    raw = resp.read()
                ctype_in = (resp.headers.get('Content-Type') or '').lower()
            except Exception as e:  # noqa: BLE001
                self.stderr.write(self.style.ERROR(f'  x {key}: fetch failed ({src}): {e}'))
                failed += 1
                continue
            # Guard against the SPA fallback (index.html served for missing files).
            if 'text/html' in ctype_in or (raw[:15].lstrip().startswith(b'<')):
                self.stderr.write(self.style.WARNING(f'  ! {key}: no real image at {src} (got HTML) - skip'))
                failed += 1
                continue
            try:
                webp = to_webp(io.BytesIO(raw)).read()
                ctype = 'image/webp'
            except Exception:  # noqa: BLE001 — non-raster/animated: store original bytes
                webp = raw
                ctype = 'image/jpeg' if filename.lower().endswith(('.jpg', '.jpeg')) else 'image/png'
            try:
                storage.put_object(f'site-images/{key}.webp', webp, ctype)
            except Exception as e:  # noqa: BLE001
                self.stderr.write(self.style.ERROR(f'  x {key}: R2 upload failed: {e}'))
                failed += 1
                continue

            ts = int(timezone.now().timestamp())
            url = f'{ADMIN_BASE}/api/public/site-image/{key}/?v={ts}'
            mode = 'auto' if SEED_AUTO.get(key) else 'manual'
            SiteImage.objects.update_or_create(key=key, defaults={'image_url': url, 'mode': mode})
            self.stdout.write(self.style.SUCCESS(f'  ok {key}: {filename} -> R2 ({mode})'))
            done += 1

        cache.delete('public_site_images')
        self.stdout.write(self.style.SUCCESS(f'\nSeeded {done}, skipped {skipped}, failed/none {failed}.'))
