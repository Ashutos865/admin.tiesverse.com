from rest_framework import viewsets
from rest_framework.permissions import DjangoModelPermissions, IsAuthenticated
from .models import (
    Department, Event, EventSpeaker, EventRegistration,
    TeamMember, TeamMemberSocial, WebinarListing, TechProduct, Brand,
)
from .serializers import (
    DepartmentSerializer, EventSerializer, EventSpeakerSerializer,
    EventRegistrationSerializer, TeamMemberSerializer, TeamMemberSocialSerializer,
    WebinarListingSerializer, TechProductSerializer, BrandSerializer,
)
from . import supabase_sync


class StaffModelPermissions(DjangoModelPermissions):
    perms_map = {
        'GET':    ['%(app_label)s.view_%(model_name)s'],
        'OPTIONS': [], 'HEAD': [],
        'POST':   ['%(app_label)s.add_%(model_name)s'],
        'PUT':    ['%(app_label)s.change_%(model_name)s'],
        'PATCH':  ['%(app_label)s.change_%(model_name)s'],
        'DELETE': ['%(app_label)s.delete_%(model_name)s'],
    }


class SupabaseSyncMixin:
    """After every write, mirror the change to Supabase."""
    def perform_create(self, serializer):
        instance = serializer.save()
        supabase_sync.upsert(instance)

    def perform_update(self, serializer):
        instance = serializer.save()
        supabase_sync.upsert(instance)

    def perform_destroy(self, instance):
        supabase_sync.delete(instance)
        instance.delete()


class DepartmentViewSet(SupabaseSyncMixin, viewsets.ModelViewSet):
    queryset = Department.objects.all().order_by('-created_at')
    serializer_class = DepartmentSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]


class EventViewSet(SupabaseSyncMixin, viewsets.ModelViewSet):
    queryset = Event.objects.all().order_by('date')
    serializer_class = EventSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]


class EventSpeakerViewSet(SupabaseSyncMixin, viewsets.ModelViewSet):
    queryset = EventSpeaker.objects.all().order_by('-created_at')
    serializer_class = EventSpeakerSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]

    def get_queryset(self):
        qs = super().get_queryset()
        event_id = self.request.query_params.get('event')
        if event_id:
            # Oldest first: the first speaker added is the host.
            qs = qs.filter(event_id=event_id).order_by('created_at')
        return qs

    def perform_create(self, serializer):
        # A guest of an upcoming webinar stays off the website until it ends;
        # a global guest (no event) or one added to a past event goes live now.
        instance = serializer.save()
        if instance.event and instance.event.status == 'upcoming':
            if instance.published:
                instance.published = False
                instance.save(update_fields=['published'])
        supabase_sync.upsert(instance)
        # The listing's host is its first speaker — there is no separate host
        # field in the UI any more, so keep the two in step here.
        ev = instance.event
        if ev and not (ev.host or '').strip():
            ev.host = instance.name
            if instance.photo_url and not (ev.host_image_url or '').strip():
                ev.host_image_url = instance.photo_url
            ev.save(update_fields=['host', 'host_image_url'])
            supabase_sync.upsert(ev)

    def perform_destroy(self, instance):
        ev = instance.event
        was_host = bool(ev and (ev.host or '').strip() == instance.name.strip())
        supabase_sync.delete(instance)
        instance.delete()
        # If the host speaker was removed, the next-oldest speaker takes over
        # on the listing (or it clears when none remain).
        if was_host:
            nxt = ev.guests.order_by('created_at').first()
            ev.host = nxt.name if nxt else ''
            ev.host_image_url = (nxt.photo_url or '') if nxt else ''
            ev.save(update_fields=['host', 'host_image_url'])
            supabase_sync.upsert(ev)


class EventRegistrationViewSet(SupabaseSyncMixin, viewsets.ModelViewSet):
    queryset = EventRegistration.objects.all().order_by('date')
    serializer_class = EventRegistrationSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]

    def perform_update(self, serializer):
        was_upcoming = serializer.instance.status == 'upcoming'
        instance = serializer.save()
        supabase_sync.upsert(instance)
        # Marking an event past by hand publishes its guests, same as the cron.
        if was_upcoming and instance.status == 'past':
            from .guests import publish_event_guests
            publish_event_guests(instance)


