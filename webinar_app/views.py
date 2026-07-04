import datetime
import json
import logging
from decimal import Decimal, InvalidOperation

from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.utils.text import slugify
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, DjangoModelPermissions, IsAuthenticated
from rest_framework.response import Response

from .models import WebinarEvent, RegistrationForm, CalendarEvent, EventFormQuestion
from .serializers import (
    WebinarEventSerializer, RegistrationFormSerializer,
    CalendarEventSerializer, EventFormQuestionSerializer,
)
from . import turso_client
from . import razorpay_client
from .ses_email import send_registration_confirmation

logger = logging.getLogger(__name__)


class StaffModelPermissions(DjangoModelPermissions):
    perms_map = {
        'GET': ['%(app_label)s.view_%(model_name)s'],
        'OPTIONS': [], 'HEAD': [],
        'POST': ['%(app_label)s.add_%(model_name)s'],
        'PUT': ['%(app_label)s.change_%(model_name)s'],
        'PATCH': ['%(app_label)s.change_%(model_name)s'],
        'DELETE': ['%(app_label)s.delete_%(model_name)s'],
    }


def _utcnow():
    return datetime.datetime.now(datetime.timezone.utc)


def _parse_coupon_datetime(value):
    if not value:
        return None
    try:
        parsed = datetime.datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=datetime.timezone.utc)
        return parsed.astimezone(datetime.timezone.utc)
    except ValueError:
        return None


def _coupon_by_code(code):
    rows = turso_client.execute(
        'SELECT * FROM coupons WHERE UPPER(code)=UPPER(:code) LIMIT 1',
        {'code': str(code or '').strip()},
    )
    return rows[0] if rows else None


