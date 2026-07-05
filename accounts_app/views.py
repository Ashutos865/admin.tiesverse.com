from django.contrib.auth.models import User, Permission
from django.db.models import Q
from rest_framework import viewsets, permissions, views, response, status
from rest_framework.decorators import action
from rest_framework_simplejwt.views import TokenObtainPairView
from .serializers import (
    UserSerializer, PermissionSerializer, CustomTokenObtainPairSerializer,
    SettingSerializer, EmailTemplateSerializer, EmailCampaignSerializer,
    FeaturedContentSerializer,
)
from .models import Setting, EmailTemplate, EmailCampaign, FeaturedContent


# ── Permission classes ────────────────────────────────────────────────────────

class IsSuperUser(permissions.BasePermission):
    """Only superusers can access user/permission management."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_superuser)


class CanDelegate(permissions.BasePermission):
    """Superusers OR users with the can_delegate_permissions custom permission."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        return request.user.has_perm('accounts_app.can_delegate_permissions')


# ── Core viewsets (superuser-only) ────────────────────────────────────────────

APP_LABELS = ['tiesverse_app', 'career_app', 'webinar_app']


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by('-date_joined')
    serializer_class = UserSerializer
    permission_classes = [IsSuperUser]


class PermissionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    All available permissions for the superuser permissions matrix.
    Includes the special can_delegate_permissions codename so HR can
    grant it to team leads.
    """
    serializer_class = PermissionSerializer
    permission_classes = [IsSuperUser]

    def get_queryset(self):
        return Permission.objects.filter(
            Q(content_type__app_label__in=APP_LABELS) |
            Q(codename='can_delegate_permissions')
        ).select_related('content_type').order_by(
            'content_type__app_label', 'content_type__model', 'codename'
        )


# ── Delegation views (team leads) ─────────────────────────────────────────────

class DelegatablePermissionsView(views.APIView):
    """
    GET — returns the permissions this user is allowed to delegate.
    Superusers can delegate everything; team leads can only delegate
    permissions they personally hold (direct + group).
    """
    permission_classes = [CanDelegate]

    def get(self, request):
        if request.user.is_superuser:
            perms = Permission.objects.filter(
                Q(content_type__app_label__in=APP_LABELS) |
                Q(codename='can_delegate_permissions')
            ).select_related('content_type').order_by(
                'content_type__app_label', 'content_type__model', 'codename'
            )
        else:
            direct = set(request.user.user_permissions.values_list('codename', flat=True))
            group = set(
                Permission.objects.filter(group__user=request.user)
                .values_list('codename', flat=True)
            )
            delegatable = direct | group
            perms = Permission.objects.filter(
                codename__in=delegatable
            ).filter(
                Q(content_type__app_label__in=APP_LABELS) |
                Q(codename='can_delegate_permissions')
            ).select_related('content_type').order_by(
                'content_type__app_label', 'content_type__model', 'codename'
            )
        return response.Response(PermissionSerializer(perms, many=True).data)


class TeamMembersForDelegationView(views.APIView):
    """
    GET — users the current user can manage permissions for.
    Superusers see all non-superusers.
    Team leads see members who share at least one department with them.
    """
    permission_classes = [CanDelegate]

    def get(self, request):
        if request.user.is_superuser:
            users = User.objects.filter(is_superuser=False).order_by('-date_joined')
            return response.Response(UserSerializer(users, many=True).data)

        from career_app.models import OnboardingSubmission
        try:
            my_sub = OnboardingSubmission.objects.get(candidate_email=request.user.email)
            my_depts = my_sub.assigned_departments or []
        except OnboardingSubmission.DoesNotExist:
            return response.Response([])

        if not my_depts:
            return response.Response([])

        # SQLite-compatible: filter department overlap in Python
        all_members = OnboardingSubmission.objects.filter(
            status='verified'
        ).exclude(candidate_email=request.user.email)

        member_emails = [
            m.candidate_email
            for m in all_members
            if m.candidate_email and any(d in (m.assigned_departments or []) for d in my_depts)
        ]

        users = User.objects.filter(email__in=member_emails, is_superuser=False)
        return response.Response(UserSerializer(users, many=True).data)


class DelegatePermissionsView(views.APIView):
    """
    PATCH /api/accounts/users/{pk}/delegate/
    Non-superusers can only grant permissions they hold — anything outside
    that set is silently dropped. Permissions set by others are preserved.
    """
    permission_classes = [CanDelegate]

    def patch(self, request, pk):
        try:
            target = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return response.Response({'error': 'User not found'}, status=404)

        if target.is_superuser:
            return response.Response(
                {'error': 'Cannot modify superuser permissions'}, status=403
            )

        requested = set(request.data.get('permissions', []))

        if request.user.is_superuser:
            perms = Permission.objects.filter(
                codename__in=requested,
                content_type__app_label__in=APP_LABELS,
            )
            target.user_permissions.set(perms)
        else:
            direct = set(request.user.user_permissions.values_list('codename', flat=True))
            group_p = set(
                Permission.objects.filter(group__user=request.user)
                .values_list('codename', flat=True)
            )
            my_scope = direct | group_p

            # Only grant within our scope
            to_grant = requested & my_scope

            # Preserve target's permissions that are outside our scope
            preserved = list(target.user_permissions.exclude(codename__in=my_scope))
            in_scope = list(
                Permission.objects.filter(
                    codename__in=to_grant,
                    content_type__app_label__in=APP_LABELS,
                )
            )
            target.user_permissions.set(preserved + in_scope)

        return response.Response(UserSerializer(target).data)


# ── Auth + settings ───────────────────────────────────────────────────────────

class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


# ── Password reset (forgot password) ──────────────────────────────────────────

class PasswordResetRequestView(views.APIView):
    """Public: accept a username or email, and if it maps to a real account with
    an email, send a tokenised reset link. Always returns the same generic
    response so the endpoint can't be used to probe which accounts exist."""
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    GENERIC = {'detail': 'If an account matches that address, a password reset link has been sent.'}

    def post(self, request):
        from django.conf import settings as dj_settings
        from django.contrib.auth.tokens import default_token_generator
        from django.utils.http import urlsafe_base64_encode
        from django.utils.encoding import force_bytes
        from config.email_templates import send_template_email

        identifier = (request.data.get('email') or request.data.get('username') or '').strip()
        if identifier:
            user = User.objects.filter(
                Q(email__iexact=identifier) | Q(username__iexact=identifier)
            ).order_by('id').first()
            if user and user.email and user.is_active:
                uid = urlsafe_base64_encode(force_bytes(user.pk))
                token = default_token_generator.make_token(user)
                reset_url = (
                    f"{dj_settings.ADMIN_PORTAL_URL.rstrip('/')}"
                    f"/reset-password?uid={uid}&token={token}"
                )
                send_template_email('password_reset', user.email, {
                    'name': user.get_full_name() or user.username,
                    'reset_url': reset_url,
                })
        return response.Response(self.GENERIC)


