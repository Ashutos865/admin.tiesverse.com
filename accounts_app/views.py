from django.contrib.auth.models import User, Permission
from django.db.models import Q
from rest_framework import viewsets, permissions, views, response, status
from rest_framework.decorators import action
from rest_framework_simplejwt.views import TokenObtainPairView
from .serializers import (
    UserSerializer, PermissionSerializer, CustomTokenObtainPairSerializer,
    SettingSerializer, EmailTemplateSerializer, EmailCampaignSerializer,
    FeaturedContentSerializer, EmailDraftSerializer, EmailSendLogSerializer,
)
from .models import Setting, EmailTemplate, EmailCampaign, FeaturedContent, EmailDraft, EmailSendLog


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

def _verify_turnstile(secret, token, request):
    """Verify a Cloudflare Turnstile token. Fails CLOSED on an explicit reject,
    but OPEN on a network error to siteverify (so a Cloudflare hiccup can never
    lock admins out — the password is still the primary factor)."""
    if not token:
        return False
    import json
    import urllib.request
    import urllib.parse
    ip = (request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
          or request.META.get('REMOTE_ADDR', ''))
    payload = urllib.parse.urlencode({'secret': secret, 'response': token, 'remoteip': ip}).encode()
    try:
        req = urllib.request.Request('https://challenges.cloudflare.com/turnstile/v0/siteverify', data=payload)
        with urllib.request.urlopen(req, timeout=10) as r:  # noqa: S310 — fixed trusted host
            return bool(json.loads(r.read()).get('success'))
    except Exception:  # noqa: BLE001 — siteverify unreachable: don't lock out logins
        return True


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        from django.conf import settings as dj_settings
        secret = getattr(dj_settings, 'TURNSTILE_SECRET_KEY', '')
        if secret and not _verify_turnstile(secret, request.data.get('cf_turnstile_token') or '', request):
            return response.Response(
                {'detail': 'Human verification failed. Please try again.'}, status=403)
        return super().post(request, *args, **kwargs)


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


# ── In-app password change with email OTP verification ────────────────────────

def _mask_email(email):
    e = (email or '').strip()
    if '@' not in e:
        return e
    local, domain = e.split('@', 1)
    shown = local[:2] + ('*' * max(1, len(local) - 2)) if len(local) > 2 else local
    return f'{shown}@{domain}'


def _send_password_change_otp(user, otp):
    """Email a 6-digit code for confirming a self-service password change."""
    from config.email_utils import send_email
    name = user.get_full_name() or user.username
    accent = '#FE7A00'
    html = (
        '<div style="font-family:Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#101014">'
        f'<div style="background:{accent};padding:20px 28px"><span style="color:#fff;font-size:19px;font-weight:800">tiesverse</span></div>'
        '<div style="padding:28px"><h2 style="margin:0 0 10px;font-size:20px">Confirm your password change</h2>'
        f'<p style="margin:0 0 8px;font-size:15px;color:#4b5563">Hi {name}, use this code to change your Tiesverse password:</p>'
        f'<div style="font-size:34px;font-weight:800;letter-spacing:8px;color:{accent};margin:16px 0">{otp}</div>'
        '<p style="margin:0;color:#6b7280;font-size:13px">This code expires in 10 minutes. If you did not request this, ignore this email and your password stays unchanged.</p>'
        '</div></div>'
    )
    return send_email(user.email, 'Your Tiesverse password change code', html,
                      text_body=f'Your Tiesverse password change code: {otp} (expires in 10 minutes).',
                      enabled=True)


