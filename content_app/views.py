"""Content Calendar API.

Three views of one dataset — table, Kanban board and month calendar — so the
board endpoint returns everything a page needs in a single round trip
(items + choice lists + the Content-department member list for the pickers),
mirroring nimble_app's /state/ endpoint.

Access follows career_app.access.get_content_calendar_access:
  full   -> anything
  member -> create, and edit items they are assigned to
  none   -> 403
"""
from django.conf import settings
from django.db.models import Prefetch, Q
from rest_framework import permissions, status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .models import (
    BOARD_ORDER, CONTENT_TYPE_CHOICES, EFFORT_CHOICES, PLATFORM_OPTIONS,
    PRIORITY_CHOICES, STATUS_CHOICES, ContentItem,
)
from .serializers import ContentActivitySerializer, ContentItemSerializer


def _tier(user):
    """(tier, member). Isolated import so a career_app import cycle can never
    break this module at load time."""
    from career_app import access
    return access.get_content_calendar_access(user)


class ContentPermission(permissions.BasePermission):
    message = 'You do not have access to the Content Calendar.'

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        tier, _ = _tier(request.user)
        return tier in ('full', 'member')

    def has_object_permission(self, request, view, obj):
        tier, member = _tier(request.user)
        if tier == 'full':
            return True
        if request.method in permissions.SAFE_METHODS:
            return True
        # A Content member may edit items they are actually on — not everyone's.
        if member is None:
            return False
        return (obj.content_assignees.filter(pk=member.pk).exists()
                or obj.graphics_assignees.filter(pk=member.pk).exists())


def _members_qs():
    """Content-department members, for the assignee pickers."""
    from career_app.models import OnboardingSubmission
    rows = (OnboardingSubmission.objects
            .filter(status='verified')
            .only('id', 'candidate_name', 'candidate_email', 'crew_id', 'assigned_departments')
            .order_by('candidate_name'))
    return [r for r in rows
            if any(str(d).strip().lower() == 'content' for d in (r.assigned_departments or []))]


def avatar_map(member_ids):
    """{member_id: avatar_url} for many members in TWO queries, not 2·N.

    Profile pictures live on accounts_app.UserProfile (default DB) while members
    live on turso_db, so the hop is member → MemberAccount.user_id → UserProfile.
    The per-object helper in career_app.serializers does this one member at a
    time, which is fine for a profile page but would be ~50 queries for a board
    of 26 people — hence this batched version.
    """
    ids = [i for i in member_ids if i]
    if not ids:
        return {}
    try:
        from accounts_app.models import UserProfile
        from career_app.models import MemberAccount

        acct = dict(MemberAccount.objects.filter(submission_id__in=ids)
                    .values_list('submission_id', 'user_id'))
        user_ids = [u for u in acct.values() if u]
        if not user_ids:
            return {}
        prof = dict(UserProfile.objects.filter(user_id__in=user_ids)
                    .exclude(avatar_url='')
                    .values_list('user_id', 'avatar_url'))
        return {mid: prof[uid] for mid, uid in acct.items()
                if uid and prof.get(uid)}
    except Exception:  # noqa: BLE001 — a missing picture must never break the board
        return {}


def _member_chip(m, avatars=None):
    return {'id': m.id, 'name': m.candidate_name,
            'email': m.candidate_email, 'crew_id': m.crew_id,
            'avatar_url': (avatars or {}).get(m.id, '')}


