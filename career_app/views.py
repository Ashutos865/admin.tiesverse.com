import secrets
import string

from django.contrib.auth.models import User, Group
from django.http import HttpResponse, Http404
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import DjangoModelPermissions, IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Position, Enrollment, OfferLetter, HRDepartment, OnboardingSubmission,
    MemberAccount, DocumentAuditLog, AttendanceRecord, LeaveRequest, Asset, Task,
)
from .serializers import (
    PositionSerializer, EnrollmentSerializer, OfferLetterSerializer,
    HRDepartmentSerializer, OnboardingSubmissionSerializer,
    MemberAccountSerializer, DocumentAuditLogSerializer,
    AttendanceRecordSerializer, LeaveRequestSerializer,
    AssetSerializer, TaskSerializer,
)
from . import cloudflare_proxy
from . import access
from .providers import CloudflareD1Provider, R2Storage, ProviderError


class StaffModelPermissions(DjangoModelPermissions):
    perms_map = {
        'GET': ['%(app_label)s.view_%(model_name)s'],
        'OPTIONS': [], 'HEAD': [],
        'POST': ['%(app_label)s.add_%(model_name)s'],
        'PUT': ['%(app_label)s.change_%(model_name)s'],
        'PATCH': ['%(app_label)s.change_%(model_name)s'],
        'DELETE': ['%(app_label)s.delete_%(model_name)s'],
    }


def _actor_name(user):
    return user.get_full_name() or user.username


def _generate_password(length=12):
    alphabet = string.ascii_letters + string.digits + '!@#$'
    while True:
        pwd = ''.join(secrets.choice(alphabet) for _ in range(length))
        # Ensure at least one of each required type
        if (any(c.isupper() for c in pwd) and any(c.islower() for c in pwd)
                and any(c.isdigit() for c in pwd)):
            return pwd


def _send_credentials_email(email, name, username, password, portal_role):
    """Send login credentials to a newly verified member via the managed
    'onboarding_credentials' template."""
    from django.conf import settings as dj_settings
    from config.email_templates import send_template_email

    role_label = dict([
        ('intern', 'Intern'), ('member', 'Member'), ('team_lead', 'Team Lead'),
        ('advisory', 'Advisory'), ('hr', 'HR'), ('admin', 'Admin'),
    ]).get(portal_role, (portal_role or 'Member').title())

    login_url = f"{getattr(dj_settings, 'ADMIN_PORTAL_URL', '').rstrip('/')}/login"
    send_template_email('onboarding_credentials', email, {
        'name': name or 'there',
        'role': role_label,
        'username': username,
        'password': password,
        'login_url': login_url,
    })


class PositionViewSet(viewsets.ModelViewSet):
    queryset = Position.objects.all()
    serializer_class = PositionSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]


class EnrollmentViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        candidates = cloudflare_proxy.get_candidates()
        if candidates is None:
            return Response({'error': 'Cloudflare D1 unreachable', 'results': []}, status=503)
        return Response(candidates)

    def retrieve(self, request, pk=None):
        candidates = cloudflare_proxy.get_candidates()
        if candidates is None:
            return Response({'error': 'Cloudflare D1 unreachable'}, status=503)
        match = next((c for c in candidates if str(c.get('id')) == str(pk)), None)
        if not match:
            return Response({'error': 'Not found'}, status=404)
        return Response(match)

    @action(detail=True, methods=['patch'])
    def update_status(self, request, pk=None):
        ok = cloudflare_proxy.update_candidate(
            row_id=pk,
            interview_status=request.data.get('interview_status', ''),
            interviewer=request.data.get('interviewer', ''),
            rating=request.data.get('rating', 0),
            final_decision=request.data.get('final_decision', 'Under Review'),
        )
        if ok:
            return Response({'status': 'updated'})
        return Response({'error': 'Update failed'}, status=503)


class OfferLetterViewSet(viewsets.ModelViewSet):
    queryset = OfferLetter.objects.all()
    serializer_class = OfferLetterSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]

    @action(detail=False, methods=['post'])
    def generate(self, request):
        applicant_id = request.data.get('applicant')
        salary = request.data.get('salary')
        joining_date = request.data.get('joining_date')
        try:
            applicant = Enrollment.objects.get(id=applicant_id)
            offer = OfferLetter.objects.create(
                applicant=applicant, salary=salary, joining_date=joining_date,
            )
            return Response({'status': 'Offer letter generated', 'offer_id': offer.id})
        except Enrollment.DoesNotExist:
            return Response({'error': 'Applicant not found'}, status=404)


