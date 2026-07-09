"""Catalog of manageable website image slots.

Each slot: key (stable — matches the website's bundled filename where possible),
label, group (for the admin UI), aspect (crop ratio), auto (whether it can pull
from a live data feed → the Auto/Manual toggle is shown).
"""

_GOVT = {
    'logo-govt-india': 'Government of India',
    'logo-govt-delhi': 'Govt of NCT of Delhi',
    'logo-govt-up': 'Government of Uttar Pradesh',
    'logo-govt-maharashtra': 'Government of Maharashtra',
    'logo-min-finance': 'Ministry of Finance',
    'logo-min-mea': 'Ministry of External Affairs',
    'logo-min-meity': 'Ministry of Electronics & IT',
    'logo-min-roadtransport': 'Ministry of Road Transport & Highways',
    'logo-min-education': 'Ministry of Education',
    'logo-icwa': 'Indian Council of World Affairs',
    'logo-unesco': 'UNESCO',
    'logo-indiaai': 'INDIAai',
    'logo-aeos': 'AEOS Group',
}

_UNIV = {
    'aiims': 'AIIMS',
    'iit-dhanbad': 'IIT Dhanbad',
    'nit-bhopal': 'NIT Bhopal',
    'kings-college-london': "King's College London",
    'university-of-glasgow': 'University of Glasgow',
    'university-of-oxford': 'University of Oxford',
    'manipal-university': 'Manipal University',
    'christ-university': 'Christ University',
    'symbiosis': 'Symbiosis',
    'university-of-delhi': 'University of Delhi',
    'jnu': 'JNU',
    'university-of-mumbai': 'University of Mumbai',
    'ms-university-of-baroda': 'MS University of Baroda',
    'savitribai-phule-pune-university': 'Savitribai Phule Pune University',
    'bbau-lucknow': 'BBAU Lucknow',
    'university-of-calcutta': 'University of Calcutta',
    'jadavpur-university': 'Jadavpur University',
}

_BRANDS = {
    'brand-tiesverse': 'Tiesverse', 'brand-foreign-policy': 'Foreign Policy India',
    'brand-ties': '.TIES', 'brand-bharat-age': 'The Bharat Age',
    'brand-india-elections': 'India Elections', 'brand-finties': 'Finties',
    'brand-upties': 'Upties', 'brand-nimble': 'Nimble',
}


def _rows(mapping, group, aspect=1, auto=False):
    return [{'key': k, 'label': v, 'group': group, 'aspect': aspect, 'auto': auto} for k, v in mapping.items()]


SLOTS = (
    [
        {'key': 'hero', 'label': 'Homepage hero', 'group': 'Hero & backdrops', 'aspect': 16 / 9, 'auto': False},
        {'key': 'cta-backdrop', 'label': 'CTA band backdrop', 'group': 'Hero & backdrops', 'aspect': 16 / 9, 'auto': False},
        {'key': 'letter-backdrop', 'label': 'Founders letter backdrop', 'group': 'Hero & backdrops', 'aspect': 16 / 9, 'auto': False},
    ]
    + _rows(_BRANDS, 'Brand logos', 1, False)
    + _rows(_GOVT, 'Government & ministry logos', 1, False)
    + _rows(_UNIV, 'University logos', 1, False)
    + [
        {'key': 'nav-insights', 'label': 'Nav: Insights featured card', 'group': 'Nav feature cards', 'aspect': 4 / 3, 'auto': True},
        {'key': 'nav-engagements', 'label': 'Nav: Engagements featured card', 'group': 'Nav feature cards', 'aspect': 4 / 3, 'auto': True},
    ]
)

SLOT_KEYS = {s['key'] for s in SLOTS}
