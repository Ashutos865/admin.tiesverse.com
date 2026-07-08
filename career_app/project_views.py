"""Projects module (Phase 1): CRUD + scoping + deadline management + participants.

Who can create projects: Advisory (org-wide / any departments) and Team Leads
(their own team's departments only). Everyone in a project's departments becomes a
participant and can see it. Row-scoping mirrors the rest of the HR portal via
career_app.access. Tasks reuse the existing Task model (Task.project FK), so a
project's board is just `/career/tasks/?project=<id>`.
"""

from django.utils import timezone
from django.utils.dateparse import parse_date
from django.db.models import Q as models_Q
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import (
    Project, ProjectMember, ProjectDeadlineChange, OnboardingSubmission,
    ProjectChecklistItem, ProjectMessage, DirectMessage, ProjectNotification,
    ProjectTeam, ProjectMilestone, ProjectAttachment, Task, TaskStep,
)
from .serializers import (
    ProjectSerializer, ProjectMemberSerializer, ProjectDeadlineChangeSerializer,
    ProjectChecklistItemSerializer, ProjectMessageSerializer, DirectMessageSerializer,
    ProjectNotificationSerializer, ProjectTeamSerializer, ProjectMilestoneSerializer,
    ProjectAttachmentSerializer, TaskStepSerializer,
)
from . import access


def _has_perm(user, perm):
    return getattr(user, 'is_superuser', False) or user.has_perm(f'career_app.{perm}')


def visible_project_ids(user):
    """Set of project ids `user` may see. A project is visible ONLY to its actual
    participants — plus the advisory/admin (org-wide) and the team lead(s) who
    manage projects touching their departments. No department/org-wide 'peeking'
    for non-participants (departments already auto-add people as participants)."""
    scope, member = access.get_access_scope(user)
    if scope == 'all':
        return set(Project.objects.values_list('id', flat=True))
    if not member:
        return set()
    keep = set(ProjectMember.objects.filter(member=member).values_list('project_id', flat=True))
    if scope == 'team':
        led = access.led_department_names(member)
        for p in Project.objects.all():
            if p.created_by_id == member.id or (set(p.departments or []) & led):
                keep.add(p.id)
    return keep


def _project_if_visible(user, project_id):
    if not project_id:
        return None
    try:
        pid = int(project_id)
    except (TypeError, ValueError):
        return None
    if pid not in visible_project_ids(user):
        return None
    return Project.objects.filter(id=pid).first()


def _sync_project_members(project, extra_lead=None):
    """Add every verified member in the project's departments as a participant.
    Keeps `extra_lead` (the creator) as project lead. Never removes anyone."""
    if project.scope == Project.SCOPE_ALL:
        targets = list(OnboardingSubmission.objects.filter(status='verified'))
    else:
        depts = set(project.departments or [])
        targets = [m for m in OnboardingSubmission.objects.filter(status='verified')
                   if set(m.assigned_departments or []) & depts]
    existing = set(project.members.values_list('member_id', flat=True))
    for m in targets:
        if m.id not in existing:
            ProjectMember.objects.create(project=project, member=m, role=ProjectMember.ROLE_MEMBER)
    if extra_lead is not None:
        pm = project.members.filter(member=extra_lead).first()
        if pm:
            if pm.role != ProjectMember.ROLE_LEAD:
                pm.role = ProjectMember.ROLE_LEAD
                pm.save(update_fields=['role'])
        else:
            ProjectMember.objects.create(project=project, member=extra_lead, role=ProjectMember.ROLE_LEAD)


