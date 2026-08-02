"""Assets & Finance API.

Everything here is money, so the permission class denies anyone whose finance
tier is 'none' — which includes ordinary members, team leads and HR. Within the
allowed roles the split is:

    advisory  raises requests, sees all assets and money
    finance   approves, marks paid, sees reporting
    admin     both, plus the restricted Finance department itself
"""
from datetime import date

from rest_framework import permissions, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import currency, services
from .models import (
    AssetItem, ExchangeRate, FinanceAuditLog, PurchaseRequest, Subscription,
)
from .serializers import (
    AssetItemSerializer, ExchangeRateSerializer, FinanceAuditLogSerializer,
    PurchaseRequestSerializer, SubscriptionSerializer,
)


def _tier(user):
    """(tier, member). Imported lazily so a career_app import cycle cannot break
    this module at load time."""
    from career_app import access
    return access.get_finance_access(user)


class FinancePermission(permissions.BasePermission):
    message = 'You do not have access to Assets & Finance.'

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        tier, _ = _tier(request.user)
        return tier in ('admin', 'finance', 'advisory')


class FinanceBaseViewSet(viewsets.ModelViewSet):
    permission_classes = [FinancePermission]

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        tier, _ = _tier(self.request.user)
        # Everyone who gets this far may see money; the flag exists so a future
        # caller can explicitly suppress it.
        ctx['show_money'] = tier in ('admin', 'finance', 'advisory')
        return ctx


class AssetItemViewSet(FinanceBaseViewSet):
    serializer_class = AssetItemSerializer

    def get_queryset(self):
        qs = AssetItem.objects.select_related('assigned_to').all()
        p = self.request.query_params
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        if p.get('category'):
            qs = qs.filter(category=p['category'])
        if p.get('assigned_to'):
            qs = qs.filter(assigned_to_id=p['assigned_to'])
        if p.get('search'):
            from django.db.models import Q
            s = p['search']
            qs = qs.filter(Q(name__icontains=s) | Q(serial__icontains=s)
                           | Q(vendor__icontains=s))
        return qs

    def perform_create(self, serializer):
        obj = serializer.save(created_by_admin=self.request.user)
        services.save_money_row(obj, self.request.user, 'asset')

    def perform_update(self, serializer):
        obj = serializer.save()
        services.log(self.request.user, 'updated', 'asset', obj.id, obj.name)

    def perform_destroy(self, instance):
        services.log(self.request.user, 'deleted', 'asset', instance.id, instance.name)
        instance.delete()


class SubscriptionViewSet(FinanceBaseViewSet):
    serializer_class = SubscriptionSerializer

    def get_queryset(self):
        qs = Subscription.objects.select_related('owner').all()
        p = self.request.query_params
        if p.get('active') in ('1', 'true'):
            qs = qs.filter(is_active=True)
        if p.get('search'):
            from django.db.models import Q
            s = p['search']
            qs = qs.filter(Q(name__icontains=s) | Q(vendor__icontains=s))
        return qs

    def perform_create(self, serializer):
        obj = serializer.save(created_by_admin=self.request.user)
        services.save_money_row(obj, self.request.user, 'subscription')

    def perform_update(self, serializer):
        obj = serializer.save()
        services.log(self.request.user, 'updated', 'subscription', obj.id, obj.name)

    def perform_destroy(self, instance):
        services.log(self.request.user, 'deleted', 'subscription', instance.id, instance.name)
        instance.delete()


class PurchaseRequestViewSet(FinanceBaseViewSet):
    serializer_class = PurchaseRequestSerializer

    def get_queryset(self):
        qs = PurchaseRequest.objects.select_related(
            'requested_by', 'linked_asset').all()
        p = self.request.query_params
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        if p.get('year'):
            qs = qs.filter(raised_on__year=p['year'])
        if p.get('mine') in ('1', 'true'):
            _, member = _tier(self.request.user)
            qs = qs.filter(requested_by_id=member.id) if member else qs.none()
        return qs

    def perform_create(self, serializer):
        """Raising is advisory's job — Finance approves, it does not request."""
        tier, member = _tier(self.request.user)
        if tier not in ('advisory', 'admin'):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only advisory can raise a purchase request.')
        obj = serializer.save(requested_by=member,
                              requested_by_admin=self.request.user)
        services.create_request(obj, self.request.user)

    def perform_update(self, serializer):
        obj = serializer.save()
        services.log(self.request.user, 'updated', 'request', obj.id, obj.title)


class _DecisionView(APIView):
    """Shared gate for the approve/reject/paid actions: Finance decides."""
    permission_classes = [IsAuthenticated, FinancePermission]

    def _get(self, request, pk):
        tier, _ = _tier(request.user)
        if tier not in ('finance', 'admin'):
            return None, Response(
                {'error': 'Only the Finance department can decide on requests.'},
                status=403)
        obj = PurchaseRequest.objects.filter(pk=pk).first()
        if not obj:
            return None, Response({'error': 'Not found.'}, status=404)
        return obj, None


