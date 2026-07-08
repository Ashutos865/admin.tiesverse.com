from rest_framework import serializers
from django.utils import timezone
from .models import (
    Position, Enrollment, OfferLetter, HRDepartment, OnboardingSubmission,
    MemberAccount, DocumentAuditLog, AttendanceRecord, LeaveRequest, Asset, Task, TaskStep,
    WorkSession, OffboardingRequest, Policy, Form, FormResponse,
    Project, ProjectMember, ProjectDeadlineChange,
    ProjectChecklistItem, ProjectMessage, DirectMessage, ProjectNotification,
    ProjectTeam, ProjectMilestone, ProjectAttachment,
    PersonalNote,
)


class PersonalNoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = PersonalNote
        fields = ['id', 'content', 'color', 'order', 'updated_at']
        read_only_fields = ['id', 'updated_at']


class PositionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Position
        fields = '__all__'


class EnrollmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Enrollment
        fields = '__all__'


class OfferLetterSerializer(serializers.ModelSerializer):
    class Meta:
        model = OfferLetter
        fields = '__all__'


class HRDepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = HRDepartment
        fields = '__all__'
        read_only_fields = ['created_at']


class OnboardingSubmissionSerializer(serializers.ModelSerializer):
    docs_complete = serializers.SerializerMethodField()
    has_account = serializers.SerializerMethodField()
    account_username = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = OnboardingSubmission
        fields = '__all__'
        read_only_fields = ['token', 'created_at', 'submitted_at', 'verified_at']

    def get_docs_complete(self, obj):
        return obj.has_aadhaar and obj.has_college_id and obj.has_photo

    def get_avatar_url(self, obj):
        # The member's profile picture (set in Profile settings, stored on UserProfile).
        try:
            if hasattr(obj, 'account') and obj.account and obj.account.user_id:
                from accounts_app.models import UserProfile
                pr = UserProfile.objects.filter(user_id=obj.account.user_id).first()
                return (pr.avatar_url if pr else '') or ''
        except Exception:  # noqa: BLE001
            pass
        return ''

    def get_has_account(self, obj):
        return hasattr(obj, 'account')

    def get_account_username(self, obj):
        if hasattr(obj, 'account') and obj.account.user:
            return obj.account.user.username
        return None


class MemberAccountSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.CharField(source='user.email', read_only=True)
    member_name = serializers.CharField(source='submission.candidate_name', read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = MemberAccount
        fields = ['id', 'username', 'email', 'member_name', 'is_active', 'created_at', 'created_by_name']

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return ''


class DocumentAuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentAuditLog
        fields = '__all__'
        read_only_fields = ['performed_at']


class AttendanceRecordSerializer(serializers.ModelSerializer):
    member_name = serializers.CharField(source='member.candidate_name', read_only=True)
    member_email = serializers.CharField(source='member.candidate_email', read_only=True)
    member_dept = serializers.JSONField(source='member.assigned_departments', read_only=True)

    class Meta:
        model = AttendanceRecord
        fields = '__all__'
        read_only_fields = ['created_at', 'approved_at']


class LeaveRequestSerializer(serializers.ModelSerializer):
    member_name = serializers.CharField(source='member.candidate_name', read_only=True)
    member_email = serializers.CharField(source='member.candidate_email', read_only=True)
    member_dept = serializers.JSONField(source='member.assigned_departments', read_only=True)
    duration_days = serializers.SerializerMethodField()

    class Meta:
        model = LeaveRequest
        fields = '__all__'
        read_only_fields = ['applied_at', 'reviewed_at']

    def get_duration_days(self, obj):
        if obj.from_date and obj.to_date:
            return (obj.to_date - obj.from_date).days + 1
        return 0


class OffboardingRequestSerializer(serializers.ModelSerializer):
    member_name = serializers.CharField(source='member.candidate_name', read_only=True)
    member_email = serializers.CharField(source='member.candidate_email', read_only=True)
    member_dept = serializers.JSONField(source='member.assigned_departments', read_only=True)
    member_role = serializers.CharField(source='member.portal_role', read_only=True)
    member_status = serializers.CharField(source='member.status', read_only=True)

    class Meta:
        model = OffboardingRequest
        fields = '__all__'
        read_only_fields = [
            'applied_at', 'reviewed_at', 'reviewed_by_name', 'reviewed_by_user',
            'last_working_day', 'revoked_at', 'revoked_by_name',
        ]


class AssetSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.SerializerMethodField()

    class Meta:
        model = Asset
        fields = '__all__'
        read_only_fields = ['added_at', 'returned_at']

    def get_assigned_to_name(self, obj):
        if obj.assigned_to:
            return obj.assigned_to.candidate_name
        return None


class TaskSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.SerializerMethodField()
    assigned_by_name = serializers.SerializerMethodField()
    steps_total = serializers.SerializerMethodField()
    steps_done = serializers.SerializerMethodField()
    actual_hours = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = '__all__'
        read_only_fields = ['created_at', 'completed_at']

    def get_actual_hours(self, obj):
        mins = sum(s.duration_minutes for s in obj.work_sessions.all())
        return round(mins / 60, 1) if mins else 0

    def get_steps_total(self, obj):
        return obj.steps.count()

    def get_steps_done(self, obj):
        return obj.steps.filter(is_done=True).count()

    def get_assigned_to_name(self, obj):
        if obj.assigned_to:
            return obj.assigned_to.candidate_name
        return None

    def get_assigned_by_name(self, obj):
        if obj.assigned_by:
            return obj.assigned_by.candidate_name
        if obj.assigned_by_admin:
            return obj.assigned_by_admin.get_full_name() or obj.assigned_by_admin.username
        return None


class TaskStepSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskStep
        fields = ['id', 'task', 'text', 'is_done', 'order', 'done_at', 'created_at']
        read_only_fields = ['id', 'done_at', 'created_at']


class WorkSessionSerializer(serializers.ModelSerializer):
    task_title = serializers.SerializerMethodField(read_only=True)
    task_progress = serializers.SerializerMethodField(read_only=True)
    member_name = serializers.SerializerMethodField(read_only=True)
    duration_minutes = serializers.IntegerField(read_only=True)

    class Meta:
        model = WorkSession
        fields = ['id', 'member', 'member_name', 'date', 'check_in', 'check_out', 'task',
                  'task_title', 'task_progress', 'custom_task', 'note', 'completed_task',
                  'progress_after', 'auto_closed', 'duration_minutes', 'created_at']
        read_only_fields = ['id', 'member_name', 'task_title', 'task_progress', 'duration_minutes', 'created_at']

    def get_task_title(self, obj):
        return obj.task.title if obj.task else (obj.custom_task or None)

    def get_task_progress(self, obj):
        return obj.task.progress if obj.task else None

    def get_member_name(self, obj):
        return obj.member.candidate_name if obj.member else None


class PolicySerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Policy
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by_user']

    def get_created_by_name(self, obj):
        if obj.created_by_user:
            return obj.created_by_user.get_full_name() or obj.created_by_user.username
        return ''


class FormSerializer(serializers.ModelSerializer):
    """Full form representation for the builder + management screens."""
    created_by_name = serializers.SerializerMethodField(read_only=True)
    response_count = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Form
        fields = [
            'id', 'title', 'description', 'schema', 'theme', 'settings',
            'visibility', 'is_published', 'token', 'created_by_name',
            'response_count', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'token', 'created_by_name', 'response_count', 'created_at', 'updated_at']

    def get_created_by_name(self, obj):
        if obj.created_by_user:
            return obj.created_by_user.get_full_name() or obj.created_by_user.username
        return ''

    def get_response_count(self, obj):
        return obj.responses.count()


class PublicFormSerializer(serializers.ModelSerializer):
    """Slim, safe representation exposed to anyone filling a form.
    Never leaks token/responses/creator or the accepting/close internals."""
    class Meta:
        model = Form
        fields = ['id', 'title', 'description', 'schema', 'theme', 'visibility']


class FormResponseSerializer(serializers.ModelSerializer):
    class Meta:
        model = FormResponse
        fields = [
            'id', 'form', 'answers', 'submitter_name', 'submitter_email',
            'submitted_by_user', 'submitted_at',
        ]
        read_only_fields = ['id', 'submitted_at']


# ── Projects ──────────────────────────────────────────────────────────────────

class ProjectMemberSerializer(serializers.ModelSerializer):
    member_name = serializers.SerializerMethodField(read_only=True)
    member_departments = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ProjectMember
        fields = ['id', 'project', 'member', 'member_name', 'member_departments', 'role', 'teams', 'added_at']
        read_only_fields = ['id', 'added_at']

    def get_member_name(self, obj):
        return obj.member.candidate_name if obj.member else None

    def get_member_departments(self, obj):
        return (obj.member.assigned_departments or []) if obj.member else []


class ProjectTeamSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField(read_only=True)
    lead_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ProjectTeam
        fields = ['id', 'project', 'name', 'description', 'lead', 'lead_name', 'color', 'order', 'member_count', 'created_at']
        read_only_fields = ['id', 'lead_name', 'member_count', 'created_at']

    def get_member_count(self, obj):
        return obj.members.count()

    def get_lead_name(self, obj):
        return obj.lead.candidate_name if obj.lead else None


class ProjectMilestoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectMilestone
        fields = ['id', 'project', 'title', 'due_date', 'is_done', 'order', 'created_at']
        read_only_fields = ['id', 'created_at']


class ProjectAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ProjectAttachment
        fields = ['id', 'project', 'name', 'url', 'uploaded_by_name', 'created_at']
        read_only_fields = ['id', 'uploaded_by_name', 'created_at']

    def get_uploaded_by_name(self, obj):
        if obj.uploaded_by:
            return obj.uploaded_by.candidate_name
        if obj.uploaded_by_admin:
            return obj.uploaded_by_admin.get_full_name() or obj.uploaded_by_admin.username
        return None


class ProjectDeadlineChangeSerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ProjectDeadlineChange
        fields = ['id', 'project', 'old_deadline', 'new_deadline', 'reason', 'changed_by_name', 'created_at']
        read_only_fields = fields

    def get_changed_by_name(self, obj):
        if obj.changed_by:
            return obj.changed_by.candidate_name
        if obj.changed_by_admin:
            return obj.changed_by_admin.get_full_name() or obj.changed_by_admin.username
        return None


class ProjectSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField(read_only=True)
    member_count = serializers.SerializerMethodField(read_only=True)
    task_stats = serializers.SerializerMethodField(read_only=True)
    progress = serializers.SerializerMethodField(read_only=True)
    days_left = serializers.SerializerMethodField(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    chat_purge_at = serializers.DateTimeField(read_only=True)
    members = ProjectMemberSerializer(many=True, read_only=True)
    teams = ProjectTeamSerializer(many=True, read_only=True)
    can_manage = serializers.SerializerMethodField(read_only=True)
    can_delete = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Project
        fields = [
            'id', 'title', 'description', 'scope', 'departments', 'department_priorities',
            'priority', 'status', 'start_date', 'deadline', 'original_deadline',
            'completed_at', 'chat_purge_after_days', 'chat_purge_at',
            'created_by', 'created_by_admin', 'created_by_name', 'owner_role',
            'member_count', 'task_stats', 'progress', 'days_left', 'is_overdue',
            'members', 'teams', 'can_manage', 'can_delete', 'created_at', 'updated_at',
        ]

    def _user(self):
        req = self.context.get('request')
        return req.user if req else None

    def get_can_manage(self, obj):
        from career_app import access
        u = self._user()
        return bool(u and access.can_manage_project(u, obj))

    def get_can_delete(self, obj):
        u = self._user()
        return bool(u and self.get_can_manage(obj) and (getattr(u, 'is_superuser', False) or u.has_perm('career_app.delete_project')))
        read_only_fields = [
            'id', 'created_by', 'created_by_admin', 'created_by_name', 'owner_role',
            'original_deadline', 'completed_at', 'created_at', 'updated_at',
        ]

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.candidate_name
        if obj.created_by_admin:
            return obj.created_by_admin.get_full_name() or obj.created_by_admin.username
        return None

    def get_member_count(self, obj):
        return obj.members.count()

    def get_task_stats(self, obj):
        stats = {'total': 0, 'todo': 0, 'in_progress': 0, 'review': 0, 'done': 0, 'cancelled': 0}
        for t in obj.tasks.all():
            stats['total'] += 1
            stats[t.status] = stats.get(t.status, 0) + 1
        return stats

    def get_progress(self, obj):
        s = self.get_task_stats(obj)
        active = s['total'] - s.get('cancelled', 0)
        return round(100 * s.get('done', 0) / active) if active else 0

    def get_days_left(self, obj):
        if not obj.deadline:
            return None
        return (obj.deadline - timezone.localdate()).days


class ProjectChecklistItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectChecklistItem
        fields = ['id', 'project', 'text', 'is_done', 'order', 'done_at', 'created_at']
        read_only_fields = ['id', 'done_at', 'created_at']


def _member_name(member):
    return member.candidate_name if member else None


class ProjectMessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField(read_only=True)
    mention_names = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ProjectMessage
        fields = ['id', 'project', 'team', 'sender', 'sender_name', 'body', 'mentions', 'mention_names', 'pinned', 'reply_to', 'created_at']
        read_only_fields = ['id', 'sender', 'sender_name', 'mention_names', 'created_at']

    def get_sender_name(self, obj):
        if obj.sender:
            return obj.sender.candidate_name
        if obj.sender_admin:
            return obj.sender_admin.get_full_name() or obj.sender_admin.username
        return 'Unknown'

    def get_mention_names(self, obj):
        ids = obj.mentions or []
        if not ids:
            return []
        names = OnboardingSubmission.objects.filter(id__in=ids).values_list('id', 'candidate_name')
        return [{'id': i, 'name': n} for i, n in names]


def _admin_name(u):
    return (u.get_full_name() or u.username) if u else None


class DirectMessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField(read_only=True)
    recipient_name = serializers.SerializerMethodField(read_only=True)
    sender_key = serializers.SerializerMethodField(read_only=True)
    is_mine = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = DirectMessage
        fields = ['id', 'project', 'sender_key', 'sender_name', 'recipient_name', 'is_mine', 'body', 'read_at', 'created_at']
        read_only_fields = fields

    def get_sender_name(self, obj):
        return _member_name(obj.sender) or _admin_name(obj.sender_admin)

    def get_recipient_name(self, obj):
        return _member_name(obj.recipient) or _admin_name(obj.recipient_admin)

    def get_sender_key(self, obj):
        return f"m{obj.sender_id}" if obj.sender_id else f"u{obj.sender_admin_id}"

    def get_is_mine(self, obj):
        req = self.context.get('request')
        if not req:
            return False
        from career_app import access
        me = access.get_member_for_user(req.user)
        if me:
            return obj.sender_id == me.id
        return obj.sender_admin_id == req.user.id


class ProjectNotificationSerializer(serializers.ModelSerializer):
    project_title = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ProjectNotification
        fields = ['id', 'kind', 'text', 'link', 'is_read', 'project', 'project_title', 'created_at']
        read_only_fields = fields

    def get_project_title(self, obj):
        return obj.project.title if obj.project else None