class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated]

    # ── visibility ────────────────────────────────────────────────────────────
    def get_queryset(self):
        scope, _ = access.get_access_scope(self.request.user)
        qs = Project.objects.all().prefetch_related('members', 'tasks')
        if scope == 'all':
            return qs
        return qs.filter(id__in=visible_project_ids(self.request.user))

    def _can_manage(self, request, project):
        """Advisory (org-wide), the creator, or a team lead over a targeted
        department may edit/close/extend a project."""
        return access.can_manage_project(request.user, project)

    # ── create (Advisory / Team Lead only) ─────────────────────────────────────
    def create(self, request, *args, **kwargs):
        if not _has_perm(request.user, 'add_project'):
            return Response({'error': 'You do not have permission to create projects.'}, status=403)
        scope, member = access.get_access_scope(request.user)
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        owner_role = 'advisory' if scope == 'all' else 'team_lead'

        # Team leads: department-scoped to their own teams only.
        if scope == 'team' and member is not None:
            led = access.led_department_names(member)
            data['scope'] = Project.SCOPE_DEPARTMENTS
            req_depts = set(data.get('departments') or [])
            allowed = (req_depts & led) if req_depts else led
            if not allowed:
                return Response({'error': 'Select at least one of your own team departments.'}, status=400)
            data['departments'] = list(allowed)

        ser = self.get_serializer(data=data)
        ser.is_valid(raise_exception=True)
        project = ser.save(
            created_by=member, created_by_admin=request.user, owner_role=owner_role,
            original_deadline=ser.validated_data.get('deadline'),
        )
        _sync_project_members(project, extra_lead=member)
        # Individually-chosen people (in addition to the departments).
        for mid in (request.data.get('members') or []):
            if str(mid).isdigit():
                ProjectMember.objects.get_or_create(
                    project=project, member_id=int(mid), defaults={'role': ProjectMember.ROLE_MEMBER})
        return Response(self.get_serializer(project).data, status=201)

    # ── update / delete (manager only) ─────────────────────────────────────────
    def update(self, request, *args, **kwargs):
        project = self.get_object()
        if not self._can_manage(request, project):
            return Response({'error': 'You cannot edit this project.'}, status=403)
        resp = super().update(request, *args, **kwargs)
        # If departments changed, pull in any new participants.
        _sync_project_members(self.get_object())
        return resp

    def partial_update(self, request, *args, **kwargs):
        project = self.get_object()
        if not self._can_manage(request, project):
            return Response({'error': 'You cannot edit this project.'}, status=403)
        resp = super().partial_update(request, *args, **kwargs)
        _sync_project_members(self.get_object())
        return resp

    def destroy(self, request, *args, **kwargs):
        if not _has_perm(request.user, 'delete_project'):
            return Response({'error': 'You do not have permission to delete projects.'}, status=403)
        project = self.get_object()
        if not self._can_manage(request, project):
            return Response({'error': 'You cannot delete this project.'}, status=403)
        return super().destroy(request, *args, **kwargs)

    # ── deadline extension (audited; resets the 15-day chat clock) ──────────────
    @action(detail=True, methods=['post'], url_path='extend-deadline')
    def extend_deadline(self, request, pk=None):
        project = self.get_object()
        if not self._can_manage(request, project):
            return Response({'error': 'You cannot change this project.'}, status=403)
        raw = request.data.get('new_deadline')
        new_deadline = parse_date(raw) if raw else None
        if not new_deadline:
            return Response({'error': 'A valid new_deadline (YYYY-MM-DD) is required.'}, status=400)
        old = project.deadline
        project.deadline = new_deadline
        # Extending a finished project reopens it (and restarts the chat purge clock).
        if project.status == Project.STATUS_COMPLETED:
            project.status = Project.STATUS_ACTIVE
            project.completed_at = None
        project.save()
        ProjectDeadlineChange.objects.create(
            project=project, old_deadline=old, new_deadline=new_deadline,
            reason=request.data.get('reason', ''),
            changed_by=access.get_member_for_user(request.user),
            changed_by_admin=request.user,
        )
        return Response(self.get_serializer(project).data)

    # ── status change (complete stamps completed_at → starts 15-day chat clock) ─
    @action(detail=True, methods=['post'], url_path='set-status')
    def set_status(self, request, pk=None):
        project = self.get_object()
        if not self._can_manage(request, project):
            return Response({'error': 'You cannot change this project.'}, status=403)
        new_status = request.data.get('status')
        if new_status not in dict(Project.STATUS_CHOICES):
            return Response({'error': 'Invalid status.'}, status=400)
        project.status = new_status
        if new_status == Project.STATUS_COMPLETED:
            if not project.completed_at:
                project.completed_at = timezone.now()
        else:
            project.completed_at = None
        project.save()
        return Response(self.get_serializer(project).data)

    # ── participants ───────────────────────────────────────────────────────────
    @action(detail=True, methods=['post'], url_path='add-member')
    def add_member(self, request, pk=None):
        project = self.get_object()
        if not self._can_manage(request, project):
            return Response({'error': 'You cannot manage this project.'}, status=403)
        mid = request.data.get('member')
        role = request.data.get('role', ProjectMember.ROLE_MEMBER)
        m = OnboardingSubmission.objects.filter(id=mid).first() if mid else None
        if not m:
            return Response({'error': 'Member not found.'}, status=404)
        pm, created = ProjectMember.objects.get_or_create(project=project, member=m, defaults={'role': role})
        if not created and pm.role != role:
            pm.role = role
            pm.save(update_fields=['role'])
        return Response(ProjectMemberSerializer(pm).data, status=201 if created else 200)

    @action(detail=True, methods=['post'], url_path='remove-member')
    def remove_member(self, request, pk=None):
        project = self.get_object()
        if not self._can_manage(request, project):
            return Response({'error': 'You cannot manage this project.'}, status=403)
        mid = request.data.get('member')
        ProjectMember.objects.filter(project=project, member_id=mid).delete()
        return Response({'ok': True}, status=200)

    @action(detail=True, methods=['post'], url_path='add-department')
    def add_department(self, request, pk=None):
        """Add every verified member of one or more departments as participants."""
        project = self.get_object()
        if not self._can_manage(request, project):
            return Response({'error': 'You cannot manage this project.'}, status=403)
        depts = request.data.get('departments') or ([request.data['department']] if request.data.get('department') else [])
        depts = set(depts)
        if not depts:
            return Response({'error': 'Provide department(s) to add.'}, status=400)
        existing = set(project.members.values_list('member_id', flat=True))
        added = 0
        for m in OnboardingSubmission.objects.filter(status='verified'):
            if m.id not in existing and (set(m.assigned_departments or []) & depts):
                ProjectMember.objects.create(project=project, member=m, role=ProjectMember.ROLE_MEMBER)
                added += 1
        return Response({'added': added}, status=200)

    @action(detail=True, methods=['get'], url_path='deadline-changes')
    def deadline_changes(self, request, pk=None):
        project = self.get_object()
        return Response(ProjectDeadlineChangeSerializer(project.deadline_changes.all(), many=True).data)

    @action(detail=True, methods=['get'], url_path='dm-people')
    def dm_people(self, request, pk=None):
        """People the current user can DM in this project: project members + admins."""
        from django.contrib.auth.models import User as _User
        project = self.get_object()
        me = _identity(request.user)
        people, seen = [], set()
        for pm in project.members.select_related('member'):
            if not pm.member_id:
                continue
            if me['kind'] == 'member' and pm.member_id == me['id']:
                continue
            key = f"m{pm.member_id}"
            if key in seen:
                continue
            seen.add(key)
            people.append({'key': key, 'name': pm.member.candidate_name, 'kind': 'member'})
        for u in _User.objects.filter(is_superuser=True):
            if me['kind'] == 'admin' and u.id == me['id']:
                continue
            m = access.get_member_for_user(u)
            if m and f"m{m.id}" in seen:
                continue   # already listed as their member identity
            key = f"u{u.id}"
            if key in seen:
                continue
            seen.add(key)
            people.append({'key': key, 'name': u.get_full_name() or u.username, 'kind': 'admin'})
        return Response({'people': people})

    @action(detail=True, methods=['post'], url_path='assign-team')
    def assign_team(self, request, pk=None):
        """Set which sub-teams a participant belongs to (a person can be in many).
        Body: {member, teams: [ids]}. Also accepts {member, team, action:'add'|'remove'}."""
        project = self.get_object()
        if not self._can_manage(request, project):
            return Response({'error': 'You cannot manage this project.'}, status=403)
        mid = request.data.get('member')
        pm = ProjectMember.objects.filter(project=project, member_id=mid).first()
        if not pm:
            return Response({'error': 'That person is not a participant.'}, status=404)
        valid_ids = set(project.teams.values_list('id', flat=True))
        if 'teams' in request.data:
            ids = [int(t) for t in (request.data.get('teams') or []) if str(t).isdigit() and int(t) in valid_ids]
            pm.teams.set(ids)
        else:
            team_id = request.data.get('team')
            if team_id and int(team_id) in valid_ids:
                if request.data.get('action') == 'remove':
                    pm.teams.remove(int(team_id))
                else:
                    pm.teams.add(int(team_id))
        return Response(ProjectMemberSerializer(pm).data)

    @action(detail=True, methods=['get'], url_path='export')
    def export(self, request, pk=None):
        """Download a CSV summary of the project (meta + tasks)."""
        import csv
        from django.http import HttpResponse
        project = self.get_object()
        resp = HttpResponse(content_type='text/csv')
        slug = ''.join(c if c.isalnum() else '-' for c in project.title)[:40] or 'project'
        resp['Content-Disposition'] = f'attachment; filename="{slug}.csv"'
        w = csv.writer(resp)
        w.writerow(['Project', project.title])
        w.writerow(['Status', project.get_status_display()])
        w.writerow(['Priority', project.priority])
        w.writerow(['Departments', ', '.join(project.departments or []) or ('All' if project.scope == 'all' else '')])
        w.writerow(['Deadline', project.deadline or ''])
        w.writerow(['Progress %', ProjectSerializer(project).data.get('progress')])
        w.writerow([])
        w.writerow(['Task', 'Status', 'Priority', 'Assigned to', 'Team', 'Due date'])
        team_names = {t.id: t.name for t in project.teams.all()}
        for t in project.tasks.select_related('assigned_to').all():
            assignee = (t.assigned_to.candidate_name if t.assigned_to else '') or t.assigned_to_department or ''
            w.writerow([t.title, t.get_status_display(), t.priority, assignee,
                        team_names.get(t.project_team_id, ''), t.due_date or ''])
        return resp


