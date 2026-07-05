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
    OffboardingRequest, WeeklyUpdate, SelfSignup,
)
from .serializers import (
    PositionSerializer, EnrollmentSerializer, OfferLetterSerializer,
    HRDepartmentSerializer, OnboardingSubmissionSerializer,
    MemberAccountSerializer, DocumentAuditLogSerializer,
    AttendanceRecordSerializer, LeaveRequestSerializer,
    AssetSerializer, TaskSerializer, OffboardingRequestSerializer,
)
from . import cloudflare_proxy
from . import access
from . import offboarding as offboarding_lib
import datetime
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


GROUP_NAME_MAP = {
    'intern': 'Interns', 'member': 'Members', 'team_lead': 'Team Leads',
    'advisory': 'Advisory', 'hr': 'HR', 'admin': 'Admins',
}


def _ensure_hr_departments(names):
    """Make sure every department a member is assigned to exists as an HRDepartment,
    so the Team Directory and HR Departments never disagree (no orphan departments)."""
    for raw in (names or []):
        name = (raw or '').strip()
        if name and not HRDepartment.objects.filter(name__iexact=name).exists():
            HRDepartment.objects.create(name=name)


def _provision_member_account(sub, created_by_user):
    """Create a portal login (User + MemberAccount) for a member if one doesn't
    already exist. Shared by the verify-onboarding and manual-add flows so both
    produce a working login. Returns the temp password, or None if skipped."""
    if not sub.candidate_email or hasattr(sub, 'account'):
        return None

    username = sub.candidate_email
    if User.objects.filter(username=username).exists():
        username = f"{sub.candidate_email.split('@')[0]}_{sub.id}"

    temp_password = _generate_password()
    name_parts = (sub.candidate_name or '').split()
    user = User.objects.create_user(
        username=username, email=sub.candidate_email, password=temp_password,
        first_name=name_parts[0] if name_parts else '',
        last_name=' '.join(name_parts[1:]),
    )
    user.is_staff = False
    user.is_active = True
    user.save()

    MemberAccount.objects.create(submission=sub, user=user, created_by=created_by_user)

    group_name = GROUP_NAME_MAP.get(sub.portal_role or 'intern', 'Members')
    group, _ = Group.objects.get_or_create(name=group_name)
    user.groups.add(group)
    # Auto-grant the role's default permissions (attendance/leave/offboarding/team
    # view etc.) so a new member of this role works without manual permission setup.
    try:
        from .role_permissions import sync_group_permissions
        sync_group_permissions()
    except Exception:  # noqa: BLE001 — never block provisioning on this
        pass

    DocumentAuditLog.objects.create(
        submission=sub, doc_type='offer_letter', action='issued',
        performed_by_name=_actor_name(created_by_user), performed_by_user=created_by_user,
        note=f"Portal account created. Username: {username}",
    )
    try:
        _send_credentials_email(
            sub.candidate_email, sub.candidate_name, username, temp_password,
            sub.portal_role or 'intern',
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[CREDENTIALS EMAIL] Error: {exc}")

    return temp_password


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

    @action(detail=True, methods=['post'])
    def schedule_interview(self, request, pk=None):
        """Create a Google Calendar event + Meet link for a candidate's interview,
        email the invite, and save the details. Works without Google configured
        (saves the date, skips the Meet link)."""
        from config import google_calendar

        candidates = cloudflare_proxy.get_candidates()
        if candidates is None:
            return Response({'error': 'Cloudflare D1 unreachable'}, status=503)
        cand = next((c for c in candidates if str(c.get('id')) == str(pk)), None)
        if not cand:
            return Response({'error': 'Candidate not found'}, status=404)

        interview_at = str(request.data.get('interview_at') or '').strip()  # 'YYYY-MM-DDTHH:MM'
        if not interview_at:
            return Response({'error': 'Pick an interview date and time.'}, status=400)
        interviewer_email = str(request.data.get('interviewer_email') or '').strip()
        interviewer = str(request.data.get('interviewer') or cand.get('interviewer') or '').strip()
        duration = int(request.data.get('duration_min') or 30)
        status_label = str(request.data.get('interview_status') or 'Interview Scheduled').strip()

        cand_name = f"{cand.get('first_name', '')} {cand.get('last_name', '')}".strip()
        cand_email = str(cand.get('email') or '').strip()
        role = cand.get('roles') or cand.get('department') or ''

        meet_link, event_id, note = '', '', ''
        if google_calendar.is_configured():
            try:
                res = google_calendar.create_interview_event(
                    summary=f"TiesVerse Interview — {cand_name or cand_email} ({role})",
                    description=f"Interview for {role}.\nCandidate: {cand_name} <{cand_email}>",
                    start_iso=interview_at,
                    duration_min=duration,
                    attendees=[cand_email, interviewer_email],
                )
                meet_link, event_id = res['meet_link'], res['event_id']
            except Exception as exc:  # noqa: BLE001
                return Response({'error': f'Could not create the calendar event: {exc}'}, status=502)
        else:
            note = 'Google Calendar is not configured, so no Meet link or invite was sent — the date was saved.'

        ok = cloudflare_proxy.set_interview(
            row_id=pk, interview_at=interview_at, meeting_link=meet_link,
            calendar_event_id=event_id, interviewer_email=interviewer_email,
            interview_status=status_label, interviewer=interviewer,
        )
        if not ok:
            return Response({'error': 'Created the event but could not update the candidate record.'}, status=503)
        return Response({
            'status': 'scheduled', 'meet_link': meet_link, 'event_id': event_id,
            'interview_at': interview_at, 'note': note,
        })


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

        # Keep HR Departments in sync with whatever this member is assigned to.
        _ensure_hr_departments(sub.assigned_departments)

        # Create the portal login on first verification.
        temp_password = _provision_member_account(sub, request.user) if creating_account else None

        source = OnboardingSubmission.objects.get(pk=sub.pk) if temp_password else sub
        resp_data = OnboardingSubmissionSerializer(source).data
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

        # Same as verify-onboarding: register departments + create a portal login.
        _ensure_hr_departments(sub.assigned_departments)
        temp_password = _provision_member_account(sub, request.user)

        source = OnboardingSubmission.objects.get(pk=sub.pk) if temp_password else sub
        resp_data = OnboardingSubmissionSerializer(source).data
        if temp_password:
            resp_data['_temp_password'] = temp_password
            resp_data['_account_created'] = True
        return Response(resp_data, status=201)


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

        # Email the member when a certificate is issued. `send_email` (default
        # true for an explicit "Mark Issued") force-sends even if the template
        # toggle is off, so issuing always delivers.
        cert_email = 'not_sent'
        if action_type == 'issue' and sub.candidate_email:
            send = request.data.get('send_email', True)
            cert_email = self._email_member(sub, cert_key, actor, force=send)

        resp = OnboardingSubmissionSerializer(sub).data
        resp['_cert_email'] = cert_email          # 'sent' | 'stubbed' | 'no_email' | 'not_sent'
        return Response(resp)

    CERT_LABELS = {
        'internship_cert': 'Internship Certificate',
        'lor': 'Letter of Recommendation',
        'noc': 'No Objection Certificate',
    }

    def _email_member(self, sub, cert_key, actor, force=True):
        from django.conf import settings as dj_settings
        from config.email_templates import send_template_email

        if not sub.candidate_email:
            return 'no_email'
        label = self.CERT_LABELS.get(cert_key, 'Certificate')
        try:
            ok = send_template_email('certificate_issue', sub.candidate_email, {
                'name': sub.candidate_name or 'there',
                'document': label,
                'issued_by': actor,
                'portal_url': f"{getattr(dj_settings, 'ADMIN_PORTAL_URL', '').rstrip('/')}/login",
            }, force=force)
            return 'sent' if ok else 'stubbed'
        except Exception as exc:  # noqa: BLE001
            print(f"[CERT EMAIL] Error: {exc}")
            return 'stubbed'


class SendCertificateEmailView(APIView):
    """Send a certificate/letter to a member using a CHOSEN template, with an
    optional PDF attachment. Gives HR full control over which template + PDF."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        import base64
        from django.conf import settings as dj_settings
        from config.email_templates import get_template, render_tokens, resolve_from
        from config.email_utils import send_email

        try:
            sub = OnboardingSubmission.objects.get(pk=pk)
        except OnboardingSubmission.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        if not sub.candidate_email:
            return Response({'error': 'This member has no email address on file.'}, status=400)

        template_key = request.data.get('template_key') or 'certificate_issue'
        cert_key = request.data.get('cert_key') or ''
        label = CertificateIssueView.CERT_LABELS.get(cert_key, 'Certificate')
        tpl = get_template(template_key)
        if tpl is None:
            return Response({'error': 'Unknown template.'}, status=400)

        ctx = {
            'name': sub.candidate_name or 'there',
            'document': label,
            'issued_by': _actor_name(request.user),
            'portal_url': f"{getattr(dj_settings, 'ADMIN_PORTAL_URL', '').rstrip('/')}/login",
            'subject_title': label,
            'certificate_id': '',
            'role': sub.role_offered or '',
            'department': ', '.join(sub.assigned_departments or []),
        }
        attachments = None
        pdf_base64 = request.data.get('pdf_base64') or ''
        if pdf_base64:
            try:
                fname = request.data.get('filename') or f'{label}.pdf'
                attachments = [(fname, base64.b64decode(pdf_base64), 'pdf')]
            except Exception:  # noqa: BLE001
                attachments = None

        subject = render_tokens(tpl.subject, ctx)
        body = render_tokens(tpl.body_html, ctx)
        ok = send_email(
            sub.candidate_email, subject, body,
            from_email=resolve_from(tpl), attachments=attachments, enabled=True,
        )
        # Log the send for the paper trail.
        DocumentAuditLog.objects.create(
            submission=sub, doc_type=cert_key or 'offer_letter',
            action=DocumentAuditLog.ACTION_ISSUED,
            performed_by_name=_actor_name(request.user), performed_by_user=request.user,
            note=f"{label} emailed via template '{tpl.name}'"
                 + (' with PDF' if attachments else ''),
        )
        return Response({'sent': bool(ok), 'to': sub.candidate_email, 'template': tpl.name})


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
            'is_advisory': _is_advisory(request.user),
            'is_member': member is not None,
            'member': OnboardingSubmissionSerializer(member).data if member else None,
            'led_departments': sorted(access.led_department_names(member)) if member else [],
        })


# ── Master Directory (unified people search) ──────────────────────────────────

class DirectorySearchView(APIView):
    """One searchable master sheet across the whole system. Search a name or email
    and get a 360° view: member/employee details, webinar registrations, and
    certificates — aggregated per person by email. Org-wide roles only."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        scope, _ = access.get_access_scope(request.user)
        if scope != 'all':
            return Response({'error': 'Not allowed.'}, status=403)

        q = (request.query_params.get('q') or '').strip().lower()
        people = {}

        def bucket(email, name):
            email = (email or '').strip()
            key = email.lower() or f'name:{(name or "").strip().lower()}'
            if not key or key == 'name:':
                key = f'row:{len(people)}'
            if key not in people:
                people[key] = {
                    'email': email, 'name': name or '', 'is_member': False, 'member': None,
                    'registrations': 0, 'registered_events': [],
                    'certificates': 0, 'certificate_list': [], 'attendance_days': 0,
                }
            return people[key]

        def matches(name, email):
            return (not q) or q in f"{name or ''} {email or ''}".lower()

        # 1) Members / employees
        for s in OnboardingSubmission.objects.all():
            if not matches(s.candidate_name, s.candidate_email):
                continue
            b = bucket(s.candidate_email, s.candidate_name)
            b['is_member'] = True
            b['name'] = b['name'] or s.candidate_name
            certs = {
                'internship_cert': bool(s.cert_internship_issued_at),
                'lor': bool(s.cert_lor_issued_at),
                'noc': bool(s.cert_noc_issued_at),
            }
            b['member'] = {
                'id': s.id, 'role': s.role_offered, 'portal_role': s.portal_role,
                'employment_type': s.employment_type, 'status': s.status,
                'departments': s.assigned_departments or [],
                'joined': (s.joining_date.isoformat() if s.joining_date
                           else (s.verified_at.isoformat() if s.verified_at else None)),
                'has_account': hasattr(s, 'account'), 'certs': certs,
            }
            b['attendance_days'] = s.attendance_records.filter(
                status=AttendanceRecord.STATUS_PRESENT).count()
            for title, val in [('Internship Certificate', s.cert_internship_issued_at),
                               ('Letter of Recommendation', s.cert_lor_issued_at),
                               ('No Objection Certificate', s.cert_noc_issued_at)]:
                if val:
                    b['certificates'] += 1
                    b['certificate_list'].append({'title': title, 'status': 'issued', 'id': ''})

        # 2) Webinar registrations + 3) certificate records (remote Turso)
        try:
            from webinar_app import turso_client
            if turso_client.is_configured():
                turso_client.setup_tables()
                for r in turso_client.execute(
                        'SELECT name,email,event_title FROM registrations ORDER BY registered_at DESC LIMIT 3000'):
                    if not matches(r.get('name'), r.get('email')):
                        continue
                    b = bucket(r.get('email'), r.get('name'))
                    b['name'] = b['name'] or str(r.get('name') or '')
                    b['registrations'] += 1
                    if r.get('event_title'):
                        b['registered_events'].append(str(r.get('event_title')))
                try:
                    for r in turso_client.execute(
                            'SELECT person_name,person_email,subject_title,certificate_id,email_status '
                            'FROM certificate_records ORDER BY created_at DESC LIMIT 3000'):
                        if not matches(r.get('person_name'), r.get('person_email')):
                            continue
                        b = bucket(r.get('person_email'), r.get('person_name'))
                        b['name'] = b['name'] or str(r.get('person_name') or '')
                        b['certificates'] += 1
                        b['certificate_list'].append({
                            'title': str(r.get('subject_title') or 'Certificate'),
                            'id': str(r.get('certificate_id') or ''),
                            'status': str(r.get('email_status') or ''),
                        })
                except Exception:  # noqa: BLE001 — certificate_records may not exist yet
                    pass
        except Exception as exc:  # noqa: BLE001 — Turso optional
            print(f"[DIRECTORY] Turso lookup skipped: {exc}")

        results = sorted(
            people.values(),
            key=lambda p: (not p['is_member'], -(p['registrations'] + p['certificates']), (p['name'] or '').lower()),
        )
        return Response({'count': len(results), 'results': results[:300]})


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


# ── Offboarding ───────────────────────────────────────────────────────────────

def _is_offboarding_hr(user):
    return user.is_superuser or user.has_perm('career_app.can_review_offboarding')


def _open_assets_for(member):
    return Asset.objects.filter(assigned_to=member, returned_at__isnull=True)


def _open_tasks_for(member):
    return Task.objects.filter(assigned_to=member).exclude(
        status__in=[Task.STATUS_DONE, Task.STATUS_CANCELLED])


def _notify_offboarding(off, key):
    """Fire an offboarding email (flag-gated in the template registry). Never raises."""
    try:
        from config.email_templates import send_template_email
        send_template_email(key, off.member.candidate_email, {
            'name': off.member.candidate_name,
            'last_working_day': str(off.last_working_day or ''),
            'notice_days': str(off.notice_period_days or ''),
        })
    except Exception:  # noqa: BLE001
        pass


class OffboardingListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = OffboardingRequest.objects.select_related('member')
        member_id = request.query_params.get('member')
        st = request.query_params.get('status')
        if member_id:
            qs = qs.filter(member_id=member_id)
        if st:
            qs = qs.filter(status=st)
        qs = access.scope_member_queryset(qs, request.user)
        return Response(OffboardingRequestSerializer(qs, many=True).data)

    def post(self, request):
        data = request.data.copy()
        scope, me = access.get_access_scope(request.user)
        if scope == 'self':
            if me is None:
                return Response({'error': 'No member profile linked to your account.'}, status=403)
            data['member'] = me.id
        member_id = data.get('member')
        if member_id and OffboardingRequest.objects.filter(
                member_id=member_id, status__in=['pending', 'approved']).exists():
            return Response({'error': 'There is already an active offboarding request for this member.'}, status=400)
        ser = OffboardingRequestSerializer(data=data)
        if ser.is_valid():
            ser.save(status='pending')
            return Response(ser.data, status=201)
        return Response(ser.errors, status=400)


class OffboardingDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            off = OffboardingRequest.objects.get(pk=pk)
        except OffboardingRequest.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        data = OffboardingRequestSerializer(off).data
        data['assets_to_return'] = AssetSerializer(_open_assets_for(off.member), many=True).data
        data['tasks_to_handover'] = TaskSerializer(_open_tasks_for(off.member), many=True).data
        return Response(data)

    def patch(self, request, pk):
        try:
            off = OffboardingRequest.objects.get(pk=pk)
        except OffboardingRequest.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        scope, me = access.get_access_scope(request.user)
        if scope == 'self':
            if me is None or off.member_id != me.id:
                return Response({'error': 'You can only edit your own request.'}, status=403)
            if off.status != 'pending':
                return Response({'error': 'This request can no longer be edited.'}, status=400)
        ser = OffboardingRequestSerializer(off, data=request.data, partial=True)
        if ser.is_valid():
            ser.save()
            return Response(ser.data)
        return Response(ser.errors, status=400)


class OffboardingReviewView(APIView):
    """HR-only: approve (with notice period), reject, or cancel. Team leads can
    view offboarding requests but cannot review them (no can_review_offboarding perm)."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if not _is_offboarding_hr(request.user):
            return Response({'error': 'Only HR can review offboarding requests.'}, status=403)
        try:
            off = OffboardingRequest.objects.get(pk=pk)
        except OffboardingRequest.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)

        decision = request.data.get('decision')
        if decision not in ('approved', 'rejected', 'cancelled'):
            return Response({'error': 'decision must be approved, rejected, or cancelled'}, status=400)

        off.status = decision
        off.reviewed_by_name = _actor_name(request.user)
        off.reviewed_by_user = request.user
        off.reviewed_at = timezone.now()
        off.review_note = request.data.get('note', '')

        if decision == 'approved':
            today = timezone.now().date()
            lwd = request.data.get('last_working_day')
            days = request.data.get('notice_period_days')
            if lwd:
                off.last_working_day = lwd
                try:
                    d = datetime.date.fromisoformat(str(lwd))
                    off.notice_period_days = (d - today).days
                except (TypeError, ValueError):
                    pass
            else:
                try:
                    days = int(days)
                except (TypeError, ValueError):
                    days = 30
                off.notice_period_days = max(0, days)
                off.last_working_day = today + datetime.timedelta(days=off.notice_period_days)
        off.save()

        if decision == 'approved':
            _notify_offboarding(off, 'offboarding_approved')
        return Response(OffboardingRequestSerializer(off).data)


class OffboardingRevokeView(APIView):
    """HR-only: immediately revoke portal access (the member's record is kept)."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not _is_offboarding_hr(request.user):
            return Response({'error': 'Only HR can revoke access.'}, status=403)
        try:
            off = OffboardingRequest.objects.get(pk=pk)
        except OffboardingRequest.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        if off.status not in ('approved', 'completed'):
            return Response({'error': 'Approve the request before revoking access.'}, status=400)
        offboarding_lib.revoke_member_access(off, actor_name=_actor_name(request.user))
        _notify_offboarding(off, 'offboarding_revoked')
        return Response(OffboardingRequestSerializer(off).data)


class OffboardingReactivateView(APIView):
    """HR-only: undo an offboarding — restore login + verified status (rehire)."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not _is_offboarding_hr(request.user):
            return Response({'error': 'Only HR can reactivate a member.'}, status=403)
        try:
            off = OffboardingRequest.objects.get(pk=pk)
        except OffboardingRequest.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        offboarding_lib.reactivate_member(off.member, actor_name=_actor_name(request.user))
        return Response({'reactivated': True, 'member': off.member_id})


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


# ── Advisory oversight + weekly team-lead updates ─────────────────────────────

def _is_advisory(user):
    """True for Advisory members, superusers, and the Admins group."""
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if user.is_superuser or user.groups.filter(name__in=['Advisory', 'Admins']).exists():
        return True
    m = access.get_member_for_user(user)
    return bool(m and (m.portal_role or '') in ('advisory', 'admin'))


class AdvisoryTaskOversightView(APIView):
    """Advisory-only: every completed task with its team lead + completer + detail."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_advisory(request.user):
            return Response({'detail': 'Advisory access only.'}, status=status.HTTP_403_FORBIDDEN)
        tasks = Task.objects.filter(status='done').select_related('assigned_by', 'assigned_to')[:500]
        data = [{
            'id': t.id,
            'title': t.title,
            'description': t.description,
            'team_lead': (t.assigned_by.candidate_name if t.assigned_by_id else ''),
            'completer': (t.assigned_to.candidate_name if t.assigned_to_id else (t.assigned_to_department or '')),
            'department': ((t.assigned_to.assigned_departments if t.assigned_to_id else None)
                           or ([t.assigned_to_department] if t.assigned_to_department else [])),
            'priority': t.priority,
            'completed_at': t.completed_at,
            'completion_note': t.completion_note,
        } for t in tasks]
        return Response({'tasks': data})


class AdvisoryDailyUpdatesView(APIView):
    """Advisory-only: daily check-out work reports across the org."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_advisory(request.user):
            return Response({'detail': 'Advisory access only.'}, status=status.HTTP_403_FORBIDDEN)
        qs = AttendanceRecord.objects.exclude(work_report='').select_related('member').order_by('-date')[:500]
        data = [{
            'id': r.id,
            'member': (r.member.candidate_name if r.member_id else ''),
            'department': (r.member.assigned_departments if r.member_id else []),
            'date': r.date,
            'work_report': r.work_report,
            'check_out': r.check_out,
        } for r in qs]
        return Response({'updates': data})


class WeeklyUpdateView(APIView):
    """Team leads submit weekly updates (POST); Advisory sees all, a lead sees their own (GET)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        member = access.get_member_for_user(request.user)
        if _is_advisory(request.user):
            qs = WeeklyUpdate.objects.select_related('team_lead').all()[:500]
        elif member:
            qs = WeeklyUpdate.objects.filter(team_lead=member).select_related('team_lead')[:500]
        else:
            qs = WeeklyUpdate.objects.none()
        data = [{
            'id': w.id,
            'team_lead': (w.team_lead.candidate_name if w.team_lead_id else ''),
            'department': (w.team_lead.assigned_departments if w.team_lead_id else []),
            'week_ending': w.week_ending,
            'summary': w.summary,
            'wins': w.wins,
            'blockers': w.blockers,
            'created_at': w.created_at,
        } for w in qs]
        return Response({'updates': data})

    def post(self, request):
        member = access.get_member_for_user(request.user)
        if not member:
            return Response({'detail': 'No member profile linked to your account.'},
                            status=status.HTTP_403_FORBIDDEN)
        if not (access.is_lead(member) or _is_advisory(request.user)):
            return Response({'detail': 'Only team leads submit weekly updates.'},
                            status=status.HTTP_403_FORBIDDEN)
        d = request.data
        if not (d.get('week_ending') and d.get('summary')):
            return Response({'detail': 'week_ending and summary are required.'},
                            status=status.HTTP_400_BAD_REQUEST)
        w = WeeklyUpdate.objects.create(
            team_lead=member,
            week_ending=d['week_ending'],
            summary=d['summary'],
            wins=d.get('wins', ''),
            blockers=d.get('blockers', ''),
            submitted_by_user=request.user if request.user.is_authenticated else None,
        )
        return Response({'id': w.id, 'status': 'submitted'}, status=status.HTTP_201_CREATED)


# ── Self-service signup: hashed link -> OTP -> HR approval ────────────────────

def _signup_hash_ok(link_hash):
    from django.conf import settings as dj
    expected = getattr(dj, 'SIGNUP_LINK_HASH', '') or ''
    return bool(expected) and str(link_hash or '') == expected


def _send_otp_email(email, name, otp):
    from django.conf import settings as dj
    key_id = getattr(dj, 'AWS_SES_ACCESS_KEY_ID', '')
    secret = getattr(dj, 'AWS_SES_SECRET_ACCESS_KEY', '')
    region = getattr(dj, 'AWS_SES_REGION', 'ap-south-1')
    from_email = getattr(dj, 'SES_FROM_EMAIL', '')
    if not all([key_id, secret, from_email]):
        return False
    try:
        import boto3
        ses = boto3.client('ses', region_name=region, aws_access_key_id=key_id, aws_secret_access_key=secret)
        html = (
            '<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">'
            '<div style="background:#FE7A00;padding:20px 28px"><span style="color:#fff;font-size:20px;font-weight:700">.tiesverse</span></div>'
            '<div style="padding:28px"><h2 style="margin:0 0 12px">Verify your email</h2>'
            f'<p style="margin:0 0 8px">Hi {name or "there"}, use this code to verify your Tiesverse signup:</p>'
            f'<div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#FE7A00;margin:16px 0">{otp}</div>'
            '<p style="margin:0;color:#666;font-size:13px">This code expires in 15 minutes. If you did not request it, ignore this email.</p>'
            '</div></div>'
        )
        ses.send_email(
            Source=from_email, Destination={'ToAddresses': [email]},
            Message={'Subject': {'Data': 'Your Tiesverse verification code'},
                     'Body': {'Html': {'Data': html}, 'Text': {'Data': f'Your Tiesverse code: {otp} (expires in 15 minutes).'}}},
        )
        return True
    except Exception as exc:  # noqa: BLE001
        print(f'[SIGNUP OTP] SES error: {exc}')
        return False


class PublicSignupView(APIView):
    """Public: with the shared hashed link, submit name/email/photo -> emails an OTP."""
    permission_classes = [AllowAny]

    def post(self, request, link_hash):
        if not _signup_hash_ok(link_hash):
            return Response({'error': 'Invalid or expired signup link.'}, status=403)
        name = (request.data.get('name') or '').strip()
        email = (request.data.get('email') or '').strip().lower()
        photo_url = (request.data.get('photo_url') or '').strip()
        # A multipart `photo` file -> convert to WebP -> Cloudinary (min storage)
        photo_file = request.FILES.get('photo')
        if photo_file and not photo_url:
            try:
                from tiesverse_app.media_views import to_webp
                import cloudinary.uploader
                from django.conf import settings as dj
                webp = to_webp(photo_file)
                res = cloudinary.uploader.upload(
                    webp, folder=getattr(dj, 'CLOUDINARY_UPLOAD_FOLDER', 'tiesverse_admin'),
                    resource_type='image', format='webp')
                photo_url = res.get('secure_url') or ''
            except Exception as exc:  # noqa: BLE001
                print(f'[SIGNUP PHOTO] {exc}')
        if not name or not email:
            return Response({'error': 'Name and email are required.'}, status=400)
        if OnboardingSubmission.objects.filter(candidate_email__iexact=email).exists():
            return Response({'error': 'This email is already registered. Please contact HR.'}, status=409)
        import random
        otp = f'{random.randint(0, 999999):06d}'
        signup, _ = SelfSignup.objects.update_or_create(
            email=email,
            defaults={
                'name': name, 'photo_url': photo_url, 'otp_code': otp,
                'otp_expires_at': timezone.now() + datetime.timedelta(minutes=15),
                'otp_attempts': 0, 'status': SelfSignup.STATUS_OTP,
            },
        )
        _send_otp_email(email, name, otp)
        return Response({'status': 'otp_sent', 'signup_id': signup.id})


class VerifySignupOtpView(APIView):
    """Public: verify the emailed OTP -> signup moves to 'awaiting HR'."""
    permission_classes = [AllowAny]

    def post(self, request, link_hash):
        if not _signup_hash_ok(link_hash):
            return Response({'error': 'Invalid link.'}, status=403)
        email = (request.data.get('email') or '').strip().lower()
        otp = (request.data.get('otp') or '').strip()
        signup = SelfSignup.objects.filter(email=email, status=SelfSignup.STATUS_OTP).order_by('-created_at').first()
        if not signup:
            return Response({'error': 'No pending signup for this email.'}, status=404)
        if signup.otp_attempts >= 6:
            return Response({'error': 'Too many attempts. Please sign up again.'}, status=429)
        if not signup.otp_expires_at or timezone.now() > signup.otp_expires_at:
            return Response({'error': 'Code expired. Please sign up again.'}, status=400)
        signup.otp_attempts += 1
        if otp != signup.otp_code:
            signup.save(update_fields=['otp_attempts'])
            return Response({'error': 'Incorrect code.'}, status=400)
        signup.status = SelfSignup.STATUS_VERIFIED
        signup.otp_code = ''
        signup.save(update_fields=['status', 'otp_code', 'otp_attempts'])
        return Response({'status': 'verified'})


class SignupListView(APIView):
    """HR: list self-signups awaiting review (verified + otp_pending), newest first."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = SelfSignup.objects.exclude(
            status__in=[SelfSignup.STATUS_APPROVED, SelfSignup.STATUS_REJECTED]
        ).order_by('-created_at')[:500]
        data = [{
            'id': s.id, 'name': s.name, 'email': s.email, 'photo_url': s.photo_url,
            'status': s.status, 'created_at': s.created_at,
        } for s in qs]
        return Response({'signups': data})


class ApproveSignupView(APIView):
    """HR: approve a verified signup -> create member record + provision login,
    assigning the role + departments HR chose."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            signup = SelfSignup.objects.get(pk=pk)
        except SelfSignup.DoesNotExist:
            return Response({'error': 'Not found.'}, status=404)
        if signup.status == SelfSignup.STATUS_APPROVED:
            return Response({'error': 'Already approved.'}, status=400)
        portal_role = (request.data.get('portal_role') or 'intern').strip()
        departments = request.data.get('assigned_departments') or []
        if isinstance(departments, str):
            departments = [d.strip() for d in departments.split(',') if d.strip()]

        sub = OnboardingSubmission.objects.create(
            candidate_id=f'signup-{signup.id}',
            candidate_name=signup.name,
            candidate_email=signup.email,
            portal_role=portal_role,
            assigned_departments=departments,
            status=OnboardingSubmission.STATUS_VERIFIED,
            token=secrets.token_urlsafe(32),
            has_photo=bool(signup.photo_url),
        )
        _ensure_hr_departments(departments)
        _provision_member_account(sub, request.user)

        signup.status = SelfSignup.STATUS_APPROVED
        signup.reviewed_by_user = request.user
        signup.reviewed_at = timezone.now()
        signup.save(update_fields=['status', 'reviewed_by_user', 'reviewed_at'])
        return Response({'status': 'approved', 'member_id': sub.id})


class RejectSignupView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            signup = SelfSignup.objects.get(pk=pk)
        except SelfSignup.DoesNotExist:
            return Response({'error': 'Not found.'}, status=404)
        signup.status = SelfSignup.STATUS_REJECTED
        signup.reviewed_by_user = request.user
        signup.reviewed_at = timezone.now()
        signup.save(update_fields=['status', 'reviewed_by_user', 'reviewed_at'])
        return Response({'status': 'rejected'})