class ContentItemViewSet(viewsets.ModelViewSet):
    serializer_class = ContentItemSerializer
    permission_classes = [ContentPermission]

    def get_queryset(self):
        qs = (ContentItem.objects
              .prefetch_related('content_assignees', 'graphics_assignees', 'tasks', 'tasks__assigned_to')
              .all())
        p = self.request.query_params

        if p.get('status'):
            qs = qs.filter(status=p['status'])
        if p.get('brand'):
            qs = qs.filter(brand__iexact=p['brand'])
        if p.get('content_type'):
            qs = qs.filter(content_type=p['content_type'])
        if p.get('platform'):
            qs = qs.filter(platforms__icontains=p['platform'])
        if p.get('assignee'):
            qs = qs.filter(Q(content_assignees__id=p['assignee'])
                           | Q(graphics_assignees__id=p['assignee'])).distinct()
        if p.get('mine') in ('1', 'true', 'yes'):
            _, member = _tier(self.request.user)
            if member is not None:
                qs = qs.filter(Q(content_assignees__id=member.id)
                               | Q(graphics_assignees__id=member.id)).distinct()
            else:
                qs = qs.none()
        # Calendar range
        if p.get('from'):
            qs = qs.filter(release_date__gte=p['from'])
        if p.get('to'):
            qs = qs.filter(release_date__lte=p['to'])
        if p.get('search'):
            s = p['search']
            qs = qs.filter(Q(title__icontains=s) | Q(brand__icontains=s)
                           | Q(notes__icontains=s))
        return qs

    def perform_create(self, serializer):
        item = serializer.save(
            created_by_admin=self.request.user if self.request.user.is_authenticated else None,
            order=services.next_order(serializer.validated_data.get('status', 'idea')),
        )
        services.log(item, 'created', f'Created “{item.title}”.', self.request.user)
        services.ensure_task(item, self.request.user)

    def perform_update(self, serializer):
        before = ContentItem.objects.filter(pk=serializer.instance.pk).values(
            'status', 'release_date').first() or {}
        item = serializer.save()

        if before.get('status') and before['status'] != item.status:
            services.log(item, 'status_changed',
                         f'{before["status"]} → {item.status}.', self.request.user)
        if before.get('release_date') != item.release_date:
            services.log(item, 'rescheduled',
                         f'Release date → {item.release_date or "cleared"}.', self.request.user)

        services.ensure_task(item, self.request.user)
        services.sync_task_status(item, self.request.user)

    def perform_destroy(self, instance):
        title = instance.title
        instance.delete()
        # The row is gone, so the activity trail goes with it (CASCADE); nothing
        # to log against. Task (if any) is left alone — it may have its own life.
        del title


class ContentMoveView(APIView):
    """POST {status, order?} — Kanban drop. Moves a card and reorders its column."""
    permission_classes = [IsAuthenticated, ContentPermission]

    def post(self, request, pk):
        item = ContentItem.objects.filter(pk=pk).first()
        if not item:
            return Response({'error': 'Not found.'}, status=404)
        self.check_object_permissions(request, item)

        new_status = (request.data.get('status') or '').strip()
        if new_status not in dict(STATUS_CHOICES):
            return Response({'error': 'Unknown status.'}, status=400)

        old = item.status
        item.status = new_status
        try:
            item.order = int(request.data.get('order'))
        except (TypeError, ValueError):
            item.order = services.next_order(new_status)
        item.save(update_fields=['status', 'order', 'updated_at'])

        if old != new_status:
            services.log(item, 'status_changed', f'{old} → {new_status}.', request.user)
            services.sync_task_status(item, request.user)

        # Optional full ordering for the destination column.
        ids = request.data.get('column_ids')
        if isinstance(ids, list) and ids:
            services.reorder_column(new_status, ids)

        item.refresh_from_db()
        return Response(ContentItemSerializer(item).data)


class ContentRescheduleView(APIView):
    """POST {release_date} — calendar drop."""
    permission_classes = [IsAuthenticated, ContentPermission]

    def post(self, request, pk):
        item = ContentItem.objects.filter(pk=pk).first()
        if not item:
            return Response({'error': 'Not found.'}, status=404)
        self.check_object_permissions(request, item)

        new_date = request.data.get('release_date') or None
        old = item.release_date
        item.release_date = new_date
        try:
            item.save(update_fields=['release_date', 'updated_at'])
        except Exception as exc:  # noqa: BLE001 — bad date string
            return Response({'error': f'Invalid date: {exc}'}, status=400)

        services.log(item, 'rescheduled',
                     f'{old or "unscheduled"} → {item.release_date or "cleared"}.',
                     request.user)
        item.refresh_from_db()
        return Response(ContentItemSerializer(item).data)


class ContentActivityView(APIView):
    """GET — the history timeline for one item."""
    permission_classes = [IsAuthenticated, ContentPermission]

    def get(self, request, pk):
        item = ContentItem.objects.filter(pk=pk).first()
        if not item:
            return Response({'error': 'Not found.'}, status=404)
        rows = item.activity.all()[:100]
        return Response({'activity': ContentActivitySerializer(rows, many=True).data})