# ── Sub-resources: checklist, chat, DMs, notifications ────────────────────────

def _current_member(user):
    return access.get_member_for_user(user)


def _project_manager(request, project):
    """Convenience wrapper around ProjectViewSet._can_manage for standalone viewsets."""
    vs = ProjectViewSet()
    vs.request = request
    return vs._can_manage(request, project)


class ProjectChecklistViewSet(viewsets.ModelViewSet):
    """The pinned 'what to do' list for a project. Everyone in the project sees it;
    managers add/edit/remove; any participant may tick items done."""
    serializer_class = ProjectChecklistItemSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'patch', 'delete']

    def get_queryset(self):
        qs = ProjectChecklistItem.objects.all()
        pid = self.request.query_params.get('project')
        if pid:
            qs = qs.filter(project_id=pid)
        return qs.filter(project_id__in=visible_project_ids(self.request.user))

    def create(self, request, *args, **kwargs):
        project = _project_if_visible(request.user, request.data.get('project'))
        if not project:
            return Response({'error': 'Project not found.'}, status=404)
        if not _project_manager(request, project):
            return Response({'error': 'Only project managers can add checklist items.'}, status=403)
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        item = ser.save(created_by=_current_member(request.user), created_by_admin=request.user)
        return Response(self.get_serializer(item).data, status=201)

    def partial_update(self, request, *args, **kwargs):
        item = self.get_object()
        # Any participant may tick items done; only managers may edit text/order.
        only_done = set(request.data.keys()) <= {'is_done'}
        if not only_done and not _project_manager(request, item.project):
            return Response({'error': 'Only project managers can edit checklist items.'}, status=403)
        if 'is_done' in request.data:
            done = bool(request.data.get('is_done'))
            item.is_done = done
            item.done_by = _current_member(request.user) if done else None
            item.done_at = timezone.now() if done else None
            item.save(update_fields=['is_done', 'done_by', 'done_at'])
        other = {k: v for k, v in request.data.items() if k != 'is_done'}
        if other:
            ser = self.get_serializer(item, data=other, partial=True)
            ser.is_valid(raise_exception=True)
            ser.save()
        return Response(self.get_serializer(self.get_object()).data)

    def destroy(self, request, *args, **kwargs):
        item = self.get_object()
        if not _project_manager(request, item.project):
            return Response({'error': 'Only project managers can remove checklist items.'}, status=403)
        return super().destroy(request, *args, **kwargs)


