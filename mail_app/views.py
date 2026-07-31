"""TIES Mail API.

Two audiences:
  * mailbox users  — own PERSONAL box and/or granted SHARED boxes (portal JWT), or
                     a scoped shared-mailbox token (team sign-in, one box only)
  * superadmins    — the is_superuser ROLE: full administration + oversight of every
                     mailbox. Any cross-mailbox access writes a MailAuditLog row.
"""
from django.core import signing
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .models import (
    KIND_PERSONAL, KIND_SHARED, KIND_SYSTEM,
    Mailbox, MailboxGrant, MailMessage, MailAuditLog,
)
from .serializers import (
    MailboxSerializer, MailboxGrantSerializer, MailAuditLogSerializer,
    MailMessageSerializer, MailMessageListSerializer,
)

SHARED_TOKEN_SALT = 'mail_app.shared_login'
SHARED_TOKEN_MAX_AGE = 12 * 60 * 60          # 12 hours


def is_superadmin(user):
    return bool(user and getattr(user, 'is_superuser', False))


# ── scoped shared-mailbox token ──────────────────────────────────────────────

def make_shared_token(mailbox):
    return signing.dumps({'mailbox_id': mailbox.id}, salt=SHARED_TOKEN_SALT)


def mailbox_from_shared_token(request):
    """A team signed in with the mailbox password: grants access to THAT box only."""
    raw = request.META.get('HTTP_X_MAIL_TOKEN', '') or ''
    if not raw:
        return None
    try:
        data = signing.loads(raw, salt=SHARED_TOKEN_SALT, max_age=SHARED_TOKEN_MAX_AGE)
    except Exception:  # noqa: BLE001 — expired/tampered tokens simply grant nothing
        return None
    box = Mailbox.objects.filter(pk=data.get('mailbox_id')).first()
    return box if (box and box.usable) else None


class MailPermission(permissions.BasePermission):
    """Authenticated portal user with at least one mailbox, OR a valid scoped
    shared-mailbox token, OR a superadmin."""
    message = 'You do not have a TIES Mail mailbox.'

    def has_permission(self, request, view):
        if mailbox_from_shared_token(request) is not None:
            return True
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if is_superadmin(user):
            return True
        return services.mailboxes_for_user(user).exists()


class IsSuperAdmin(permissions.BasePermission):
    message = 'Only a superadmin can administer mailboxes.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated
                    and is_superadmin(request.user))


def _accessible_mailbox(request, mailbox_id):
    """Resolve a mailbox the requester may act on, or (None, error_response).
    Superadmin access to someone else's box is allowed but audited by the caller."""
    scoped = mailbox_from_shared_token(request)
    if scoped is not None:
        if str(scoped.id) != str(mailbox_id):
            return None, Response({'error': 'Not found.'}, status=404)
        return scoped, None

    box = Mailbox.objects.filter(pk=mailbox_id).first()
    if not box:
        return None, Response({'error': 'Mailbox not found.'}, status=404)
    if services.can_use_mailbox(request.user, box):
        return box, None
    if is_superadmin(request.user):
        return box, None
    return None, Response({'error': 'Not found.'}, status=404)


# ── who am I / my mailboxes ──────────────────────────────────────────────────

class MyMailboxesView(APIView):
    """GET — the mailboxes this requester can open, plus their role."""
    permission_classes = [MailPermission]

    def get(self, request):
        scoped = mailbox_from_shared_token(request)
        if scoped is not None:
            return Response({
                'mode': 'shared_token',
                'is_superadmin': False,
                'mailboxes': [MailboxSerializer(scoped).data],
            })
        boxes = services.mailboxes_for_user(request.user)
        return Response({
            'mode': 'portal',
            'is_superadmin': is_superadmin(request.user),
            'mailboxes': MailboxSerializer(boxes, many=True).data,
        })


class MailboxAvatarView(APIView):
    """PATCH {avatar_url, display_name?} — the mailbox's own picture/name.
    Deliberately separate from the portal profile picture."""
    permission_classes = [MailPermission]

    def patch(self, request, pk):
        box, denied = _accessible_mailbox(request, pk)
        if denied:
            return denied
        fields = []
        if 'avatar_url' in request.data:
            box.avatar_url = (request.data.get('avatar_url') or '')[:500]
            fields.append('avatar_url')
        if 'display_name' in request.data:
            box.display_name = (request.data.get('display_name') or '')[:120]
            fields.append('display_name')
        if fields:
            box.save(update_fields=fields)
        return Response(MailboxSerializer(box).data)


# ── messages ─────────────────────────────────────────────────────────────────