class HRDepartmentViewSet(viewsets.ModelViewSet):
    queryset = HRDepartment.objects.all()
    serializer_class = HRDepartmentSerializer
    permission_classes = [IsAuthenticated]


# ── Onboarding — email helper ─────────────────────────────────────────────────

def _send_onboarding_email(email, name, upload_link, role):
    """Send the document-upload onboarding invite via the managed
    'onboarding_invite' template."""
    from config.email_templates import send_template_email
    send_template_email('onboarding_invite', email, {
        'name': name or 'there',
        'role': role or 'the team',
        'upload_link': upload_link,
    })


# ── Onboarding — admin views ──────────────────────────────────────────────────

class InitiateOnboardingView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from django.conf import settings as dj_settings
        candidate_id = str(request.data.get('candidate_id', '') or '')
        candidate_name = request.data.get('candidate_name', '')
        candidate_email = (request.data.get('candidate_email', '') or '').strip()
        role_offered = request.data.get('role_offered', '')

        if not candidate_email:
            return Response({'error': 'candidate_email is required'}, status=400)

        existing = OnboardingSubmission.objects.filter(candidate_id=candidate_id).first()
        if existing:
            website_url = getattr(dj_settings, 'WEBSITE_URL', 'https://tiesverse.com')
            upload_link = f"{website_url}/onboarding/{existing.token}"
            return Response({**OnboardingSubmissionSerializer(existing).data, 'upload_link': upload_link})

        token = secrets.token_urlsafe(32)
        sub = OnboardingSubmission.objects.create(
            candidate_id=candidate_id, candidate_name=candidate_name,
            candidate_email=candidate_email, role_offered=role_offered, token=token,
        )
        website_url = getattr(dj_settings, 'WEBSITE_URL', 'https://tiesverse.com')
        upload_link = f"{website_url}/onboarding/{token}"
        try:
            _send_onboarding_email(candidate_email, candidate_name, upload_link, role_offered)
        except Exception as exc:
            print(f"[ONBOARDING] Email error: {exc}")
        return Response(
            {**OnboardingSubmissionSerializer(sub).data, 'upload_link': upload_link},
            status=201,
        )


class OnboardingListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        subs = OnboardingSubmission.objects.all()
        # Team directory scoping: leads see their team, members see themselves,
        # org-wide roles see everyone. `id` is the member itself here.
        scope, member = access.get_access_scope(request.user)
        if scope == 'team' and member:
            subs = subs.filter(id__in=access.team_member_ids(member))
        elif scope == 'self':
            subs = subs.filter(id=member.id) if member else subs.none()
        return Response(OnboardingSubmissionSerializer(subs, many=True).data)


class OnboardingDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            sub = OnboardingSubmission.objects.get(pk=pk)
        except OnboardingSubmission.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        return Response(OnboardingSubmissionSerializer(sub).data)


