"""Rules that stop a certificate send corrupting real records.

Every send used to mint a fresh certificate ID and write a new row. So a test
mail to your own address created a real, verifiable certificate; sending twice
to the same person produced two numbers for one document; and a certificate
could be issued in the wrong name against a colleague's address.

These checks answer one question per recipient: may this send happen, and if so
under which certificate number?
"""
import logging
import re

logger = logging.getLogger(__name__)

# Written on the certificate and in the email, never in the records table.
TEST_ID_PREFIX = 'TEST'


def norm_email(value):
    return str(value or '').strip().lower()


def _norm_name(value):
    """Compare names loosely: case, punctuation and honorifics vary between the
    directory and whatever someone types into a spreadsheet."""
    text = str(value or '').lower()
    text = re.sub(r'\b(mr|mrs|ms|miss|dr|prof|capt|shri|smt)\.?\s+', ' ', text)
    text = re.sub(r'[^a-z0-9\s]', ' ', text)
    return ' '.join(text.split())


def names_match(typed, official):
    """True when two spellings plainly mean the same person.

    Deliberately generous: 'Dr. Asha R. Rao' and 'Asha Rao' are the same person
    and blocking that would make the check a nuisance rather than a safeguard.
    A genuinely different name shares no surname and is caught.
    """
    a, b = _norm_name(typed), _norm_name(official)
    if not a or not b:
        return True                     # nothing to compare; do not block
    if a == b or a in b or b in a:
        return True
    at, bt = set(a.split()), set(b.split())
    shared = at & bt
    # One shared token is a coincidence ("Kumar"); two is the same person.
    return len(shared) >= 2 or (len(shared) == 1 and min(len(at), len(bt)) == 1)


def directory_member(email):
    """The member record for this address, or None."""
    email = norm_email(email)
    if not email:
        return None
    try:
        from career_app.models import OnboardingSubmission
        return (OnboardingSubmission.objects
                .filter(candidate_email__iexact=email).order_by('-id').first())
    except Exception:  # noqa: BLE001
        return None


def existing_certificate(email, template_id='', doc_key='', source_type=''):
    """A certificate this person already holds for this document.

    Returns {'certificate_id', 'person_name', 'created_at'} or None. Matching is
    by EMAIL and template, not by name: the person is the constant, and a
    retyped name should not earn them a second number.
    """
    email = norm_email(email)
    if not email:
        return None
    try:
        from webinar_app import turso_client
        if not turso_client.is_configured():
            return None
        turso_client.setup_tables()
        sql = ("SELECT certificate_id, person_name, created_at FROM certificate_records "
               "WHERE LOWER(person_email)=:e")
        params = {'e': email}
        if template_id:
            sql += " AND template_id=:t"
            params['t'] = str(template_id)
        sql += " ORDER BY created_at ASC LIMIT 1"
        rows = turso_client.execute(sql, params)
        if rows:
            row = rows[0]
            return {
                'certificate_id': str(row.get('certificate_id') or ''),
                'person_name': str(row.get('person_name') or ''),
                'created_at': str(row.get('created_at') or ''),
            }
    except Exception as exc:  # noqa: BLE001
        logger.warning('existing_certificate lookup failed for %s: %s', email, exc)
    return None


def check_recipient(email, name, *, template_id='', doc_key='', is_test=False,
                    seen_emails=None):
    """Decide what to do with one recipient.

    Returns a dict:
        allowed        False stops the send
        reason         why, for the sender to read
        reuse_cert_id  send under this existing number instead of a new one
        is_test        record nothing, use a TEST- id
    """
    email = norm_email(email)
    result = {'allowed': True, 'reason': '', 'reuse_cert_id': '', 'is_test': bool(is_test),
              'email': email, 'name': str(name or '').strip()}

    if not email:
        return {**result, 'allowed': False, 'reason': 'No email address.'}

    # A campaign must not mail one person twice in the same run.
    if seen_emails is not None:
        if email in seen_emails:
            return {**result, 'allowed': False,
                    'reason': 'This address appears more than once in this send.'}
        seen_emails.add(email)

    # A test send stops here: it neither reads nor writes real records, so it
    # cannot collide with anything or leave anything behind.
    if is_test:
        return result

    member = directory_member(email)
    if member is not None:
        official = getattr(member, 'candidate_name', '') or ''
        if result['name'] and official and not names_match(result['name'], official):
            return {**result, 'allowed': False,
                    'reason': (f'This address belongs to {official}, not '
                               f'"{result["name"]}". Check the name or use a test send.')}

    prior = existing_certificate(email, template_id=template_id, doc_key=doc_key)
    if prior and prior['certificate_id']:
        # Re-issue under the number they already hold, so the QR they were sent
        # keeps working and no second record appears.
        result['reuse_cert_id'] = prior['certificate_id']
        result['reason'] = (f'Already issued as {prior["certificate_id"]}; '
                            're-sending under the same number.')
    return result


def test_certificate_id():
    """An obviously fake id for a test send, so a screenshot of one can never be
    mistaken for a real certificate."""
    import secrets
    return f'{TEST_ID_PREFIX}-{"".join(secrets.choice("0123456789") for _ in range(6))}'