def _resolve_hosted_price(event_id, event_title, event_type):
    """Read the authoritative INR price from Supabase, never from the browser."""
    from tiesverse_app import supabase_sync

    table = 'workshops' if str(event_type).lower() == 'webinar' else 'events'
    client = supabase_sync.get_client()
    if not client:
        return None
    try:
        rows = (
            client.table(table)
            .select('title,price')
            .eq('title', str(event_title or '').strip())
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        logger.warning('Could not resolve hosted price from %s: %s', table, exc)
        return None
    if not rows:
        return None
    row = rows[0]
    if slugify(str(row.get('title') or '')).lower() != str(event_id or '').strip().lower():
        return None
    try:
        return max(Decimal(str(row.get('price') or 0)), Decimal('0'))
    except InvalidOperation:
        return None


def _evaluate_coupon(code, event_id, event_title, event_type, base_amount):
    coupon = _coupon_by_code(code)
    if not coupon:
        return None, 'Coupon code was not found.'

    normalized_type = str(event_type or 'event').strip().lower()
    request_keys = {
        str(event_id or '').strip().lower(),
        slugify(str(event_title or '')).lower(),
    }
    if str(coupon.get('event_type') or '').lower() != normalized_type \
            or str(coupon.get('event_id') or '').lower() not in request_keys:
        return None, 'This coupon is not valid for the selected event or webinar.'

    if str(coupon.get('active') or '0') != '1':
        return None, 'This coupon has been paused.'

    now = _utcnow()
    starts_at = _parse_coupon_datetime(coupon.get('starts_at'))
    expires_at = _parse_coupon_datetime(coupon.get('expires_at'))
    if starts_at and now < starts_at:
        return None, 'This coupon is not active yet.'
    if expires_at and now >= expires_at:
        return None, 'This coupon has expired.'

    max_redemptions = int(coupon['max_redemptions']) if coupon.get('max_redemptions') not in (None, '') else None
    redeemed_count = int(coupon.get('redeemed_count') or 0)
    if max_redemptions is not None and redeemed_count >= max_redemptions:
        return None, 'This coupon has reached its registration limit.'

    try:
        base = max(Decimal(str(base_amount)), Decimal('0'))
        value = max(Decimal(str(coupon.get('discount_value') or 0)), Decimal('0'))
    except InvalidOperation:
        return None, 'Coupon pricing is invalid.'

    if coupon.get('discount_type') == 'percent':
        discount = base * min(value, Decimal('100')) / Decimal('100')
    else:
        discount = min(value, base)
    final_amount = max(base - discount, Decimal('0'))

    return {
        **coupon,
        'discount_amount': discount.quantize(Decimal('0.01')),
        'final_amount': final_amount.quantize(Decimal('0.01')),
    }, None


def _reserve_coupon(coupon_id):
    rows = turso_client.execute(
        """UPDATE coupons
           SET redeemed_count=redeemed_count+1, updated_at=:updated_at
           WHERE id=:id AND active=1
             AND (max_redemptions IS NULL OR redeemed_count < max_redemptions)
           RETURNING id, redeemed_count""",
        {'id': coupon_id, 'updated_at': _utcnow().isoformat()},
    )
    return bool(rows)


def _release_coupon(code):
    if not code:
        return
    turso_client.execute(
        """UPDATE coupons
           SET redeemed_count=CASE WHEN redeemed_count > 0 THEN redeemed_count-1 ELSE 0 END,
               updated_at=:updated_at
           WHERE UPPER(code)=UPPER(:code)""",
        {'code': code, 'updated_at': _utcnow().isoformat()},
    )


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def coupons(request):
    """List or create event-specific coupons in hosted Turso."""
    turso_client.setup_tables()
    if request.method == 'GET':
        rows = turso_client.execute('SELECT * FROM coupons ORDER BY created_at DESC')
        return Response({'rows': rows, 'count': len(rows)})

    data = request.data
    code = str(data.get('code') or '').strip().upper()
    event_id = str(data.get('event_id') or '').strip()
    event_title = str(data.get('event_title') or '').strip()
    event_type = str(data.get('event_type') or '').strip().lower()
    discount_type = str(data.get('discount_type') or 'percent').strip().lower()
    try:
        discount_value = Decimal(str(data.get('discount_value')))
    except (InvalidOperation, TypeError):
        return Response({'error': 'Enter a valid discount value.'}, status=400)

    if not code or not event_id or not event_title or event_type not in ('event', 'webinar'):
        return Response({'error': 'Code and a valid event/webinar target are required.'}, status=400)
    if discount_type not in ('percent', 'fixed') or discount_value <= 0:
        return Response({'error': 'Discount must be a positive percentage or fixed amount.'}, status=400)
    if discount_type == 'percent' and discount_value > 100:
        return Response({'error': 'Percentage discounts cannot exceed 100%.'}, status=400)

    max_redemptions = str(data.get('max_redemptions') or '').strip()
    if max_redemptions and (not max_redemptions.isdigit() or int(max_redemptions) < 1):
        return Response({'error': 'Registration limit must be at least 1.'}, status=400)

    starts_at = str(data.get('starts_at') or '').strip()
    expires_at = str(data.get('expires_at') or '').strip()
    if starts_at and not _parse_coupon_datetime(starts_at):
        return Response({'error': 'Start date is invalid.'}, status=400)
    if expires_at and not _parse_coupon_datetime(expires_at):
        return Response({'error': 'Expiry date is invalid.'}, status=400)
    if starts_at and expires_at and _parse_coupon_datetime(starts_at) >= _parse_coupon_datetime(expires_at):
        return Response({'error': 'Expiry must be later than the start date.'}, status=400)

    now = _utcnow().isoformat()
    try:
        turso_client.execute(
            """INSERT INTO coupons
               (code,event_id,event_title,event_type,discount_type,discount_value,
                starts_at,expires_at,max_redemptions,redeemed_count,active,created_at,updated_at)
               VALUES (:code,:event_id,:event_title,:event_type,:discount_type,:discount_value,
                       NULLIF(:starts_at,''),NULLIF(:expires_at,''),NULLIF(:max_redemptions,''),
                       0,:active,:created_at,:updated_at)""",
            {
                'code': code, 'event_id': event_id, 'event_title': event_title,
                'event_type': event_type, 'discount_type': discount_type,
                'discount_value': str(discount_value), 'starts_at': starts_at,
                'expires_at': expires_at, 'max_redemptions': max_redemptions,
                'active': 1 if data.get('active', True) else 0,
                'created_at': now, 'updated_at': now,
            },
        )
    except turso_client.TursoError as exc:
        if 'UNIQUE' in str(exc).upper():
            return Response({'error': 'That coupon code already exists.'}, status=409)
        return Response({'error': str(exc)}, status=503)
    return Response(_coupon_by_code(code), status=201)


@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def coupon_detail(request, coupon_id):
    turso_client.setup_tables()
    rows = turso_client.execute('SELECT * FROM coupons WHERE id=:id LIMIT 1', {'id': coupon_id})
    if not rows:
        return Response({'error': 'Coupon not found.'}, status=404)
    existing = rows[0]

    if request.method == 'DELETE':
        turso_client.execute('DELETE FROM coupons WHERE id=:id', {'id': coupon_id})
        return Response(status=204)

    data = request.data
    allowed = {
        'code', 'event_id', 'event_title', 'event_type', 'discount_type',
        'discount_value', 'starts_at', 'expires_at', 'max_redemptions', 'active',
    }
    merged = {**existing, **{key: data[key] for key in allowed if key in data}}
    code = str(merged.get('code') or '').strip().upper()
    event_type = str(merged.get('event_type') or '').lower()
    discount_type = str(merged.get('discount_type') or '').lower()
    try:
        discount_value = Decimal(str(merged.get('discount_value')))
    except InvalidOperation:
        return Response({'error': 'Enter a valid discount value.'}, status=400)
    if not code or event_type not in ('event', 'webinar') or discount_type not in ('percent', 'fixed'):
        return Response({'error': 'Coupon settings are invalid.'}, status=400)
    if discount_value <= 0 or (discount_type == 'percent' and discount_value > 100):
        return Response({'error': 'Discount value is outside the allowed range.'}, status=400)

    starts_at = str(merged.get('starts_at') or '').strip()
    expires_at = str(merged.get('expires_at') or '').strip()
    max_redemptions = str(merged.get('max_redemptions') or '').strip()
    if max_redemptions and (not max_redemptions.isdigit() or int(max_redemptions) < 1):
        return Response({'error': 'Registration limit must be at least 1.'}, status=400)
    if starts_at and expires_at and (
        not _parse_coupon_datetime(starts_at)
        or not _parse_coupon_datetime(expires_at)
        or _parse_coupon_datetime(starts_at) >= _parse_coupon_datetime(expires_at)
    ):
        return Response({'error': 'Coupon schedule is invalid.'}, status=400)

    try:
        turso_client.execute(
            """UPDATE coupons SET
                 code=:code,event_id=:event_id,event_title=:event_title,event_type=:event_type,
                 discount_type=:discount_type,discount_value=:discount_value,
                 starts_at=NULLIF(:starts_at,''),expires_at=NULLIF(:expires_at,''),
                 max_redemptions=NULLIF(:max_redemptions,''),active=:active,updated_at=:updated_at
               WHERE id=:id""",
            {
                'id': coupon_id, 'code': code,
                'event_id': str(merged.get('event_id') or ''),
                'event_title': str(merged.get('event_title') or ''),
                'event_type': event_type, 'discount_type': discount_type,
                'discount_value': str(discount_value), 'starts_at': starts_at,
                'expires_at': expires_at, 'max_redemptions': max_redemptions,
                'active': 1 if str(merged.get('active')).lower() in ('1', 'true') else 0,
                'updated_at': _utcnow().isoformat(),
            },
        )
    except turso_client.TursoError as exc:
        if 'UNIQUE' in str(exc).upper():
            return Response({'error': 'That coupon code already exists.'}, status=409)
        return Response({'error': str(exc)}, status=503)
    return Response(turso_client.execute('SELECT * FROM coupons WHERE id=:id', {'id': coupon_id})[0])


@api_view(['POST'])
@permission_classes([AllowAny])
def validate_coupon(request):
    turso_client.setup_tables()
    data = request.data
    base_amount = _resolve_hosted_price(
        data.get('event_id'), data.get('event_title'), data.get('event_type'),
    )
    if base_amount is None or base_amount <= 0:
        return Response({'valid': False, 'error': 'The paid event price could not be verified.'}, status=400)
    result, error = _evaluate_coupon(
        data.get('code'), data.get('event_id'), data.get('event_title'),
        data.get('event_type'), base_amount,
    )
    if error:
        return Response({'valid': False, 'error': error}, status=400)
    return Response({
        'valid': True,
        'code': result['code'],
        'discount_type': result['discount_type'],
        'discount_value': result['discount_value'],
        'discount_amount': str(result['discount_amount']),
        'final_amount': str(result['final_amount']),
        'remaining_uses': (
            None if result.get('max_redemptions') in (None, '')
            else max(int(result['max_redemptions']) - int(result.get('redeemed_count') or 0), 0)
        ),
    })


# ── public registration endpoint ─────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([AllowAny])
def register_for_event(request):
    """
    Public endpoint — no JWT required.
    Accepts: { event_id, event_title, event_type, name, email, phone, city, event_date }
    Saves to Turso, sends SES confirmation email.
    """
    data = request.data
    name = str(data.get('name') or '').strip()
    email = str(data.get('email') or '').strip().lower()
    event_title = str(data.get('event_title') or '').strip()
    event_type = str(data.get('event_type') or 'event').strip()

    if not name or not email or not event_title:
        return Response({'error': 'name, email and event_title are required'}, status=400)

    now = datetime.datetime.utcnow().isoformat()
    event_date = str(data.get('event_date') or '')

    if turso_client.is_configured():
        try:
            turso_client.setup_tables()
            turso_client.execute(
                """INSERT INTO registrations
                   (event_id, event_title, event_type, event_date, name, email, phone,
                    role, organization, country, city, source, expectations, speaker_question, registered_at)
                   VALUES (:event_id, :event_title, :event_type, :event_date, :name, :email, :phone,
                           :role, :organization, :country, :city, :source, :expectations, :speaker_question, :registered_at)""",
                {
                    'event_id':        str(data.get('event_id') or ''),
                    'event_title':     event_title,
                    'event_type':      event_type,
                    'event_date':      event_date,
                    'name':            name,
                    'email':           email,
                    'phone':           str(data.get('phone') or ''),
                    'role':            str(data.get('role') or ''),
                    'organization':    str(data.get('organization') or ''),
                    'country':         str(data.get('country') or ''),
                    'city':            str(data.get('city') or ''),
                    'source':          str(data.get('source') or ''),
                    'expectations':    str(data.get('expectations') or ''),
                    'speaker_question':str(data.get('speaker_question') or ''),
                    'registered_at':   now,
                },
            )
        except turso_client.TursoError as exc:
            logger.error('Turso registration insert failed: %s', exc)
            return Response({'error': 'Registration could not be saved. Please try again.'}, status=500)

        email_sent = send_registration_confirmation(email, name, event_title, event_type, event_date)

        if email_sent:
            try:
                row_id = turso_client.execute('SELECT last_insert_rowid() AS id')
                if row_id:
                    turso_client.execute(
                        'UPDATE registrations SET email_sent = 1 WHERE id = :id',
                        {'id': row_id[0]['id']},
                    )
            except turso_client.TursoError:
                pass
    else:
        logger.warning('Turso not configured — registration from %s not persisted', email)
        email_sent = send_registration_confirmation(email, name, event_title, event_type, event_date)

    return Response({
        'status': 'registered',
        'email_sent': email_sent,
    })


# ── admin-only registrations list (reads from Turso) ─────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_registrations(request):
    """Returns all registrations from Turso. Admin only (JWT required)."""
    if not turso_client.is_configured():
        return Response({'error': 'Turso not configured', 'rows': []}, status=503)
    try:
        turso_client.setup_tables()
        rows = turso_client.execute(
            'SELECT * FROM registrations ORDER BY registered_at DESC LIMIT 500'
        )
        return Response({'rows': rows, 'count': len(rows)})
    except turso_client.TursoError as exc:
        logger.error('list_registrations failed: %s', exc)
        return Response({'error': str(exc), 'rows': []}, status=503)


# ── Django ORM–backed viewsets (webinar events, calendar) ────────────────────

class WebinarEventViewSet(viewsets.ModelViewSet):
    queryset = WebinarEvent.objects.all()
    serializer_class = WebinarEventSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]

    @action(detail=True, methods=['post'], url_path='calendar-sync')
    def calendar_sync(self, request, pk=None):
        webinar = self.get_object()
        CalendarEvent.objects.update_or_create(
            webinar=webinar,
            defaults={'calendar_id': f'cal_{webinar.id}', 'sync_status': True},
        )
        return Response({'status': 'Synced with calendar'})