class PasswordResetConfirmView(views.APIView):
    """Public: validate the uid+token pair and set a new password."""
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        from django.contrib.auth.tokens import default_token_generator
        from django.utils.http import urlsafe_base64_decode
        from django.utils.encoding import force_str

        uidb64 = request.data.get('uid') or ''
        token = request.data.get('token') or ''
        new_password = request.data.get('password') or ''

        if not (uidb64 and token and new_password):
            return response.Response({'error': 'uid, token and password are required.'}, status=400)
        if len(new_password) < 8:
            return response.Response({'error': 'Password must be at least 8 characters.'}, status=400)

        try:
            uid = force_str(urlsafe_base64_decode(uidb64))
            user = User.objects.get(pk=uid)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            return response.Response({'error': 'Invalid or expired reset link.'}, status=400)

        if not default_token_generator.check_token(user, token):
            return response.Response({'error': 'This reset link is invalid or has expired.'}, status=400)

        user.set_password(new_password)
        user.save()
        return response.Response({'detail': 'Password updated. You can now log in.'})


class EmailTemplateViewSet(viewsets.ModelViewSet):
    """Superuser-managed email templates for every send point in the app."""
    serializer_class = EmailTemplateSerializer
    permission_classes = [IsSuperUser]
    queryset = EmailTemplate.objects.all()
    http_method_names = ['get', 'post', 'patch', 'put', 'delete', 'head', 'options']

    def list(self, request, *args, **kwargs):
        # Make sure every registry template has a row before listing.
        from config.email_templates import ensure_templates
        ensure_templates()
        return super().list(request, *args, **kwargs)

    def _actor(self):
        return self.request.user.get_full_name() or self.request.user.username

    def perform_create(self, serializer):
        from django.utils.text import slugify
        from config.email_templates import render_content
        name = serializer.validated_data.get('name') or 'Custom Template'
        base = 'custom_' + (slugify(name).replace('-', '_') or 'template')
        key, i = base, 2
        while EmailTemplate.objects.filter(key=key).exists():
            key, i = f'{base}_{i}', i + 1
        obj = serializer.save(key=key, is_custom=True, updated_by=self._actor())
        if not obj.html_mode:
            obj.body_html = render_content(obj.content_json)
            obj.save(update_fields=['body_html'])

    def perform_update(self, serializer):
        from config.email_templates import render_content
        instance = serializer.instance
        # Built-in templates: name / variables / attachment rule are fixed by code.
        if not instance.is_custom:
            for field in ('name', 'variables', 'allow_attachment'):
                serializer.validated_data.pop(field, None)
        obj = serializer.save(updated_by=self._actor())
        # In structured mode, body_html is always regenerated from the content.
        if not obj.html_mode:
            new_html = render_content(obj.content_json)
            if new_html != obj.body_html:
                obj.body_html = new_html
                obj.save(update_fields=['body_html'])

    def destroy(self, request, *args, **kwargs):
        obj = self.get_object()
        if not obj.is_custom:
            return response.Response(
                {'error': 'Built-in templates cannot be deleted — disable it instead.'}, status=400)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def test(self, request, pk=None):
        """Send a one-off test of this template to an address, using sample data.
        Forced to send (ignores the template's enabled flag) so it can be previewed
        even while disabled."""
        from config.email_templates import SAMPLE_CONTEXT, render_tokens, resolve_from
        from config.email_utils import send_email

        tpl = self.get_object()
        to = (request.data.get('to') or request.user.email or '').strip()
        if not to:
            return response.Response({'error': 'Provide a recipient email address.'}, status=400)

        sample = {v: SAMPLE_CONTEXT.get(v, '{{' + v + '}}') for v in (tpl.variables or [])}
        subject = '[TEST] ' + render_tokens(tpl.subject, sample)
        body = render_tokens(tpl.body_html, sample)
        ok = send_email(to, subject, body, from_email=resolve_from(tpl), enabled=True)
        return response.Response({'sent': bool(ok), 'to': to})

    @action(detail=True, methods=['post'], url_path='send-campaign')
    def send_campaign(self, request, pk=None):
        """Bulk mail-merge: render this template per recipient and send via SES.
        Body: {recipients:[{...vars, email}], email_field, name?, subject?,
        html_mode?, body_html?, content_json?}. Each recipient dict fills the
        {{tokens}} for that person. Records the send in campaign history."""
        import re
        from config.email_templates import render_tokens, render_content, resolve_from
        from config.email_utils import send_email

        tpl = self.get_object()
        recipients = request.data.get('recipients') or []
        email_field = request.data.get('email_field') or 'email'

        # Allow sending with unsaved edits from the campaign screen.
        subject_src = request.data.get('subject', tpl.subject)
        html_mode = request.data.get('html_mode', tpl.html_mode)
        if html_mode:
            body_src = request.data.get('body_html', tpl.body_html)
        else:
            body_src = render_content(request.data.get('content_json', tpl.content_json))

        # Sender override: campaign can send from any verified address/name.
        from_email = (request.data.get('from_email') or '').strip()
        from_name = (request.data.get('from_name') or '').strip()
        if from_email:
            source = f'"{from_name}" <{from_email}>' if from_name else from_email
        else:
            source = resolve_from(tpl)

        email_re = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
        sent = failed = skipped = 0
        results = []
        seen = set()
        for row in recipients:
            row = row if isinstance(row, dict) else {}
            to = str(row.get(email_field, '')).strip()
            if not to or not email_re.match(to) or to.lower() in seen:
                skipped += 1
                results.append({'email': to, 'status': 'skipped'})
                continue
            seen.add(to.lower())
            subject = render_tokens(subject_src, row)
            body = render_tokens(body_src, row)
            ok = send_email(to, subject, body, from_email=source, enabled=True)
            if ok:
                sent += 1
                results.append({'email': to, 'status': 'sent'})
            else:
                failed += 1
                results.append({'email': to, 'status': 'failed'})

        EmailCampaign.objects.create(
            name=request.data.get('name', ''),
            template_key=tpl.key, template_name=tpl.name,
            subject=render_tokens(subject_src, {}),
            recipient_count=len(recipients),
            sent_count=sent, failed_count=failed, skipped_count=skipped,
            created_by=self._actor(),
        )
        return response.Response({
            'sent': sent, 'failed': failed, 'skipped': skipped, 'results': results,
        })

    @action(detail=True, methods=['post'])
    def preview(self, request, pk=None):
        """Return the rendered subject + HTML with sample data (no email sent).
        Accepts unsaved structured `content_json` + `subject` to preview live edits."""
        from config.email_templates import SAMPLE_CONTEXT, render_tokens, render_content

        tpl = self.get_object()
        subject_src = request.data.get('subject', tpl.subject)
        html_mode = request.data.get('html_mode', tpl.html_mode)
        if html_mode:
            body_src = request.data.get('body_html', tpl.body_html)
        else:
            body_src = render_content(request.data.get('content_json', tpl.content_json))
        variables = request.data.get('variables', tpl.variables) or []
        sample = {v: SAMPLE_CONTEXT.get(v, '{{' + v + '}}') for v in variables}
        return response.Response({
            'subject': render_tokens(subject_src, sample),
            'html': render_tokens(body_src, sample),
        })


