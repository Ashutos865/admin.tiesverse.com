"""TIES Mail API.

Two audiences:
  * mailbox users  — own PERSONAL box and/or granted SHARED boxes (portal JWT), or
                     a scoped shared-mailbox token (team sign-in, one box only)
  * superadmins    — the is_superuser ROLE: full administration + oversight of every
                     mailbox. Any cross-mailbox access writes a MailAuditLog row.
"""
import uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core import signing
from django.db.models import Count, Q
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import permissions, status, viewsets
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from . import bulk, sanitize, services, storage
from .models import (
    KIND_PERSONAL, KIND_SHARED, KIND_SYSTEM,
    Mailbox, MailboxGrant, MailMessage, MailAuditLog,
    MailAttachment, MailBulkJob, MailDraft, MailNote, MailSsoTicket,
)
from .serializers import (
    MailboxSerializer, MailboxGrantSerializer, MailAuditLogSerializer,
    MailMessageSerializer, MailMessageListSerializer,
    MailAttachmentSerializer, MailBulkJobSerializer, MailDraftSerializer,
    MailNoteSerializer,
)

SHARED_TOKEN_SALT = 'mail_app.shared_login'
SHARED_TOKEN_MAX_AGE = 12 * 60 * 60          # 12 hours


def is_superadmin(user):
    """May this user administer TIES Mail?

    Two ways in, and the distinction matters. `is_superuser` is checked in 63
    places across the portal — finance, HR, careers, docs — so granting it to
    hand out mailbox administration handed over everything else too. A MailAdmin
    row grants mail administration ALONE.

    The name is kept because it is what the whole app already calls this gate;
    what changed is that it is no longer only the portal superuser.
    """
    if not (user and getattr(user, 'is_authenticated', False)):
        return False
    if getattr(user, 'is_superuser', False):
        return True
    try:
        from .models import MailAdmin
        return MailAdmin.objects.filter(user_id=user.id).exists()
    except Exception:  # noqa: BLE001 — a lookup failure must never grant access
        return False


# ── shared-mailbox password login: withdrawn ─────────────────────────────────
#
# A team mailbox used to carry its own password, so a whole team could sign in
# to that one box without portal accounts. That is gone: a team mailbox is now
# reached only by granting it to someone's normal account.
#
# Two reasons. A password shared by a team is a password that leaks and can
# never be un-shared without rotating it for everyone; and every action taken
# through it was attributable only to "the team", so the audit log could not say
# who actually read or sent a message.
#
# This function is kept — rather than being torn out of the twenty-odd handlers
# that call it — and now always returns None. No token can be issued (the login
# endpoint is gone) and none would be honoured if one were replayed, so every
# one of those call sites simply takes its authenticated-user path.

