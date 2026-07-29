"""Crew ID identity transitions — change a member's identity class or account
status with a full audit trail, per the Ties HQ Crew ID Standard.

The Crew ID itself is NEVER touched here (it is permanent). Only the separate
`identity_class` and `account_status` fields change. Every change writes a
`DocumentAuditLog` row so the history timeline is complete.

Account-status changes also enforce access: statuses that block portal use
(SUSPENDED/EXPIRED/OFFBOARDED/ARCHIVED/CANCELLED) deactivate the member's login;
ACTIVE restores it — mirroring `offboarding.revoke_member_access`.
"""
from .models import (
    OnboardingSubmission, MemberAccount, DocumentAuditLog,
    IDENTITY_CLASS_CHOICES, ACCOUNT_STATUS_CHOICES,
)

_VALID_CLASSES = {c for c, _ in IDENTITY_CLASS_CHOICES}
_VALID_STATUSES = {s for s, _ in ACCOUNT_STATUS_CHOICES}

# Statuses under which the member must NOT be able to log in.
_LOGIN_BLOCKING = {'SUSPENDED', 'EXPIRED', 'OFFBOARDED', 'ARCHIVED', 'CANCELLED'}


def _actor_name(user):
    if not user:
        return 'system'
    return (user.get_full_name() or user.username or 'system')


def set_identity_class(member, new_class, actor=None):
    """Change a member's identity class (Crew ID unchanged). Returns the audit row.
    Raises ValueError on an invalid class."""
    new_class = (new_class or '').strip().upper()
    if new_class not in _VALID_CLASSES:
        raise ValueError(f'Invalid identity class: {new_class!r}')
    old = member.identity_class or '—'
    if new_class == member.identity_class:
        return None   # no-op, no audit noise
    member.identity_class = new_class
    member.save(update_fields=['identity_class'])
    return DocumentAuditLog.objects.create(
        submission=member,
        doc_type=DocumentAuditLog.DOC_IDENTITY_CLASS,
        action=DocumentAuditLog.ACTION_CHANGED,
        performed_by_name=_actor_name(actor),
        performed_by_user=actor if (actor and actor.is_authenticated) else None,
        note=f'Identity class {old} → {new_class}.',
    )


def _set_login_active(member, active):
    """Flip the member's Django login on/off (mirrors offboarding helper)."""
    acct = MemberAccount.objects.filter(submission=member).first()
    user = getattr(acct, 'user', None)
    if user is not None and user.is_active != active:
        user.is_active = active
        user.save(update_fields=['is_active'])
    if acct is not None and acct.is_active != active:
        acct.is_active = active
        acct.save(update_fields=['is_active'])


def set_account_status(member, new_status, actor=None, reason=''):
    """Change a member's account status + enforce login access + audit.
    Returns the audit row. Raises ValueError on an invalid status."""
    new_status = (new_status or '').strip().upper()
    if new_status not in _VALID_STATUSES:
        raise ValueError(f'Invalid account status: {new_status!r}')
    old = member.account_status or '—'
    if new_status == member.account_status and not reason:
        return None

    fields = ['account_status']
    member.account_status = new_status
    if new_status in ('OFFBOARDED', 'ARCHIVED') and reason:
        member.deactivation_reason = reason
        fields.append('deactivation_reason')
    member.save(update_fields=fields)

    # Enforce access: block login for blocking statuses, restore on ACTIVE.
    if new_status in _LOGIN_BLOCKING:
        _set_login_active(member, False)
    elif new_status == 'ACTIVE':
        _set_login_active(member, True)

    note = f'Account status {old} → {new_status}.'
    if reason:
        note += f' Reason: {reason}'
    return DocumentAuditLog.objects.create(
        submission=member,
        doc_type=DocumentAuditLog.DOC_ACCOUNT_STATUS,
        action=DocumentAuditLog.ACTION_CHANGED,
        performed_by_name=_actor_name(actor),
        performed_by_user=actor if (actor and actor.is_authenticated) else None,
        note=note,
    )