def _member_in_team(user, project, team_id):
    me = access.get_member_for_user(user)
    if not me or not str(team_id).isdigit():
        return False
    pm = ProjectMember.objects.filter(project=project, member=me).first()
    return bool(pm and pm.teams.filter(id=team_id).exists())


def _can_access_team(request, project, team_id):
    """Managers, or members of the sub-team, may read/post in its channel."""
    return _project_manager(request, project) or _member_in_team(request.user, project, team_id)


class ProjectMessageViewSet(viewsets.ModelViewSet):
    """Project chat (polling). Group chat: ?project=<id>. Sub-team channel:
    ?project=<id>&team=<team_id>. ?after=<last_id> for incremental polling."""
    serializer_class = ProjectMessageSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'patch', 'delete']

    def get_queryset(self):
        qs = ProjectMessage.objects.filter(project_id__in=visible_project_ids(self.request.user))
        pid = self.request.query_params.get('project')
        if pid:
            qs = qs.filter(project_id=pid)
        team = self.request.query_params.get('team')
        if team:
            proj = _project_if_visible(self.request.user, pid) if pid else None
            if not proj or not _can_access_team(self.request, proj, team):
                return ProjectMessage.objects.none()
            qs = qs.filter(team_id=team)
        else:
            qs = qs.filter(team__isnull=True)   # whole-project group chat
        after = self.request.query_params.get('after')
        if after:
            qs = qs.filter(id__gt=after)
        return qs

    def create(self, request, *args, **kwargs):
        project = _project_if_visible(request.user, request.data.get('project'))
        if not project:
            return Response({'error': 'Project not found.'}, status=404)
        body = (request.data.get('body') or '').strip()
        if not body:
            return Response({'error': 'Message cannot be empty.'}, status=400)
        team_id = request.data.get('team') or None
        if team_id and not _can_access_team(request, project, team_id):
            return Response({'error': 'You are not in this sub-team.'}, status=403)
        mentions = request.data.get('mentions') or []
        me = _current_member(request.user)
        msg = ProjectMessage.objects.create(
            project=project, team_id=team_id, sender=me, sender_admin=request.user, body=body,
            mentions=[int(m) for m in mentions if str(m).isdigit()],
            reply_to_id=request.data.get('reply_to') or None,
        )
        # Notify mentioned members.
        sender_name = (me.candidate_name if me else (request.user.get_full_name() or request.user.username))
        for mid in msg.mentions:
            if me and mid == me.id:
                continue
            ProjectNotification.objects.create(
                recipient_id=mid, project=project, kind=ProjectNotification.KIND_MENTION,
                text=f"{sender_name} mentioned you in {project.title}",
                link=f"/projects/{project.id}",
            )
        return Response(self.get_serializer(msg).data, status=201)

    def _pin_guard(self, request):
        return None  # pin handled in partial_update

    def partial_update(self, request, *args, **kwargs):
        msg = self.get_object()
        if not _project_manager(request, msg.project):
            return Response({'error': 'Only project managers can pin/edit messages.'}, status=403)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        msg = self.get_object()
        me = _current_member(request.user)
        if not ((me and msg.sender_id == me.id) or _project_manager(request, msg.project)):
            return Response({'error': 'You can only delete your own messages.'}, status=403)
        return super().destroy(request, *args, **kwargs)