class EmailCampaignViewSet(viewsets.ReadOnlyModelViewSet):
    """History of bulk email campaigns."""
    serializer_class = EmailCampaignSerializer
    permission_classes = [IsSuperUser]
    queryset = EmailCampaign.objects.all()


class PublicEmailTemplateView(views.APIView):
    """Public read of a whitelisted email template (subject + HTML with {{tokens}}
    intact) so another service — the careers site — can render + send it via SES.
    Only career-safe templates are exposed; internal ones (password reset, etc.)
    are never public."""
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    ALLOWED = {'career_application'}

    def get(self, request, key):
        if key not in self.ALLOWED:
            return response.Response({'error': 'Not available'}, status=404)
        from config.email_templates import get_template
        tpl = get_template(key)
        if tpl is None:
            return response.Response({'error': 'Unknown template'}, status=404)
        return response.Response({
            'key': tpl.key, 'subject': tpl.subject, 'body_html': tpl.body_html,
            'from_name': tpl.from_name, 'from_email': tpl.from_email,
        })


class SESSendersView(views.APIView):
    """List the SES-verified sender identities so the UI can offer valid 'from'
    addresses. Any address under a verified domain also works."""
    permission_classes = [IsSuperUser]

    def get(self, request):
        from django.conf import settings as s
        payload = {'emails': [], 'domains': [], 'default': getattr(s, 'SES_FROM_EMAIL', '')}
        try:
            import boto3
            client = boto3.client(
                'ses', region_name=s.AWS_SES_REGION,
                aws_access_key_id=s.AWS_SES_ACCESS_KEY_ID,
                aws_secret_access_key=s.AWS_SES_SECRET_ACCESS_KEY,
            )
            ids = client.list_identities().get('Identities', [])
            attrs = (client.get_identity_verification_attributes(Identities=ids)
                     .get('VerificationAttributes', {}) if ids else {})
            for i in ids:
                if attrs.get(i, {}).get('VerificationStatus') != 'Success':
                    continue
                (payload['emails'] if '@' in i else payload['domains']).append(i)
            payload['emails'].sort()
            payload['domains'].sort()
        except Exception as exc:  # noqa: BLE001
            payload['error'] = str(exc)
        return response.Response(payload)