class CalendarEventViewSet(viewsets.ModelViewSet):
    queryset = CalendarEvent.objects.all()
    serializer_class = CalendarEventSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]


# ── Razorpay: create order ─────────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([AllowAny])
def create_payment_order(request):
    """
    Step 1 of paid registration.
    Called when the event has a price > 0.
    Returns a Razorpay order_id the frontend uses to open the checkout modal.
    """
    data = request.data
    event_id    = str(data.get('event_id') or '')
    event_title = str(data.get('event_title') or '').strip()
    event_type  = str(data.get('event_type') or 'event').strip().lower()
    name        = str(data.get('name') or '').strip()
    email       = str(data.get('email') or '').strip()
    coupon_code = str(data.get('coupon_code') or '').strip().upper()

    amount_inr = _resolve_hosted_price(event_id, event_title, event_type)

    if not event_title or not email:
        return Response({'error': 'event_title and email are required.'}, status=400)
    if amount_inr is None or amount_inr <= 0:
        return Response({'error': 'The paid event price could not be verified.'}, status=400)

    turso_client.setup_tables()
    coupon = None
    if coupon_code:
        coupon, coupon_error = _evaluate_coupon(
            coupon_code, event_id, event_title, event_type, amount_inr,
        )
        if coupon_error:
            return Response({'error': coupon_error}, status=400)
        if not _reserve_coupon(coupon['id']):
            return Response({'error': 'This coupon is no longer available.'}, status=409)

    discount_amount = coupon['discount_amount'] if coupon else Decimal('0')
    final_amount = coupon['final_amount'] if coupon else amount_inr
    now = _utcnow().isoformat()
    registration_params = {
        'event_id': event_id,
        'event_title': event_title,
        'event_type': event_type,
        'event_date': str(data.get('event_date') or ''),
        'name': name,
        'email': email,
        'phone': str(data.get('phone') or ''),
        'city': str(data.get('city') or ''),
        'registered_at': now,
        'amount': int(round(amount_inr * 100)),
        'coupon_code': coupon_code,
        'discount_amount': int(round(discount_amount * 100)),
        'final_amount': int(round(final_amount * 100)),
        'coupon_redeemed': 1 if coupon else 0,
    }

    # A 100% coupon completes registration without opening Razorpay.
    if final_amount <= 0:
        try:
            turso_client.execute(
                """INSERT INTO registrations
                   (event_id,event_title,event_type,event_date,name,email,phone,city,registered_at,
                    payment_required,amount,payment_status,coupon_code,discount_amount,
                    final_amount,coupon_redeemed)
                   VALUES (:event_id,:event_title,:event_type,:event_date,:name,:email,:phone,:city,
                           :registered_at,0,:amount,'free',:coupon_code,:discount_amount,
                           :final_amount,:coupon_redeemed)""",
                registration_params,
            )
        except turso_client.TursoError as exc:
            if coupon:
                _release_coupon(coupon_code)
            logger.error('Turso coupon registration insert failed: %s', exc)
            return Response({'error': 'Registration could not be saved.'}, status=503)

        email_sent = send_registration_confirmation(
            email, name, event_title, event_type, str(data.get('event_date') or ''),
        )
        return Response({
            'status': 'registered',
            'free': True,
            'coupon_code': coupon_code,
            'discount_amount': str(discount_amount),
            'final_amount': '0.00',
            'email_sent': email_sent,
        })

    if not razorpay_client.is_configured():
        if coupon:
            _release_coupon(coupon_code)
        return Response({'error': 'Payment system not configured.'}, status=503)

    try:
        order = razorpay_client.create_order(
            amount_inr=float(final_amount),
            receipt=f'tvev-{event_id[:20]}-{email[:15]}',
            notes={
                'event': event_title,
                'email': email,
                'name': name,
                'coupon': coupon_code,
            },
        )
    except Exception as exc:
        if coupon:
            _release_coupon(coupon_code)
        logger.error('Razorpay create_order failed: %s', exc)
        return Response({'error': 'Could not create payment order.'}, status=500)

    # Save a pending row to Turso so we can match it on verification
    if turso_client.is_configured():
        try:
            turso_client.execute(
                """INSERT INTO registrations
                   (event_id, event_title, event_type, event_date, name, email,
                    phone, city, registered_at,
                    payment_required, amount, razorpay_order_id, payment_status,
                    coupon_code,discount_amount,final_amount,coupon_redeemed)
                   VALUES (:event_id,:event_title,:event_type,:event_date,:name,:email,
                           :phone,:city,:registered_at,
                           1,:amount,:razorpay_order_id,'pending',
                           :coupon_code,:discount_amount,:final_amount,:coupon_redeemed)""",
                {
                    **registration_params,
                    'razorpay_order_id': order['order_id'],
                },
            )
        except turso_client.TursoError as exc:
            if coupon:
                _release_coupon(coupon_code)
            logger.warning('Turso pending row insert failed: %s', exc)
            return Response({'error': 'Payment order was created but registration could not be reserved.'}, status=503)

    return Response({
        **order,
        'coupon_code': coupon_code,
        'discount_amount': str(discount_amount),
        'final_amount': str(final_amount),
    })


