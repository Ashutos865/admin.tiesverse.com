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

from .models import OnboardingSubmission, WorkSession, Task, AttendanceRecord, LeaveRequest, DailyWorkSummary
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


def _compose_day_report(member, day):
    """Build the day-level work report from that day's session notes.

    Each checked-out session contributes its note, labelled with the task title
    (or the ad-hoc custom label). Sessions with no note are skipped. Returns a
    newline-joined string suitable for AttendanceRecord.work_report. If nothing
    was written, returns '' so we don't overwrite an existing manual report with
    blank text (see the caller — it only assigns when there IS something).
    """
    sessions = (
        WorkSession.objects
        .filter(member=member, date=day, check_out__isnull=False)
        .select_related('task')
        .order_by('check_in')
    )
    lines = []
    for s in sessions:
        note = (s.note or '').strip()
        if not note:
            continue
        label = ''
        if s.task_id and s.task:
            label = (s.task.title or '').strip()
        elif s.custom_task:
            label = s.custom_task.strip()
        lines.append(f'{label}: {note}' if label else note)
    return '\n'.join(lines)


class WorkSessionCheckInView(APIView):
    """Start a work session. Body: {member?, task?, custom_task?}.

    `task` = an assigned Task id (its progress is tracked on the board);
    `custom_task` = a free-text label for ad-hoc work (no board tracking)."""
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
        custom_task = '' if task else str(request.data.get('custom_task') or '').strip()[:300]
        # An assigned task moves to "In Progress" the moment work starts on it.
        if task and task.status == Task.STATUS_TODO:
            task.status = Task.STATUS_IN_PROGRESS
            task.save(update_fields=['status'])
        # Keep the day-level record in sync — but approval now lives PER SESSION,
        # so a new session must NOT touch the day record's approval (doing so would
        # wipe an already-reviewed earlier session). The day record just holds the
        # day's first check_in; the Attendance view reads live state per session.
        record, _ = AttendanceRecord.objects.get_or_create(
            member=sub, date=today, defaults={'status': AttendanceRecord.STATUS_PRESENT})
        if not record.check_in:
            record.check_in = now
            record.save(update_fields=['check_in'])
        session = WorkSession.objects.create(
            member=sub, date=today, check_in=now, task=task, custom_task=custom_task)
        return Response(WorkSessionSerializer(session).data, status=201)


class WorkSessionCheckOutView(APIView):
    """Close the caller's open session. Body: {member?, note?, progress?, complete_task?}.

    `note` (what you did this session) is always saved. `progress` (0–100) and
    `complete_task` apply ONLY to an assigned task and update its board status;
    custom (ad-hoc) tasks are note-only."""
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
        # Progress only for an assigned task; carries over across sessions.
        if session.task_id:
            t = session.task
            done = bool(request.data.get('complete_task'))
            raw = request.data.get('progress')
            prog = None
            if raw is not None and str(raw) != '':
                try:
                    prog = max(0, min(100, int(float(raw))))
                except (TypeError, ValueError):
                    prog = None
            if done:
                prog = 100
            if prog is not None:
                t.progress = prog
                session.progress_after = prog
                fields = ['progress', 'status']
                if prog >= 100:
                    session.completed_task = True
                    t.status = Task.STATUS_DONE
                    t.completed_at = now
                    fields.append('completed_at')
                elif prog > 0:
                    t.status = Task.STATUS_IN_PROGRESS
                t.save(update_fields=fields)
        # Approval is per-session. Leads/advisory self-approve their own sessions;
        # everyone else's session starts Pending (the field default) for review.
        if member_self_approves(sub):
            session.approval_status = WorkSession.APPROVAL_APPROVED
            session.approved_by_name = 'Auto (team lead / advisory)'
            session.approved_at = now
        session.save()
        # day-level record: latest checkout; leads self-approve, others await review
        rec = AttendanceRecord.objects.filter(member=sub, date=session.date).first()
        if rec:
            rec.check_out = now
            # Surface what the member actually did on the day-level Attendance row.
            # Work notes live on each WorkSession; the AttendanceRecord.work_report
            # column stayed empty, so the Attendance table showed "—". Compose the
            # report from all of the day's session notes (each labelled with its
            # task / custom label) so the report is visible there too. Only assign
            # when there's something, so we never blank an existing manual report.
            day_report = _compose_day_report(sub, session.date)
            if day_report:
                rec.work_report = day_report
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
        # per-date rollup (live)
        daily = {}
        for s in sessions:
            key = s.date.isoformat()
            d = daily.setdefault(key, {'date': key, 'sessions': 0, 'minutes': 0,
                                       'finalized': False, 'tasks': [], 'auto_closed': 0})
            d['sessions'] += 1
            d['minutes'] += s.duration_minutes
        # overlay the locked end-of-day snapshots (per-task breakdown + 🔒 finalized)
        summ = DailyWorkSummary.objects.all()
        summ = access.scope_member_queryset(summ, request.user, field='member')
        if mid:
            summ = summ.filter(member_id=mid)
        if d_from:
            summ = summ.filter(date__gte=d_from)
        if d_to:
            summ = summ.filter(date__lte=d_to)
        for su in summ:
            key = su.date.isoformat()
            d = daily.setdefault(key, {'date': key, 'sessions': su.session_count, 'minutes': su.total_minutes})
            d['finalized'] = True
            d['minutes'] = su.total_minutes
            d['sessions'] = su.session_count
            d['tasks'] = su.tasks or []
            d['auto_closed'] = su.auto_closed_count
        return Response({
            'sessions': WorkSessionSerializer(sessions, many=True).data,
            'daily': sorted(daily.values(), key=lambda x: x['date'], reverse=True),
        })