class FeaturedContentViewSet(viewsets.ModelViewSet):
    """Superuser CRUD for the public homepage's curated cards."""
    serializer_class = FeaturedContentSerializer
    permission_classes = [IsSuperUser]
    queryset = FeaturedContent.objects.all()


class PublicFeaturedView(views.APIView):
    """Public, unauthenticated feed of active homepage cards, grouped by section.
    The website fetches this so cards update without a redeploy."""
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        out = {'spotlight': [], 'insights': [], 'engagements': []}
        for item in FeaturedContent.objects.filter(is_active=True):
            out.setdefault(item.section, []).append({
                'kind': item.kind, 'title': item.title, 'subtitle': item.subtitle,
                'image_url': item.image_url, 'link_url': item.link_url,
                'cta_label': item.cta_label, 'date_label': item.date_label,
            })
        return response.Response(out)


class SettingViewSet(viewsets.ModelViewSet):
    queryset = Setting.objects.all()
    serializer_class = SettingSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = 'key'
    lookup_value_regex = '[^/]+'

    def get_queryset(self):
        defaults = {
            'event_display_limit_pc': '2',
            'event_display_limit_mobile': '1',
            'article_display_limit_pc': '3',
            'article_display_limit_mobile': '3',
            'youtube_display_limit_pc': '3',
            'youtube_display_limit_mobile': '2',
        }
        if not Setting.objects.exists():
            Setting.objects.bulk_create([
                Setting(key=k, value=v) for k, v in defaults.items()
            ])
        return Setting.objects.all()


class UserProfileView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return response.Response(serializer.data)

    def put(self, request):
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return response.Response(serializer.data)
        return response.Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