# ── DM identities: a party is either a member ("m<id>") or an admin user ("u<id>") ─
def _identity(user):
    """Return {'kind','id'} for the current user (member if they have a profile)."""
    m = access.get_member_for_user(user)
    return {'kind': 'member', 'id': m.id, 'member': m} if m else {'kind': 'admin', 'id': user.id, 'user': user}


def _parse_key(key):
    """'m5' -> ('member',5); 'u3' -> ('admin',3); bare int -> member (back-compat)."""
    if key is None:
        return None
    key = str(key)
    if key.startswith('m') and key[1:].isdigit():
        return ('member', int(key[1:]))
    if key.startswith('u') and key[1:].isdigit():
        return ('admin', int(key[1:]))
    if key.isdigit():
        return ('member', int(key))
    return None


def _sender_q(kind, ident):
    return models_Q(sender_id=ident) if kind == 'member' else models_Q(sender_admin_id=ident)


def _recipient_q(kind, ident):
    return models_Q(recipient_id=ident) if kind == 'member' else models_Q(recipient_admin_id=ident)


class DirectMessageViewSet(viewsets.ModelViewSet):
    """1:1 DMs within a project between members and/or admins.
    List a conversation: ?project=<id>&with=<m|u><id>."""
    serializer_class = DirectMessageSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post']

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    def get_queryset(self):
        me = _identity(self.request.user)
        qs = DirectMessage.objects.filter(project_id__in=visible_project_ids(self.request.user))
        pid = self.request.query_params.get('project')
        if pid:
            qs = qs.filter(project_id=pid)
        mine_send, mine_recv = _sender_q(me['kind'], me['id']), _recipient_q(me['kind'], me['id'])
        other = _parse_key(self.request.query_params.get('with'))
        if other:
            ok, oid = other
            a = _sender_q(me['kind'], me['id']) & _recipient_q(ok, oid)
            b = _sender_q(ok, oid) & _recipient_q(me['kind'], me['id'])
            qs = qs.filter(a | b)
        else:
            qs = qs.filter(mine_send | mine_recv)
        after = self.request.query_params.get('after')
        if after:
            qs = qs.filter(id__gt=after)
        return qs

    def create(self, request, *args, **kwargs):
        me = _identity(request.user)
        project = _project_if_visible(request.user, request.data.get('project'))
        if not project:
            return Response({'error': 'Project not found.'}, status=404)
        other = _parse_key(request.data.get('recipient'))
        body = (request.data.get('body') or '').strip()
        if not (other and body):
            return Response({'error': 'recipient and body are required.'}, status=400)
        rk, rid = other
        dm = DirectMessage(project=project, body=body)
        if me['kind'] == 'member':
            dm.sender_id = me['id']
        else:
            dm.sender_admin_id = me['id']
        if rk == 'member':
            dm.recipient_id = rid
        else:
            dm.recipient_admin_id = rid
        dm.save()
        # Notify member recipients (admin recipients see it via polling / their own bell later).
        if rk == 'member':
            sender_name = me.get('member').candidate_name if me['kind'] == 'member' else (
                request.user.get_full_name() or request.user.username)
            ProjectNotification.objects.create(
                recipient_id=rid, project=project, kind=ProjectNotification.KIND_DM,
                text=f"{sender_name} sent you a message in {project.title}",
                link=f"/projects/{project.id}",
            )
        return Response(self.get_serializer(dm).data, status=201)


