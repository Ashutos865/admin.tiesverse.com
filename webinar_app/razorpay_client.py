import hashlib
import hmac
import logging

logger = logging.getLogger(__name__)


def _get_client():
    from django.conf import settings
    import razorpay
    key_id = getattr(settings, 'RAZORPAY_KEY_ID', '')
    key_secret = getattr(settings, 'RAZORPAY_KEY_SECRET', '')
    if not key_id or not key_secret:
        return None, None
    return razorpay.Client(auth=(key_id, key_secret)), key_id


def is_configured():
    from django.conf import settings
    return bool(
        getattr(settings, 'RAZORPAY_KEY_ID', '')
        and getattr(settings, 'RAZORPAY_KEY_SECRET', '')
    )


def create_order(amount_inr, receipt, notes=None):
    """
    Create a Razorpay order.
    amount_inr: amount in rupees (will be converted to paise internally).
    Returns dict with order_id, amount (paise), currency, key_id.
    """
    client, key_id = _get_client()
    if not client:
        raise RuntimeError('Razorpay not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET')

    amount_paise = int(round(amount_inr * 100))
    order = client.order.create({
        'amount': amount_paise,
        'currency': 'INR',
        'receipt': receipt[:40],
        'notes': notes or {},
    })
    return {
        'order_id': order['id'],
        'amount':   amount_paise,
        'currency': 'INR',
        'key_id':   key_id,
    }


def verify_payment_signature(razorpay_order_id, razorpay_payment_id, razorpay_signature):
    """
    Verify the HMAC-SHA256 signature Razorpay sends after a successful payment.
    Returns True if valid, False otherwise.
    """
    from django.conf import settings
    key_secret = getattr(settings, 'RAZORPAY_KEY_SECRET', '')
    if not key_secret:
        return False

    message = f'{razorpay_order_id}|{razorpay_payment_id}'.encode()
    expected = hmac.new(key_secret.encode(), message, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, razorpay_signature)


def fetch_payment(payment_id):
    """Live payment record from Razorpay, or None when unavailable.

    Used before refunding so the amount and current state come from Razorpay
    rather than our own row, which can be stale if a refund was already issued
    from their dashboard.
    """
    client, _ = _get_client()
    if not client or not payment_id:
        return None
    try:
        return client.payment.fetch(payment_id)
    except Exception as exc:  # noqa: BLE001 — network/API errors are not fatal here
        logger.warning('Razorpay payment fetch failed for %s: %s', payment_id, exc)
        return None


def refund_payment(payment_id, amount_paise=None, notes=None, speed='normal'):
    """Refund a captured payment, in full or partly.

    amount_paise=None refunds everything still refundable. Returns the refund
    dict from Razorpay; raises RuntimeError with a readable message otherwise,
    so the caller can show the operator what Razorpay actually said.
    """
    client, _ = _get_client()
    if not client:
        raise RuntimeError('Razorpay not configured - set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET')
    if not payment_id:
        raise RuntimeError('This registration has no Razorpay payment id to refund.')

    data = {'speed': speed}
    if amount_paise is not None:
        data['amount'] = int(amount_paise)
    if notes:
        data['notes'] = notes
    try:
        return client.payment.refund(payment_id, data)
    except Exception as exc:  # noqa: BLE001 — surface Razorpay's own wording
        msg = str(exc)
        try:
            err = getattr(exc, 'error', None) or {}
            msg = (err.get('description') or msg) if isinstance(err, dict) else msg
        except Exception:  # noqa: BLE001
            pass
        raise RuntimeError(msg) from exc


def verify_webhook_signature(body_bytes, received_signature):
    """
    Verify the signature on an incoming Razorpay webhook.
    body_bytes: raw request body bytes.
    received_signature: value of X-Razorpay-Signature header.
    """
    from django.conf import settings
    secret = getattr(settings, 'RAZORPAY_WEBHOOK_SECRET', '')
    if not secret:
        logger.warning('RAZORPAY_WEBHOOK_SECRET not set — rejecting webhook')
        return False

    expected = hmac.new(secret.encode(), body_bytes, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, received_signature)
