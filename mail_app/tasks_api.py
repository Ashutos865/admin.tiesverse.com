"""Turning a message into a task.

An email that needs doing is work, not correspondence — this is the one place
that crosses that line. The task itself is a normal `career_app.Task`, so it
shows up on the assignee's board exactly like every other task; nothing here
invents a second to-do system.

Why this lives in mail_app rather than calling /api/career/tasks/ from the
browser: that endpoint requires the `add_task` model permission, which ordinary
members do not have, and it needs a `request.user`, which a shared-mailbox
session does not have. Both are correct for the admin panel and wrong here. So
the rule this module enforces instead is:

    assigning to YOURSELF      — anyone who can open the mailbox
    assigning to SOMEONE ELSE  — only someone who could already assign work
                                 (lead / HR / advisory / admin), and a lead
                                 still only within their own team

which keeps the portal's authority model intact while letting anyone make a
note-to-self out of their own mail.
"""
from django.utils.dateparse import parse_date
from rest_framework.response import Response
from rest_framework.views import APIView

from career_app import access
from career_app.models import OnboardingSubmission, Task

from . import services
from .models import MailMessage
from .views import MailPermission, _accessible_mailbox, mailbox_from_shared_token

# Mirrors career_app.Task's own choices; a bad value falls back to the default
# rather than 500ing on a DB constraint.
PRIORITIES = {'low', 'medium', 'high', 'urgent'}


def _member_for_request(request, mailbox):
    """Who is acting. A portal user resolves to their member record; a shared
    mailbox resolves to the member that box belongs to, so a team signed in with
    the mailbox password can still raise tasks for that team's own member."""
    if getattr(request.user, 'is_authenticated', False):
        return access.get_member_for_user(request.user)
    return mailbox.member if mailbox else None


def _may_assign_to_others(request, me):
    """Everyone can task themselves; handing work to someone else is the part
    that needs standing. Superusers and back-office staff (no member record)
    keep the org-wide reach they have everywhere else."""
    scope, _ = access.get_access_scope(request.user) if getattr(
        request.user, 'is_authenticated', False) else ('none', None)
    return scope in {'all', 'team'}


def _assignable_ids(request, me):
    """The set of member ids this caller may assign to, or None for 'anyone'."""
    scope, _ = access.get_access_scope(request.user) if getattr(
        request.user, 'is_authenticated', False) else ('none', None)
    if scope == 'all':
        return None
    if scope == 'team' and me is not None:
        return access.team_member_ids(me)
    return {me.id} if me is not None else set()


def _snippet(message, limit=600):
    """A short plain-text quote of the mail, so the task carries its own context
    on a board where the mail app is not open."""
    text = (message.body_text or message.snippet or '').strip()
    if not text and message.body_html:
        from .sanitize import html_to_text
        text = (html_to_text(message.body_html) or '').strip()
    text = ' '.join(text.split())
    return text[:limit] + ('…' if len(text) > limit else '')