# ── Razorpay: verify payment ───────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([AllowAny])
def verify_payment(request):
    """
    Step 2 of paid registration.
    Called by the frontend after the Razorpay checkout modal succeeds.
    Verifies HMAC signature, marks the registration paid, sends confirmation email.
    """
    data               = request.data
    razorpay_order_id  = str(data.get('razorpay_order_id') or '')
    razorpay_payment_id = str(data.get('razorpay_payment_id') or '')
    razorpay_signature = str(data.get('razorpay_signature') or '')

    if not all([razorpay_order_id, razorpay_payment_id, razorpay_signature]):
        return Response({'error': 'Missing payment verification fields.'}, status=400)

    if not razorpay_client.verify_payment_signature(
        razorpay_order_id, razorpay_payment_id, razorpay_signature
    ):
        logger.warning('Razorpay signature mismatch for order %s', razorpay_order_id)
        return Response({'error': 'Payment verification failed.'}, status=400)

    # Mark paid in Turso and fetch the row for the email
    row = None
    if turso_client.is_configured():
        try:
            turso_client.execute(
                """UPDATE registrations
                   SET payment_status='paid', razorpay_payment_id=:pid
                   WHERE razorpay_order_id=:oid""",
                {'pid': razorpay_payment_id, 'oid': razorpay_order_id},
            )
            rows = turso_client.execute(
                'SELECT * FROM registrations WHERE razorpay_order_id=:oid LIMIT 1',
                {'oid': razorpay_order_id},
            )
            row = rows[0] if rows else None
        except turso_client.TursoError as exc:
            logger.warning('Turso payment update failed: %s', exc)

    email_sent = False
    if row:
        email_sent = send_registration_confirmation(
            to_email=row.get('email', ''),
            name=row.get('name', 'Guest'),
            event_title=row.get('event_title', ''),
            event_type=row.get('event_type', 'event'),
        )
        if email_sent and turso_client.is_configured():
            try:
                turso_client.execute(
                    'UPDATE registrations SET email_sent=1 WHERE razorpay_order_id=:oid',
                    {'oid': razorpay_order_id},
                )
            except turso_client.TursoError:
                pass

    return Response({'status': 'paid', 'email_sent': email_sent})


