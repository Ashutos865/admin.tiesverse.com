"""Seed the nav mega-menu feature-card images into R2 + the SiteImage table.

For each nav slot we fetch its bundled image from the live website
(https://tiesverse.com/work/<file>), convert it to WebP (the same pipeline as
a manual admin upload), store it in R2 at site-images/<key>.webp, and upsert a
SiteImage row pointing at the public proxy URL.

Mode: static slots (What we do / Company) are seeded as 'manual' so the upload
always shows; live rows (Insights / Engagements, auto=True) are seeded as
'auto' so the nav keeps auto-filling from articles/events until an editor
toggles a card to Manual. Re-running is idempotent (update_or_create).

    python manage.py seed_nav_images          # seed only rows that don't exist yet
    python manage.py seed_nav_images --force   # re-import/overwrite every nav slot
"""
import io
import urllib.request

from django.core.cache import cache
from django.core.management.base import BaseCommand
from django.utils import timezone

from tiesverse_app.models import SiteImage
from tiesverse_app.site_image_slots import _NAV, NAV_SEED

WORK_BASE = 'https://tiesverse.com/work/'
ADMIN_BASE = 'https://admin.tiesverse.com'


class Command(BaseCommand):
    help = 'Import the nav mega-menu feature-card images into R2 + SiteImage.'

    def add_arguments(self, parser):
        parser.add_argument('--force', action='store_true',
                             help='Re-import even slots that already have an image.')

    def handle(self, *args, **opts):
        from tiesverse_app.media_views import to_webp
        from career_app.providers import R2Storage

        force = opts['force']
        auto_by_key = {k: a for (k, _l, a, _f) in _NAV}
        storage = R2Storage()
        existing = {s.key: s for s in SiteImage.objects.filter(key__in=list(NAV_SEED))}
        done = skipped = failed = 0

        for key, filename in NAV_SEED.items():
            cur = existing.get(key)
            if cur and cur.image_url and not force:
                self.stdout.write(f'  · {key}: already set — skip')
                skipped += 1
                continue
            src = WORK_BASE + filename
            try:
                req = urllib.request.Request(src, headers={'User-Agent': 'ties-seed/1.0'})
                with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310 — fixed trusted host
                    raw = resp.read()
            except Exception as e:  # noqa: BLE001
                self.stderr.write(self.style.ERROR(f'  ✗ {key}: fetch failed ({src}): {e}'))
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
                self.stderr.write(self.style.ERROR(f'  ✗ {key}: R2 upload failed: {e}'))
                failed += 1
                continue

            ts = int(timezone.now().timestamp())
            url = f'{ADMIN_BASE}/api/public/site-image/{key}/?v={ts}'
            mode = 'auto' if auto_by_key.get(key) else 'manual'
            SiteImage.objects.update_or_create(key=key, defaults={'image_url': url, 'mode': mode})
            self.stdout.write(self.style.SUCCESS(f'  ✓ {key}: {filename} → R2 ({mode})'))
            done += 1

        cache.delete('public_site_images')
        self.stdout.write(self.style.SUCCESS(
            f'\nSeeded {done}, skipped {skipped}, failed {failed}.'))