class WhatsAppStatusView(APIView):
    """GET — is WhatsApp live, and what has it sent?  POST — send a test message.

    Superadmin only: this exposes configuration state and can spend money.
    """
    permission_classes = [IsAuthenticated]

    def _denied(self, request):
        if getattr(request.user, 'is_superuser', False):
            return None
        return Response({'error': 'Only a superadmin can manage WhatsApp.'}, status=403)

    def get(self, request):
        denied = self._denied(request)
        if denied:
            return denied
        from . import whatsapp
        from .models import WhatsAppLog

        rows = WhatsAppLog.objects.select_related('member')[:60]
        return Response({
            'config': whatsapp.config_status(),
            'sent_today': whatsapp.sent_today(),
            'counts': {
                s: WhatsAppLog.objects.filter(status=s).count()
                for s in ('sent', 'skipped', 'failed')
            },
            'log': [{
                'id': r.id,
                'member': getattr(r.member, 'candidate_name', '') if r.member_id else '',
                'to': r.to_number,
                'status': r.status,
                'error': r.error,
                'template': r.template,
                'created_at': r.created_at,
            } for r in rows],
            'members_opted_in': _opt_in_count(),
        })

    def post(self, request):
        denied = self._denied(request)
        if denied:
            return denied
        from . import whatsapp

        to = (request.data.get('to') or '').strip()
        if not to:
            return Response({'error': 'Give a number to test with.'}, status=400)
        row = whatsapp.send_template(
            to,
            getattr(settings, 'WHATSAPP_TEMPLATE_ASSIGNED', 'content_assigned'),
            ['there', 'Test message', 'Content', 'today', 'https://admin.tiesverse.com'],
            actor=request.user,
        )
        return Response({'status': row.status, 'error': row.error, 'wamid': row.wamid},
                        status=200 if row.status == 'sent' else 400)


def _opt_in_count():
    from career_app.models import OnboardingSubmission
    return (OnboardingSubmission.objects
            .filter(notify_whatsapp=True).exclude(whatsapp_number='').count())


class ContentBoardView(APIView):
    """Everything the page needs in one call: items, choices, and members."""
    permission_classes = [IsAuthenticated, ContentPermission]

    def get(self, request):
        tier, member = _tier(request.user)

        qs = (ContentItem.objects
              .prefetch_related('content_assignees', 'graphics_assignees', 'tasks', 'tasks__assigned_to')
              .all())
        if request.query_params.get('mine') in ('1', 'true', 'yes') and member:
            qs = qs.filter(Q(content_assignees__id=member.id)
                           | Q(graphics_assignees__id=member.id)).distinct()

        # Resolve every avatar the page needs in one batch, then hand the map to
        # the serializer via context so assignee chips render real photos.
        members = _members_qs()
        needed = {m.id for m in members}
        for it in qs:
            needed.update(a.id for a in it.content_assignees.all())
            needed.update(a.id for a in it.graphics_assignees.all())
        avatars = avatar_map(needed)

        items = ContentItemSerializer(qs, many=True, context={'avatars': avatars}).data

        # Brands come from the website's Brand table so the two stay consistent.
        try:
            from tiesverse_app.models import Brand
            brands = list(Brand.objects.filter(is_active=True)
                          .order_by('order', 'name').values_list('name', flat=True))
        except Exception:  # noqa: BLE001
            brands = []

        return Response({
            'items': items,
            'tier': tier,
            'me': _member_chip(member) if member else None,
            'choices': {
                'statuses': [{'value': v, 'label': l} for v, l in STATUS_CHOICES],
                'board_order': BOARD_ORDER,
                'content_types': [{'value': v, 'label': l} for v, l in CONTENT_TYPE_CHOICES],
                'priorities': [{'value': v, 'label': l} for v, l in PRIORITY_CHOICES],
                'efforts': [{'value': v, 'label': l} for v, l in EFFORT_CHOICES],
                'platforms': PLATFORM_OPTIONS,
                'brands': brands,
            },
            'members': [_member_chip(m, avatars) for m in members],
        })
