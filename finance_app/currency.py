"""Currency conversion — enter in anything, report in INR.

Rates come from Frankfurter (frankfurter.dev): free, no API key, sourced from
the European Central Bank via 84 central banks. Verified working 2 Aug 2026.

The important rule is that a rate is **frozen** onto a row when it is approved
and never recalculated. Live conversion would mean a $50 subscription approved
in January changes value every day, and a report run last month would not match
the same report today.

Nothing here raises. A rate lookup failing must never stop somebody recording a
purchase — the row saves with `fx_missing=True` and reporting counts it
separately rather than silently treating it as ₹0.
"""
import json
import urllib.error
import urllib.request
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

BASE_URL = 'https://api.frankfurter.dev/v1'
TIMEOUT = 15

# Currencies we offer. INR is the reporting currency and never needs a lookup.
SUPPORTED = ['USD', 'EUR', 'GBP', 'AUD', 'SGD', 'AED', 'CAD', 'JPY']


def _fetch(path):
    # A User-Agent is required: the default `Python-urllib/3.x` is rejected with
    # 403 by the CDN in front of Frankfurter, while any ordinary UA is accepted.
    req = urllib.request.Request(
        f'{BASE_URL}{path}',
        headers={
            'Accept': 'application/json',
            'User-Agent': 'TIESVerse-Admin/1.0 (+https://admin.tiesverse.com)',
        },
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return json.loads(resp.read().decode('utf-8') or '{}')


def fetch_rates(on=None):
    """{currency: Decimal(rate to INR)} from Frankfurter.

    One call for every currency. Returns {} on any failure — the caller falls
    back to the last stored rate.
    """
    try:
        # Ask with INR as the base, then invert: 1 USD = 1 / (INR→USD).
        symbols = ','.join(SUPPORTED)
        path = f'/{on.isoformat()}' if on else '/latest'
        data = _fetch(f'{path}?base=INR&symbols={symbols}')
        out = {}
        for cur, per_inr in (data.get('rates') or {}).items():
            try:
                v = Decimal(str(per_inr))
                if v > 0:
                    out[cur] = (Decimal('1') / v).quantize(Decimal('0.000001'))
            except (InvalidOperation, ZeroDivisionError):
                continue
        return out, data.get('date') or ''
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError, TimeoutError):
        return {}, ''
    except Exception:  # noqa: BLE001 — a rate feed must never break a save
        return {}, ''


def store_rates(rates, on_date, source='frankfurter'):
    """Upsert today's rates. Returns how many rows were written."""
    from .models import ExchangeRate

    n = 0
    for cur, rate in rates.items():
        obj, created = ExchangeRate.objects.update_or_create(
            currency=cur, on_date=on_date,
            defaults={'rate_to_inr': rate, 'source': source, 'is_manual': False},
        )
        n += 1
    return n


def rate_for(currency, on=None):
    """(Decimal rate, date_used, is_stale) for one currency.

    Prefers an exact-date rate, then the most recent earlier one (so a weekend
    approval uses Friday's ECB rate, flagged stale). Returns (None, None, True)
    when nothing is known.
    """
    from .models import ExchangeRate

    currency = (currency or 'INR').upper()
    if currency == 'INR':
        return Decimal('1'), on or date.today(), False

    on = on or date.today()
    exact = ExchangeRate.objects.filter(currency=currency, on_date=on).first()
    if exact:
        return exact.rate_to_inr, exact.on_date, False

    prior = (ExchangeRate.objects.filter(currency=currency, on_date__lte=on)
             .order_by('-on_date').first())
    if prior:
        return prior.rate_to_inr, prior.on_date, True

    # Nothing stored — try the network once, for this date.
    rates, api_date = fetch_rates(on if on < date.today() else None)
    if rates:
        try:
            store_rates(rates, date.fromisoformat(api_date) if api_date else on)
        except Exception:  # noqa: BLE001
            pass
        if currency in rates:
            return rates[currency], on, False
    return None, None, True


def to_inr(amount, currency, on=None):
    """(amount_inr, rate, date_used, missing).

    `missing=True` means no rate was available: the caller should still save the
    row, flag it, and leave it out of confident totals.
    """
    try:
        amount = Decimal(str(amount or 0))
    except (InvalidOperation, TypeError):
        return None, None, None, True

    currency = (currency or 'INR').upper()
    if currency == 'INR':
        return amount.quantize(Decimal('0.01')), Decimal('1'), on or date.today(), False

    rate, used_date, _stale = rate_for(currency, on)
    if rate is None:
        return None, None, None, True
    return (amount * rate).quantize(Decimal('0.01')), rate, used_date, False


def freeze_inr(obj, *, amount=None, on=None, force=False):
    """Write the INR equivalent onto a row and leave it there.

    Called when a request is approved, or when an asset/subscription is saved
    (those have no approval step). Does nothing if the row is already frozen,
    unless `force` — so an edit cannot silently re-value a historical record.
    """
    if obj.amount_inr is not None and not force:
        return obj

    value = amount if amount is not None else obj.amount
    inr, rate, used_date, missing = to_inr(value, obj.currency, on)

    obj.amount_inr = inr
    obj.fx_rate = rate
    obj.fx_date = used_date
    obj.fx_missing = missing
    return obj