def mailbox_from_shared_token(request):  # noqa: ARG001 — signature kept for callers
    """Always None. Shared-password sign-in has been withdrawn; see above."""
    return None


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
    message = 'Only a mail administrator can do this.'

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
                'user': {'name': scoped.display_name or scoped.address, 'email': scoped.address},
                'mailboxes': [MailboxSerializer(scoped, context={'request': request}).data],
            })
        boxes = services.mailboxes_for_user(request.user)
        user = request.user
        return Response({
            'mode': 'portal',
            # Administers mail — either a portal superuser or an appointed mail
            # admin. The name is kept because the whole app reads it already.
            'is_superadmin': is_superadmin(user),
            # May appoint other administrators. Any mail admin can — the role
            # confers mail administration and nothing else, so widening it
            # cannot reach finance, HR or the rest of the portal.
            'can_manage_admins': is_superadmin(user),
            'user': {
                'name': user.get_full_name() or user.username,
                'email': user.email or '',
            },
            'mailboxes': MailboxSerializer(boxes, many=True, context={'request': request}).data,
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
        now = timezone.now()
        qs = MailMessage.objects.filter(mailbox=box)
        if folder == 'sent':
            qs = qs.filter(direction='OUT', is_deleted=False, status='sent')
        elif folder == 'trash':
            qs = qs.filter(is_deleted=True)
        elif folder == 'starred':
            qs = qs.filter(starred=True, is_deleted=False)
        elif folder == 'snoozed':
            qs = qs.filter(snoozed_until__gt=now, is_deleted=False)
        elif folder == 'scheduled':
            qs = qs.filter(direction='OUT', status='queued', is_deleted=False)
        else:
            # Inbox hides what is snoozed until its time comes back around.
            qs = qs.filter(direction='IN', is_deleted=False).filter(
                Q(snoozed_until__isnull=True) | Q(snoozed_until__lte=now))
            if (request.query_params.get('filter') or '').lower() == 'unread':
                qs = qs.filter(read_at__isnull=True)

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
        if (is_superadmin(request.user)
                and not services.can_use_mailbox(request.user, msg.mailbox)):
            services.audit(request.user, 'restored_message', mailbox=msg.mailbox, message=msg,
                           note=f'Restored "{msg.subject[:80]}".')
        return Response(MailMessageSerializer(msg).data)


class MailMessageFlagsView(APIView):
    """POST {starred?, snoozed_until?, read?} — any subset. The small toggles."""
    permission_classes = [MailPermission]

    def post(self, request, pk):
        msg = MailMessage.objects.filter(pk=pk).select_related('mailbox').first()
        if not msg:
            return Response({'error': 'Message not found.'}, status=404)
        _, denied = _accessible_mailbox(request, msg.mailbox_id)
        if denied:
            return denied

        fields = []
        if 'starred' in request.data:
            msg.starred = bool(request.data.get('starred'))
            fields.append('starred')
        if 'read' in request.data:
            # Explicitly marking unread is a real action, not an absence of one.
            msg.read_at = timezone.now() if request.data.get('read') else None
            fields.append('read_at')
        if 'snoozed_until' in request.data:
            raw = request.data.get('snoozed_until')
            if not raw:
                msg.snoozed_until = None
            else:
                when = parse_datetime(str(raw))
                if when is None:
                    return Response({'error': 'Could not read that snooze time.'}, status=400)
                if timezone.is_naive(when):
                    when = timezone.make_aware(when)
                msg.snoozed_until = when
            fields.append('snoozed_until')

        if not fields:
            return Response({'error': 'Nothing to change.'}, status=400)
        msg.save(update_fields=fields)
        return Response(MailMessageSerializer(msg).data)


class MailMessageCancelView(APIView):
    """POST — undo a send that has not gone out yet.

    The message returns as a draft rather than vanishing: someone who presses
    Undo wants to keep writing, not to lose what they wrote.
    """
    permission_classes = [MailPermission]

    def post(self, request, pk):
        msg = MailMessage.objects.filter(pk=pk).select_related('mailbox').first()
        if not msg:
            return Response({'error': 'Message not found.'}, status=404)
        _, denied = _accessible_mailbox(request, msg.mailbox_id)
        if denied:
            return denied

        # Only a message still sitting in the queue can be stopped. Anything else
        # is already with SES, and no API can recall an email that has left.
        stopped = MailMessage.objects.filter(pk=pk, status='queued').update(status='canceled')
        if not stopped:
            msg.refresh_from_db()
            return Response(
                {'error': 'This message has already been sent and cannot be recalled.',
                 'status': msg.status}, status=409)

        msg.refresh_from_db()
        draft = MailDraft.objects.create(
            mailbox=msg.mailbox, to=msg.to, cc=msg.cc, bcc=msg.bcc,
            subject=msg.subject, body_text=msg.body_text,
            in_reply_to=msg.in_reply_to, thread_key=msg.thread_key,
            created_by_user=request.user if getattr(request.user, 'is_authenticated', False) else None,
        )
        msg.attachments.update(message=None, draft=draft)
        return Response({'ok': True, 'draft': MailDraftSerializer(draft).data})


class MailMessageReleaseView(APIView):
    """POST — send a queued message now, without waiting for the cron tick.

    Called by the composer once its undo window closes, so an ordinary send is
    immediate; the cron flusher remains the safety net for a closed tab.
    """
    permission_classes = [MailPermission]

    def post(self, request, pk):
        msg = MailMessage.objects.filter(pk=pk).select_related('mailbox').first()
        if not msg:
            return Response({'error': 'Message not found.'}, status=404)
        _, denied = _accessible_mailbox(request, msg.mailbox_id)
        if denied:
            return denied

        claimed = services.claim_for_sending(pk)
        if claimed is None:
            msg.refresh_from_db()
            # Not an error: the cron worker simply got there first.
            return Response(MailMessageSerializer(msg).data)
        ok, error = services.deliver(claimed)
        claimed.refresh_from_db()
        if not ok:
            return Response({'error': error,
                             'message': MailMessageSerializer(claimed).data}, status=400)
        return Response(MailMessageSerializer(claimed).data)


# How long a sender has to change their mind. The composer shows an Undo toast
# for the same duration and calls release/ when it closes.
UNDO_WINDOW_SECONDS = 6


class MailSendView(APIView):
    """POST {mailbox, to, cc?, bcc?, subject, body, attachments?, send_at?, draft?}

    Always queues; nothing goes straight to SES. A normal send is queued a few
    seconds out so it can be undone, and the composer releases it when that
    window closes.
    """
    permission_classes = [MailPermission]

    def post(self, request):
        box, denied = _accessible_mailbox(request, request.data.get('mailbox'))
        if denied:
            return denied
        # Superadmins may oversee any box, but may not SEND as one they don't hold.
        scoped = mailbox_from_shared_token(request)
        if scoped is None and not services.can_use_mailbox(request.user, box):
            return Response({'error': 'You cannot send from this mailbox.'}, status=403)

        send_at = timezone.now() + timedelta(seconds=UNDO_WINDOW_SECONDS)
        raw_when = request.data.get('send_at')
        if raw_when:
            when = parse_datetime(str(raw_when))
            if when is None:
                return Response({'error': 'Could not read that send time.'}, status=400)
            if timezone.is_naive(when):
                when = timezone.make_aware(when)
            send_at = when

        attachments, err = _collect_attachments(request, box)
        if err:
            return err

        # Whatever the composer sends is cleaned here, before it is stored or
        # mailed: this HTML ends up rendering in other people's clients.
        raw_html = request.data.get('body_html') or ''
        safe_html = sanitize.clean_html(raw_html) if raw_html else ''
        plain = request.data.get('body')
        if safe_html and not plain:
            plain = sanitize.html_to_text(safe_html)

        msg, error = services.queue_mail_message(
            box,
            to=request.data.get('to'),
            cc=request.data.get('cc'),
            bcc=request.data.get('bcc'),
            subject=request.data.get('subject'),
            body_text=plain,
            body_html=safe_html,
            actor=request.user if getattr(request.user, 'is_authenticated', False) else None,
            in_reply_to=request.data.get('in_reply_to', '') or '',
            thread_key=request.data.get('thread_key', '') or '',
            send_at=send_at,
            attachments=attachments,
        )
        if error:
            return Response({'error': error,
                             'message': MailMessageSerializer(msg).data if msg else None},
                            status=400)

        # The draft has become a message; keeping it would show the same text in
        # two places.
        draft_id = request.data.get('draft')
        if draft_id:
            MailDraft.objects.filter(pk=draft_id, mailbox=box).delete()

        return Response(MailMessageSerializer(msg).data, status=201)


def _collect_attachments(request, box):
    """Resolve posted attachment ids to rows this caller may actually use.

    Returns (list, error_response). An id belonging to someone else's draft is
    treated as not found rather than forbidden — the API never confirms that a
    file it will not show you exists.
    """
    ids = request.data.get('attachments') or []
    if not isinstance(ids, (list, tuple)):
        return [], Response({'error': 'attachments must be a list of ids.'}, status=400)
    if not ids:
        return [], None

    rows = list(MailAttachment.objects.filter(pk__in=[i for i in ids if str(i).isdigit()]))
    if len(rows) != len(ids):
        return [], Response({'error': 'One of those attachments is no longer available.'},
                            status=404)
    for att in rows:
        owning_box = None
        if att.draft_id:
            owning_box = MailDraft.objects.filter(pk=att.draft_id).values_list('mailbox_id', flat=True).first()
        elif att.message_id:
            owning_box = MailMessage.objects.filter(pk=att.message_id).values_list('mailbox_id', flat=True).first()
        if owning_box is not None and owning_box != box.id:
            return [], Response({'error': 'One of those attachments is no longer available.'},
                                status=404)

    total = sum(a.size or 0 for a in rows)
    if total > storage.MAX_TOTAL_BYTES:
        mb = storage.MAX_TOTAL_BYTES // (1024 * 1024)
        return [], Response(
            {'error': f'Attachments total {total // (1024*1024)} MB — the limit is {mb} MB.'},
            status=400)
    return rows, None


# ── mail administration ──────────────────────────────────────────────────────

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
        """Record WHAT changed, not merely that something did — an audit line
        reading 'Updated x@…' answers none of the questions it gets asked."""
        before = Mailbox.objects.filter(pk=serializer.instance.pk).first()
        was = {
            'display_name': before.display_name, 'address': before.address,
            'daily_send_limit': before.daily_send_limit,
            'is_active': before.is_active, 'is_archived': before.is_archived,
            'user': before.user_id, 'member': before.member_id,
        } if before else {}

        box = serializer.save()

        labels = {
            'display_name': 'name', 'address': 'address',
            'daily_send_limit': 'daily limit', 'is_active': 'active',
            'is_archived': 'archived',
        }
        changes = []
        for field, label in labels.items():
            old, new = was.get(field), getattr(box, field)
            if old != new:
                changes.append(f'{label} {old!r} → {new!r}')

        # Reassignment is its own action: it hands someone else's mail to a new
        # person, which is not the same kind of edit as a rename.
        if was.get('user') != box.user_id or was.get('member') != box.member_id:
            from .serializers import _user_label
            who = (getattr(box.member, 'candidate_name', '') if box.member_id
                   else _user_label(box.user_id)) or 'nobody'
            services.audit(self.request.user, 'updated_mailbox_owner', mailbox=box,
                           note=f'{box.address} now belongs to {who}.')

        if changes:
            services.audit(self.request.user, 'updated_mailbox', mailbox=box,
                           note=f'{box.address}: ' + '; '.join(changes))

    def perform_destroy(self, instance):
        # Never hard-delete a mailbox — archive it so its history survives.
        instance.is_archived = True
        instance.is_active = False
        instance.save(update_fields=['is_archived', 'is_active'])
        services.audit(self.request.user, 'archived_mailbox', mailbox=instance,
                       note=f'Archived {instance.address}.')


class MailboxPasswordView(APIView):
    """Gone. A team mailbox no longer has a password of its own.

    Kept as a route so an old tab still holding the button gets a sentence
    explaining what to do instead, rather than a bare 404. It also CLEARS any
    password left on the box, so pressing it retires the old credential rather
    than leaving it lying in the database.
    """
    permission_classes = [IsSuperAdmin]

    def post(self, request, pk):
        box = Mailbox.objects.filter(pk=pk).first()
        if not box:
            return Response({'error': 'Mailbox not found.'}, status=404)
        if box.access_password:
            box.set_access_password('')
            box.save(update_fields=['access_password'])
            services.audit(request.user, 'set_password', mailbox=box,
                           note=f'Cleared the retired password on {box.address}.')
        return Response(
            {'error': 'Team mailboxes no longer have their own password. '
                      'Use Access to give people the mailbox instead.'},
            status=400)


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


class MailAdminRoleView(APIView):
    """GET — who administers mail. POST {user} — appoint. DELETE ?user= — remove.

    Reading the list is open to any mail admin (knowing who else can reach your
    mail is not a secret worth keeping); changing it is superuser-only.
    """
    permission_classes = [IsSuperAdmin]

    def _user_label(self, user_id):
        User = get_user_model()
        u = User.objects.filter(pk=user_id).only(
            'username', 'first_name', 'last_name', 'email').first()
        if not u:
            return ('', '')
        return ((u.get_full_name() or u.username or '').strip(), u.email or '')

    def get(self, request):
        from .models import MailAdmin
        rows = list(MailAdmin.objects.all())
        User = get_user_model()
        # Superusers administer mail implicitly and hold no row, so they are
        # listed too — otherwise the page would claim they cannot do what they
        # plainly can.
        supers = list(User.objects.filter(is_superuser=True, is_active=True)
                      .only('id', 'username', 'first_name', 'last_name', 'email'))
        out = [{
            'id': f'super-{u.id}', 'user': u.id,
            'user_name': (u.get_full_name() or u.username or '').strip(),
            'user_email': u.email or '',
            'source': 'superuser', 'removable': False,
            'granted_by_name': '', 'created_at': None,
        } for u in supers]
        seen = {u.id for u in supers}
        for r in rows:
            if r.user_id in seen:
                continue          # a superuser who also holds a row: listed once
            out.append({
                'id': r.id, 'user': r.user_id,
                'user_name': r.user_name, 'user_email': r.user_email,
                'source': 'granted', 'removable': True,
                'granted_by_name': r.granted_by_name, 'created_at': r.created_at,
            })
        return Response(out)

    def post(self, request):
        # Any mail admin may appoint another. The role only ever confers mail
        # administration, so widening it cannot leak finance, HR or the portal —
        # and every appointment is audited with who made it.
        from .models import MailAdmin
        user_id = request.data.get('user')
        if not user_id:
            return Response({'error': 'user is required.'}, status=400)
        User = get_user_model()
        target = User.objects.filter(pk=user_id, is_active=True).first()
        if not target:
            return Response({'error': 'That person was not found.'}, status=400)
        if target.is_superuser:
            return Response(
                {'error': 'Superadmins already administer mail.'}, status=400)

        name, email = self._user_label(target.id)
        row, created = MailAdmin.objects.get_or_create(
            user_id=target.id,
            defaults={
                'user_name': name, 'user_email': email,
                'granted_by_user': request.user,
                'granted_by_name': (request.user.get_full_name()
                                    or request.user.username or ''),
                'note': (request.data.get('note') or '')[:255],
            },
        )
        if created:
            services.audit(request.user, 'granted_admin',
                           note=f'Made {name or target.username} a mail administrator.')
        return Response({
            'id': row.id, 'user': row.user_id, 'user_name': row.user_name,
            'user_email': row.user_email, 'source': 'granted', 'removable': True,
            'granted_by_name': row.granted_by_name, 'created_at': row.created_at,
        }, status=201 if created else 200)

    def delete(self, request):
        from .models import MailAdmin
        user_id = request.query_params.get('user')
        if not user_id:
            return Response({'error': 'user is required.'}, status=400)
        # Removing your own row would be harmless for a superuser (the flag
        # still admits them) but confusing, so say so rather than no-op.
        if str(user_id) == str(request.user.id):
            return Response({'error': 'You cannot remove your own access.'}, status=400)
        row = MailAdmin.objects.filter(user_id=user_id).first()
        if not row:
            return Response({'error': 'They are not a mail administrator.'}, status=404)
        name = row.user_name
        row.delete()
        services.audit(request.user, 'revoked_admin',
                       note=f'Removed mail administration from {name or user_id}.')
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


# ── drafts ───────────────────────────────────────────────────────────────────

class MailDraftListView(APIView):
    """GET ?mailbox= — this mailbox's drafts. POST — start one."""
    permission_classes = [MailPermission]

    def get(self, request):
        box, denied = _accessible_mailbox(request, request.query_params.get('mailbox'))
        if denied:
            return denied
        rows = MailDraft.objects.filter(mailbox=box).prefetch_related('attachments')[:200]
        return Response({'drafts': MailDraftSerializer(rows, many=True).data})

    def post(self, request):
        box, denied = _accessible_mailbox(request, request.data.get('mailbox'))
        if denied:
            return denied
        draft = MailDraft.objects.create(
            mailbox=box,
            to=services._clean_recipients(request.data.get('to')),
            cc=services._clean_recipients(request.data.get('cc')),
            bcc=services._clean_recipients(request.data.get('bcc')),
            subject=(request.data.get('subject') or '')[:500],
            body_text=request.data.get('body_text') or request.data.get('body') or '',
            body_html=sanitize.clean_html(request.data.get('body_html') or ''),
            in_reply_to=request.data.get('in_reply_to', '') or '',
            thread_key=request.data.get('thread_key', '') or '',
            created_by_user=request.user if getattr(request.user, 'is_authenticated', False) else None,
        )
        return Response(MailDraftSerializer(draft).data, status=201)


class MailDraftDetailView(APIView):
    """GET / PATCH (the autosave target) / DELETE one draft."""
    permission_classes = [MailPermission]

    def _get(self, request, pk):
        draft = MailDraft.objects.filter(pk=pk).select_related('mailbox').first()
        if not draft:
            return None, Response({'error': 'Draft not found.'}, status=404)
        _, denied = _accessible_mailbox(request, draft.mailbox_id)
        if denied:
            return None, denied
        return draft, None

    def get(self, request, pk):
        draft, denied = self._get(request, pk)
        return denied or Response(MailDraftSerializer(draft).data)

    def patch(self, request, pk):
        draft, denied = self._get(request, pk)
        if denied:
            return denied
        data = request.data
        if 'to' in data:
            draft.to = services._clean_recipients(data.get('to'))
        if 'cc' in data:
            draft.cc = services._clean_recipients(data.get('cc'))
        if 'bcc' in data:
            draft.bcc = services._clean_recipients(data.get('bcc'))
        if 'subject' in data:
            draft.subject = (data.get('subject') or '')[:500]
        if 'body_text' in data or 'body' in data:
            draft.body_text = data.get('body_text') or data.get('body') or ''
        if 'body_html' in data:
            draft.body_html = sanitize.clean_html(data.get('body_html') or '')
        draft.save()
        return Response(MailDraftSerializer(draft).data)

    def delete(self, request, pk):
        draft, denied = self._get(request, pk)
        if denied:
            return denied
        # Files uploaded to a draft nobody sent are of no use to anyone.
        for att in draft.attachments.all():
            storage.delete(att.storage_key)
        draft.delete()
        return Response({'ok': True})


# ── attachments ──────────────────────────────────────────────────────────────

class MailAttachmentUploadView(APIView):
    """POST multipart {file, draft?} — store a file and return its id."""
    permission_classes = [MailPermission]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        upload = request.FILES.get('file')
        if not upload:
            return Response({'error': 'No file was uploaded.'}, status=400)
        if upload.size > storage.MAX_FILE_BYTES:
            mb = storage.MAX_FILE_BYTES // (1024 * 1024)
            return Response({'error': f'"{upload.name}" is larger than {mb} MB.'}, status=400)

        draft = None
        draft_id = request.data.get('draft')
        if draft_id:
            draft = MailDraft.objects.filter(pk=draft_id).select_related('mailbox').first()
            if not draft:
                return Response({'error': 'Draft not found.'}, status=404)
            _, denied = _accessible_mailbox(request, draft.mailbox_id)
            if denied:
                return denied
            used = sum(a.size or 0 for a in draft.attachments.all())
            if used + upload.size > storage.MAX_TOTAL_BYTES:
                mb = storage.MAX_TOTAL_BYTES // (1024 * 1024)
                return Response(
                    {'error': f'That would take this message past the {mb} MB attachment limit.'},
                    status=400)

        filename = storage.safe_filename(upload.name)
        content_type = storage.guess_content_type(filename, getattr(upload, 'content_type', ''))
        key = storage.build_key(filename)
        try:
            storage.put(key, upload.read(), content_type=content_type)
        except Exception as exc:  # noqa: BLE001
            return Response({'error': f'Could not store that file: {exc}'[:300]}, status=502)

        att = MailAttachment.objects.create(
            draft=draft, filename=filename, size=upload.size, content_type=content_type,
            storage_key=key,
            uploaded_by_user=request.user if getattr(request.user, 'is_authenticated', False) else None,
        )
        return Response(MailAttachmentSerializer(att).data, status=201)


class MailAttachmentDetailView(APIView):
    """GET — download the file. DELETE — remove one still on a draft."""
    permission_classes = [MailPermission]

    def _get(self, request, pk):
        att = MailAttachment.objects.filter(pk=pk).first()
        if not att:
            return None, Response({'error': 'Attachment not found.'}, status=404)
        box_id = None
        if att.message_id:
            box_id = MailMessage.objects.filter(pk=att.message_id).values_list('mailbox_id', flat=True).first()
        elif att.draft_id:
            box_id = MailDraft.objects.filter(pk=att.draft_id).values_list('mailbox_id', flat=True).first()
        if box_id is None:
            return None, Response({'error': 'Attachment not found.'}, status=404)
        _, denied = _accessible_mailbox(request, box_id)
        if denied:
            return None, denied
        return att, None

    def get(self, request, pk):
        att, denied = self._get(request, pk)
        if denied:
            return denied
        try:
            data = storage.get(att.storage_key)
        except Exception:  # noqa: BLE001
            return Response({'error': 'That file could not be retrieved.'}, status=502)
        resp = HttpResponse(data, content_type=att.content_type or 'application/octet-stream')
        resp['Content-Disposition'] = f'attachment; filename="{att.filename}"'
        resp['Content-Length'] = str(len(data))
        return resp

    def delete(self, request, pk):
        att, denied = self._get(request, pk)
        if denied:
            return denied
        if att.message_id:
            return Response({'error': 'This file is part of a sent message.'}, status=400)
        storage.delete(att.storage_key)
        att.delete()
        return Response({'ok': True})


# ── internal notes ───────────────────────────────────────────────────────────

class MailNoteView(APIView):
    """GET ?mailbox=&thread_key= / POST — comments the team sees and nobody emails."""
    permission_classes = [MailPermission]

    def get(self, request):
        box, denied = _accessible_mailbox(request, request.query_params.get('mailbox'))
        if denied:
            return denied
        thread_key = (request.query_params.get('thread_key') or '').strip()
        if not thread_key:
            return Response({'error': 'thread_key is required.'}, status=400)
        rows = MailNote.objects.filter(mailbox=box, thread_key=thread_key)
        return Response({'notes': MailNoteSerializer(rows, many=True).data})

    def post(self, request):
        box, denied = _accessible_mailbox(request, request.data.get('mailbox'))
        if denied:
            return denied
        thread_key = (request.data.get('thread_key') or '').strip()
        body = (request.data.get('body') or '').strip()
        if not thread_key:
            return Response({'error': 'thread_key is required.'}, status=400)
        if not body:
            return Response({'error': 'Write something first.'}, status=400)

        author = 'Team'
        if getattr(request.user, 'is_authenticated', False):
            author = request.user.get_full_name() or request.user.username
        elif mailbox_from_shared_token(request) is not None:
            author = box.display_name or box.address

        note = MailNote.objects.create(
            mailbox=box, thread_key=thread_key, body=body, author_name=author,
            author_user=request.user if getattr(request.user, 'is_authenticated', False) else None,
        )
        return Response(MailNoteSerializer(note).data, status=201)


# ── counts ───────────────────────────────────────────────────────────────────

class MailCountsView(APIView):
    """GET — every badge the sidebar and dashboard need, in one call.

    One request rather than one per folder per mailbox: the sidebar shows six
    numbers for each box, and asking separately would make opening the app a
    burst of near-identical queries.
    """
    permission_classes = [MailPermission]

    def get(self, request):
        scoped = mailbox_from_shared_token(request)
        if scoped is not None:
            boxes = [scoped]
        else:
            boxes = list(services.mailboxes_for_user(request.user))
        now = timezone.now()

        out = {}
        total_unread = 0
        for box in boxes:
            unread = MailMessage.objects.filter(
                mailbox=box, direction='IN', read_at__isnull=True, is_deleted=False,
            ).filter(Q(snoozed_until__isnull=True) | Q(snoozed_until__lte=now)).count()
            out[str(box.id)] = {
                'inbox_unread': unread,
                'starred': MailMessage.objects.filter(mailbox=box, starred=True, is_deleted=False).count(),
                'snoozed': MailMessage.objects.filter(mailbox=box, snoozed_until__gt=now, is_deleted=False).count(),
                'drafts': MailDraft.objects.filter(mailbox=box).count(),
                'scheduled': MailMessage.objects.filter(
                    mailbox=box, direction='OUT', status='queued', is_deleted=False).count(),
                'sent_today': services.sends_today(box),
                'daily_send_limit': box.daily_send_limit,
            }
            total_unread += unread

        return Response({'total_unread': total_unread, 'mailboxes': out})


# ── single sign-on from the admin panel ──────────────────────────────────────

SSO_SALT = 'mail_app.sso'
SSO_TICKET_SECONDS = 60


class MailSsoTicketView(APIView):
    """POST — mint a one-time code for the signed-in panel user.

    The code is minted on click, not on page load, so a minute of life is ample
    and a stale link in someone's history is worthless.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        jti = uuid.uuid4().hex
        MailSsoTicket.objects.create(
            user_id=request.user.id, jti=jti,
            expires_at=timezone.now() + timedelta(seconds=SSO_TICKET_SECONDS),
        )
        code = signing.dumps({'uid': request.user.id, 'jti': jti}, salt=SSO_SALT)
        return Response({'code': code, 'expires_in': SSO_TICKET_SECONDS})


class MailSsoRedeemView(APIView):
    """POST {code} — exchange a ticket for real tokens. Works once."""
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'login'

    def post(self, request):
        code = (request.data.get('code') or '').strip()
        if not code:
            return Response({'error': 'No sign-in code was provided.'}, status=400)
        try:
            data = signing.loads(code, salt=SSO_SALT, max_age=SSO_TICKET_SECONDS)
        except Exception:  # noqa: BLE001 — expired or tampered; say the same thing either way
            return Response({'error': 'This sign-in link has expired. Please sign in.'}, status=400)

        # Burning the ticket is a single conditional UPDATE: two requests racing
        # with the same code cannot both see it unused.
        burned = MailSsoTicket.objects.filter(
            jti=data.get('jti'), used_at__isnull=True,
        ).update(used_at=timezone.now())
        if not burned:
            return Response({'error': 'This sign-in link has already been used.'}, status=400)

        from django.contrib.auth import get_user_model
        from rest_framework_simplejwt.tokens import RefreshToken

        user = get_user_model().objects.filter(pk=data.get('uid'), is_active=True).first()
        if not user:
            return Response({'error': 'That account is no longer active.'}, status=400)

        refresh = RefreshToken.for_user(user)
        services.audit(user, 'sso_login', note='Signed in from the admin panel.')
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': {'name': user.get_full_name() or user.username, 'email': user.email},
        })


# ── bulk sends ───────────────────────────────────────────────────────────────

class MailBulkJobListView(APIView):
    """GET ?mailbox= — this mailbox's bulk sends. POST — create one as a draft.

    Only someone who may send from the mailbox may set up a bulk send from it;
    superadmin oversight is read access, not permission to mail as somebody.
    """
    permission_classes = [MailPermission]

    def get(self, request):
        box, denied = _accessible_mailbox(request, request.query_params.get('mailbox'))
        if denied:
            return denied
        rows = MailBulkJob.objects.filter(mailbox=box).prefetch_related('attachments')[:100]
        return Response({'jobs': MailBulkJobSerializer(rows, many=True).data})

    def post(self, request):
        box, denied = _accessible_mailbox(request, request.data.get('mailbox'))
        if denied:
            return denied
        scoped = mailbox_from_shared_token(request)
        if scoped is None and not services.can_use_mailbox(request.user, box):
            return Response({'error': 'You cannot send from this mailbox.'}, status=403)

        subject = (request.data.get('subject') or '').strip()
        if not subject:
            return Response({'error': 'Give the message a subject.'}, status=400)

        rows, skipped = bulk.clean_recipients(request.data.get('recipients'))
        if not rows:
            return Response({'error': 'Add at least one valid recipient.'}, status=400)

        job = MailBulkJob.objects.create(
            mailbox=box,
            name=(request.data.get('name') or '')[:200],
            subject=subject[:500],
            body_text=request.data.get('body_text') or request.data.get('body') or '',
            recipients=rows,
            created_by_user=request.user if getattr(request.user, 'is_authenticated', False) else None,
        )
        for att_id in (request.data.get('attachments') or []):
            MailAttachment.objects.filter(pk=att_id, message__isnull=True).update(
                bulk_job=job, draft=None)
        data = MailBulkJobSerializer(job).data
        data['skipped'] = skipped
        return Response(data, status=201)


class MailBulkJobDetailView(APIView):
    """GET progress · PATCH a draft · DELETE it."""
    permission_classes = [MailPermission]

    def _get(self, request, pk):
        job = MailBulkJob.objects.filter(pk=pk).select_related('mailbox').first()
        if not job:
            return None, Response({'error': 'That send was not found.'}, status=404)
        _, denied = _accessible_mailbox(request, job.mailbox_id)
        if denied:
            return None, denied
        return job, None

    def get(self, request, pk):
        job, denied = self._get(request, pk)
        return denied or Response(MailBulkJobSerializer(job).data)

    def patch(self, request, pk):
        job, denied = self._get(request, pk)
        if denied:
            return denied
        if job.status != 'draft':
            return Response({'error': 'This send has already started and cannot be edited.'},
                            status=409)
        for field in ('name', 'subject', 'body_text'):
            if field in request.data:
                setattr(job, field, request.data.get(field) or '')
        if 'recipients' in request.data:
            job.recipients, _ = bulk.clean_recipients(request.data.get('recipients'))
        job.save()
        return Response(MailBulkJobSerializer(job).data)

    def delete(self, request, pk):
        job, denied = self._get(request, pk)
        if denied:
            return denied
        if job.status == 'running':
            return Response({'error': 'Stop the send before deleting it.'}, status=409)
        for att in job.attachments.all():
            storage.delete(att.storage_key)
        job.delete()
        return Response({'ok': True})


class MailBulkJobActionView(APIView):
    """POST — start, pause or cancel a bulk send."""
    permission_classes = [MailPermission]

    def post(self, request, pk, action):
        job = MailBulkJob.objects.filter(pk=pk).select_related('mailbox').first()
        if not job:
            return Response({'error': 'That send was not found.'}, status=404)
        box, denied = _accessible_mailbox(request, job.mailbox_id)
        if denied:
            return denied
        scoped = mailbox_from_shared_token(request)
        if scoped is None and not services.can_use_mailbox(request.user, box):
            return Response({'error': 'You cannot send from this mailbox.'}, status=403)

        if action == 'start':
            if job.status in ('running', 'queued'):
                return Response(MailBulkJobSerializer(job).data)
            if job.status == 'done':
                return Response({'error': 'This send has already finished.'}, status=409)
            job.status = 'queued'
            job.last_error = ''
            job.save(update_fields=['status', 'last_error'])
            services.audit(request.user, 'bulk_started', mailbox=box,
                           note=f'Started “{job.name or job.subject[:60]}” to {job.total} recipients.')
        elif action == 'pause':
            if job.status not in ('queued', 'running'):
                return Response({'error': 'That send is not running.'}, status=409)
            job.status = 'paused'
            job.save(update_fields=['status'])
        elif action == 'cancel':
            # The worker checks this between recipients, so it stops after the
            # one in flight rather than abandoning a half-sent message.
            job.status = 'canceled'
            job.save(update_fields=['status'])
        else:
            return Response({'error': 'Unknown action.'}, status=400)

        return Response(MailBulkJobSerializer(job).data)