class OnboardingVerifyView(APIView):
    """HR verifies documents, assigns departments/role, and creates portal account."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            sub = OnboardingSubmission.objects.get(pk=pk)
        except OnboardingSubmission.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)

        new_status = request.data.get('status')
        creating_account = new_status == 'verified' and sub.status != 'verified'

        if new_status in ('verified', 'rejected'):
            sub.status = new_status
            if new_status == 'verified':
                sub.verified_at = timezone.now()
                sub.verified_by = _actor_name(request.user)

        if 'assigned_departments' in request.data:
            sub.assigned_departments = request.data['assigned_departments']
        if 'hr_notes' in request.data:
            sub.hr_notes = request.data['hr_notes']
        if 'role_offered' in request.data:
            sub.role_offered = request.data['role_offered']
        if 'candidate_name' in request.data:
            sub.candidate_name = request.data['candidate_name']

        # ── Structured fields ─────────────────────────────────────────────
        if 'employment_type' in request.data:
            sub.employment_type = request.data['employment_type']
        if 'joining_date' in request.data:
            sub.joining_date = request.data['joining_date'] or None
        if 'portal_role' in request.data:
            sub.portal_role = request.data['portal_role']
        if 'member_notes' in request.data:
            sub.member_notes = request.data['member_notes']

        sub.save()

        # ── Create portal User account on first verification ──────────────
        temp_password = None
        if creating_account and sub.candidate_email:
            if not hasattr(sub, 'account'):
                username = sub.candidate_email
                # Ensure unique username
                if User.objects.filter(username=username).exists():
                    username = f"{sub.candidate_email.split('@')[0]}_{sub.id}"

                temp_password = _generate_password()
                name_parts = (sub.candidate_name or '').split()
                user = User.objects.create_user(
                    username=username,
                    email=sub.candidate_email,
                    password=temp_password,
                    first_name=name_parts[0] if name_parts else '',
                    last_name=' '.join(name_parts[1:]),
                )
                user.is_staff = False
                user.is_active = True
                user.save()

                MemberAccount.objects.create(
                    submission=sub, user=user, created_by=request.user,
                )

                # Assign Django group based on portal_role
                role = sub.portal_role or 'intern'
                group_name_map = {
                    'intern': 'Interns', 'member': 'Members',
                    'team_lead': 'Team Leads', 'advisory': 'Advisory',
                    'hr': 'HR', 'admin': 'Admins',
                }
                group_name = group_name_map.get(role, 'Members')
                group, _ = Group.objects.get_or_create(name=group_name)
                user.groups.add(group)

                # Log to DocumentAuditLog for account creation
                DocumentAuditLog.objects.create(
                    submission=sub,
                    doc_type='offer_letter',
                    action='issued',
                    performed_by_name=_actor_name(request.user),
                    performed_by_user=request.user,
                    note=f"Portal account created. Username: {username}",
                )

                try:
                    _send_credentials_email(
                        sub.candidate_email, sub.candidate_name,
                        username, temp_password, sub.portal_role or 'intern',
                    )
                except Exception as exc:
                    print(f"[CREDENTIALS EMAIL] Error: {exc}")

        resp_data = OnboardingSubmissionSerializer(sub).data
        if temp_password:
            resp_data['_temp_password'] = temp_password
            resp_data['_account_created'] = True
        return Response(resp_data)


class ManualAddMemberView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        name = (request.data.get('candidate_name') or '').strip()
        email = (request.data.get('candidate_email') or '').strip()
        if not name or not email:
            return Response({'error': 'candidate_name and candidate_email are required.'}, status=400)
        if OnboardingSubmission.objects.filter(candidate_email=email).exists():
            return Response({'error': 'A record with this email already exists.'}, status=400)

        token = secrets.token_urlsafe(32)
        sub = OnboardingSubmission.objects.create(
            candidate_id=email, candidate_name=name, candidate_email=email,
            role_offered=request.data.get('role_offered', ''),
            employment_type=request.data.get('employment_type', ''),
            portal_role=request.data.get('portal_role', ''),
            token=token, status=OnboardingSubmission.STATUS_VERIFIED,
            assigned_departments=request.data.get('assigned_departments', []),
            hr_notes=request.data.get('hr_notes', ''),
            member_notes=request.data.get('member_notes', ''),
            verified_by=_actor_name(request.user),
            verified_at=timezone.now(),
        )
        return Response(OnboardingSubmissionSerializer(sub).data, status=201)


class OnboardingDocView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, doc_type):
        try:
            sub = OnboardingSubmission.objects.get(pk=pk)
        except OnboardingSubmission.DoesNotExist:
            raise Http404
        key_map = {
            'aadhaar': sub.aadhaar_key,
            'college_id': sub.college_id_key,
            'photo': sub.photo_key,
        }
        key = key_map.get(doc_type)
        if not key:
            raise Http404('Document not yet uploaded.')
        try:
            content = R2Storage().get_object(key)
        except Exception as exc:
            return HttpResponse(str(exc), status=500)
        ext = key.rsplit('.', 1)[-1].lower() if '.' in key else 'bin'
        content_type = {
            'pdf': 'application/pdf', 'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif',
        }.get(ext, 'application/octet-stream')
        resp = HttpResponse(content, content_type=content_type)
        resp['Content-Disposition'] = f'inline; filename="{doc_type}.{ext}"'
        return resp


# ── Certificate issuance ──────────────────────────────────────────────────────

class CertificateIssueView(APIView):
    """Issue or revoke a certificate for a verified member, with full audit trail."""
    permission_classes = [IsAuthenticated]

    CERT_FIELD_MAP = {
        'internship_cert': ('cert_internship_issued_at', 'cert_internship_issued_by'),
        'lor':             ('cert_lor_issued_at',         'cert_lor_issued_by'),
        'noc':             ('cert_noc_issued_at',         'cert_noc_issued_by'),
    }

    def patch(self, request, pk):
        try:
            sub = OnboardingSubmission.objects.get(pk=pk)
        except OnboardingSubmission.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)

        cert_key = request.data.get('cert_key')       # 'internship_cert' | 'lor' | 'noc'
        action_type = request.data.get('action')       # 'issue' | 'revoke'

        if cert_key not in self.CERT_FIELD_MAP:
            return Response({'error': 'Invalid cert_key'}, status=400)
        if action_type not in ('issue', 'revoke'):
            return Response({'error': 'action must be issue or revoke'}, status=400)

        at_field, by_field = self.CERT_FIELD_MAP[cert_key]
        actor = _actor_name(request.user)

        if action_type == 'issue':
            setattr(sub, at_field, timezone.now())
            setattr(sub, by_field, actor)
            audit_action = DocumentAuditLog.ACTION_ISSUED
        else:
            setattr(sub, at_field, None)
            setattr(sub, by_field, '')
            audit_action = DocumentAuditLog.ACTION_REVOKED

        sub.save()

        DocumentAuditLog.objects.create(
            submission=sub,
            doc_type=cert_key,
            action=audit_action,
            performed_by_name=actor,
            performed_by_user=request.user,
            note=request.data.get('note', ''),
        )

        # Notify the member when a certificate is issued (stubbed unless enabled).
        if action_type == 'issue' and sub.candidate_email:
            self._email_member(sub, cert_key, actor)

        return Response(OnboardingSubmissionSerializer(sub).data)

    CERT_LABELS = {
        'internship_cert': 'Internship Certificate',
        'lor': 'Letter of Recommendation',
        'noc': 'No Objection Certificate',
    }

    def _email_member(self, sub, cert_key, actor):
        from django.conf import settings as dj_settings
        from config.email_templates import send_template_email

        label = self.CERT_LABELS.get(cert_key, 'Certificate')
        try:
            send_template_email('certificate_issue', sub.candidate_email, {
                'name': sub.candidate_name or 'there',
                'document': label,
                'issued_by': actor,
                'portal_url': f"{getattr(dj_settings, 'ADMIN_PORTAL_URL', '').rstrip('/')}/login",
            })
        except Exception as exc:  # noqa: BLE001
            print(f"[CERT EMAIL] Error: {exc}")


class DocumentAuditLogListView(APIView):
    """Return audit log for a specific member."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        logs = DocumentAuditLog.objects.filter(submission_id=pk)
        return Response(DocumentAuditLogSerializer(logs, many=True).data)