class TeamMemberViewSet(SupabaseSyncMixin, viewsets.ModelViewSet):
    queryset = TeamMember.objects.all().order_by('display_order')
    serializer_class = TeamMemberSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]


class TeamMemberSocialViewSet(SupabaseSyncMixin, viewsets.ModelViewSet):
    queryset = TeamMemberSocial.objects.all().order_by('-created_at')
    serializer_class = TeamMemberSocialSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]


class WebinarListingViewSet(SupabaseSyncMixin, viewsets.ModelViewSet):
    queryset = WebinarListing.objects.all().order_by('-date')
    serializer_class = WebinarListingSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]


class TechProductViewSet(viewsets.ModelViewSet):
    """Admin CRUD for the website's Technology-section products."""
    queryset = TechProduct.objects.all().order_by('order', 'id')
    serializer_class = TechProductSerializer
    permission_classes = [IsAuthenticated]


class BrandViewSet(viewsets.ModelViewSet):
    """Admin CRUD for the website's 'mastheads' brands."""
    queryset = Brand.objects.all().order_by('order', 'id')
    serializer_class = BrandSerializer
    permission_classes = [IsAuthenticated]


# ── Website image slots (per-slot manual override / auto toggle) ───────────────
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from django.core.cache import cache
from .models import SiteImage
from .site_image_slots import SLOTS, SLOT_KEYS


def _can_manage_site(user):
    """Org-wide staff (superuser / HR / admin / advisory) may edit site content."""
    if getattr(user, 'is_superuser', False):
        return True
    from career_app.access import get_access_scope
    return get_access_scope(user)[0] == 'all'


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def site_images_admin(request):
    """GET: the full slot catalog merged with any stored overrides.
    POST {key, image_url?, mode?}: set a slot's image / mode."""
    if request.method == 'GET':
        stored = {s.key: s for s in SiteImage.objects.all()}
        rows = [{
            **slot,
            'image_url': (stored[slot['key']].image_url if slot['key'] in stored else ''),
            'mode': (stored[slot['key']].mode if slot['key'] in stored else 'manual'),
        } for slot in SLOTS]
        return Response({'slots': rows})

    if not _can_manage_site(request.user):   # writes = org-wide staff only
        return Response({'error': 'Only staff can manage website images.'}, status=403)
    key = str(request.data.get('key') or '').strip()
    if key not in SLOT_KEYS:
        return Response({'error': 'Unknown slot.'}, status=400)
    defaults = {}
    if 'image_url' in request.data:
        defaults['image_url'] = str(request.data.get('image_url') or '')
    if 'mode' in request.data:
        defaults['mode'] = 'auto' if request.data.get('mode') == 'auto' else 'manual'
    si, _ = SiteImage.objects.update_or_create(key=key, defaults=defaults)
    cache.delete('public_site_images')   # push the change to the website promptly
    return Response({'key': si.key, 'image_url': si.image_url, 'mode': si.mode})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def site_image_upload(request):
    """Upload a website image → WebP → Cloudflare R2 → return the public proxy URL."""
    if not _can_manage_site(request.user):   # writes = org-wide staff only
        return Response({'error': 'Only staff can manage website images.'}, status=403)
    key = str(request.data.get('key') or '').strip()
    if key not in SLOT_KEYS:
        return Response({'error': 'Unknown slot.'}, status=400)
    f = request.FILES.get('file')
    if not f:
        return Response({'error': 'No file provided.'}, status=400)
    from .media_views import to_webp
    from career_app.providers import R2Storage
    from django.utils import timezone
    try:
        webp = to_webp(f).read()
    except Exception:  # noqa: BLE001 — fall back to the original bytes
        f.seek(0)
        webp = f.read()
    try:
        R2Storage().put_object(f'site-images/{key}.webp', webp, 'image/webp')
    except Exception as e:  # noqa: BLE001
        return Response({'error': f'R2 upload failed: {e}'}, status=502)
    # Cache-busting version so the browser picks up the new image immediately.
    ts = int(timezone.now().timestamp())
    url = request.build_absolute_uri(f'/api/public/site-image/{key}/') + f'?v={ts}'
    SiteImage.objects.update_or_create(key=key, defaults={'image_url': url, 'mode': 'manual'})
    cache.delete('public_site_images')
    return Response({'image_url': url})
