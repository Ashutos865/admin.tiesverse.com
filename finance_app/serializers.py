"""Serializers for Assets & Finance.

The permission layer already blocks anyone without finance access, so these
serializers are only ever reached by advisory/finance/superadmin. The money
fields are nonetheless dropped when `show_money` is false in the context — a
second line of defence, so a future endpoint that forgets to gate cannot leak
amounts by accident.
"""
from rest_framework import serializers

from .models import (
    AssetItem, ExchangeRate, FinanceAuditLog, PurchaseRequest, Subscription,
)

MONEY_FIELDS = ('amount', 'currency', 'amount_inr', 'fx_rate', 'fx_date', 'fx_missing')


class MoneyAwareSerializer(serializers.ModelSerializer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.context.get('show_money') is False:
            for f in MONEY_FIELDS + ('approved_amount',):
                self.fields.pop(f, None)

    def validate(self, attrs):
        """Picking "Other" must be accompanied by saying what it was — a row
        reading "Other · ₹40,000" is useless to whoever reads the ledger later."""
        attrs = super().validate(attrs)
        category = attrs.get('category', getattr(self.instance, 'category', None))
        if category == 'other':
            said = (attrs.get('category_other')
                    or getattr(self.instance, 'category_other', '') or '').strip()
            if not said:
                raise serializers.ValidationError(
                    {'category_other': 'Say what this is — "Other" on its own is '
                                       'not much use when reading the ledger later.'})
            attrs['category_other'] = said
        return attrs


class ExchangeRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExchangeRate
        fields = ['id', 'currency', 'rate_to_inr', 'on_date', 'source', 'is_manual']
        read_only_fields = ['id', 'source']


class AssetItemSerializer(MoneyAwareSerializer):
    assigned_to_name = serializers.CharField(
        source='assigned_to.candidate_name', read_only=True, default='')

    class Meta:
        model = AssetItem
        fields = [
            'id', 'name', 'category', 'category_other', 'serial', 'vendor',
            'purchase_date', 'warranty_until', 'condition', 'status',
            'assigned_to', 'assigned_to_name', 'assigned_at', 'notes',
            'amount', 'currency', 'amount_inr', 'fx_rate', 'fx_date', 'fx_missing',
            'created_at', 'updated_at',
        ]
        # INR values are derived and frozen by the service layer, never posted.
        read_only_fields = ['id', 'amount_inr', 'fx_rate', 'fx_date', 'fx_missing',
                            'created_at', 'updated_at']

    def validate_name(self, v):
        v = (v or '').strip()
        if not v:
            raise serializers.ValidationError('Give the asset a name.')
        return v


class SubscriptionSerializer(MoneyAwareSerializer):
    owner_name = serializers.CharField(
        source='owner.candidate_name', read_only=True, default='')
    yearly_inr = serializers.SerializerMethodField()

    class Meta:
        model = Subscription
        fields = [
            'id', 'name', 'vendor', 'plan', 'cycle', 'seats',
            'started_on', 'renews_on', 'auto_renew', 'is_active',
            'owner', 'owner_name', 'notes',
            'amount', 'currency', 'amount_inr', 'fx_rate', 'fx_date', 'fx_missing',
            'yearly_inr', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'amount_inr', 'fx_rate', 'fx_date', 'fx_missing',
                            'created_at', 'updated_at']

    def get_yearly_inr(self, obj):
        if self.context.get('show_money') is False:
            return None
        v = obj.yearly_inr
        return float(v) if v is not None else None

    def validate_name(self, v):
        v = (v or '').strip()
        if not v:
            raise serializers.ValidationError('Give the subscription a name.')
        return v


class PurchaseRequestSerializer(MoneyAwareSerializer):
    requested_by_name = serializers.CharField(
        source='requested_by.candidate_name', read_only=True, default='')
    linked_asset_name = serializers.CharField(
        source='linked_asset.name', read_only=True, default='')

    class Meta:
        model = PurchaseRequest
        fields = [
            'id', 'title', 'description', 'category', 'category_other', 'justification',
            'needed_by', 'raised_on',
            'requested_by', 'requested_by_name',
            'status', 'approved_amount', 'approved_on',
            'decided_by_name', 'decided_at', 'decision_note',
            'invoice_url', 'invoice_no', 'paid_on',
            'linked_asset', 'linked_asset_name', 'linked_subscription',
            'amount', 'currency', 'amount_inr', 'fx_rate', 'fx_date', 'fx_missing',
            'created_at', 'updated_at',
        ]
        # Status and the decision trail move only through the service layer, so
        # a client cannot post itself an approval.
        read_only_fields = [
            'id', 'status', 'approved_amount', 'approved_on',
            'decided_by_name', 'decided_at',
            'amount_inr', 'fx_rate', 'fx_date', 'fx_missing',
            'created_at', 'updated_at',
        ]

    def validate_title(self, v):
        v = (v or '').strip()
        if not v:
            raise serializers.ValidationError('Say what is being requested.')
        return v

    def validate_amount(self, v):
        if v is None or v < 0:
            raise serializers.ValidationError('Enter the cost.')
        return v


class FinanceAuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = FinanceAuditLog
        fields = ['id', 'actor_name', 'action', 'object_type', 'object_id',
                  'detail', 'created_at']
        read_only_fields = fields