class MailMessageListView(APIView):
    """GET ?mailbox=<id>&folder=inbox|sent|trash&search= — the message list."""
    permission_classes = [MailPermission]

    def get(self, request):
        mailbox_id = request.query_params.get('mailbox')
        if not mailbox_id:
            return Response({'error': 'mailbox is required.'}, status=400)
        box, denied = _accessible_mailbox(request, mailbox_id)
        if denied:
            return denied

        # A superadmin looking into a box that is not theirs is always recorded.
        if (is_superadmin(request.user) and not services.can_use_mailbox(request.user, box)
                and mailbox_from_shared_token(request) is None):
            services.audit(request.user, 'viewed_mailbox', mailbox=box,
                           note=f'Opened {box.address}.')

        folder = (request.query_params.get('folder') or 'inbox').lower()
        qs = MailMessage.objects.filter(mailbox=box)
        if folder == 'sent':
            qs = qs.filter(direction='OUT', is_deleted=False)
        elif folder == 'trash':
            qs = qs.filter(is_deleted=True)
        else:
            qs = qs.filter(direction='IN', is_deleted=False)

        search = (request.query_params.get('search') or '').strip()
        if search:
            qs = qs.filter(Q(subject__icontains=search) | Q(peer__icontains=search)
                           | Q(snippet__icontains=search))

        rows = qs.select_related('mailbox')[:200]
        return Response({
            'mailbox': MailboxSerializer(box).data,
            'folder': folder,
            'messages': MailMessageListSerializer(rows, many=True).data,
            'unread': MailMessage.objects.filter(mailbox=box, direction='IN',
                                                 read_at__isnull=True,
                                                 is_deleted=False).count(),
        })


class MailMessageDetailView(APIView):
    """GET — full message (marks read). DELETE — soft delete. POST — restore."""
    permission_classes = [MailPermission]

    def _get(self, request, pk):
        msg = MailMessage.objects.filter(pk=pk).select_related('mailbox').first()
        if not msg:
            return None, Response({'error': 'Message not found.'}, status=404)
        box, denied = _accessible_mailbox(request, msg.mailbox_id)
        if denied:
            return None, denied
        return msg, None

    def get(self, request, pk):
        msg, denied = self._get(request, pk)
        if denied:
            return denied
        if msg.read_at is None and msg.direction == 'IN':
            msg.read_at = timezone.now()
            msg.save(update_fields=['read_at'])
        if (is_superadmin(request.user)
                and not services.can_use_mailbox(request.user, msg.mailbox)
                and mailbox_from_shared_token(request) is None):
            services.audit(request.user, 'read_message', mailbox=msg.mailbox, message=msg,
                           note=f'Read "{msg.subject[:80]}".')
        thread = MailMessage.objects.filter(
            mailbox=msg.mailbox, thread_key=msg.thread_key, is_deleted=False,
        ).order_by('created_at') if msg.thread_key else []
        return Response({
            'message': MailMessageSerializer(msg).data,
            'thread': MailMessageSerializer(thread, many=True).data,
        })

    def delete(self, request, pk):
        msg, denied = self._get(request, pk)
        if denied:
            return denied
        msg.is_deleted = True
        msg.deleted_at = timezone.now()
        msg.save(update_fields=['is_deleted', 'deleted_at'])
        if (is_superadmin(request.user)
                and not services.can_use_mailbox(request.user, msg.mailbox)):
            services.audit(request.user, 'deleted_message', mailbox=msg.mailbox, message=msg,
                           note=f'Deleted "{msg.subject[:80]}".')
        return Response({'ok': True})

    def post(self, request, pk):
        msg, denied = self._get(request, pk)
        if denied:
            return denied
        msg.is_deleted = False
        msg.deleted_at = None
        msg.save(update_fields=['is_deleted', 'deleted_at'])
        return Response(MailMessageSerializer(msg).data)


class MailSendView(APIView):
    """POST {mailbox, to, cc?, subject, body, in_reply_to?, thread_key?}"""
    permission_classes = [MailPermission]

    def post(self, request):
        box, denied = _accessible_mailbox(request, request.data.get('mailbox'))
        if denied:
            return denied
        # Superadmins may oversee any box, but may not SEND as one they don't hold.
        scoped = mailbox_from_shared_token(request)
        if scoped is None and not services.can_use_mailbox(request.user, box):
            return Response({'error': 'You cannot send from this mailbox.'}, status=403)

        msg, error = services.send_mail_message(
            box,
            to=request.data.get('to'),
            cc=request.data.get('cc'),
            subject=request.data.get('subject'),
            body_text=request.data.get('body'),
            actor=request.user if getattr(request.user, 'is_authenticated', False) else None,
            in_reply_to=request.data.get('in_reply_to', '') or '',
            thread_key=request.data.get('thread_key', '') or '',
        )
        if error:
            return Response({'error': error,
                             'message': MailMessageSerializer(msg).data if msg else None},
                            status=400)
        return Response(MailMessageSerializer(msg).data, status=201)


# ── shared-mailbox password sign-in ──────────────────────────────────────────

