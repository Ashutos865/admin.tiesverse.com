from django.contrib import admin

from .models import (
    AssetItem, ExchangeRate, FinanceAuditLog, PurchaseRequest, Subscription,
)


@admin.register(AssetItem)
class AssetItemAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'status', 'assigned_to', 'amount', 'currency', 'amount_inr')
    list_filter = ('status', 'category', 'currency')
    search_fields = ('name', 'serial', 'vendor')


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ('name', 'vendor', 'cycle', 'amount', 'currency', 'amount_inr', 'renews_on', 'is_active')
    list_filter = ('is_active', 'cycle', 'currency')
    search_fields = ('name', 'vendor')


@admin.register(PurchaseRequest)
class PurchaseRequestAdmin(admin.ModelAdmin):
    list_display = ('title', 'status', 'amount', 'currency', 'amount_inr',
                    'raised_on', 'approved_on', 'paid_on')
    list_filter = ('status', 'category', 'currency')
    search_fields = ('title', 'description')
    date_hierarchy = 'raised_on'


@admin.register(ExchangeRate)
class ExchangeRateAdmin(admin.ModelAdmin):
    list_display = ('currency', 'rate_to_inr', 'on_date', 'source', 'is_manual')
    list_filter = ('currency', 'is_manual')


@admin.register(FinanceAuditLog)
class FinanceAuditLogAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'actor_name', 'action', 'object_type', 'object_id')
    list_filter = ('action', 'object_type')
    readonly_fields = [f.name for f in FinanceAuditLog._meta.fields]
