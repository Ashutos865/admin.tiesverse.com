"""Developer / infrastructure dashboard.

One endpoint (`GET /api/technical/stats/`) that aggregates live usage across every
external service + the host, each section isolated so one failure never breaks the
page. Gated to DEVELOPER_EMAILS (plus superusers). Cached 60s to avoid hammering
the provider APIs.
"""

from __future__ import annotations

import os

from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response


def is_developer(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return (user.email or '').strip().lower() in getattr(settings, 'DEVELOPER_EMAILS', [])


# ── per-service collectors (each returns a dict or {'error': ...}) ─────────────

def _server_stats():
    out = {'cpu_cores': os.cpu_count()}
    try:
        mem = {}
        with open('/proc/meminfo') as f:
            for line in f:
                k, _, rest = line.partition(':')
                if rest:
                    mem[k.strip()] = int(rest.strip().split()[0]) * 1024  # kB -> bytes
        total = mem.get('MemTotal', 0)
        avail = mem.get('MemAvailable', mem.get('MemFree', 0))
        out['mem_total'] = total
        out['mem_used'] = total - avail
        out['mem_free'] = avail
        out['mem_pct'] = round((total - avail) / total * 100, 1) if total else 0
    except Exception:  # noqa: BLE001
        pass
    try:
        st = os.statvfs('/')
        total = st.f_blocks * st.f_frsize
        free = st.f_bavail * st.f_frsize
        out['disk_total'] = total
        out['disk_free'] = free
        out['disk_used'] = total - free
        out['disk_pct'] = round((total - free) / total * 100, 1) if total else 0
    except Exception:  # noqa: BLE001
        pass
    try:
        with open('/proc/loadavg') as f:
            out['load_avg'] = [float(x) for x in f.read().split()[:3]]
    except Exception:  # noqa: BLE001
        pass
    try:
        with open('/proc/uptime') as f:
            out['uptime_sec'] = int(float(f.read().split()[0]))
    except Exception:  # noqa: BLE001
        pass
    return out


def _ses_stats():
    import boto3
    if not (getattr(settings, 'AWS_SES_ACCESS_KEY_ID', '') and getattr(settings, 'AWS_SES_SECRET_ACCESS_KEY', '')):
        return {'error': 'SES not configured'}
    ses = boto3.client(
        'ses', region_name=getattr(settings, 'AWS_SES_REGION', 'ap-south-1'),
        aws_access_key_id=settings.AWS_SES_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SES_SECRET_ACCESS_KEY,
    )
    q = ses.get_send_quota()
    max_24h = q.get('Max24HourSend') or 0
    sent_24h = q.get('SentLast24Hours') or 0
    out = {
        'max_24h': max_24h,
        'sent_24h': sent_24h,
        'remaining_24h': max(0, max_24h - sent_24h),
        'max_send_rate': q.get('MaxSendRate'),
        'sandbox': max_24h <= 200,
        'region': getattr(settings, 'AWS_SES_REGION', 'ap-south-1'),
    }
    try:
        out['identities'] = ses.list_identities(MaxItems=50).get('Identities', [])
    except Exception:  # noqa: BLE001
        out['identities'] = []
    try:
        points = ses.get_send_statistics().get('SendDataPoints', [])
        agg = {'DeliveryAttempts': 0, 'Bounces': 0, 'Complaints': 0, 'Rejects': 0}
        for p in points:
            for k in agg:
                agg[k] += p.get(k, 0)
        out['recent'] = agg  # ~last 2 weeks
    except Exception:  # noqa: BLE001
        pass
    return out


def _cloudinary_stats():
    import cloudinary
    import cloudinary.api
    u = cloudinary.api.usage()
    cr = u.get('credits', {}) or {}
    return {
        'plan': u.get('plan'),
        'credits_used': cr.get('usage'),
        'credits_limit': cr.get('limit'),
        'credits_pct': cr.get('used_percent'),
        'storage_bytes': (u.get('storage') or {}).get('usage'),
        'bandwidth_bytes': (u.get('bandwidth') or {}).get('usage'),
        'transformations': (u.get('transformations') or {}).get('usage'),
        'images': u.get('resources'),
        'derived': u.get('derived_resources'),
        'requests': u.get('requests'),
        'max_image_bytes': (u.get('media_limits') or {}).get('image_max_size_bytes'),
        'last_updated': u.get('last_updated'),
    }


def _r2_stats():
    from career_app.providers import R2Storage
    client = R2Storage().client()
    bucket = os.environ.get('CLOUDFLARE_R2_BUCKET')
    total = size = pages = 0
    token = None
    while True:
        kw = {'Bucket': bucket, 'MaxKeys': 1000}
        if token:
            kw['ContinuationToken'] = token
        resp = client.list_objects_v2(**kw)
        for o in resp.get('Contents', []):
            total += 1
            size += o.get('Size', 0)
        pages += 1
        if resp.get('IsTruncated') and pages < 20:
            token = resp.get('NextContinuationToken')
        else:
            break
    return {'objects': total, 'bytes': size, 'bucket': bucket,
            'free_bytes': 10 * 1024 ** 3}  # 10 GB free tier


def _turso_stats():
    from webinar_app import turso_client

    def cnt(table):
        try:
            rows = turso_client.execute(f'SELECT COUNT(*) AS n FROM {table}')
            return int(rows[0].get('n'))
        except Exception:  # noqa: BLE001
            return None
    return {
        'registrations': cnt('registrations'),
        'certificate_records': cnt('certificate_records'),
        'free_bytes': 9 * 1024 ** 3,  # 9 GB free tier
    }


def _d1_stats():
    from career_app import cloudflare_proxy
    return {'candidates': len(cloudflare_proxy.get_candidates() or []),
            'free_bytes': 5 * 1024 ** 3}  # 5 GB free tier


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def technical_stats(request):
    if not is_developer(request.user):
        return Response({'error': 'Developer access only.'}, status=403)

    from django.core.cache import cache
    cached = cache.get('tech_stats_v1')
    if cached and not request.GET.get('fresh'):
        return Response(cached)

    def safe(fn):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001
            return {'error': str(exc)}

    data = {
        'server': safe(_server_stats),
        'ses': safe(_ses_stats),
        'cloudinary': safe(_cloudinary_stats),
        'r2': safe(_r2_stats),
        'turso': safe(_turso_stats),
        'd1': safe(_d1_stats),
        'supabase': {'configured': bool(getattr(settings, 'SUPABASE_URL', ''))},
    }
    cache.set('tech_stats_v1', data, 60)
    return Response(data)
