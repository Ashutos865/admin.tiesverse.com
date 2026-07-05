from rest_framework import serializers
from .models import (
    Position, Enrollment, OfferLetter, HRDepartment, OnboardingSubmission,
    MemberAccount, DocumentAuditLog, AttendanceRecord, LeaveRequest, Asset, Task,
    OffboardingRequest,
)


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

    class Meta:
        model = OnboardingSubmission
        fields = '__all__'
        read_only_fields = ['token', 'created_at', 'submitted_at', 'verified_at']

    def get_docs_complete(self, obj):
        return obj.has_aadhaar and obj.has_college_id and obj.has_photo

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

    class Meta:
        model = Task
        fields = '__all__'
        read_only_fields = ['created_at', 'completed_at']

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