# ── Current member ("me") ─────────────────────────────────────────────────────

class MeView(APIView):
    """The logged-in user's own member profile and access scope. Powers the
    role-aware navigation and the member self-service ("My Work") screens."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        scope, member = access.get_access_scope(request.user)
        return Response({
            'user': {
                'username': request.user.username,
                'email': request.user.email,
                'full_name': request.user.get_full_name(),
                'is_superuser': request.user.is_superuser,
                'is_staff': request.user.is_staff,
            },
            'scope': scope,                       # 'all' | 'team' | 'self'
            'is_lead': scope == 'team',
            'is_member': member is not None,
            'member': OnboardingSubmissionSerializer(member).data if member else None,
            'led_departments': sorted(access.led_department_names(member)) if member else [],
        })


# ── Attendance ────────────────────────────────────────────────────────────────

class AttendanceListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = AttendanceRecord.objects.select_related('member')
        member_id = request.query_params.get('member')
        date = request.query_params.get('date')
        month = request.query_params.get('month')    # YYYY-MM
        dept = request.query_params.get('dept')
        approval = request.query_params.get('approval')

        if member_id:
            qs = qs.filter(member_id=member_id)
        if date:
            qs = qs.filter(date=date)
        if month:
            year, mon = month.split('-')
            qs = qs.filter(date__year=year, date__month=mon)
        if dept:
            qs = qs.filter(member__assigned_departments__contains=dept)
        if approval:
            qs = qs.filter(approval_status=approval)

        qs = access.scope_member_queryset(qs, request.user)
        return Response(AttendanceRecordSerializer(qs, many=True).data)

    def post(self, request):
        """HR/admin manually creates an attendance record."""
        ser = AttendanceRecordSerializer(data=request.data)
        if ser.is_valid():
            ser.save()
            return Response(ser.data, status=201)
        return Response(ser.errors, status=400)


class AttendanceCheckInView(APIView):
    """Member checks in for today."""
    permission_classes = [IsAuthenticated]

    def post(self, request, member_id):
        try:
            sub = OnboardingSubmission.objects.get(pk=member_id, status='verified')
        except OnboardingSubmission.DoesNotExist:
            return Response({'error': 'Member not found'}, status=404)

        # A self-scope member may only check themselves in.
        scope, me = access.get_access_scope(request.user)
        if scope == 'self' and (me is None or me.id != sub.id):
            return Response({'error': 'You can only check in for yourself.'}, status=403)

        today = timezone.now().date()
        record, created = AttendanceRecord.objects.get_or_create(
            member=sub, date=today,
            defaults={'status': AttendanceRecord.STATUS_PRESENT},
        )
        if record.check_in:
            return Response({'error': 'Already checked in today'}, status=400)
        record.check_in = timezone.now()
        record.save()
        return Response(AttendanceRecordSerializer(record).data, status=201 if created else 200)


class AttendanceCheckOutView(APIView):
    """Member checks out and submits work report."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, member_id):
        try:
            sub = OnboardingSubmission.objects.get(pk=member_id, status='verified')
        except OnboardingSubmission.DoesNotExist:
            return Response({'error': 'Member not found'}, status=404)

        # A self-scope member may only check themselves out.
        scope, me = access.get_access_scope(request.user)
        if scope == 'self' and (me is None or me.id != sub.id):
            return Response({'error': 'You can only check out for yourself.'}, status=403)

        today = timezone.now().date()
        try:
            record = AttendanceRecord.objects.get(member=sub, date=today)
        except AttendanceRecord.DoesNotExist:
            return Response({'error': 'No check-in record for today'}, status=404)

        if record.check_out:
            return Response({'error': 'Already checked out today'}, status=400)

        work_report = (request.data.get('work_report') or '').strip()
        if not work_report:
            return Response({'error': 'work_report is required on checkout'}, status=400)

        record.check_out = timezone.now()
        record.work_report = work_report
        record.approval_status = AttendanceRecord.APPROVAL_PENDING
        record.save()
        return Response(AttendanceRecordSerializer(record).data)