class MailMessageTaskView(APIView):
    """POST /api/mail/messages/<pk>/task/ — make this message someone's task.

    GET returns the tasks already made from it, which is what stops the same
    mail quietly becoming four identical tasks after four clicks.
    """
    permission_classes = [MailPermission]

    def _message(self, request, pk):
        msg = MailMessage.objects.filter(pk=pk).select_related('mailbox').first()
        if not msg:
            return None, None, Response({'error': 'Message not found.'}, status=404)
        box, denied = _accessible_mailbox(request, msg.mailbox_id)
        if denied:
            return None, None, denied
        return msg, box, None

    def get(self, request, pk):
        msg, _box, denied = self._message(request, pk)
        if denied:
            return denied
        rows = (Task.objects.filter(source_mail_message=msg)
                .select_related('assigned_to').order_by('-created_at'))
        return Response({'tasks': [_serialize(t) for t in rows]})

    def post(self, request, pk):
        msg, box, denied = self._message(request, pk)
        if denied:
            return denied

        me = _member_for_request(request, box)
        title = (request.data.get('title') or msg.subject or '').strip()
        if not title:
            return Response({'error': 'Give the task a title.'}, status=400)
        title = title[:500]

        raw_to = request.data.get('assigned_to')
        assignee = None
        if raw_to in (None, '', 'me'):
            # The default and the common case: this is mine to do.
            if me is None:
                return Response(
                    {'error': 'Your mailbox is not linked to a member record, '
                              'so a task cannot be assigned to you.'}, status=400)
            assignee = me
        else:
            try:
                assignee = OnboardingSubmission.objects.filter(pk=int(raw_to)).first()
            except (TypeError, ValueError):
                assignee = None
            if assignee is None:
                return Response({'error': 'That person was not found.'}, status=400)
            if me is None or assignee.id != me.id:
                if not _may_assign_to_others(request, me):
                    return Response(
                        {'error': 'You can only make tasks for yourself.'}, status=403)
                allowed = _assignable_ids(request, me)
                if allowed is not None and assignee.id not in allowed:
                    return Response(
                        {'error': 'You can only assign tasks to your own team.'}, status=403)

        priority = str(request.data.get('priority') or 'medium').lower()
        if priority not in PRIORITIES:
            priority = 'medium'

        due = parse_date(str(request.data.get('due_date') or '')) or None

        note = (request.data.get('description') or '').strip()
        quote = _snippet(msg)
        sender = (msg.peer or '').strip()
        description = '\n\n'.join(part for part in [
            note,
            f'From the email “{msg.subject or "(no subject)"}”'
            + (f' — {sender}' if sender else '') + '.',
            quote,
        ] if part)

        task = Task.objects.create(
            title=title,
            description=description,
            assigned_to=assignee,
            assigned_by=me,
            assigned_by_admin=(request.user
                               if getattr(request.user, 'is_authenticated', False) else None),
            priority=priority,
            status='todo',
            due_date=due,
            source_mail_message=msg,
            source_mail_subject=(msg.subject or '')[:500],
            source_mail_from=sender[:255],
        )

        # A superadmin acting inside a box that is not theirs is audited here for
        # the same reason reading it is: the trail must not have holes.
        if (getattr(request.user, 'is_authenticated', False)
                and getattr(request.user, 'is_superuser', False)
                and not services.can_use_mailbox(request.user, box)):
            services.audit(request.user, 'created_task', mailbox=box, message=msg,
                           note=f'Made a task for {assignee.candidate_name}: "{title[:80]}".')

        return Response(_serialize(task), status=201)


class MailAssignableView(APIView):
    """GET /api/mail/assignable/ — who this caller may hand a task to.

    Returns `{me, can_assign_others, people}`. `people` is empty when the caller
    may only task themselves, so the picker can simply not offer a choice
    rather than offering one the server will refuse.
    """
    permission_classes = [MailPermission]

    def get(self, request):
        box = mailbox_from_shared_token(request)
        me = _member_for_request(request, box)
        can_others = _may_assign_to_others(request, me)

        people = []
        if can_others:
            allowed = _assignable_ids(request, me)
            qs = OnboardingSubmission.objects.filter(status='verified')
            if allowed is not None:
                qs = qs.filter(pk__in=list(allowed))
            people = [{
                'id': m.id,
                'name': m.candidate_name,
                'email': m.candidate_email,
                'crew_id': m.crew_id or '',
                'role': m.role_offered or '',
                'departments': list(m.assigned_departments or []),
            } for m in qs.order_by('candidate_name')[:500]]

        return Response({
            'me': {'id': me.id, 'name': me.candidate_name} if me else None,
            'can_assign_others': can_others,
            'people': people,
        })


def _serialize(task):
    return {
        'id': task.id,
        'title': task.title,
        'status': task.status,
        'priority': task.priority,
        'due_date': task.due_date,
        'assigned_to': task.assigned_to_id,
        'assigned_to_name': task.assigned_to.candidate_name if task.assigned_to else '',
        'created_at': task.created_at,
    }
