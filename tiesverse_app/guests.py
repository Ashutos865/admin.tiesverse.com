"""Publishing a webinar's guests to the website guest list.

Guests attached to an upcoming webinar sit unpublished — visible in the admin,
absent from the website. When the webinar ends (detected by cron, or the event
being marked past by hand) they publish here, which is what puts them in the
website's previous-guests section via Supabase.
"""
from django.core.cache import cache

from . import supabase_sync
from .models import EventSpeaker


def publish_event_guests(ev):
    """Publish every still-hidden guest of this event. Returns how many."""
    count = 0
    for guest in EventSpeaker.objects.filter(event=ev, published=False):
        guest.published = True
        guest.save(update_fields=['published'])
        supabase_sync.upsert(guest)
        count += 1
    if count:
        # The website reads the cached public feed; show the new guests now
        # rather than whenever the 2-minute cache happens to lapse.
        cache.delete('public_guests_feed')
    return count
