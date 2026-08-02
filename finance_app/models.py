"""Assets, subscriptions and spending — the confidential half of the portal.

Everything here is money, so nothing in this app is visible to ordinary members
or to HR. Access is decided by career_app.access.get_finance_access; the models
themselves carry no permission logic.

Amounts are stored as a PAIR: the original `amount` + `currency` as entered, and
`amount_inr` derived from it. Only the INR side is ever summed, so a report is
one currency regardless of what things were bought in.

The conversion rate is FROZEN when a row is approved (see services.freeze_inr).
Applying live rates would mean a $50 subscription approved in January silently
changes value every day, and last month's report would not match this month's.
"""
from django.conf import settings
from django.db import models

CURRENCY_CHOICES = [
    ('INR', '₹ Indian Rupee'),
    ('USD', '$ US Dollar'),
    ('EUR', '€ Euro'),
    ('GBP', '£ Pound Sterling'),
    ('AUD', 'A$ Australian Dollar'),
    ('SGD', 'S$ Singapore Dollar'),
    ('AED', 'AED UAE Dirham'),
    ('CAD', 'C$ Canadian Dollar'),
    ('JPY', '¥ Japanese Yen'),
]

CATEGORY_CHOICES = [
    ('laptop', 'Laptop'),
    ('phone', 'Phone'),
    ('monitor', 'Monitor'),
    ('camera', 'Camera / Gear'),
    ('accessory', 'Accessory'),
    ('software', 'Software licence'),
    ('subscription', 'Subscription'),
    ('furniture', 'Furniture'),
    ('other', 'Other'),
]

CONDITION_CHOICES = [
    ('new', 'New'), ('good', 'Good'), ('fair', 'Fair'), ('poor', 'Poor'),
]

ASSET_STATUS_CHOICES = [
    ('in_stock', 'In stock'),
    ('assigned', 'Assigned'),
    ('repair', 'In repair'),
    ('retired', 'Retired'),
    ('lost', 'Lost'),
]

CYCLE_CHOICES = [
    ('monthly', 'Monthly'),
    ('quarterly', 'Quarterly'),
    ('half_yearly', 'Half-yearly'),
    ('yearly', 'Yearly'),
    ('one_time', 'One-time'),
]

# How many times a cycle bills in a year — used to annualise spend.
CYCLE_PER_YEAR = {
    'monthly': 12, 'quarterly': 4, 'half_yearly': 2, 'yearly': 1, 'one_time': 0,
}

REQUEST_STATUS_CHOICES = [
    ('pending', 'Pending'),
    ('approved', 'Approved'),
    ('rejected', 'Rejected'),
    ('purchased', 'Purchased'),
    ('paid', 'Paid'),
    ('cancelled', 'Cancelled'),
]


class MoneyMixin(models.Model):
    """An amount in any currency, plus its frozen INR equivalent.

    `amount_inr` is written once (at approval, or at save for rows that need no
    approval) and then left alone, so historical totals never drift. `fx_rate`
    and `fx_date` record exactly how the conversion was made, so any figure can
    be explained later.
    """
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default='INR')
    amount_inr = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    fx_rate = models.DecimalField(max_digits=12, decimal_places=6, null=True, blank=True)
    fx_date = models.DateField(null=True, blank=True)
    # True when no rate could be found — the row still saves, but reporting
    # counts it separately rather than pretending it is zero.
    fx_missing = models.BooleanField(default=False)

    class Meta:
        abstract = True


class ExchangeRate(models.Model):
    """One currency's value in INR on one date.

    Kept per-day so a past approval can always be explained, and so a failed
    fetch can fall back to the most recent known rate.
    """
    currency = models.CharField(max_length=3, db_index=True)
    rate_to_inr = models.DecimalField(max_digits=12, decimal_places=6)
    on_date = models.DateField(db_index=True)
    source = models.CharField(max_length=40, default='frankfurter')
    is_manual = models.BooleanField(default=False)   # superadmin override
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'finance_exchange_rates'
        ordering = ['-on_date', 'currency']
        unique_together = [('currency', 'on_date')]

    def __str__(self):
        return f'1 {self.currency} = ₹{self.rate_to_inr} ({self.on_date})'


class AssetItem(MoneyMixin):
    """A physical or licensed item the org owns."""
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='other')
    # What "Other" actually was. Required by the serializer when category is
    # 'other', because a bare "Other · ₹40,000" is unreadable months later.
    category_other = models.CharField(max_length=120, blank=True)
    serial = models.CharField(max_length=120, blank=True)
    vendor = models.CharField(max_length=200, blank=True)
    purchase_date = models.DateField(null=True, blank=True)
    warranty_until = models.DateField(null=True, blank=True)
    condition = models.CharField(max_length=10, choices=CONDITION_CHOICES, default='good')
    status = models.CharField(max_length=12, choices=ASSET_STATUS_CHOICES,
                              default='in_stock', db_index=True)
    assigned_to = models.ForeignKey(
        'career_app.OnboardingSubmission', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='finance_assets')
    assigned_at = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_by_admin = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        db_constraint=False, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'finance_assets'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'category']),
            models.Index(fields=['purchase_date']),
        ]

    def __str__(self):
        return f'{self.name} [{self.status}]'