class RequestApproveView(_DecisionView):
    def post(self, request, pk):
        obj, err = self._get(request, pk)
        if err:
            return err
        if obj.status not in ('pending',):
            return Response({'error': f'Request is already {obj.status}.'}, status=400)
        amt = request.data.get('approved_amount')
        services.approve_request(
            obj, request.user,
            approved_amount=amt if amt not in ('', None) else None,
            note=request.data.get('note', ''))
        return Response(PurchaseRequestSerializer(obj, context={'show_money': True}).data)


class RequestRejectView(_DecisionView):
    def post(self, request, pk):
        obj, err = self._get(request, pk)
        if err:
            return err
        services.reject_request(obj, request.user, note=request.data.get('note', ''))
        return Response(PurchaseRequestSerializer(obj, context={'show_money': True}).data)


class RequestPaidView(_DecisionView):
    def post(self, request, pk):
        obj, err = self._get(request, pk)
        if err:
            return err
        try:
            services.mark_paid(
                obj, request.user,
                paid_on=request.data.get('paid_on') or None,
                invoice_url=request.data.get('invoice_url', ''),
                invoice_no=request.data.get('invoice_no', ''))
        except ValueError as exc:
            return Response({'error': str(exc)}, status=400)
        return Response(PurchaseRequestSerializer(obj, context={'show_money': True}).data)


class FinanceSummaryView(APIView):
    """Spend for a year: the calendar's numbers, all in INR."""
    permission_classes = [IsAuthenticated, FinancePermission]

    def get(self, request):
        try:
            year = int(request.query_params.get('year') or date.today().year)
        except ValueError:
            year = date.today().year
        return Response(services.spend_summary(year))


class FinanceBoardView(APIView):
    """Everything the page needs in one call."""
    permission_classes = [IsAuthenticated, FinancePermission]

    def get(self, request):
        tier, member = _tier(request.user)
        ctx = {'show_money': True}

        from career_app.models import OnboardingSubmission
        people = (OnboardingSubmission.objects.filter(status='verified')
                  .only('id', 'candidate_name').order_by('candidate_name'))

        from .models import (
            CATEGORY_CHOICES, CONDITION_CHOICES, CURRENCY_CHOICES,
            CYCLE_CHOICES, ASSET_STATUS_CHOICES, REQUEST_STATUS_CHOICES,
        )
        return Response({
            'tier': tier,
            'can_raise': tier in ('advisory', 'admin'),
            'can_decide': tier in ('finance', 'admin'),
            'assets': AssetItemSerializer(
                AssetItem.objects.select_related('assigned_to')[:400], many=True, context=ctx).data,
            'subscriptions': SubscriptionSerializer(
                Subscription.objects.select_related('owner')[:400], many=True, context=ctx).data,
            'requests': PurchaseRequestSerializer(
                PurchaseRequest.objects.select_related('requested_by')[:400], many=True, context=ctx).data,
            'summary': services.spend_summary(),
            'members': [{'id': m.id, 'name': m.candidate_name} for m in people],
            'choices': {
                'currencies': [{'value': v, 'label': l} for v, l in CURRENCY_CHOICES],
                'categories': [{'value': v, 'label': l} for v, l in CATEGORY_CHOICES],
                'conditions': [{'value': v, 'label': l} for v, l in CONDITION_CHOICES],
                'cycles': [{'value': v, 'label': l} for v, l in CYCLE_CHOICES],
                'asset_statuses': [{'value': v, 'label': l} for v, l in ASSET_STATUS_CHOICES],
                'request_statuses': [{'value': v, 'label': l} for v, l in REQUEST_STATUS_CHOICES],
            },
        })


class ExchangeRateView(APIView):
    """Current rates, and a superadmin override when a feed value is wrong."""
    permission_classes = [IsAuthenticated, FinancePermission]

    def get(self, request):
        latest = {}
        for r in ExchangeRate.objects.order_by('currency', '-on_date'):
            latest.setdefault(r.currency, r)
        return Response({
            'rates': ExchangeRateSerializer(list(latest.values()), many=True).data,
            'supported': currency.SUPPORTED,
        })

    def post(self, request):
        if not getattr(request.user, 'is_superuser', False):
            return Response({'error': 'Only a superadmin can override a rate.'}, status=403)
        cur = (request.data.get('currency') or '').upper()
        rate = request.data.get('rate_to_inr')
        if not cur or rate in (None, ''):
            return Response({'error': 'Give a currency and a rate.'}, status=400)
        obj, _ = ExchangeRate.objects.update_or_create(
            currency=cur, on_date=date.today(),
            defaults={'rate_to_inr': rate, 'source': 'manual', 'is_manual': True})
        services.log(request.user, 'rate_override', 'rate', obj.id,
                     f'1 {cur} = ₹{rate}')
        return Response(ExchangeRateSerializer(obj).data)


class FinanceAuditView(APIView):
    permission_classes = [IsAuthenticated, FinancePermission]

    def get(self, request):
        rows = FinanceAuditLog.objects.all()[:200]
        return Response({'log': FinanceAuditLogSerializer(rows, many=True).data})