class AttendanceApproveView(APIView):
    """Team lead approves / rejects a member's daily attendance and work report."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            record = AttendanceRecord.objects.get(pk=pk)
        except AttendanceRecord.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)

        # Only leads (for their team) and org-wide roles may review attendance.
        scope, me = access.get_access_scope(request.user)
        if scope == 'self':
            return Response({'error': 'You are not allowed to review attendance.'}, status=403)
        if scope == 'team' and record.member_id not in access.team_member_ids(me):
            return Response({'error': 'You can only review your own team.'}, status=403)

        decision = request.data.get('decision')  # 'approved' | 'rejected'
        if decision not in ('approved', 'rejected'):
            return Response({'error': 'decision must be approved or rejected'}, status=400)

        record.approval_status = decision
        record.approved_by_name = _actor_name(request.user)
        record.approved_by_user = request.user
        record.approved_at = timezone.now()
        record.approval_note = request.data.get('note', '')
        record.save()
        return Response(AttendanceRecordSerializer(record).data)


class AttendanceDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            record = AttendanceRecord.objects.get(pk=pk)
        except AttendanceRecord.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        return Response(AttendanceRecordSerializer(record).data)

    def patch(self, request, pk):
        try:
            record = AttendanceRecord.objects.get(pk=pk)
        except AttendanceRecord.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        ser = AttendanceRecordSerializer(record, data=request.data, partial=True)
        if ser.is_valid():
            ser.save()
            return Response(ser.data)
        return Response(ser.errors, status=400)


# ── Leave Management ──────────────────────────────────────────────────────────

class LeaveListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = LeaveRequest.objects.select_related('member')
        member_id = request.query_params.get('member')
        leave_status = request.query_params.get('status')
        dept = request.query_params.get('dept')
        range_from = request.query_params.get('from')   # YYYY-MM-DD
        range_to = request.query_params.get('to')       # YYYY-MM-DD

        if member_id:
            qs = qs.filter(member_id=member_id)
        if leave_status:
            qs = qs.filter(status=leave_status)
        if dept:
            qs = qs.filter(member__assigned_departments__contains=dept)
        # Calendar range: any leave overlapping [from, to]
        if range_from:
            qs = qs.filter(to_date__gte=range_from)
        if range_to:
            qs = qs.filter(from_date__lte=range_to)

        qs = access.scope_member_queryset(qs, request.user)
        return Response(LeaveRequestSerializer(qs, many=True).data)

    def post(self, request):
        data = request.data.copy()
        # A self-scope member can only file leave for themselves.
        scope, me = access.get_access_scope(request.user)
        if scope == 'self':
            if me is None:
                return Response({'error': 'No member profile linked to your account.'}, status=403)
            data['member'] = me.id
        ser = LeaveRequestSerializer(data=data)
        if ser.is_valid():
            ser.save()
            return Response(ser.data, status=201)
        return Response(ser.errors, status=400)


class LeaveDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            leave = LeaveRequest.objects.get(pk=pk)
        except LeaveRequest.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        return Response(LeaveRequestSerializer(leave).data)

    def patch(self, request, pk):
        try:
            leave = LeaveRequest.objects.get(pk=pk)
        except LeaveRequest.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        # A self-scope member may only edit their own leave request.
        scope, me = access.get_access_scope(request.user)
        if scope == 'self' and (me is None or leave.member_id != me.id):
            return Response({'error': 'You can only edit your own leave requests.'}, status=403)
        ser = LeaveRequestSerializer(leave, data=request.data, partial=True)
        if ser.is_valid():
            ser.save()
            return Response(ser.data)
        return Response(ser.errors, status=400)


class LeaveReviewView(APIView):
    """Only HR (users with career_app.can_review_leave) can approve/reject a leave
    request. Team leads can view leave requests but cannot review them."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if not (request.user.is_superuser
                or request.user.has_perm('career_app.can_review_leave')):
            return Response(
                {'error': 'Only HR can approve or reject leave requests.'},
                status=403,
            )

        try:
            leave = LeaveRequest.objects.get(pk=pk)
        except LeaveRequest.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)

        decision = request.data.get('decision')
        if decision not in ('approved', 'rejected', 'cancelled'):
            return Response({'error': 'decision must be approved, rejected, or cancelled'}, status=400)

        leave.status = decision
        leave.reviewed_by_name = _actor_name(request.user)
        leave.reviewed_by_user = request.user
        leave.reviewed_at = timezone.now()
        leave.review_note = request.data.get('note', '')
        leave.save()
        return Response(LeaveRequestSerializer(leave).data)