class ProjectNotificationViewSet(viewsets.ModelViewSet):
    """The current member's project notifications."""
    serializer_class = ProjectNotificationSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post']

    def get_queryset(self):
        me = _current_member(self.request.user)
        if not me:
            return ProjectNotification.objects.none()
        return ProjectNotification.objects.filter(recipient=me).exclude(text='')

    @action(detail=False, methods=['post'], url_path='mark-read')
    def mark_read(self, request):
        me = _current_member(request.user)
        if not me:
            return Response({'ok': True})
        ids = request.data.get('ids')
        qs = ProjectNotification.objects.filter(recipient=me, is_read=False)
        if ids:
            qs = qs.filter(id__in=ids)
        qs.update(is_read=True)
        return Response({'ok': True})


# ── Managed project sub-resources: teams, milestones, attachments ─────────────

class _ManagedProjectResource(viewsets.ModelViewSet):
    """Base: read = anyone who can see the project; write = project managers."""
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'patch', 'delete']
    model = None

    def get_queryset(self):
        qs = self.model.objects.all()
        pid = self.request.query_params.get('project')
        if pid:
            qs = qs.filter(project_id=pid)
        return qs.filter(project_id__in=visible_project_ids(self.request.user))

    def create(self, request, *args, **kwargs):
        project = _project_if_visible(request.user, request.data.get('project'))
        if not project:
            return Response({'error': 'Project not found.'}, status=404)
        if not _project_manager(request, project):
            return Response({'error': 'Only project managers can do that.'}, status=403)
        return super().create(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        obj = self.get_object()
        if not _project_manager(request, obj.project):
            return Response({'error': 'Only project managers can edit this.'}, status=403)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        obj = self.get_object()
        if not _project_manager(request, obj.project):
            return Response({'error': 'Only project managers can remove this.'}, status=403)
        return super().destroy(request, *args, **kwargs)


class ProjectTeamViewSet(_ManagedProjectResource):
    serializer_class = ProjectTeamSerializer
    model = ProjectTeam


class ProjectMilestoneViewSet(_ManagedProjectResource):
    serializer_class = ProjectMilestoneSerializer
    model = ProjectMilestone


class ProjectAttachmentViewSet(_ManagedProjectResource):
    """Attachments: any participant may add; managers (or nobody else) may delete."""
    serializer_class = ProjectAttachmentSerializer
    model = ProjectAttachment

    def create(self, request, *args, **kwargs):
        project = _project_if_visible(request.user, request.data.get('project'))
        if not project:
            return Response({'error': 'Project not found.'}, status=404)
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        obj = ser.save(uploaded_by=_current_member(request.user), uploaded_by_admin=request.user)
        return Response(self.get_serializer(obj).data, status=201)


class TaskStepViewSet(viewsets.ModelViewSet):
    """Ordered workflow steps within a task ('how to do this work'). ?task=<id>.
    Read: anyone who can see the task's project. Write/tick: the task's assignee
    or a project manager."""
    serializer_class = TaskStepSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'patch', 'delete']

    def get_queryset(self):
        qs = TaskStep.objects.select_related('task')
        task_id = self.request.query_params.get('task')
        if task_id:
            qs = qs.filter(task_id=task_id)
        return qs.filter(task__project_id__in=visible_project_ids(self.request.user))

    def _can_edit(self, request, task):
        me = _current_member(request.user)
        if task.assigned_to_id and me and task.assigned_to_id == me.id:
            return True
        if task.project_id:
            proj = Project.objects.filter(id=task.project_id).first()
            return bool(proj and _project_manager(request, proj))
        return _has_perm(request.user, 'change_task')

    def create(self, request, *args, **kwargs):
        task = Task.objects.filter(id=request.data.get('task')).first()
        if not task or (task.project_id and task.project_id not in visible_project_ids(request.user)):
            return Response({'error': 'Task not found.'}, status=404)
        if not self._can_edit(request, task):
            return Response({'error': 'Only the assignee or a project manager can add steps.'}, status=403)
        return super().create(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        step = self.get_object()
        if not self._can_edit(request, step.task):
            return Response({'error': 'You cannot edit this step.'}, status=403)
        if 'is_done' in request.data:
            done = bool(request.data.get('is_done'))
            step.is_done = done
            step.done_by = _current_member(request.user) if done else None
            step.done_at = timezone.now() if done else None
            step.save(update_fields=['is_done', 'done_by', 'done_at'])
        other = {k: v for k, v in request.data.items() if k != 'is_done'}
        if other:
            ser = self.get_serializer(step, data=other, partial=True)
            ser.is_valid(raise_exception=True)
            ser.save()
        return Response(self.get_serializer(self.get_object()).data)

    def destroy(self, request, *args, **kwargs):
        step = self.get_object()
        if not self._can_edit(request, step.task):
            return Response({'error': 'You cannot remove this step.'}, status=403)
        return super().destroy(request, *args, **kwargs)
