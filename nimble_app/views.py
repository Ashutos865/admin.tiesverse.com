from django.db.models import Q
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import api_view, permission_classes as perm_decorator
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import MonitorChannel, MonitorAlert, MonitorOwnPost
from .serializers import (
    MonitorChannelSerializer, MonitorAlertSerializer, MonitorOwnPostSerializer,
)
from . import services


def _nimble_tier(user):
    """('full'|'none', member) — access to the Nimble Monitor. Isolated import so
    a career_app import cycle can never break this module at load time."""
    from career_app import access
    return access.get_nimble_access(user)


class NimblePermission(permissions.BasePermission):
    """Nimble Monitor is a single shared workspace. Only Nimble-department members
    (+ their lead, org-wide staff, and superusers) may read OR write. Interim
    policy: full access for all Nimble members; finer roles come later."""

    message = 'You do not have access to the Nimble Monitor.'

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        tier, _ = _nimble_tier(request.user)
        return tier == 'full'


class MonitorChannelViewSet(viewsets.ModelViewSet):
    queryset = MonitorChannel.objects.all()
    serializer_class = MonitorChannelSerializer
    permission_classes = [NimblePermission]

    def get_queryset(self):
        from . import platforms
        qs = MonitorChannel.objects.all()
        kind = self.request.query_params.get('kind')
        if kind in {'COMPETITOR', 'OWN'}:
            qs = qs.filter(kind=kind)
        source = platforms.normalize_source(self.request.query_params.get('source'))
        if source:
            qs = qs.filter(source=source)
        return qs


class MonitorAlertViewSet(viewsets.ModelViewSet):
    """List / retrieve / PATCH alerts. Alerts are created by the poller, not the
    API — POST/PUT are not exposed (ModelViewSet allows PATCH for the board)."""
    serializer_class = MonitorAlertSerializer
    permission_classes = [NimblePermission]
    http_method_names = ['get', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        # channel is same-DB (turso) — safe to select_related. Do NOT join to auth.
        qs = MonitorAlert.objects.select_related('channel')
        status_f = self.request.query_params.get('status')
        if status_f in {'OPEN', 'WORKING'}:
            qs = qs.filter(status=status_f)
        channel = self.request.query_params.get('channel')
        if channel:
            qs = qs.filter(channel_id=channel)
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(note__icontains=search))
        return qs


class MonitorOwnPostViewSet(viewsets.ModelViewSet):
    queryset = MonitorOwnPost.objects.all()
    serializer_class = MonitorOwnPostSerializer
    permission_classes = [NimblePermission]
    http_method_names = ['get', 'post', 'delete', 'head', 'options']


class MonitorPlatformsView(APIView):
    """The platforms the UI should offer (label, handle help, experimental flag).
    Mirrors the upstream tool's /api/platforms so the React page stops hardcoding
    "YouTube". Only ENABLED sources are returned, so Instagram stays hidden until
    NIMBLE_ENABLED_SOURCES includes it."""
    permission_classes = [NimblePermission]

    def get(self, request):
        from . import platforms
        return Response(platforms.public_platforms())


class MonitorStateView(APIView):
    """One call that returns the whole workspace for the dashboard: channels,
    alerts, own-posts, and the 7-day report — mirrors the tool's /api/state.
    Optional ?source=youtube|x filters to one platform workspace."""
    permission_classes = [NimblePermission]

    def get(self, request):
        from . import platforms
        source = platforms.normalize_source(request.query_params.get('source'))

        channels = MonitorChannel.objects.all()
        alerts = MonitorAlert.objects.select_related('channel')
        own = MonitorOwnPost.objects.all()
        if source:
            channels = channels.filter(source=source)
            alerts = alerts.filter(channel__source=source)
            own = own.filter(source=source)
        return Response({
            'channels': MonitorChannelSerializer(channels, many=True).data,
            'alerts': MonitorAlertSerializer(alerts, many=True).data,
            'ownPosts': MonitorOwnPostSerializer(own, many=True).data,
            'report': services.weekly_report(),
            'heatmap': services.own_post_heatmap(7),
            'platforms': platforms.public_platforms(),
            'health': services.health(),
        })


class MonitorPollNowView(APIView):
    """"Check now" — run the same poll the cron runs, on demand. Optional
    ?source=x to check just one platform."""
    permission_classes = [NimblePermission]

    def post(self, request):
        source = request.query_params.get('source') or (request.data or {}).get('source')
        return Response(services.poll_channels(only_source=source))

    # allow GET too for convenience / manual trigger
    def get(self, request):
        return Response(services.poll_channels(
            only_source=request.query_params.get('source')))


class MonitorWeeklyReportView(APIView):
    permission_classes = [NimblePermission]

    def get(self, request):
        return Response(services.weekly_report())


class MonitorWeeklyReportSendView(APIView):
    permission_classes = [NimblePermission]

    def post(self, request):
        from .youtube import send_report_email
        r = services.weekly_report()
        subject = (f"Nimble Monitor Weekly Report - {r['competitorPosts']} competitor posts, "
                   f"{r['actionsTaken']} actions, {r['missedSignals']} missed signals")
        try:
            return Response(send_report_email(services.weekly_report_text(), subject))
        except Exception as exc:  # noqa: BLE001
            return Response({'sent': False, 'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class MonitorExportCsvView(APIView):
    permission_classes = [NimblePermission]

    def get(self, request):
        from django.http import HttpResponse
        payload = services.export_csv_text().encode('utf-8-sig')
        resp = HttpResponse(payload, content_type='text/csv; charset=utf-8')
        resp['Content-Disposition'] = 'attachment; filename="nimble-monitor-export.csv"'
        return resp
