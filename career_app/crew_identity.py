"""Crew ID identity transitions — change a member's identity class or account
status with a full audit trail, per the Ties HQ Crew ID Standard.

The Crew ID itself is NEVER touched here (it is permanent). Only the separate
`identity_class` and `account_status` fields change. Every change writes a
`DocumentAuditLog` row so the history timeline is complete.

Account-status changes also enforce access: statuses that block portal use
(SUSPENDED/EXPIRED/OFFBOARDED/ARCHIVED/CANCELLED) deactivate the member's login;
ACTIVE restores it — mirroring `offboarding.revoke_member_access`.
"""
from django.db import transaction

from .models import (
    OnboardingSubmission, MemberAccount, DocumentAuditLog,
    IDENTITY_CLASS_CHOICES, ACCOUNT_STATUS_CHOICES,
)

_VALID_CLASSES = {c for c, _ in IDENTITY_CLASS_CHOICES}
_VALID_STATUSES = {s for s, _ in ACCOUNT_STATUS_CHOICES}

_DB = 'turso_db'   # career_app models live here

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


# ── Superadmin Crew ID edit / swap ────────────────────────────────────────────
# The Crew ID is normally permanent and system-generated. This is the ONE
# deliberate exception: a superadmin may manually re-assign a member's Crew ID.
# If the target ID already belongs to someone else, the two SWAP so neither is
# duplicated nor left blank. If the editee had no ID to give back, the displaced
# member is auto-assigned the next available Crew ID from the series.


def _crew_id_audit(member, note, actor):
    return DocumentAuditLog.objects.create(
        submission=member,
        doc_type=DocumentAuditLog.DOC_CREW_ID,
        action=DocumentAuditLog.ACTION_CHANGED,
        performed_by_name=_actor_name(actor),
        performed_by_user=actor if (actor and actor.is_authenticated) else None,
        note=note,
    )


def preview_crew_id_change(member, new_crew_id):
    """Describe what set_crew_id() would do — for a confirmation prompt. Returns
    a dict {kind, message, ...} or raises ValueError on invalid input.

    kind ∈ {'noop', 'assign', 'swap', 'swap_fresh'}.
    """
    from .crew_id import is_valid_crew_id
    new_crew_id = (new_crew_id or '').strip().upper()
    if not is_valid_crew_id(new_crew_id):
        raise ValueError('Enter a valid Crew ID like CRW-A-0007.')

    current = (member.crew_id or '').upper()
    if new_crew_id == current:
        return {'kind': 'noop', 'message': f'{member.candidate_name} already has {new_crew_id}.'}

    other = (OnboardingSubmission.objects.using(_DB)
             .filter(crew_id__iexact=new_crew_id).exclude(pk=member.pk).first())
    if other is None:
        return {
            'kind': 'assign',
            'message': (f'{member.candidate_name}: {current or "no Crew ID"} → {new_crew_id}.'),
            'new_crew_id': new_crew_id,
        }

    if current:
        return {
            'kind': 'swap',
            'message': (f'SWAP: {member.candidate_name} takes {new_crew_id}; '
                        f'{other.candidate_name} takes {current} in return.'),
            'new_crew_id': new_crew_id,
            'other_id': other.pk,
            'other_name': other.candidate_name,
            'other_gets': current,
        }
    return {
        'kind': 'swap_fresh',
        'message': (f'{member.candidate_name} takes {new_crew_id}; '
                    f'{other.candidate_name} (who had it) gets a fresh next Crew ID.'),
        'new_crew_id': new_crew_id,
        'other_id': other.pk,
        'other_name': other.candidate_name,
    }


def set_crew_id(member, new_crew_id, actor=None):
    """Superadmin: assign `new_crew_id` to `member`, swapping with the current
    holder if the ID is taken. Atomic on turso_db. Returns the preview-style dict
    describing what happened. Raises ValueError on invalid input.

    Cases:
      * free ID       → assign directly.
      * taken + editee has an ID → the two members swap IDs.
      * taken + editee blank      → the displaced member gets a fresh next ID.
    """
    from .crew_id import is_valid_crew_id, generate_crew_id
    new_crew_id = (new_crew_id or '').strip().upper()
    if not is_valid_crew_id(new_crew_id):
        raise ValueError('Enter a valid Crew ID like CRW-A-0007.')

    with transaction.atomic(using=_DB):
        # Re-read fresh inside the txn to avoid a stale race.
        member = OnboardingSubmission.objects.using(_DB).select_for_update().get(pk=member.pk)
        current = (member.crew_id or '').upper()
        if new_crew_id == current:
            return {'kind': 'noop', 'message': f'{member.candidate_name} already has {new_crew_id}.'}

        other = (OnboardingSubmission.objects.using(_DB).select_for_update()
                 .filter(crew_id__iexact=new_crew_id).exclude(pk=member.pk).first())

        # ── free ID: straight assign ──
        if other is None:
            member.crew_id = new_crew_id
            member.save(using=_DB, update_fields=['crew_id'])
            _crew_id_audit(member, f'Crew ID {current or "—"} → {new_crew_id} (assigned by admin).', actor)
            return {'kind': 'assign', 'new_crew_id': new_crew_id,
                    'message': f'{member.candidate_name} → {new_crew_id}.'}

        # ── taken: must free the unique slot before reassigning (SQLite unique). ──
        # Step 1: park the other member's id to NULL so `new_crew_id` is free.
        other.crew_id = None
        other.save(using=_DB, update_fields=['crew_id'])

        # Step 2: give the editee the requested id.
        member.crew_id = new_crew_id
        member.save(using=_DB, update_fields=['crew_id'])

        # Step 3: give the displaced member something back.
        if current:
            # Swap: they take the editee's old id (guaranteed free now).
            other.crew_id = current
            other.save(using=_DB, update_fields=['crew_id'])
            _crew_id_audit(member, f'Crew ID {current} → {new_crew_id} (swapped with {other.candidate_name} by admin).', actor)
            _crew_id_audit(other, f'Crew ID {new_crew_id} → {current} (swapped with {member.candidate_name} by admin).', actor)
            return {'kind': 'swap', 'new_crew_id': new_crew_id, 'other_id': other.pk,
                    'other_name': other.candidate_name, 'other_gets': current,
                    'message': f'Swapped: {member.candidate_name} ↔ {other.candidate_name}.'}

        # Editee had no id: displaced member gets a fresh next id.
        fresh = generate_crew_id()
        other.crew_id = fresh
        other.save(using=_DB, update_fields=['crew_id'])
        _crew_id_audit(member, f'Crew ID — → {new_crew_id} (assigned by admin).', actor)
        _crew_id_audit(other, f'Crew ID {new_crew_id} → {fresh} (displaced by admin assignment; fresh ID issued).', actor)
        return {'kind': 'swap_fresh', 'new_crew_id': new_crew_id, 'other_id': other.pk,
                'other_name': other.candidate_name, 'other_gets': fresh,
                'message': f'{member.candidate_name} → {new_crew_id}; {other.candidate_name} → {fresh}.'}
