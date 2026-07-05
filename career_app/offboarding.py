"""Offboarding access-control helpers.

Kept in its own module (not views.py) so the login/auth path can enforce
offboarding without importing the whole views module. The revocation primitive
is simply flipping ``User.is_active`` — which blocks new logins (auth backend)
and rejects existing JWTs (SimpleJWT re-checks is_active per request).
"""
from django.utils import timezone

from .models import MemberAccount, OnboardingSubmission, OffboardingRequest


def revoke_member_access(off, actor_name='system'):
    """Cut a member's portal access but KEEP their record. Marks the request
    completed. Idempotent-ish: safe to call again."""
    member = off.member
    acct = MemberAccount.objects.filter(submission=member).first()
    user = getattr(acct, 'user', None)
    if user is not None and user.is_active:
        user.is_active = False
        user.save(update_fields=['is_active'])
    if member.status != OnboardingSubmission.STATUS_OFFBOARDED:
        member.status = OnboardingSubmission.STATUS_OFFBOARDED
        member.save(update_fields=['status'])
    if acct is not None and acct.is_active:
        acct.is_active = False
        acct.save(update_fields=['is_active'])
    off.status = OffboardingRequest.STATUS_COMPLETED
    off.revoked_at = timezone.now()
    off.revoked_by_name = actor_name or 'system'
    off.save(update_fields=['status', 'revoked_at', 'revoked_by_name'])
    return off


def reactivate_member(member, actor_name='system'):
    """Undo an offboarding — restore login + verified status (rehire)."""
    acct = MemberAccount.objects.filter(submission=member).first()
    user = getattr(acct, 'user', None)
    if user is not None and not user.is_active:
        user.is_active = True
        user.save(update_fields=['is_active'])
    if acct is not None and not acct.is_active:
        acct.is_active = True
        acct.save(update_fields=['is_active'])
    member.status = OnboardingSubmission.STATUS_VERIFIED
    member.save(update_fields=['status'])
    OffboardingRequest.objects.filter(
        member=member,
        status__in=[OffboardingRequest.STATUS_COMPLETED, OffboardingRequest.STATUS_APPROVED],
    ).update(status=OffboardingRequest.STATUS_CANCELLED)


def enforce_offboarding_on_login(user):
    """If the user has an APPROVED offboarding whose last working day is today or
    earlier, revoke access now and return True (caller should block login).
    Returns False when there's nothing to enforce."""
    acct = MemberAccount.objects.filter(user=user).select_related('submission').first()
    if not acct:
        return False
    today = timezone.now().date()
    off = (OffboardingRequest.objects
           .filter(member=acct.submission,
                   status=OffboardingRequest.STATUS_APPROVED,
                   last_working_day__isnull=False,
                   last_working_day__lte=today)
           .first())
    if off:
        revoke_member_access(off, actor_name='system (last working day reached)')
        return True
    return False


def revoke_expired(today=None):
    """Batch-revoke every approved offboarding whose last working day has passed.
    Used by the `revoke_expired_offboarding` management command. Returns the count."""
    today = today or timezone.now().date()
    due = OffboardingRequest.objects.filter(
        status=OffboardingRequest.STATUS_APPROVED,
        last_working_day__isnull=False,
        last_working_day__lte=today,
    )
    n = 0
    for off in due:
        revoke_member_access(off, actor_name='system (scheduled)')
        n += 1
    return n