# ── Razorpay: webhook ──────────────────────────────────────────────────────────
@csrf_exempt
def razorpay_webhook(request):
    """
    Receives Razorpay server-side webhooks (payment.captured, payment.failed, etc.).
    Configure the webhook URL in the Razorpay dashboard:
      https://yourdomain/api/webinar/razorpay-webhook/
    """
    from django.http import HttpResponse, HttpResponseForbidden

    if request.method != 'POST':
        return HttpResponse(status=405)

    sig = request.META.get('HTTP_X_RAZORPAY_SIGNATURE', '')
    if not razorpay_client.verify_webhook_signature(request.body, sig):
        return HttpResponseForbidden('Invalid signature')

    try:
        payload = json.loads(request.body.decode())
    except (json.JSONDecodeError, UnicodeDecodeError):
        return HttpResponse('Bad JSON', status=400)

    event   = payload.get('event', '')
    entity  = payload.get('payload', {}).get('payment', {}).get('entity', {})
    order_id   = entity.get('order_id', '')
    payment_id = entity.get('id', '')

    if event == 'payment.captured' and order_id and turso_client.is_configured():
        try:
            turso_client.execute(
                """UPDATE registrations
                   SET payment_status='paid', razorpay_payment_id=:pid
                   WHERE razorpay_order_id=:oid AND payment_status != 'paid'""",
                {'pid': payment_id, 'oid': order_id},
            )
            logger.info('Webhook: marked order %s as paid', order_id)
        except turso_client.TursoError as exc:
            logger.warning('Webhook Turso update failed: %s', exc)

    elif event == 'payment.failed' and order_id and turso_client.is_configured():
        try:
            rows = turso_client.execute(
                """SELECT coupon_code,coupon_redeemed,payment_status
                   FROM registrations WHERE razorpay_order_id=:oid LIMIT 1""",
                {'oid': order_id},
            )
            row = rows[0] if rows else None
            if row and str(row.get('coupon_redeemed') or '0') == '1' \
                    and row.get('payment_status') != 'failed':
                _release_coupon(row.get('coupon_code'))
            turso_client.execute(
                """UPDATE registrations
                   SET payment_status='failed', coupon_redeemed=0
                   WHERE razorpay_order_id=:oid""",
                {'oid': order_id},
            )
        except turso_client.TursoError:
            pass


