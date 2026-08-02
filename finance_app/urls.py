from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import (
    AssetItemViewSet, ExchangeRateView, FinanceAuditView, FinanceBoardView,
    FinanceSummaryView, PurchaseRequestViewSet, RequestApproveView,
    RequestPaidView, RequestRejectView, SubscriptionViewSet,
)

# trailing_slash=True to match the admin's apiClient (withSlash appends one).
router = SimpleRouter(trailing_slash=True)
router.register(r'assets', AssetItemViewSet, basename='finance-asset')
router.register(r'subscriptions', SubscriptionViewSet, basename='finance-subscription')
router.register(r'requests', PurchaseRequestViewSet, basename='finance-request')

urlpatterns = [
    path('board/', FinanceBoardView.as_view(), name='finance-board'),
    path('summary/', FinanceSummaryView.as_view(), name='finance-summary'),
    path('rates/', ExchangeRateView.as_view(), name='finance-rates'),
    path('audit/', FinanceAuditView.as_view(), name='finance-audit'),
    path('requests/<int:pk>/approve/', RequestApproveView.as_view(), name='finance-approve'),
    path('requests/<int:pk>/reject/', RequestRejectView.as_view(), name='finance-reject'),
    path('requests/<int:pk>/paid/', RequestPaidView.as_view(), name='finance-paid'),
    *router.urls,
]