def _session_report(session):
    """The single-session work text, labelled with its task / custom label."""
    note = (session.note or '').strip()
    if not note:
        return ''
    label = ''
    if session.task_id and session.task:
        label = (session.task.title or '').strip()
    elif session.custom_task:
        label = session.custom_task.strip()
    return f'{label}: {note}' if label else note


def _rollup_day_approval(member, day, sessions_by_day, fallback):
    """Approval to show for a finalized day: rejected if any session rejected,
    approved if all approved, else pending. Pre-migration days have sessions all
    at the default 'pending' — fall back to the day AttendanceRecord's approval
    (which legacy code set) so already-approved past days still read approved."""
    day_sessions = sessions_by_day.get((member.id, day), [])
    statuses = [s.approval_status for s in day_sessions]
    if not statuses:
        return fallback
    if any(s == WorkSession.APPROVAL_REJECTED for s in statuses):
        return WorkSession.APPROVAL_REJECTED
    if all(s == WorkSession.APPROVAL_APPROVED for s in statuses):
        return WorkSession.APPROVAL_APPROVED
    # every session still at the default 'pending' + a legacy approved day → trust the day
    if all(s == WorkSession.APPROVAL_PENDING for s in statuses) and fallback == AttendanceRecord.APPROVAL_APPROVED:
        return AttendanceRecord.APPROVAL_APPROVED
    return WorkSession.APPROVAL_PENDING