class Subscription(MoneyMixin):
    """Recurring spend — the thing a one-off asset cannot represent."""
    name = models.CharField(max_length=255)
    vendor = models.CharField(max_length=200, blank=True)
    plan = models.CharField(max_length=120, blank=True)
    cycle = models.CharField(max_length=12, choices=CYCLE_CHOICES, default='monthly')
    started_on = models.DateField(null=True, blank=True)
    renews_on = models.DateField(null=True, blank=True, db_index=True)
    auto_renew = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True, db_index=True)
    owner = models.ForeignKey(
        'career_app.OnboardingSubmission', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='finance_subscriptions')
    seats = models.PositiveSmallIntegerField(default=1)
    notes = models.TextField(blank=True)
    created_by_admin = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        db_constraint=False, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'finance_subscriptions'
        ordering = ['renews_on', 'name']
        indexes = [models.Index(fields=['is_active', 'renews_on'])]

    @property
    def yearly_inr(self):
        """Annualised cost, so monthly and yearly plans can be compared."""
        if self.amount_inr is None:
            return None
        return self.amount_inr * CYCLE_PER_YEAR.get(self.cycle, 0)

    def __str__(self):
        return f'{self.name} ({self.cycle})'


class PurchaseRequest(MoneyMixin):
    """"We need this" — raised by advisory, approved by Finance.

    `amount` is what the requester asked for; `approved_amount` is what Finance
    actually sanctioned, which may differ. The INR figures on this row are frozen
    at the moment of approval.
    """
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='other')
    category_other = models.CharField(max_length=120, blank=True)   # required when category='other'
    justification = models.TextField(blank=True)
    needed_by = models.DateField(null=True, blank=True)

    requested_by = models.ForeignKey(
        'career_app.OnboardingSubmission', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='finance_requests')
    requested_by_admin = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        db_constraint=False, related_name='+')

    # ── the dates that matter for an audit trail ──
    # raised_on is the business date of the request; created_at is the row's
    # technical timestamp. They are usually the same, but raised_on can be
    # back-dated when something is recorded after the fact.
    raised_on = models.DateField(null=True, blank=True, db_index=True)

    status = models.CharField(max_length=12, choices=REQUEST_STATUS_CHOICES,
                              default='pending', db_index=True)
    approved_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    decided_by_admin = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        db_constraint=False, related_name='+')
    decided_by_name = models.CharField(max_length=255, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)      # exact moment
    approved_on = models.DateField(null=True, blank=True, db_index=True)  # the date it counts against
    decision_note = models.TextField(blank=True)

    invoice_url = models.URLField(max_length=1000, blank=True)
    invoice_no = models.CharField(max_length=120, blank=True)
    paid_on = models.DateField(null=True, blank=True, db_index=True)
    # Set when a purchase turns into something the org owns.
    linked_asset = models.ForeignKey(
        AssetItem, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='from_requests')
    linked_subscription = models.ForeignKey(
        Subscription, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='from_requests')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'finance_requests'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', '-created_at']),
            models.Index(fields=['paid_on']),
        ]

    def __str__(self):
        return f'{self.title} [{self.status}]'


class FinanceAuditLog(models.Model):
    """Who did what with money.

    Approvals and edits are recorded, and so is a superadmin or advisory reading
    someone else's records — visibility into confidential data should itself
    leave a trace.
    """
    ACTION_CHOICES = [
        ('created', 'Created'),
        ('updated', 'Updated'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('paid', 'Marked paid'),
        ('assigned', 'Assigned'),
        ('returned', 'Returned'),
        ('deleted', 'Deleted'),
        ('rate_override', 'Exchange rate overridden'),
        ('viewed', 'Viewed'),
    ]
    OBJECT_CHOICES = [
        ('asset', 'Asset'), ('subscription', 'Subscription'),
        ('request', 'Request'), ('rate', 'Exchange rate'), ('report', 'Report'),
    ]

    actor_admin = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        db_constraint=False, related_name='+')
    actor_name = models.CharField(max_length=255, blank=True)
    action = models.CharField(max_length=16, choices=ACTION_CHOICES)
    object_type = models.CharField(max_length=14, choices=OBJECT_CHOICES)
    object_id = models.PositiveIntegerField(null=True, blank=True)
    detail = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'finance_audit_logs'
        ordering = ['-created_at']
        indexes = [models.Index(fields=['object_type', 'object_id'])]

    def __str__(self):
        return f'{self.actor_name} {self.action} {self.object_type}#{self.object_id}'
