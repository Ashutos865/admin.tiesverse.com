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
from .webinar_access import (
    require_webinar_cap, member_capabilities, can_grant, WebinarEventPermission,
    CAPABILITIES, CAP_KEYS,
)

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
    """Authoritative INR price from EventRegistration (turso_db) — the SAME source
    the public website lists from — never from the browser.

    Matches on the event title (case-insensitive) first, then falls back to a slug
    match, so underscores/case in the title never break verification.
    """
    from tiesverse_app.models import EventRegistration

    title = str(event_title or '').strip()
    eid = str(event_id or '').strip().lower()
    try:
        match = EventRegistration.objects.using('turso_db').filter(title__iexact=title).first()
        if not match and eid:
            for e in EventRegistration.objects.using('turso_db').all():
                if slugify(e.title or '').lower() == eid:
                    match = e
                    break
        if not match:
            return None
        return max(Decimal(str(match.price or 0)), Decimal('0'))
    except Exception as exc:
        logger.warning('Could not resolve hosted price: %s', exc)
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

        # FREE webinars: every registrant gets the Meet link now. PAID webinars:
        # the link is only sent after payment (see verify_payment), so skip here.
        meeting_link = _deliver_meeting_link(data.get('event_id'), event_title, email, free_only=True)
        email_sent = send_registration_confirmation(email, name, event_title, event_type, event_date, meeting_link=meeting_link)

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
        meeting_link = _deliver_meeting_link(data.get('event_id'), event_title, email, free_only=True)
        email_sent = send_registration_confirmation(email, name, event_title, event_type, event_date, meeting_link=meeting_link)

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
    permission_classes = [IsAuthenticated, WebinarEventPermission]

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

        # 100%-off coupon on a paid webinar → confirmed attendee, so send the link.
        meeting_link = _deliver_meeting_link(data.get('event_id'), event_title, email)
        email_sent = send_registration_confirmation(
            email, name, event_title, event_type, str(data.get('event_date') or ''),
            meeting_link=meeting_link,
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
        # Paid registrant → add them as a guest on the webinar's Meet + send the link.
        meeting_link = ''
        try:
            from config import google_calendar
            ev = _find_event_registration(event_key=row.get('event_id') or row.get('event_title'))
            if ev:
                meeting_link = ev.meeting_link or ''
                if ev.calendar_event_id and row.get('email'):
                    google_calendar.add_guest(ev.calendar_event_id, row.get('email'))
        except Exception:  # noqa: BLE001
            pass
        email_sent = send_registration_confirmation(
            to_email=row.get('email', ''),
            name=row.get('name', 'Guest'),
            event_title=row.get('event_title', ''),
            event_type=row.get('event_type', 'event'),
            meeting_link=meeting_link,
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
@require_webinar_cap('manage_questions')
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
@require_webinar_cap('manage_questions')
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
@require_webinar_cap('manage_questions')
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
    from django.core.cache import cache
    status_filter = request.query_params.get('status', '')
    cache_key = f'public_events:{status_filter or "all"}'
    cached = cache.get(cache_key)
    if cached is not None:
        return Response(cached)
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
        cache.set(cache_key, data, 60)   # 60s — new events appear within a minute
        return Response(data)
    except Exception as exc:
        logger.warning('list_public_events failed: %s', exc)
        return Response([])


# ─── Attendee Tracking (Turso) ────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
@require_webinar_cap('manage_registrations')
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
@require_webinar_cap('manage_registrations')
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
@require_webinar_cap('send_emails')
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
        # The frontend keys events by their slugified title (e.g. "test"), not the
        # numeric PK — so only try an id lookup when the key is actually numeric,
        # then fall back to an exact title match, then a slug match.
        Model = Event if event_type == 'event' else EventRegistration
        ek = str(event_key).strip()
        if ek.isdigit():
            obj = Model.objects.filter(id=int(ek)).first()
            if obj:
                return obj
        obj = Model.objects.filter(title__iexact=ek).first()
        if obj:
            return obj
        for e in Model.objects.all():
            if slugify(e.title) == ek:
                return e
        return None

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


# ─── Per-webinar mail automation (broadcast) + send analytics ─────────────────

def _load_event_registrants(event_key, audience='all'):
    """Return this webinar's registrants from Turso, filtered by audience.
    audience: 'all' | 'attended' | 'not_attended'."""
    if not turso_client.is_configured():
        return []
    try:
        turso_client.setup_tables()
    except turso_client.TursoError:
        pass
    rows = turso_client.execute(
        "SELECT * FROM registrations WHERE event_id=:ek ORDER BY registered_at DESC LIMIT 2000",
        {'ek': str(event_key)},
    )
    if audience == 'attended':
        rows = [r for r in rows if int(r.get('attended') or 0) == 1]
    elif audience == 'not_attended':
        rows = [r for r in rows if int(r.get('attended') or 0) != 1]
    return rows


def _fetch_url_attachments(metas):
    """Download admin-uploaded files ({url, filename}) into email attachment
    tuples. The same files go to every recipient, so this runs once per send.
    Skips anything that fails; caps combined size to keep emails deliverable."""
    from urllib.request import urlopen
    import os
    out, total = [], 0
    for m in (metas or []):
        url = str((m or {}).get('url') or '').strip()
        if not url:
            continue
        fname = str((m or {}).get('filename') or '').strip() or os.path.basename(url.split('?')[0]) or 'attachment'
        try:
            with urlopen(url, timeout=25) as resp:
                blob = resp.read()
        except Exception:  # noqa: BLE001
            continue
        if not blob:
            continue
        total += len(blob)
        if total > 20 * 1024 * 1024:   # ~20 MB combined cap
            break
        ext = (fname.rsplit('.', 1)[-1] if '.' in fname else '').lower()
        subtype = 'pdf' if ext == 'pdf' else 'octet-stream'
        out.append((fname, blob, subtype))
    return out


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@require_webinar_cap('send_emails')
def webinar_broadcast(request):
    """
    Bulk-email a webinar's registrants using an admin email template.
    Body: {
      event_key, event_type, event_title,
      template_key,                 # e.g. webinar_reminder | webinar_followup | any key
      subject (optional override),
      audience: 'all' | 'attended' | 'not_attended',
      extra_context: { join_link, recording_link, time, ... },   # merged into tokens
      test_email (optional)         # if set, send ONE test to this address only
    }
    Records one EmailSendLog per recipient + one aggregate EmailCampaign.
    """
    from accounts_app.models import EmailSendLog, EmailCampaign
    from config.email_templates import get_template, render_tokens, resolve_from
    from config.email_utils import send_email

    data = request.data or {}
    event_key   = str(data.get('event_key') or '').strip()
    event_type  = str(data.get('event_type') or 'webinar').strip()
    event_title = str(data.get('event_title') or '').strip()
    template_key = str(data.get('template_key') or '').strip()
    audience    = str(data.get('audience') or 'all').strip()
    subject_override = str(data.get('subject') or '').strip()
    extra = data.get('extra_context') or {}
    test_email  = str(data.get('test_email') or '').strip().lower()

    # Certificate attachment options
    cert_template_id = str(data.get('certificate_template_id') or '').strip()
    include_certificate = bool(data.get('include_certificate')) and bool(cert_template_id)
    include_id = bool(data.get('include_id'))
    cert_fields = data.get('certificate_fields') or {}    # {var: {source, value}} explicit mapping
    cert_name_var = cert_id_var = None
    cert_all_vars = []
    if include_certificate:
        try:
            cert_name_var, cert_id_var, cert_all_vars = _cert_template_vars(cert_template_id)
        except Exception:  # noqa: BLE001
            return Response({'error': 'Could not read the certificate template — check it still exists.'}, status=502)

    if not template_key:
        return Response({'error': 'template_key is required.'}, status=400)
    tpl = get_template(template_key)
    if tpl is None:
        return Response({'error': f'Unknown template: {template_key}'}, status=400)

    actor = (request.user.get_full_name() or request.user.get_username() or '')[:200]

    def _context_for(name, row=None):
        from config.email_templates import variable_defaults
        ctx = {
            # declared-variable defaults first, so any {{token}} the admin defined
            # a default for is filled even when not supplied here (no leaks).
            **variable_defaults(getattr(tpl, 'variables', None)),
            'name': name or 'there',
            'topic': event_title,
            'event_title': event_title,
            'event_type': event_type,
        }
        for k, v in (extra or {}).items():
            ctx[str(k)] = v
        # per-recipient columns (from an uploaded/typed list) become tokens too
        for k, v in (row or {}).items():
            if k not in ('email', 'name') and v not in (None, ''):
                ctx[str(k)] = v
        return ctx

    def _send_one(to_email, name, row=None, attachments=None):
        ctx = _context_for(name, row)
        subject = render_tokens(subject_override or tpl.subject, ctx)
        body = render_tokens(tpl.body_html, ctx)
        ok = send_email(to_email, subject, body, from_email=resolve_from(tpl), enabled=True, attachments=attachments)
        return ok, subject

    def _cert_attachment(name, row=None):
        """Generate this recipient's certificate PDF; returns attachments list or None."""
        if not include_certificate:
            return None, ''
        cert_id = _make_cert_id(event_title) if include_id else ''
        try:
            gen_data = _build_cert_data(cert_fields, row, name, cert_id, cert_name_var, cert_id_var, cert_all_vars)
            pdf = _generate_certificate_pdf(cert_template_id, gen_data)
            fname = f"certificate-{(name or 'participant').replace(' ', '_')[:40]}.pdf"
            return [(fname, pdf, 'pdf')], cert_id
        except Exception:  # noqa: BLE001
            return None, ''

    # Admin-uploaded documents/PDFs — same set attached to every recipient.
    doc_attachments = _fetch_url_attachments(data.get('attachments'))

    # ---- test send: one email, not logged as a campaign ----
    if test_email:
        cert_att, _cid = _cert_attachment('Preview Name')
        att = (cert_att or []) + doc_attachments
        ok, subject = _send_one(test_email, 'Preview', attachments=(att or None))
        return Response({'test': True, 'sent': bool(ok), 'stubbed': not ok, 'to': test_email, 'subject': subject})

    if not event_key:
        return Response({'error': 'event_key is required.'}, status=400)

    # Recipient source: an explicit list (CSV upload / manual entry) OR the
    # webinar's own registrants filtered by audience.
    custom = data.get('recipients')
    if isinstance(custom, list) and custom:
        send_list = []
        for r in custom:
            if not isinstance(r, dict):
                continue
            em = str(r.get('email') or '').strip().lower()
            if not em:
                continue
            send_list.append({'email': em, 'name': str(r.get('name') or '').strip(), 'row': r})
        list_source = 'list'
    else:
        try:
            registrants = _load_event_registrants(event_key, audience)
        except turso_client.TursoError as exc:
            return Response({'error': f'Could not load registrants: {exc}'}, status=503)
        send_list = [
            {'email': str(r.get('email') or '').strip().lower(),
             'name': str(r.get('name') or '').strip(), 'row': r}   # keep full data for tokens + certs
            for r in registrants
        ]
        list_source = 'registrants'

    sent = stubbed = skipped = 0
    seen = set()
    results = []
    for item in send_list:
        email = item['email']
        name = item['name']
        if not email or email in seen:
            skipped += 1
            continue
        seen.add(email)
        cert_att, cert_id = _cert_attachment(name, item.get('row'))
        attachments = (cert_att or []) + doc_attachments
        ok, subject = _send_one(email, name, item.get('row'), attachments=(attachments or None))
        status_str = 'sent' if ok else 'stubbed'
        if ok:
            sent += 1
        else:
            stubbed += 1
        EmailSendLog.objects.create(
            recipient_email=email, recipient_name=name,
            template_key=template_key, template_name=tpl.name, subject=subject[:300],
            context='webinar_broadcast', event_key=event_key, event_type=event_type,
            status=status_str, certificate_id=(cert_id if cert_att else ''), sent_by=actor,
        )
        results.append({'email': email, 'name': name, 'status': status_str, 'certificate_id': cert_id if cert_att else ''})

    EmailCampaign.objects.create(
        name=f'{tpl.name} · {event_title} ({list_source})'[:200],
        template_key=template_key, template_name=tpl.name,
        subject=(subject_override or tpl.subject)[:300],
        recipient_count=len(seen), sent_count=sent, failed_count=0, skipped_count=skipped,
        created_by=actor,
    )
    return Response({
        'total': len(seen), 'sent': sent, 'stubbed': stubbed, 'skipped': skipped,
        'source': list_source, 'results': results,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
@require_webinar_cap('send_emails')
def webinar_send_history(request):
    """
    GET ?event_key=...  -> per-recipient send counts + recent log for a webinar.
    Returns { summary, recipients:[...], log:[...] }.
    """
    from accounts_app.models import EmailSendLog

    event_key = str(request.query_params.get('event_key') or '').strip()
    if not event_key:
        return Response({'summary': {}, 'recipients': [], 'log': []})

    logs = list(
        EmailSendLog.objects.filter(event_key=event_key)
        .values('recipient_email', 'recipient_name', 'template_name', 'template_key',
                'subject', 'status', 'certificate_id', 'sent_by', 'sent_at')
    )

    # Certificates issued for this event (one row per cert PDF actually attached).
    certificates = [
        {
            'email': r['recipient_email'], 'name': r['recipient_name'],
            'certificate_id': r['certificate_id'],
            'sent_at': r['sent_at'].isoformat() if r['sent_at'] else None,
        }
        for r in sorted(logs, key=lambda x: x['sent_at'] or '', reverse=True)
        if r.get('certificate_id')
    ]

    by_email = {}
    by_template = {}
    for row in logs:
        em = row['recipient_email']
        rec = by_email.setdefault(em, {
            'email': em, 'name': row['recipient_name'], 'count': 0,
            'last_sent': None, 'templates': set(),
        })
        rec['count'] += 1
        rec['templates'].add(row['template_name'] or row['template_key'])
        ts = row['sent_at']
        if rec['last_sent'] is None or (ts and ts > rec['last_sent']):
            rec['last_sent'] = ts
            if row['recipient_name']:
                rec['name'] = row['recipient_name']
        tname = row['template_name'] or row['template_key'] or '—'
        by_template[tname] = by_template.get(tname, 0) + 1

    recipients = sorted(
        (
            {
                'email': r['email'], 'name': r['name'], 'count': r['count'],
                'last_sent': r['last_sent'].isoformat() if r['last_sent'] else None,
                'templates': sorted(r['templates']),
            }
            for r in by_email.values()
        ),
        key=lambda x: x['count'], reverse=True,
    )
    log = [
        {
            'email': row['recipient_email'], 'name': row['recipient_name'],
            'template': row['template_name'] or row['template_key'],
            'subject': row['subject'], 'status': row['status'],
            'sent_by': row['sent_by'],
            'sent_at': row['sent_at'].isoformat() if row['sent_at'] else None,
        }
        for row in sorted(logs, key=lambda x: x['sent_at'] or '', reverse=True)[:200]
    ]
    return Response({
        'summary': {
            'total_sends': len(logs),
            'unique_recipients': len(by_email),
            'by_template': by_template,
            'certificates_sent': len(certificates),
        },
        'recipients': recipients,
        'certificates': certificates,
        'log': log,
    })


# ─── Webinar meeting (one Google Meet per event) ─────────────────────────────

def _find_event_registration(event_key=None, event_pk=None):
    from tiesverse_app.models import EventRegistration
    if event_pk:
        obj = EventRegistration.objects.filter(id=event_pk).first()
        if obj:
            return obj
    ek = str(event_key or '').strip()
    if not ek:
        return None
    if ek.isdigit():
        obj = EventRegistration.objects.filter(id=int(ek)).first()
        if obj:
            return obj
    obj = EventRegistration.objects.filter(title__iexact=ek).first()
    if obj:
        return obj
    for e in EventRegistration.objects.all():
        if slugify(e.title) == ek:
            return e
    return None


def _deliver_meeting_link(event_id, event_title, email, free_only=False):
    """Return the event's Meet link and add the person as a guest. When
    free_only=True, only do so for FREE events (price 0) — used on the public
    registration path so paid webinars withhold the link until payment."""
    try:
        from config import google_calendar
        ev = _find_event_registration(event_key=str(event_id or '') or event_title)
        if not ev or not ev.meeting_link:
            return ''
        if free_only and int(ev.price or 0) != 0:
            return ''
        if ev.calendar_event_id and email:
            google_calendar.add_guest(ev.calendar_event_id, email)
        return ev.meeting_link
    except Exception:  # noqa: BLE001
        return ''


# ─── Certificate PDF generation (server-side, via the hosted generator) ───────

def _cert_template_vars(template_id):
    """Fetch the certificate template's variables and pick the name + id fields.
    Returns (name_var, id_var). Raises on failure."""
    import json
    import urllib.request
    from django.conf import settings as _s
    base = _s.CERTIFICATE_GENERATOR_API_URL.rstrip('/')
    req = urllib.request.Request(f"{base}/api/templates/{template_id}", headers={'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read().decode())
    variables = data.get('variables') or []
    names = [str(v.get('name', '')) for v in variables]
    name_var = next((n for n in names if 'name' in n.lower()), 'name')
    id_var = next((n for n in names if 'id' in n.lower() and 'email' not in n.lower()), None)
    return name_var, id_var, variables


def _generate_certificate_pdf(template_id, data):
    """Generate one certificate PDF from a {variable: value} dict. Returns bytes."""
    import json
    import urllib.request
    from django.conf import settings as _s
    base = _s.CERTIFICATE_GENERATOR_API_URL.rstrip('/')
    req = urllib.request.Request(
        f"{base}/api/templates/{template_id}/generate",
        data=json.dumps(data or {}).encode(),
        headers={'Content-Type': 'application/json', 'Accept': 'application/pdf'},
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read()


def _build_cert_data(fields, row, name, cert_id, auto_name_var=None, auto_id_var=None, template_vars=None):
    """Build the {variable: value} dict for a recipient. `fields` is an explicit
    mapping {var: {source, value}} where source is a registrant column key
    ('name', 'organization', 'role', …), 'id' (verification id), 'custom', or
    'blank'. Falls back to the auto-detected name/id vars when no mapping."""
    lookup = dict(row or {})
    lookup['name'] = name or lookup.get('name') or 'Participant'
    if fields:
        out = {}
        for var, spec in (fields or {}).items():
            src = (spec or {}).get('source')
            if src == 'id':
                out[var] = cert_id
            elif src == 'custom':
                out[var] = str((spec or {}).get('value') or '')
            elif src in ('blank', None, ''):
                continue
            else:  # a registrant column
                out[var] = str(lookup.get(src, '') or '')
    else:
        out = {(auto_name_var or 'name'): lookup['name']}
        if auto_id_var and cert_id:
            out[auto_id_var] = cert_id
    # No-conflict guarantee: make sure EVERY declared template variable is present
    # so the generator never prints a missing token as its humanized name. Anything
    # not otherwise set falls back to the variable's default_value (or blank).
    for v in (template_vars or []):
        vn = str(v.get('name') or '').strip()
        if vn and vn not in out:
            out[vn] = str(v.get('default_value') or '')
    return out


def _make_cert_id(event_title):
    import uuid
    prefix = (slugify(event_title)[:6] or 'WEB').upper()
    return f"TIES-{prefix}-{uuid.uuid4().hex[:6].upper()}"


@api_view(['GET'])
@permission_classes([IsAuthenticated])
@require_webinar_cap('manage_meeting')
def webinar_meeting_guests(request):
    """List the meeting's current guests (from Google Calendar) + guest-visibility.
    GET ?event_key=|event_pk="""
    from config import google_calendar
    obj = _find_event_registration(request.query_params.get('event_key'), request.query_params.get('event_pk'))
    if obj is None:
        return Response({'error': 'Webinar not found.'}, status=404)
    if not obj.calendar_event_id:
        return Response({'attendees': [], 'guests_can_see_other_guests': obj.meeting_guests_see_each_other,
                         'configured': google_calendar.is_configured(), 'has_meeting': False})
    live = google_calendar.get_event_guests(obj.calendar_event_id)
    if live is None:
        return Response({'attendees': [], 'guests_can_see_other_guests': obj.meeting_guests_see_each_other,
                         'configured': google_calendar.is_configured(), 'has_meeting': True})
    live['configured'] = True
    live['has_meeting'] = True
    return Response(live)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@require_webinar_cap('manage_meeting')
def generate_webinar_meeting(request):
    """Create/refresh the single Google Meet for a webinar and store it on the event.
    Body: { event_key|event_pk, start (ISO 'YYYY-MM-DDTHH:MM'), duration_min,
            hosts:[email], join_access, guests_see_each_other, moderation, auto_record }."""
    from config import google_calendar

    obj = _find_event_registration(request.data.get('event_key'), request.data.get('event_pk'))
    if obj is None:
        return Response({'error': 'Webinar not found.'}, status=404)

    start = str(request.data.get('start') or '').strip()
    if not start:
        return Response({'error': 'Pick a meeting date and time.'}, status=400)
    if not google_calendar.is_configured():
        return Response({'error': 'Google Calendar is not configured on the server yet.'}, status=400)

    duration = int(request.data.get('duration_min') or obj.meeting_duration_min or 60)
    hosts = request.data.get('hosts') or obj.meeting_hosts or []
    guests_see = bool(request.data.get('guests_see_each_other', obj.meeting_guests_see_each_other))
    join_access = request.data.get('join_access', obj.meeting_join_access)
    moderation = bool(request.data.get('moderation', obj.meeting_moderation))
    auto_record = bool(request.data.get('auto_record', obj.meeting_auto_record))

    # Phase C: try a configured Meet space (host controls). Falls back to a plain
    # Calendar Meet link if the Meet API isn't enabled / the scope isn't granted.
    meet_uri = None
    controls_applied = False
    space = google_calendar.create_meet_space(
        access_type=google_calendar._join_access_to_meet(join_access),
        moderation=moderation, auto_record=auto_record,
    )
    if space and space.get('uri'):
        meet_uri = space['uri']
        controls_applied = True

    try:
        res = google_calendar.create_event(
            summary=f"{obj.title} — TiesVerse {obj.kind.title()}",
            description=obj.description or '',
            start_iso=start, duration_min=duration,
            attendees=hosts,  # only hosts invited now; paid registrants added on payment
            guests_can_see_other_guests=guests_see,
            request_id_prefix='ties-web', meet_uri=meet_uri,
        )
    except Exception as exc:  # noqa: BLE001
        return Response({'error': f'Could not create the meeting: {exc}'}, status=502)

    obj.meeting_link = res['meet_link']
    obj.calendar_event_id = res['event_id']
    obj.meeting_duration_min = duration
    obj.meeting_hosts = hosts
    obj.meeting_join_access = join_access
    obj.meeting_guests_see_each_other = guests_see
    obj.meeting_moderation = moderation
    obj.meeting_auto_record = auto_record
    from django.utils.dateparse import parse_datetime
    dt = parse_datetime(start)
    if dt is not None:
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone.get_current_timezone())
        obj.meeting_start = dt
    obj.save()
    return Response({
        'meeting_link': obj.meeting_link, 'event_id': obj.calendar_event_id,
        'start': start, 'host_controls_applied': controls_applied,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def payment_reminder(request):
    """Email an abandoned/failed payer a link to finish their webinar payment.
    Only sends if they genuinely have a PENDING (unpaid) order for this event —
    so the endpoint can't be used to spam arbitrary addresses."""
    from django.conf import settings as dj_settings
    from .ses_email import send_payment_reminder

    data = request.data
    email = str(data.get('email') or '').strip()
    event_title = str(data.get('event_title') or '').strip()
    if not email or not event_title:
        return Response({'error': 'email and event_title required.'}, status=400)

    name = ''
    try:
        rows = turso_client.execute(
            "SELECT name FROM registrations WHERE email=:email AND event_title=:title "
            "AND payment_status='pending' ORDER BY registered_at DESC LIMIT 1",
            {'email': email, 'title': event_title},
        ) or []
    except Exception:
        rows = []
    if not rows:
        return Response({'status': 'no_pending_registration', 'sent': False})
    try:
        name = rows[0].get('name') or ''
    except Exception:
        name = ''

    website = getattr(dj_settings, 'WEBSITE_URL', 'https://tiesverse.com').rstrip('/')
    event_url = f"{website}/webinars/{slugify(event_title)}"
    sent = send_payment_reminder(email, name, event_title, event_url)
    return Response({'status': 'reminder_sent' if sent else 'skipped', 'sent': sent})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def webinar_revenue(request):
    """Paid-webinar revenue summary. Advisory / Admin / superuser ONLY — the
    figure is hidden from every other role (role-based dashboard data-hiding)."""
    from career_app.views import _is_advisory
    if not _is_advisory(request.user):
        return Response({'detail': 'Advisory access only.'}, status=403)
    try:
        rows = turso_client.execute(
            "SELECT event_title, final_amount, amount FROM registrations WHERE payment_status='paid'"
        ) or []
    except Exception as exc:
        logger.warning('revenue query failed: %s', exc)
        rows = []
    total, count, by_event = 0, 0, {}
    for r in rows:
        try:
            paise = int(r.get('final_amount') or r.get('amount') or 0)
        except Exception:
            paise = 0
        total += paise
        count += 1
        title = r.get('event_title') or 'Unknown'
        e = by_event.setdefault(title, {'event': title, 'revenue': 0, 'count': 0})
        e['revenue'] += paise
        e['count'] += 1
    events = sorted(by_event.values(), key=lambda x: -x['revenue'])
    for e in events:
        e['revenue'] = round(e['revenue'] / 100, 2)
    return Response({
        'total_revenue': round(total / 100, 2),
        'paid_count': count,
        'currency': 'INR',
        'by_event': events,
    })


# ── Webinar access control (granular per-member capabilities) ──────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def webinar_my_access(request):
    """The caller's own webinar capabilities + whether they may grant to others.
    Drives which tabs/buttons the Webinar portal shows."""
    return Response({
        'capabilities': sorted(member_capabilities(request.user)),
        'can_grant': can_grant(request.user),
        'all_capabilities': [{'key': k, 'label': label} for k, label in CAPABILITIES],
    })


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def webinar_access_admin(request):
    """GET: current grants (granters only). POST {member_id, capabilities:[...]}:
    set a member's webinar capabilities (empty list = revoke all)."""
    from career_app.models import OnboardingSubmission, WebinarAccess
    if not can_grant(request.user):
        return Response({'error': 'Only the Webinar lead or an admin can manage webinar access.'},
                        status=status.HTTP_403_FORBIDDEN)
    if request.method == 'GET':
        rows = [{
            'member_id': wa.member_id,
            'member_name': (wa.member.candidate_name if wa.member_id else ''),
            'capabilities': wa.capabilities or [],
            'updated_at': wa.updated_at,
        } for wa in WebinarAccess.objects.select_related('member').all()]
        return Response({'grants': rows,
                         'all_capabilities': [{'key': k, 'label': label} for k, label in CAPABILITIES]})

    mid = request.data.get('member_id') or request.data.get('member')
    caps = [c for c in (request.data.get('capabilities') or []) if c in CAP_KEYS]
    member = OnboardingSubmission.objects.filter(pk=mid, status='verified').first()
    if not member:
        return Response({'error': 'Member not found.'}, status=status.HTTP_404_NOT_FOUND)
    if caps:
        wa, _ = WebinarAccess.objects.update_or_create(
            member=member,
            defaults={'capabilities': caps,
                      'granted_by_user': request.user if request.user.is_authenticated else None},
        )
        return Response({'member_id': member.id, 'capabilities': wa.capabilities})
    WebinarAccess.objects.filter(member=member).delete()
    return Response({'member_id': member.id, 'capabilities': []})
