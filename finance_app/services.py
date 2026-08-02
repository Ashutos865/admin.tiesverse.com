"""Finance business logic: the request lifecycle, audit trail and reporting.

The lifecycle is deliberately explicit about dates, because "when was this
raised?" and "when was it approved?" are the two questions an audit asks first:

    raised_on ──► approved_on ──► paid_on
    (advisory)    (finance)       (finance)

Approval is also the moment the exchange rate is frozen onto the row, so a
figure can always be explained: this amount, at this rate, on this date.
"""
from datetime import date

from django.utils import timezone

from . import currency
from .models import CYCLE_PER_YEAR, FinanceAuditLog, PurchaseRequest, Subscription


def actor_name(user):
    if not user or not getattr(user, 'is_authenticated', False):
        return 'system'
    return (user.get_full_name() or user.username or 'system')


def log(user, action, object_type, object_id=None, detail=''):
    """Record who did what. Never raises — an audit failure must not roll back
    the action it was describing."""
    try:
        return FinanceAuditLog.objects.create(
            actor_admin=user if (user and user.is_authenticated) else None,
            actor_name=actor_name(user),
            action=action, object_type=object_type,
            object_id=object_id, detail=detail[:2000],
        )
    except Exception:  # noqa: BLE001
        return None


def create_request(obj, user):
    """Stamp the raising date and freeze nothing yet — the rate is taken at
    approval, not at request time, because the asked-for figure is only a
    proposal."""
    if not obj.raised_on:
        obj.raised_on = date.today()
    obj.save()
    log(user, 'created', 'request', obj.id,
        f'Raised “{obj.title}” for {obj.currency} {obj.amount} on {obj.raised_on}.')
    return obj


def approve_request(obj, user, *, approved_amount=None, note='', on=None):
    """Approve, and freeze the INR value at that moment.

    `approved_amount` may differ from what was asked for — Finance sanctions the
    real number. The rate used is the one for the approval date, stored on the
    row so the figure never moves afterwards.
    """
    when = on or date.today()
    obj.status = 'approved'
    obj.approved_amount = (approved_amount if approved_amount is not None else obj.amount)
    obj.approved_on = when
    obj.decided_at = timezone.now()
    obj.decided_by_admin = user if (user and user.is_authenticated) else None
    obj.decided_by_name = actor_name(user)
    obj.decision_note = note or ''

    currency.freeze_inr(obj, amount=obj.approved_amount, on=when, force=True)
    obj.save()

    rate_txt = (f'@ {obj.fx_rate} on {obj.fx_date}' if obj.fx_rate else 'no rate available')
    log(user, 'approved', 'request', obj.id,
        f'Approved {obj.currency} {obj.approved_amount} '
        f'(₹{obj.amount_inr if obj.amount_inr is not None else "—"} {rate_txt}) on {when}.')
    return obj


def reject_request(obj, user, note=''):
    obj.status = 'rejected'
    obj.decided_at = timezone.now()
    obj.approved_on = None
    obj.decided_by_admin = user if (user and user.is_authenticated) else None
    obj.decided_by_name = actor_name(user)
    obj.decision_note = note or ''
    obj.save()
    log(user, 'rejected', 'request', obj.id, f'Rejected. {note}'.strip())
    return obj


def mark_paid(obj, user, *, paid_on=None, invoice_url='', invoice_no=''):
    """Record payment. Approval must have happened first — paying something
    nobody approved would leave a hole in the trail."""
    if obj.status not in ('approved', 'purchased'):
        raise ValueError('Only an approved request can be marked paid.')
    obj.status = 'paid'
    obj.paid_on = paid_on or date.today()
    if invoice_url:
        obj.invoice_url = invoice_url
    if invoice_no:
        obj.invoice_no = invoice_no
    # A row approved while the rate feed was down can be valued now.
    if obj.amount_inr is None:
        currency.freeze_inr(obj, amount=obj.approved_amount or obj.amount,
                            on=obj.approved_on or obj.paid_on, force=True)
    obj.save()
    log(user, 'paid', 'request', obj.id,
        f'Paid on {obj.paid_on}. Invoice {obj.invoice_no or obj.invoice_url or "—"}.')
    return obj


def save_money_row(obj, user, object_type, *, on=None):
    """Assets and subscriptions have no approval step, so their INR value is
    frozen at the purchase/start date when first saved."""
    when = on or getattr(obj, 'purchase_date', None) or getattr(obj, 'started_on', None) or date.today()
    currency.freeze_inr(obj, on=when)
    obj.save()
    log(user, 'created' if obj._state.adding else 'updated', object_type, obj.id,
        f'{obj.currency} {obj.amount} → ₹{obj.amount_inr if obj.amount_inr is not None else "—"}')
    return obj


# ── reporting ──────────────────────────────────────────────────────────────

def spend_summary(year=None):
    """Money out, in INR, for a year — the numbers the calendar shows.

    Rows whose rate could not be resolved are counted separately rather than
    folded in as zero, so a total is never quietly wrong.
    """
    year = year or date.today().year

    paid = PurchaseRequest.objects.filter(status='paid', paid_on__year=year)
    approved = PurchaseRequest.objects.filter(
        status__in=['approved', 'purchased'], approved_on__year=year)

    def total(qs):
        rows = [r.amount_inr for r in qs if r.amount_inr is not None]
        return sum(rows) if rows else 0

    def unpriced(qs):
        return qs.filter(amount_inr__isnull=True).count()

    months = []
    for m in range(1, 13):
        m_paid = paid.filter(paid_on__month=m)
        months.append({
            'month': m,
            'paid_inr': float(total(m_paid)),
            'count': m_paid.count(),
        })

    subs = Subscription.objects.filter(is_active=True)
    sub_year = sum((s.amount_inr or 0) * CYCLE_PER_YEAR.get(s.cycle, 0) for s in subs)

    return {
        'year': year,
        'paid_inr': float(total(paid)),
        'approved_pending_payment_inr': float(total(approved)),
        'subscriptions_yearly_inr': float(sub_year),
        'total_committed_inr': float(total(paid) + sub_year),
        'months': months,
        'unpriced_rows': unpriced(paid) + unpriced(approved),
        'pending_count': PurchaseRequest.objects.filter(status='pending').count(),
    }
