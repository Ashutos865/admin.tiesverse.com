import os
from supabase import create_client

_client = None

def get_client():
    global _client
    if _client is None:
        url = os.environ.get('SUPABASE_URL', '')
        key = os.environ.get('SUPABASE_SERVICE_KEY', '')
        if url and key:
            _client = create_client(url, key)
    return _client


TABLE_MAP = {
    'Event':              'events',
    'Department':         'departments',
    'TeamMember':         'team_members',
    'TeamMemberSocial':   'team_member_socials',
    'EventSpeaker':       'event_speakers',
    'EventRegistration':  'event_registrations',
}


def upsert(instance):
    """Push a Django model instance to its Supabase table."""
    sb = get_client()
    if not sb:
        return
    table = TABLE_MAP.get(type(instance).__name__)
    if not table or not hasattr(instance, 'to_supabase_dict'):
        return
    data = instance.to_supabase_dict()
    # Use Django pk as a stable external reference key so re-saves update, not duplicate.
    data['django_id'] = instance.pk
    try:
        sb.table(table).upsert(data, on_conflict='django_id').execute()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f'Supabase upsert failed for {table}: {e}')


def delete(instance):
    """Remove a record from Supabase when deleted from Django."""
    sb = get_client()
    if not sb:
        return
    table = TABLE_MAP.get(type(instance).__name__)
    if not table:
        return
    try:
        sb.table(table).delete().eq('django_id', instance.pk).execute()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f'Supabase delete failed for {table}: {e}')