class PasswordChangeRequestView(views.APIView):
    """Authenticated: email the logged-in user a 6-digit code to authorise a
    password change. The code is held in the cache for 10 minutes."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        import secrets
        from django.core.cache import cache
        user = request.user
        if not user.email:
            return response.Response({'error': 'Your account has no email address on file.'}, status=400)
        otp = f'{secrets.randbelow(1000000):06d}'
        cache.set(f'pwdchg:{user.id}', otp, 600)
        cache.set(f'pwdchg_tries:{user.id}', 0, 600)
        _send_password_change_otp(user, otp)
        return response.Response({'sent': True, 'email': _mask_email(user.email)})


class PasswordChangeConfirmView(views.APIView):
    """Authenticated: verify the emailed code + set the new password."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from django.core.cache import cache
        user = request.user
        otp = (request.data.get('otp') or '').strip()
        new_password = request.data.get('new_password') or ''
        if len(new_password) < 8:
            return response.Response({'error': 'Password must be at least 8 characters.'}, status=400)

        key = f'pwdchg:{user.id}'
        expected = cache.get(key)
        if not expected:
            return response.Response({'error': 'No active code. Please request a new one.'}, status=400)
        tries = cache.get(f'pwdchg_tries:{user.id}', 0)
        if tries >= 5:
            cache.delete(key)
            return response.Response({'error': 'Too many attempts. Please request a new code.'}, status=429)
        if otp != expected:
            cache.set(f'pwdchg_tries:{user.id}', tries + 1, 600)
            return response.Response({'error': 'Incorrect code.'}, status=400)

        user.set_password(new_password)
        user.save()
        cache.delete(key)
        cache.delete(f'pwdchg_tries:{user.id}')
        return response.Response({'detail': 'Password changed successfully.'})


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
        from config.email_templates import render_content, normalize_variables
        name = serializer.validated_data.get('name') or 'Custom Template'
        base = 'custom_' + (slugify(name).replace('-', '_') or 'template')
        key, i = base, 2
        while EmailTemplate.objects.filter(key=key).exists():
            key, i = f'{base}_{i}', i + 1
        obj = serializer.save(key=key, is_custom=True, updated_by=self._actor())
        obj.variables = normalize_variables(obj.variables)
        fields = ['variables']
        if not obj.html_mode:
            obj.body_html = render_content(obj.content_json)
            fields.append('body_html')
        obj.save(update_fields=fields)

    def perform_update(self, serializer):
        from config.email_templates import render_content, normalize_variables
        instance = serializer.instance
        # Built-in templates: name + attachment rule stay fixed by code, but
        # variables ARE editable on every template so you can add your own
        # {{tokens}} (each with an optional default) — the no-conflict feature.
        if not instance.is_custom:
            for field in ('name', 'allow_attachment'):
                serializer.validated_data.pop(field, None)
        obj = serializer.save(updated_by=self._actor())
        changed = []
        norm = normalize_variables(obj.variables)
        if norm != obj.variables:
            obj.variables = norm
            changed.append('variables')
        if not obj.html_mode:
            new_html = render_content(obj.content_json)
            if new_html != obj.body_html:
                obj.body_html = new_html
                changed.append('body_html')
        if changed:
            obj.save(update_fields=changed)

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
        from config.email_templates import (SAMPLE_CONTEXT, render_tokens, resolve_from,
                                             normalize_variables)
        from config.email_utils import send_email

        tpl = self.get_object()
        to = (request.data.get('to') or request.user.email or '').strip()
        if not to:
            return response.Response({'error': 'Provide a recipient email address.'}, status=400)

        sample = {v['name']: (SAMPLE_CONTEXT.get(v['name']) or v['default'] or v['label'])
                  for v in normalize_variables(tpl.variables)}
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
        import base64
        from config.email_templates import (render_tokens, render_content, resolve_from,
                                             variable_defaults, unresolved_tokens)
        from config.email_utils import send_email

        tpl = self.get_object()
        recipients = request.data.get('recipients') or []
        email_field = request.data.get('email_field') or 'email'
        variables = request.data.get('variables', tpl.variables) or []
        defaults = variable_defaults(variables)

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

        actor = self._actor()
        from_email_only = from_email or resolve_from(tpl)

        # Create the campaign up front so every per-recipient log can link to it.
        campaign = EmailCampaign.objects.create(
            name=request.data.get('name', ''),
            template_key=tpl.key, template_name=tpl.name,
            subject=render_tokens(subject_src, {}),
            from_name=from_name, from_email=from_email_only,
            body_html=render_tokens(body_src, defaults),   # representative content (defaults filled)
            recipient_count=len(recipients),
            created_by=actor,
        )

        email_re = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
        sent = failed = skipped = 0
        results = []
        seen = set()
        had_attachment = False
        logs = []
        for row in recipients:
            row = row if isinstance(row, dict) else {}
            to = str(row.get(email_field, '')).strip()
            name = str(row.get('name', ''))[:200]
            if not to or not email_re.match(to) or to.lower() in seen:
                skipped += 1
                results.append({'email': to, 'status': 'skipped'})
                logs.append(EmailSendLog(
                    recipient_email=to[:254], recipient_name=name, template_key=tpl.key,
                    template_name=tpl.name, subject=render_tokens(subject_src, {**defaults, **row})[:300],
                    context='campaign', status='skipped',
                    error='duplicate' if to.lower() in seen else 'invalid or blank email',
                    campaign=campaign, sent_by=actor,
                ))
                continue
            seen.add(to.lower())
            # Per-recipient values win; declared-variable defaults fill the gaps;
            # anything still unresolved is stripped (never shipped as {{token}}).
            merged = {**defaults, **row}
            subject = render_tokens(subject_src, merged)
            body = render_tokens(body_src, merged)

            # Optional per-recipient attachment (e.g. a personalised certificate PDF).
            attachments = None
            cert_filename = ''
            att = row.get('attachment')
            if isinstance(att, dict) and att.get('content_base64'):
                try:
                    raw = base64.b64decode(att['content_base64'])
                    cert_filename = (att.get('filename') or 'attachment.pdf').strip() or 'attachment.pdf'
                    attachments = [(cert_filename, raw, att.get('subtype') or 'pdf')]
                    had_attachment = True
                except Exception:  # noqa: BLE001 — a bad attachment must not block the email
                    attachments = None
                    cert_filename = ''

            res = send_email(to, subject, body, from_email=source,
                             attachments=attachments, enabled=True, detailed=True)
            ok = res.get('ok')
            if ok:
                sent += 1
                results.append({'email': to, 'status': 'sent'})
            else:
                failed += 1
                results.append({'email': to, 'status': 'failed'})

            logs.append(EmailSendLog(
                recipient_email=to[:254], recipient_name=name, template_key=tpl.key,
                template_name=tpl.name, subject=subject[:300], context='campaign',
                status='sent' if ok else 'failed', error=(res.get('error') or '')[:400],
                certificate_id=cert_filename[:64], message_id=(res.get('message_id') or '')[:200],
                campaign=campaign, sent_by=actor,
            ))

        # Persist the full per-recipient history in one shot.
        try:
            EmailSendLog.objects.bulk_create(logs, batch_size=200)
        except Exception:  # noqa: BLE001 — history must never break the send
            pass

        campaign.sent_count = sent
        campaign.failed_count = failed
        campaign.skipped_count = skipped
        campaign.had_attachment = had_attachment
        campaign.save(update_fields=['sent_count', 'failed_count', 'skipped_count', 'had_attachment'])

        all_keys = set(defaults) | {
            k for r in recipients if isinstance(r, dict) for k in r
        }
        return response.Response({
            'sent': sent, 'failed': failed, 'skipped': skipped, 'results': results,
            'campaign_id': campaign.id,
            'warnings': unresolved_tokens(variables, all_keys, subject_src, body_src),
        })

    @action(detail=True, methods=['post'], url_path='send-campaign-async')
    def send_campaign_async(self, request, pk=None):
        """Certificate campaigns: the browser sends only recipient DATA (no PDFs),
        and a background job generates + attaches + sends each certificate. Returns
        a campaign id to poll for progress. Scales to any recipient count."""
        from config.email_templates import (render_tokens, render_content, resolve_from,
                                             variable_defaults)

        tpl = self.get_object()
        recipients = request.data.get('recipients') or []
        email_field = request.data.get('email_field') or 'email'
        variables = request.data.get('variables', tpl.variables) or []
        defaults = variable_defaults(variables)

        subject_src = request.data.get('subject', tpl.subject)
        html_mode = request.data.get('html_mode', tpl.html_mode)
        if html_mode:
            body_src = request.data.get('body_html', tpl.body_html)
        else:
            body_src = render_content(request.data.get('content_json', tpl.content_json))

        from_email = (request.data.get('from_email') or '').strip()
        from_name = (request.data.get('from_name') or '').strip()
        if from_email:
            source = f'"{from_name}" <{from_email}>' if from_name else from_email
        else:
            source = resolve_from(tpl)

        cert = request.data.get('certificate') or None

        # Notify address for the completion email = the campaign's From (bare email).
        notify_email = from_email or ''

        # The full job travels on the row itself so the durable worker can run it —
        # and resume it after a restart — without the browser. status='queued': the
        # always-on worker (manage.py run_campaign_worker) picks it up.
        campaign = EmailCampaign.objects.create(
            name=request.data.get('name', ''), template_key=tpl.key, template_name=tpl.name,
            subject=render_tokens(subject_src, {}), from_name=from_name,
            from_email=(from_email or resolve_from(tpl)),
            body_html=render_tokens(body_src, defaults),
            recipient_count=len(recipients), status='queued',
            had_attachment=bool(cert), created_by=self._actor(),
            notify_email=notify_email,
            job_config={
                'recipients': recipients, 'defaults': defaults, 'subject_src': subject_src,
                'body_src': body_src, 'source': source, 'email_field': email_field,
                'actor': self._actor(), 'tpl_key': tpl.key, 'tpl_name': tpl.name, 'certificate': cert,
            },
        )
        return response.Response({'campaign_id': campaign.id, 'status': 'queued',
                                  'total': len(recipients)})

    @action(detail=True, methods=['post'])
    def preview(self, request, pk=None):
        """Return the rendered subject + HTML with sample data (no email sent).
        Accepts unsaved structured `content_json` + `subject` to preview live edits."""
        from config.email_templates import (SAMPLE_CONTEXT, render_tokens, render_content,
                                             normalize_variables, unresolved_tokens)

        tpl = self.get_object()
        subject_src = request.data.get('subject', tpl.subject)
        html_mode = request.data.get('html_mode', tpl.html_mode)
        if html_mode:
            body_src = request.data.get('body_html', tpl.body_html)
        else:
            body_src = render_content(request.data.get('content_json', tpl.content_json))
        variables = request.data.get('variables', tpl.variables) or []
        sample = {v['name']: (SAMPLE_CONTEXT.get(v['name']) or v['default'] or ('{{' + v['name'] + '}}'))
                  for v in normalize_variables(variables)}
        return response.Response({
            'subject': render_tokens(subject_src, sample, keep_unknown=True),
            'html': render_tokens(body_src, sample, keep_unknown=True),
            # Tokens used in the body but neither declared nor defaulted -> would be blank.
            'warnings': unresolved_tokens(variables, [], subject_src, body_src),
        })