# ── Asset Management ──────────────────────────────────────────────────────────

class AssetListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Asset.objects.select_related('assigned_to')
        asset_status = request.query_params.get('status')
        category = request.query_params.get('category')
        member_id = request.query_params.get('member')
        if asset_status:
            qs = qs.filter(status=asset_status)
        if category:
            qs = qs.filter(category=category)
        if member_id:
            qs = qs.filter(assigned_to_id=member_id)
        qs = access.scope_member_queryset(qs, request.user, field='assigned_to')
        return Response(AssetSerializer(qs, many=True).data)

    def post(self, request):
        ser = AssetSerializer(data=request.data)
        if ser.is_valid():
            ser.save()
            return Response(ser.data, status=201)
        return Response(ser.errors, status=400)


class AssetDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            asset = Asset.objects.get(pk=pk)
        except Asset.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        return Response(AssetSerializer(asset).data)

    def patch(self, request, pk):
        try:
            asset = Asset.objects.get(pk=pk)
        except Asset.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        ser = AssetSerializer(asset, data=request.data, partial=True)
        if ser.is_valid():
            ser.save()
            return Response(ser.data)
        return Response(ser.errors, status=400)

    def delete(self, request, pk):
        try:
            asset = Asset.objects.get(pk=pk)
        except Asset.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        asset.delete()
        return Response(status=204)


