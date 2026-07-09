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


# Brand / government-ministry / university logos are intentionally HARDCODED in
# the website (stable brand assets) — not managed here. The CMS only covers the
# slots that genuinely change: the hero, backdrops, and data-driven nav cards.
_BRAND_PAGE = {
    'brand-establishing': ('Establishing shot (hero)', 16 / 9),
    'brand-universe-map': ('World map (observatory/river/…)', 16 / 10),
    'brand-bharat': ('“Built for Bharat” wide hero', 3 / 1),
    'moodboard': ('Moodboard collage', 1 / 1),
    'brand-jantar-mantar': ('Jantar Mantar thesis image', 16 / 9),
    'brand-arch-pattern': ('Architecture pattern strip', 1200 / 140),
    'brand-one-light': ('Imagery: one light, one grade', 16 / 10),
    'brand-scale-stillness': ('Imagery: scale & stillness', 16 / 10),
    'brand-atlas': ('Civilization atlas plate', 16 / 9),
    'brand-source-portrait': ('Source portrait (before grade)', 4 / 5),
    'sign-observatory': ('Signature: Observatory', 1 / 1),
    'sign-river': ('Signature: River', 1 / 1),
    'sign-archive': ('Signature: Archive', 1 / 1),
    'sign-tower': ('Signature: Tower', 1 / 1),
    'sign-constellation': ('Signature: Constellation', 1 / 1),
}


def _rows2(mapping, group, auto=False):
    return [{'key': k, 'label': v[0], 'group': group, 'aspect': v[1], 'auto': auto} for k, v in mapping.items()]


SLOTS = (
    [
        {'key': 'hero', 'label': 'Homepage hero', 'group': 'Hero & backdrops', 'aspect': 16 / 9, 'auto': False},
        {'key': 'cta-backdrop', 'label': 'CTA band backdrop', 'group': 'Hero & backdrops', 'aspect': 16 / 9, 'auto': False},
        {'key': 'letter-backdrop', 'label': 'Founders letter backdrop', 'group': 'Hero & backdrops', 'aspect': 16 / 9, 'auto': False},
        {'key': 'team-group', 'label': 'About: team group photo', 'group': 'About', 'aspect': 16 / 9, 'auto': False},
    ]
    + _rows2(_BRAND_PAGE, 'Brand page')
    + [
        {'key': 'nav-insights', 'label': 'Nav: Insights featured card', 'group': 'Nav feature cards', 'aspect': 4 / 3, 'auto': True},
        {'key': 'nav-engagements', 'label': 'Nav: Engagements featured card', 'group': 'Nav feature cards', 'aspect': 4 / 3, 'auto': True},
    ]
)

SLOT_KEYS = {s['key'] for s in SLOTS}