class AttendanceRowsView(APIView):
    """The Attendance page's rows. While a day is LIVE (today, not yet finalized)
    each work session is its own row; once a day is FINALIZED (a DailyWorkSummary
    exists, or the date is in the past) its sessions collapse into a single
    day-summary row. Returns one flat array with a `row_type` discriminator."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        member_id = request.query_params.get('member')
        date = request.query_params.get('date')
        month = request.query_params.get('month')      # YYYY-MM
        dept = request.query_params.get('dept')
        approval = request.query_params.get('approval')

        def apply_common(qs, field_prefix=''):
            qs = access.scope_member_queryset(qs, request.user, field='member')
            if member_id:
                qs = qs.filter(member_id=member_id)
            if date:
                qs = qs.filter(date=date)
            if month:
                y, mo = month.split('-')
                qs = qs.filter(date__year=y, date__month=mo)
            if dept:
                qs = qs.filter(member__assigned_departments__contains=dept)
            return qs

        rows = []

        # ---- Finalized days → one day-summary row each ----
        summaries = apply_common(DailyWorkSummary.objects.select_related('member'))
        summ_list = list(summaries)
        # matching AttendanceRecords (for status + composed work_report) and the
        # day's sessions (to roll up approval), fetched in bulk.
        summ_keys = [(su.member_id, su.date) for su in summ_list]
        recs_by_key, sessions_by_day = {}, {}
        if summ_keys:
            member_ids = {su.member_id for su in summ_list}
            dates = {su.date for su in summ_list}
            for r in AttendanceRecord.objects.filter(member_id__in=member_ids, date__in=dates):
                recs_by_key[(r.member_id, r.date)] = r
            for s in WorkSession.objects.filter(member_id__in=member_ids, date__in=dates).select_related('member'):
                sessions_by_day.setdefault((s.member_id, s.date), []).append(s)

        for su in summ_list:
            rec = recs_by_key.get((su.member_id, su.date))
            fallback = rec.approval_status if rec else AttendanceRecord.APPROVAL_PENDING
            appr = _rollup_day_approval(su.member, su.date, sessions_by_day, fallback)
            if approval and appr != approval:
                continue
            rows.append({
                'row_type': 'day',
                'id': f'd-{su.id}',
                'summary_id': su.id,
                'attendance_id': rec.id if rec else None,
                'member': su.member_id,
                'member_name': su.member.candidate_name,
                'date': su.date.isoformat(),
                'check_in': su.first_check_in,
                'check_out': su.last_check_out,
                'is_ongoing': False,
                'status': rec.status if rec else AttendanceRecord.STATUS_PRESENT,
                'approval_status': appr,
                'approval_note': rec.approval_note if rec else '',
                'work_report': (rec.work_report if rec else '') or '',
                'total_minutes': su.total_minutes,
                'session_count': su.session_count,
                'auto_closed_count': su.auto_closed_count,
                'duration_minutes': su.total_minutes,
                'can_checkout': False,
                'can_review': False,
            })

        finalized_days = {(su.member_id, su.date) for su in summ_list}

        # ---- Live today → one row per session ----
        # (only today; older un-summarized days are rare but still show as day rows
        #  via the summary branch once finalize runs — for safety they fall here only
        #  if date==today.)
        live_sessions = apply_common(
            WorkSession.objects.select_related('member', 'task').filter(date=today))
        # day AttendanceRecords for today, for status
        today_recs = {}
        if not date or date == today.isoformat():
            for r in AttendanceRecord.objects.filter(date=today):
                today_recs[r.member_id] = r
        seen_members_today = set()
        for s in live_sessions:
            if (s.member_id, s.date) in finalized_days:
                continue  # a summary already exists (early finalize) — skip session rows
            if approval and s.approval_status != approval:
                continue
            seen_members_today.add(s.member_id)
            rec = today_recs.get(s.member_id)
            is_ongoing = s.check_out is None
            closed_pending = (not is_ongoing) and s.approval_status == WorkSession.APPROVAL_PENDING
            rows.append({
                'row_type': 'session',
                'id': f's-{s.id}',
                'session_id': s.id,
                'attendance_id': rec.id if rec else None,
                'member': s.member_id,
                'member_name': s.member.candidate_name,
                'date': s.date.isoformat(),
                'check_in': s.check_in,
                'check_out': s.check_out,
                'is_ongoing': is_ongoing,
                'status': rec.status if rec else AttendanceRecord.STATUS_PRESENT,
                'approval_status': s.approval_status,
                'approval_note': s.approval_note,
                'work_report': _session_report(s),
                'task_title': s.task.title if s.task_id and s.task else (s.custom_task or None),
                'duration_minutes': s.duration_minutes,
                'can_checkout': is_ongoing,
                'can_review': closed_pending,
            })

        # ---- Legacy: checked in today via the day flow but no WorkSession yet ----
        if not date or date == today.isoformat():
            for mid, rec in today_recs.items():
                if mid in seen_members_today or (mid, today) in finalized_days:
                    continue
                if not rec.check_in:
                    continue
                if member_id and str(mid) != str(member_id):
                    continue
                # scope check: only include if the member is in the caller's scope
                if not access.scope_member_queryset(
                        AttendanceRecord.objects.filter(pk=rec.pk), request.user, field='member').exists():
                    continue
                appr = rec.approval_status
                if approval and appr != approval:
                    continue
                is_ongoing = rec.check_out is None
                rows.append({
                    'row_type': 'session',
                    'id': f'a-{rec.id}',
                    'session_id': None,
                    'attendance_id': rec.id,
                    'member': mid,
                    'member_name': rec.member.candidate_name,
                    'date': rec.date.isoformat(),
                    'check_in': rec.check_in,
                    'check_out': rec.check_out,
                    'is_ongoing': is_ongoing,
                    'status': rec.status,
                    'approval_status': appr,
                    'approval_note': rec.approval_note,
                    'work_report': rec.work_report or '',
                    'task_title': None,
                    'duration_minutes': 0,
                    'can_checkout': is_ongoing,
                    'can_review': (not is_ongoing) and appr == AttendanceRecord.APPROVAL_PENDING,
                })

        rows.sort(key=lambda r: (r['date'], r['check_in'].isoformat() if r['check_in'] else ''), reverse=True)
        return Response(rows)


class WorkSessionApproveView(APIView):
    """Team lead approves / rejects ONE work session (per-session review)."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        session = WorkSession.objects.filter(pk=pk).select_related('member').first()
        if not session:
            return Response({'error': 'Session not found'}, status=404)

        scope, me = access.get_access_scope(request.user)
        if scope == 'self':
            return Response({'error': 'You are not allowed to review attendance.'}, status=403)
        if scope == 'team' and session.member_id not in access.team_member_ids(me):
            return Response({'error': 'You can only review your own team.'}, status=403)

        # A finalized day is locked — its sessions can't be re-reviewed.
        if DailyWorkSummary.objects.filter(member_id=session.member_id, date=session.date).exists():
            return Response({'error': 'This day is finalized and can no longer be reviewed.'}, status=400)

        decision = request.data.get('decision')
        if decision not in ('approved', 'rejected'):
            return Response({'error': 'decision must be approved or rejected'}, status=400)

        session.approval_status = decision
        session.approved_by_name = (request.user.get_full_name() or request.user.username)
        session.approved_by_user = request.user
        session.approved_at = timezone.now()
        session.approval_note = request.data.get('note', '')
        session.save(update_fields=['approval_status', 'approved_by_name',
                                    'approved_by_user', 'approved_at', 'approval_note'])
        return Response(WorkSessionSerializer(session).data)


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