class SharedMailboxLoginView(APIView):
    """POST {address, password} → a scoped token for that ONE mailbox.

    Lets a team sign in to e.g. nimble@mail.tiesverse.com without a portal account.
    The token never grants portal access or any other mailbox.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'login'

    def post(self, request):
        address = (request.data.get('address') or '').strip().lower()
        password = request.data.get('password') or ''
        generic = Response({'error': 'Invalid mailbox address or password.'}, status=400)
        if not address or not password:
            return generic
        box = Mailbox.objects.filter(address__iexact=address, kind=KIND_SHARED,
                                     is_active=True, is_archived=False).first()
        # Same generic error whether the box is missing or the password is wrong.
        if not box or not box.check_access_password(password):
            return generic
        services.audit(None, 'shared_login', mailbox=box,
                       note=f'Password sign-in to {box.address}.')
        return Response({
            'token': make_shared_token(box),
            'mailbox': MailboxSerializer(box).data,
        })


# ── superadmin administration ────────────────────────────────────────────────

class MailboxAdminViewSet(viewsets.ModelViewSet):
    """Create/manage every mailbox. Superadmin ROLE only — promoting a colleague to
    superadmin gives them these powers immediately."""
    serializer_class = MailboxSerializer
    permission_classes = [IsSuperAdmin]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = Mailbox.objects.all()
        kind = self.request.query_params.get('kind')
        if kind:
            qs = qs.filter(kind=kind.upper())
        if (self.request.query_params.get('archived') or '').lower() in ('1', 'true'):
            qs = qs.filter(is_archived=True)
        return qs

    def perform_create(self, serializer):
        box = serializer.save(created_by_user=self.request.user)
        # A PERSONAL box is bound to the member's portal login so they can open it.
        if box.kind == KIND_PERSONAL and box.member_id and not box.user_id:
            try:
                from career_app.models import MemberAccount
                acct = MemberAccount.objects.filter(submission_id=box.member_id).only('user').first()
                if acct and acct.user_id:
                    box.user_id = acct.user_id
                    box.save(update_fields=['user'])
            except Exception:  # noqa: BLE001 — never block creation on this lookup
                pass
        services.audit(self.request.user, 'created_mailbox', mailbox=box,
                       note=f'Created {box.address} ({box.kind}).')

    def perform_update(self, serializer):
        box = serializer.save()
        services.audit(self.request.user, 'updated_mailbox', mailbox=box,
                       note=f'Updated {box.address}.')

    def perform_destroy(self, instance):
        # Never hard-delete a mailbox — archive it so its history survives.
        instance.is_archived = True
        instance.is_active = False
        instance.save(update_fields=['is_archived', 'is_active'])
        services.audit(self.request.user, 'archived_mailbox', mailbox=instance,
                       note=f'Archived {instance.address}.')


class MailboxPasswordView(APIView):
    """POST {password} — set/rotate a SHARED mailbox password; empty clears it."""
    permission_classes = [IsSuperAdmin]

    def post(self, request, pk):
        box = Mailbox.objects.filter(pk=pk).first()
        if not box:
            return Response({'error': 'Mailbox not found.'}, status=404)
        if box.kind != KIND_SHARED:
            return Response({'error': 'Only shared mailboxes can have a password.'}, status=400)
        raw = request.data.get('password') or ''
        if raw and len(raw) < 8:
            return Response({'error': 'Password must be at least 8 characters.'}, status=400)
        box.set_access_password(raw)
        box.save(update_fields=['access_password'])
        services.audit(request.user, 'set_password', mailbox=box,
                       note=('Set/rotated' if raw else 'Cleared') + f' password for {box.address}.')
        return Response({'ok': True, 'has_access_password': box.has_access_password})


class MailboxGrantView(APIView):
    """GET — who can use this shared box. POST {user} — grant. DELETE ?user= — revoke."""
    permission_classes = [IsSuperAdmin]

    def get(self, request, pk):
        rows = MailboxGrant.objects.filter(mailbox_id=pk)
        return Response(MailboxGrantSerializer(rows, many=True).data)

    def post(self, request, pk):
        box = Mailbox.objects.filter(pk=pk).first()
        if not box:
            return Response({'error': 'Mailbox not found.'}, status=404)
        user_id = request.data.get('user')
        if not user_id:
            return Response({'error': 'user is required.'}, status=400)
        grant, created = MailboxGrant.objects.get_or_create(
            mailbox=box, user_id=user_id,
            defaults={'granted_by_user': request.user},
        )
        if created:
            services.audit(request.user, 'granted_access', mailbox=box,
                           note=f'Granted access to user {user_id}.')
        return Response(MailboxGrantSerializer(grant).data,
                        status=201 if created else 200)

    def delete(self, request, pk):
        user_id = request.query_params.get('user')
        if not user_id:
            return Response({'error': 'user is required.'}, status=400)
        MailboxGrant.objects.filter(mailbox_id=pk, user_id=user_id).delete()
        services.audit(request.user, 'revoked_access',
                       mailbox=Mailbox.objects.filter(pk=pk).first(),
                       note=f'Revoked access for user {user_id}.')
        return Response({'ok': True})


class MailAuditLogView(APIView):
    """GET ?mailbox= — the audit trail. Superadmin only."""
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        qs = MailAuditLog.objects.all()
        mailbox_id = request.query_params.get('mailbox')
        if mailbox_id:
            qs = qs.filter(mailbox_id=mailbox_id)
        return Response(MailAuditLogSerializer(qs.select_related('mailbox')[:200], many=True).data)