# ─── Form Questions ───────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def form_questions(request):
    """List or create form questions for an event/webinar.
    GET is public (website reads form schema). POST requires a logged-in admin.
    """
    event_key  = request.query_params.get('event_key', '').strip()
    event_type = request.query_params.get('event_type', '').strip()

    if request.method == 'GET':
        qs = EventFormQuestion.objects.filter(event_key=event_key, event_type=event_type).order_by('order')
        return Response(EventFormQuestionSerializer(qs, many=True).data)

    # POST — admin only
    if not request.user or not request.user.is_authenticated:
        return Response({'error': 'Authentication required.'}, status=status.HTTP_403_FORBIDDEN)

    # POST — create; prefer body values, fall back to query params
    body_key  = str(request.data.get('event_key') or '').strip()
    body_type = str(request.data.get('event_type') or '').strip()
    data = {
        **request.data,
        'event_key':  body_key  or event_key,
        'event_type': body_type or event_type,
    }
    serializer = EventFormQuestionSerializer(data=data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def form_question_detail(request, pk):
    """Retrieve, update or delete a single form question."""
    try:
        question = EventFormQuestion.objects.get(pk=pk)
    except EventFormQuestion.DoesNotExist:
        return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        return Response(EventFormQuestionSerializer(question).data)

    if request.method == 'PATCH':
        serializer = EventFormQuestionSerializer(question, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    # DELETE
    question.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def reorder_form_questions(request):
    """Bulk-update `order` field. Body: { items: [{id, order}, …] }"""
    items = request.data.get('items', [])
    updated = []
    for item in items:
        try:
            q = EventFormQuestion.objects.get(pk=item['id'])
            q.order = item['order']
            q.save(update_fields=['order'])
            updated.append(q.id)
        except (EventFormQuestion.DoesNotExist, KeyError):
            pass
    return Response({'updated': updated})


# ─── Public events listing (website) ─────────────────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def list_public_events(request):
    """
    Public endpoint — no JWT required.
    Returns all EventRegistration rows so the website can list them dynamically.
    """
    from tiesverse_app.models import EventRegistration
    status_filter = request.query_params.get('status', '')
    try:
        qs = EventRegistration.objects.using('turso_db').all()
        if status_filter in ('upcoming', 'past'):
            qs = qs.filter(status=status_filter)
        data = [
            {
                'kind':           e.kind or 'webinar',
                'title':          e.title or '',
                'description':    e.description or '',
                'date':           e.date or '',
                'time_tz':        e.time_tz or '',
                'host':           e.host or '',
                'host_image_url': e.host_image_url or '',
                'price':          int(e.price or 0),
                'cover_url':      e.cover_url or '',
                'status':         e.status or 'upcoming',
                'slug':           slugify(e.title or ''),
            }
            for e in qs
        ]
        return Response(data)
    except Exception as exc:
        logger.warning('list_public_events failed: %s', exc)
        return Response([])


# ─── Attendee Tracking (Turso) ────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_attended(request):
    """
    Toggle the `attended` flag on Turso registration rows.
    Body: { ids: [int, …], attended: true|false }
    """
    ids      = request.data.get('ids', [])
    attended = bool(request.data.get('attended', True))

    if not ids:
        return Response({'error': 'No ids provided.'}, status=status.HTTP_400_BAD_REQUEST)
    if not turso_client.is_configured():
        return Response({'error': 'Turso not configured.'}, status=503)

    try:
        turso_client.setup_tables()
    except turso_client.TursoError:
        pass

    placeholders = ', '.join([':id' + str(i) for i in range(len(ids))])
    params = {f'id{i}': id_val for i, id_val in enumerate(ids)}
    params['attended'] = 1 if attended else 0

    try:
        turso_client.execute(
            f"UPDATE registrations SET attended=:attended WHERE id IN ({placeholders})",
            params,
        )
    except turso_client.TursoError as exc:
        logger.error('mark_attended update failed: %s', exc)
        return Response({'error': str(exc)}, status=503)
    return Response({'updated': len(ids), 'attended': attended})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_registrations_extended(request):
    """
    Same as list_registrations but includes the `attended` column.
    GET /api/webinar/registrations-full/
    Optional query: ?event_key=... to filter by event
    """
    if not turso_client.is_configured():
        return Response({'rows': [], 'count': 0})
    try:
        turso_client.setup_tables()
    except turso_client.TursoError as exc:
        logger.error('setup_tables failed in list_registrations_extended: %s', exc)
        return Response({'rows': [], 'count': 0, 'error': str(exc)}, status=503)

    event_key = request.query_params.get('event_key', '').strip()
    try:
        if event_key:
            rows = turso_client.execute(
                "SELECT * FROM registrations WHERE event_id=:ek ORDER BY registered_at DESC LIMIT 1000",
                {'ek': event_key},
            )
        else:
            rows = turso_client.execute(
                "SELECT * FROM registrations ORDER BY registered_at DESC LIMIT 1000"
            )
        return Response({'rows': rows, 'count': len(rows)})
    except turso_client.TursoError as exc:
        logger.error('list_registrations_extended query failed: %s', exc)
        return Response({'rows': [], 'count': 0, 'error': str(exc)}, status=503)


# ─── Event Certificate Link ───────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def event_certificate_link(request):
    """
    GET  ?event_key=...&event_type=event|webinar  → current cert assignment
    POST { event_key, event_type, template_id, template_name }  → save assignment
    """
    from tiesverse_app.models import EventRegistration, Event

    event_key  = request.query_params.get('event_key') or request.data.get('event_key', '')
    event_type = request.query_params.get('event_type') or request.data.get('event_type', 'webinar')
    event_key  = str(event_key).strip()
    event_type = str(event_type).strip().lower()

    def _get_obj():
        if event_type == 'event':
            return Event.objects.filter(id=event_key).first() or \
                   Event.objects.filter(title__iexact=event_key).first()
        return EventRegistration.objects.filter(id=event_key).first() or \
               EventRegistration.objects.filter(title__iexact=event_key).first()

    if request.method == 'GET':
        obj = _get_obj()
        if not obj:
            return Response({'template_id': '', 'template_name': ''})
        return Response({
            'template_id':   getattr(obj, 'certificate_template_id', ''),
            'template_name': getattr(obj, 'certificate_template_name', ''),
        })

    # POST — save assignment
    template_id   = str(request.data.get('template_id', '')).strip()
    template_name = str(request.data.get('template_name', '')).strip()
    obj = _get_obj()
    if not obj:
        return Response({'error': 'Event/webinar not found.'}, status=404)

    obj.certificate_template_id   = template_id
    obj.certificate_template_name = template_name
    obj.save(update_fields=['certificate_template_id', 'certificate_template_name'])
    return Response({'saved': True, 'template_id': template_id, 'template_name': template_name})