class AssetAssignView(APIView):
    """Assign or unassign an asset to/from a member."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            asset = Asset.objects.get(pk=pk)
        except Asset.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)

        member_id = request.data.get('member_id')
        if member_id:
            try:
                member = OnboardingSubmission.objects.get(pk=member_id, status='verified')
            except OnboardingSubmission.DoesNotExist:
                return Response({'error': 'Member not found'}, status=404)
            asset.assigned_to = member
            asset.assigned_at = timezone.now()
            asset.assigned_by_name = _actor_name(request.user)
            asset.assigned_by_user = request.user
            asset.returned_at = None
            asset.status = Asset.STATUS_ASSIGNED
        else:
            # Unassign / return
            asset.returned_at = timezone.now()
            asset.assigned_to = None
            asset.status = Asset.STATUS_AVAILABLE

        asset.save()
        return Response(AssetSerializer(asset).data)


# ── Task Management ───────────────────────────────────────────────────────────

class TaskListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Task.objects.select_related('assigned_to', 'assigned_by')
        member_id = request.query_params.get('member')
        dept = request.query_params.get('dept')
        task_status = request.query_params.get('status')
        assigned_by = request.query_params.get('assigned_by')

        if member_id:
            qs = qs.filter(assigned_to_id=member_id)
        if dept:
            qs = qs.filter(assigned_to_department=dept)
        if task_status:
            qs = qs.filter(status=task_status)
        if assigned_by:
            qs = qs.filter(assigned_by_id=assigned_by)

        # Scope: a task belongs to you if it's assigned to you, to one of your
        # departments, or (for leads) to anyone on your team or created by you.
        scope, me = access.get_access_scope(request.user)
        if scope != 'all' and me is not None:
            from django.db.models import Q
            if scope == 'team':
                led = access.led_department_names(me)
                cond = Q(assigned_to_id__in=access.team_member_ids(me)) | Q(assigned_by_id=me.id)
                if led:
                    cond |= Q(assigned_to_department__in=list(led))
            else:  # self
                cond = Q(assigned_to_id=me.id)
                if me.assigned_departments:
                    cond |= Q(assigned_to_department__in=list(me.assigned_departments))
            qs = qs.filter(cond)

        return Response(TaskSerializer(qs, many=True).data)

    def post(self, request):
        data = request.data.copy()
        # Tag which admin created this task
        ser = TaskSerializer(data=data)
        if ser.is_valid():
            task = ser.save(assigned_by_admin=request.user)
            return Response(TaskSerializer(task).data, status=201)
        return Response(ser.errors, status=400)


class TaskDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            task = Task.objects.get(pk=pk)
        except Task.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        return Response(TaskSerializer(task).data)

    def patch(self, request, pk):
        try:
            task = Task.objects.get(pk=pk)
        except Task.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)

        # A self-scope member may only update their own (or their dept's) tasks.
        scope, me = access.get_access_scope(request.user)
        if scope == 'self':
            own = me and (
                task.assigned_to_id == me.id
                or task.assigned_to_department in (me.assigned_departments or [])
            )
            if not own:
                return Response({'error': 'You can only update your own tasks.'}, status=403)

        data = request.data.copy()
        if data.get('status') == 'done' and not task.completed_at:
            task.completed_at = timezone.now()
            task.save()
        ser = TaskSerializer(task, data=data, partial=True)
        if ser.is_valid():
            ser.save()
            return Response(ser.data)
        return Response(ser.errors, status=400)

    def delete(self, request, pk):
        try:
            task = Task.objects.get(pk=pk)
        except Task.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        # Members can't delete tasks — only leads / org-wide roles.
        scope, _ = access.get_access_scope(request.user)
        if scope == 'self':
            return Response({'error': 'You are not allowed to delete tasks.'}, status=403)
        task.delete()
        return Response(status=204)


# ── Onboarding — public views ─────────────────────────────────────────────────

class OnboardingPublicInfoView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, token):
        try:
            sub = OnboardingSubmission.objects.get(token=token)
        except OnboardingSubmission.DoesNotExist:
            return Response({'error': 'Invalid or expired link.'}, status=404)
        return Response({
            'candidate_name': sub.candidate_name, 'role_offered': sub.role_offered,
            'status': sub.status, 'has_aadhaar': sub.has_aadhaar,
            'has_college_id': sub.has_college_id, 'has_photo': sub.has_photo,
            'emergency_name': sub.emergency_name, 'emergency_phone': sub.emergency_phone,
            'emergency_relation': sub.emergency_relation, 'submitted_at': sub.submitted_at,
        })


class OnboardingPublicUploadView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request, token):
        try:
            sub = OnboardingSubmission.objects.get(token=token)
        except OnboardingSubmission.DoesNotExist:
            return Response({'error': 'Invalid or expired link.'}, status=404)
        if sub.status == 'verified':
            return Response({'error': 'Documents already verified by HR.'}, status=400)

        r2 = R2Storage()
        updated = False
        for field_name, r2_name, flag_attr, key_attr in [
            ('aadhaar',    'aadhaar',    'has_aadhaar',    'aadhaar_key'),
            ('college_id', 'college_id', 'has_college_id', 'college_id_key'),
            ('photo',      'photo',      'has_photo',      'photo_key'),
        ]:
            file_obj = request.FILES.get(field_name)
            if file_obj:
                ext = file_obj.name.rsplit('.', 1)[-1].lower() if '.' in file_obj.name else 'bin'
                r2_key = f"onboarding/{token[:16]}/{r2_name}.{ext}"
                r2.put_object(r2_key, file_obj.read(), file_obj.content_type or 'application/octet-stream')
                setattr(sub, key_attr, r2_key)
                setattr(sub, flag_attr, True)
                updated = True
        for field, attr in [
            ('emergency_name', 'emergency_name'),
            ('emergency_phone', 'emergency_phone'),
            ('emergency_relation', 'emergency_relation'),
        ]:
            val = request.data.get(field, '').strip()
            if val:
                setattr(sub, attr, val)
                updated = True
        if updated:
            if sub.has_aadhaar or sub.has_college_id or sub.has_photo:
                sub.status = OnboardingSubmission.STATUS_SUBMITTED
                if not sub.submitted_at:
                    sub.submitted_at = timezone.now()
            sub.save()
        return Response({
            'status': sub.status, 'has_aadhaar': sub.has_aadhaar,
            'has_college_id': sub.has_college_id, 'has_photo': sub.has_photo,
        })


# ── Other existing views ──────────────────────────────────────────────────────

class CandidateListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            provider = CloudflareD1Provider()
            candidates = provider.get_candidates()
            return Response({'status': 'success', 'data': candidates})
        except ProviderError as e:
            return Response({'status': 'error', 'message': str(e)}, status=500)


class CandidateDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        try:
            provider = CloudflareD1Provider()
            result = provider.update_candidate(pk, request.data)
            return Response(result)
        except ProviderError as e:
            return Response({'status': 'error', 'message': str(e)}, status=500)


class FormGateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            provider = CloudflareD1Provider()
            gates = provider.read_form_gates()
            return Response({'status': 'success', 'gates': gates})
        except ProviderError as e:
            return Response({'status': 'error', 'message': str(e)}, status=500)

    def post(self, request):
        try:
            provider = CloudflareD1Provider()
            gates = request.data.get('gates', {})
            result = provider.write_form_gates(gates)
            return Response(result)
        except ProviderError as e:
            return Response({'status': 'error', 'message': str(e)}, status=500)


class SendOfferLetterView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        import base64
        from config.email_templates import get_template, render_tokens, resolve_from
        from config.email_utils import send_email

        email = (request.data.get('email') or '').strip()
        name = request.data.get('name') or 'Candidate'
        pdf_base64 = request.data.get('pdf_base64') or ''

        # Log to audit if submission_id provided
        submission_id = request.data.get('submission_id')
        if submission_id:
            try:
                sub = OnboardingSubmission.objects.get(pk=submission_id)
                DocumentAuditLog.objects.create(
                    submission=sub,
                    doc_type=DocumentAuditLog.DOC_OFFER_LETTER,
                    action=DocumentAuditLog.ACTION_ISSUED,
                    performed_by_name=_actor_name(request.user),
                    performed_by_user=request.user,
                    note='Offer letter emailed to candidate',
                )
            except OnboardingSubmission.DoesNotExist:
                pass

        if not email:
            return Response({'status': 'error', 'message': 'Recipient email is required.'}, status=400)

        # Managed 'offer_letter' template drives sender, subject, and body design.
        # The candidate's offer details fill the {{placeholders}} so the sent
        # email matches the in-app preview. A per-send subject may still override.
        tpl = get_template('offer_letter')
        today = timezone.now().strftime('%d %B %Y')
        ctx = {
            'name': name,
            'role': request.data.get('role') or 'Tiesverse',
            'department': request.data.get('department') or 'N/A',
            'status': request.data.get('status') or 'Selected',
            'effective_date': request.data.get('effective_date') or today,
        }
        subject = request.data.get('subject') or render_tokens(tpl.subject, ctx)
        body_html = render_tokens(tpl.body_html, ctx)
        attachments = None
        if pdf_base64:
            attachments = [('Offer-Letter.pdf', base64.b64decode(pdf_base64), 'pdf')]

        if not tpl.is_enabled:
            print(f"[OFFER EMAIL STUB] would send to {email}")
            return Response({
                'status': 'stubbed',
                'message': f"The Offer Letter email template is disabled — nothing sent to {email}.",
            })

        ok = send_email(
            email, subject, body_html,
            from_email=resolve_from(tpl), attachments=attachments, enabled=True,
        )
        if not ok:
            return Response({'status': 'error', 'message': 'SES send failed.'}, status=502)
        return Response({'status': 'sent', 'message': f'Offer letter sent to {email}.'})


class ResumeDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            provider = CloudflareD1Provider()
            result = provider.get_resume(pk)
            if result.get('status') == 'error':
                raise Http404(result.get('message'))
            response = HttpResponse(result['content'], content_type=result['content_type'])
            response['Content-Disposition'] = f'inline; filename="{result["resume_name"]}"'
            return response
        except ProviderError as e:
            return HttpResponse(str(e), status=500)
