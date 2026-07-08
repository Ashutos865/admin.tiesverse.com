"""Multi-session attendance ("work sessions") + weekly hours leaderboard.

A person can check in/out several times a day; each is a WorkSession, optionally
tied to a Task. The day's AttendanceRecord still holds the day-level status and
the single team-lead approval (approved as a whole). Actual task hours come from
summing a task's sessions; the dashboard leaderboard ranks people by hours this
week (worst first), excluding approved-leave days.
"""

from datetime import timedelta
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import OnboardingSubmission, WorkSession, Task, AttendanceRecord, LeaveRequest
from .serializers import WorkSessionSerializer
from . import access


def member_self_approves(member):
    """Team leads (and advisory/HR/admin) mark their own attendance without review."""
    if not member:
        return False
    if access.is_lead(member):
        return True
    return (member.portal_role or '') in {'team_lead', 'advisory', 'admin', 'hr'}


def _resolve_member(request, member_id):
    """(member, error_response). Defaults to the caller; self-scope may only act on self."""
    scope, me = access.get_access_scope(request.user)
    if member_id:
        sub = OnboardingSubmission.objects.filter(pk=member_id, status='verified').first()
        if not sub:
            return None, Response({'error': 'Member not found'}, status=404)
        if scope == 'self' and (me is None or me.id != sub.id):
            return None, Response({'error': 'You can only do this for yourself.'}, status=403)
        return sub, None
    if me is None:
        return None, Response({'error': 'No member profile for this account.'}, status=400)
    return me, None


class WorkSessionCheckInView(APIView):
    """Start a work session (optionally on a task). Body: {member?, task?}."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        sub, err = _resolve_member(request, request.data.get('member'))
        if err:
            return err
        if WorkSession.objects.filter(member=sub, check_out__isnull=True).exists():
            return Response({'error': 'You already have an open session — check out first.'}, status=400)
        now = timezone.now()
        today = now.date()
        task = None
        tid = request.data.get('task')
        if tid:
            task = Task.objects.filter(pk=tid).first()
        # keep the day-level record in sync (first session sets its check_in)
        record, _ = AttendanceRecord.objects.get_or_create(
            member=sub, date=today, defaults={'status': AttendanceRecord.STATUS_PRESENT})
        if not record.check_in:
            record.check_in = now
            record.save(update_fields=['check_in'])
        session = WorkSession.objects.create(member=sub, date=today, check_in=now, task=task)
        return Response(WorkSessionSerializer(session).data, status=201)


class WorkSessionCheckOutView(APIView):
    """Close the caller's open session. Body: {member?, note?, complete_task?}."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        sub, err = _resolve_member(request, request.data.get('member'))
        if err:
            return err
        session = WorkSession.objects.filter(member=sub, check_out__isnull=True).order_by('-check_in').first()
        if not session:
            return Response({'error': 'No open session to check out.'}, status=400)
        now = timezone.now()
        session.check_out = now
        session.note = (request.data.get('note') or '').strip()
        if request.data.get('complete_task') and session.task_id:
            session.completed_task = True
            t = session.task
            t.status = Task.STATUS_DONE
            t.completed_at = now
            t.save(update_fields=['status', 'completed_at'])
        session.save()
        # day-level record: latest checkout; leads self-approve, others await review
        rec = AttendanceRecord.objects.filter(member=sub, date=session.date).first()
        if rec:
            rec.check_out = now
            if member_self_approves(sub):
                rec.approval_status = AttendanceRecord.APPROVAL_APPROVED
                rec.approved_by_name = 'Auto (team lead / advisory)'
                rec.approved_at = now
            else:
                rec.approval_status = AttendanceRecord.APPROVAL_PENDING
            rec.save()
        return Response(WorkSessionSerializer(session).data)


class WorkSessionActiveView(APIView):
    """The caller's (or ?member=) currently open session, or null."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        sub, err = _resolve_member(request, request.query_params.get('member'))
        if err:
            return err
        s = WorkSession.objects.filter(member=sub, check_out__isnull=True).order_by('-check_in').first()
        return Response(WorkSessionSerializer(s).data if s else None)


class WorkSessionListView(APIView):
    """List sessions. ?member=&from=&to= (row-scoped). Also returns a per-date rollup."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = WorkSession.objects.select_related('task', 'member')
        qs = access.scope_member_queryset(qs, request.user, field='member')
        mid = request.query_params.get('member')
        if mid:
            qs = qs.filter(member_id=mid)
        d_from = request.query_params.get('from')
        d_to = request.query_params.get('to')
        if d_from:
            qs = qs.filter(date__gte=d_from)
        if d_to:
            qs = qs.filter(date__lte=d_to)
        sessions = list(qs)
        # per-date rollup
        daily = {}
        for s in sessions:
            key = s.date.isoformat()
            d = daily.setdefault(key, {'date': key, 'sessions': 0, 'minutes': 0})
            d['sessions'] += 1
            d['minutes'] += s.duration_minutes
        return Response({
            'sessions': WorkSessionSerializer(sessions, many=True).data,
            'daily': sorted(daily.values(), key=lambda x: x['date'], reverse=True),
        })


def _week_bounds(today):
    monday = today - timedelta(days=today.weekday())
    return monday, monday + timedelta(days=6)


class WorkLeaderboardView(APIView):
    """This week's hours per member, worst (fewest) first. Members on approved
    leave for the whole elapsed week are excluded (not shamed)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        monday, sunday = _week_bounds(today)

        # sessions this week, grouped per member
        by_member = {}
        for s in WorkSession.objects.filter(date__gte=monday, date__lte=sunday).select_related('member'):
            e = by_member.setdefault(s.member_id, {'minutes': 0, 'sessions': 0})
            e['minutes'] += s.duration_minutes
            e['sessions'] += 1

        # approved leave days per member within the week
        leave_days = {}
        for lr in LeaveRequest.objects.filter(status='approved', from_date__lte=sunday, to_date__gte=monday):
            days = set()
            d = max(lr.from_date, monday)
            while d <= min(lr.to_date, sunday):
                days.add(d)
                d += timedelta(days=1)
            leave_days.setdefault(lr.member_id, set()).update(days)

        elapsed_days = (today - monday).days + 1   # Mon..today inclusive
        rows = []
        for m in OnboardingSubmission.objects.filter(status='verified'):
            stat = by_member.get(m.id, {'minutes': 0, 'sessions': 0})
            lv = leave_days.get(m.id, set())
            on_leave_elapsed = len([d for d in lv if monday <= d <= today])
            # exclude someone who did nothing only because they were on leave all elapsed days
            if stat['minutes'] == 0 and on_leave_elapsed >= elapsed_days:
                continue
            rows.append({
                'member': m.id,
                'name': m.candidate_name,
                'departments': m.assigned_departments or [],
                'minutes': stat['minutes'],
                'hours': round(stat['minutes'] / 60, 1),
                'sessions': stat['sessions'],
                'on_leave_days': len(lv),
            })
        rows.sort(key=lambda r: (r['minutes'], r['name']))   # worst (fewest) first
        return Response({'week_start': monday.isoformat(), 'week_end': sunday.isoformat(), 'leaderboard': rows})