class EmailCampaignViewSet(viewsets.ReadOnlyModelViewSet):
    """History of bulk email campaigns."""
    serializer_class = EmailCampaignSerializer
    permission_classes = [IsSuperUser]
    queryset = EmailCampaign.objects.all()

    @action(detail=True, methods=['get'])
    def status(self, request, pk=None):
        """Live progress for a background (certificate) campaign — polled by the UI.
        Includes batch position and a server-computed ETA so the UI can show how
        long is left and reassure the user they can close the tab."""
        from django.utils import timezone
        c = self.get_object()
        processed, total = c.processed_count, c.recipient_count

        # ETA from the observed rate since the job actually started processing.
        eta_seconds = None
        if c.status in ('queued', 'running') and c.started_at and processed > 0 and total > processed:
            elapsed = (timezone.now() - c.started_at).total_seconds()
            if elapsed > 0:
                rate = processed / elapsed          # recipients per second so far
                if rate > 0:
                    eta_seconds = int((total - processed) / rate)

        return response.Response({
            'status': c.status, 'processed': processed, 'total': total,
            'sent': c.sent_count, 'failed': c.failed_count, 'skipped': c.skipped_count,
            'batch_index': c.batch_index, 'batch_total': c.batch_total, 'batch_size': c.batch_size,
            'cancel_requested': c.cancel_requested, 'notify_email': c.notify_email,
            'started_at': c.started_at, 'eta_seconds': eta_seconds,
        })

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Ask the worker to stop this campaign. It halts between recipients;
        anyone already emailed stays sent, and the completion email still goes out.
        A campaign still 'queued' (not yet started) is stopped immediately."""
        c = self.get_object()
        if c.status not in ('queued', 'running'):
            return response.Response({'status': c.status, 'detail': 'Campaign is not in progress.'})
        if c.status == 'queued':
            # Never started — mark it canceled right away so the worker skips it.
            EmailCampaign.objects.filter(id=c.id).update(cancel_requested=True, status='canceled')
        else:
            EmailCampaign.objects.filter(id=c.id).update(cancel_requested=True)
        return response.Response({'status': 'canceling', 'ok': True})

    @action(detail=True, methods=['get'])
    def recipients(self, request, pk=None):
        """Full per-recipient send history for one campaign: who, status, error,
        and delivery outcome (updated by SES bounce/complaint notifications)."""
        camp = self.get_object()
        logs = camp.logs.all().order_by('recipient_email')
        return response.Response({
            'campaign': EmailCampaignSerializer(camp).data,
            'recipients': EmailSendLogSerializer(logs, many=True).data,
        })


class SESNotificationView(views.APIView):
    """Receives AWS SES bounce/complaint/delivery notifications via SNS and updates
    the matching send log so we can see who actually received a mail vs. bounced.
    Public (SNS can't send our JWT); matched strictly by SES MessageId."""
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        import json
        from urllib.request import urlopen
        try:
            body = json.loads(request.body.decode('utf-8') or '{}')
        except Exception:  # noqa: BLE001
            return response.Response({'ok': False}, status=400)

        msg_type = body.get('Type') or request.headers.get('x-amz-sns-message-type', '')

        # Confirm the SNS subscription automatically on first setup. Only ever
        # fetch a genuine AWS SNS host — otherwise this is an SSRF gadget that
        # would let an unauthenticated caller make the server hit internal URLs.
        if msg_type == 'SubscriptionConfirmation':
            import re
            from urllib.parse import urlparse
            sub_url = body.get('SubscribeURL') or ''
            host = (urlparse(sub_url).hostname or '').lower()
            if sub_url.startswith('https://') and re.fullmatch(r'sns\.[a-z0-9-]+\.amazonaws\.com', host):
                try:
                    urlopen(sub_url, timeout=10).read()
                except Exception:  # noqa: BLE001
                    pass
            return response.Response({'ok': True, 'confirmed': True})

        if msg_type == 'Notification':
            try:
                inner = json.loads(body.get('Message') or '{}')
            except Exception:  # noqa: BLE001
                inner = {}
            ntype = (inner.get('notificationType') or inner.get('eventType') or '').lower()
            message_id = ((inner.get('mail') or {}).get('messageId') or '')
            new_status = None
            detail = ''
            if ntype == 'bounce':
                new_status = 'bounced'
                b = inner.get('bounce') or {}
                detail = f"{b.get('bounceType', '')}/{b.get('bounceSubType', '')}".strip('/')
            elif ntype == 'complaint':
                new_status = 'complained'
                detail = (inner.get('complaint') or {}).get('complaintFeedbackType', '')
            elif ntype == 'delivery':
                new_status = 'delivered'

            if new_status and message_id:
                try:
                    qs = EmailSendLog.objects.filter(message_id=message_id)
                    # Don't downgrade a bounce/complaint back to delivered.
                    if new_status == 'delivered':
                        qs = qs.exclude(status__in=['bounced', 'complained'])
                    qs.update(status=new_status, **({'error': detail} if detail else {}))
                except Exception:  # noqa: BLE001
                    pass
        return response.Response({'ok': True})


class EmailDraftViewSet(viewsets.ModelViewSet):
    """Saved-but-unsent Mail Automation setups (drafts)."""
    serializer_class = EmailDraftSerializer
    permission_classes = [IsSuperUser]
    queryset = EmailDraft.objects.all()
    http_method_names = ['get', 'post', 'patch', 'put', 'delete', 'head', 'options']

    def _actor(self):
        return self.request.user.get_full_name() or self.request.user.username

    def perform_create(self, serializer):
        serializer.save(created_by=self._actor())

    def perform_update(self, serializer):
        serializer.save(created_by=self._actor())


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
        from django.core.cache import cache
        cache_key = f'public_email_tpl:{key}'
        cached = cache.get(cache_key)
        if cached is not None:
            return response.Response(cached)
        from config.email_templates import get_template
        tpl = get_template(key)
        if tpl is None:
            return response.Response({'error': 'Unknown template'}, status=404)
        payload = {
            'key': tpl.key, 'subject': tpl.subject, 'body_html': tpl.body_html,
            'from_name': tpl.from_name, 'from_email': tpl.from_email,
        }
        cache.set(cache_key, payload, 300)   # 5 min; template edits are infrequent
        return response.Response(payload)


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


class SiteNavCategoryViewSet(viewsets.ModelViewSet):
    """Superuser CRUD for the website's navigation categories (which WordPress
    categories appear in the site nav, their order + display label). Busts the
    public nav cache on every change so the website reflects edits promptly."""
    from .serializers import SiteNavCategorySerializer as _S
    from .models import SiteNavCategory as _M
    serializer_class = _S
    permission_classes = [IsSuperUser]
    queryset = _M.objects.all()

    def _bust(self):
        from django.core.cache import cache
        cache.delete('public_nav')

    def perform_create(self, serializer):
        serializer.save(); self._bust()

    def perform_update(self, serializer):
        serializer.save(); self._bust()

    def perform_destroy(self, instance):
        instance.delete(); self._bust()


class PublicFeaturedView(views.APIView):
    """Public, unauthenticated feed of active homepage cards, grouped by section.
    The website fetches this so cards update without a redeploy."""
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        from django.core.cache import cache
        cached = cache.get('public_featured')
        if cached is not None:
            return response.Response(cached)
        out = {'spotlight': [], 'insights': [], 'engagements': []}
        for item in FeaturedContent.objects.filter(is_active=True):
            out.setdefault(item.section, []).append({
                'kind': item.kind, 'title': item.title, 'subtitle': item.subtitle,
                'image_url': item.image_url, 'link_url': item.link_url,
                'cta_label': item.cta_label, 'date_label': item.date_label,
            })
        cache.set('public_featured', out, 60)
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
