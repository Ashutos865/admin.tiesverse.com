"""Give existing questions a section and, where they carry one, their binding.

The form has always had three steps with a fixed set of fields; every question
already stored belongs to one of them. This records what was already true so
nothing moves the first time an admin opens the builder.

`maps_to` marks the answers the rest of the system reads by name — above all
'name' and 'email', which every confirmation, reminder and certificate is
addressed from. Marking them here is what makes them undeletable later.
"""
from django.db import migrations


# label (lowercased) -> (section, maps_to)
KNOWN = {
    'full name':                    (1, 'name'),
    'email address':                (1, 'email'),
    'whatsapp number':              (1, 'phone'),
    'current role':                 (2, 'role'),
    'organization / university':    (2, 'organization'),
    'country':                      (2, 'country'),
    'city':                         (2, 'city'),
    'how did you hear about this?': (3, 'source'),
    'what do you hope to learn?':   (3, 'expectations'),
    'question for the speaker':     (3, 'speaker_question'),
}


def forwards(apps, schema_editor):
    Question = apps.get_model('webinar_app', 'EventFormQuestion')
    Section = apps.get_model('webinar_app', 'EventFormSection')

    for q in Question.objects.all():
        section, maps_to = KNOWN.get((q.label or '').strip().lower(), (None, ''))
        if section is None:
            # A question the admin added. It sat at the end of the form, which
            # is the last step.
            section = 3
        q.section = section
        q.maps_to = maps_to
        q.save(update_fields=['section', 'maps_to'])

    # Give every event that has questions the three sections it already had,
    # so the builder opens showing what the form actually does today.
    pairs = set(Question.objects.values_list('event_key', 'event_type'))
    for event_key, event_type in pairs:
        for number, title in [(1, 'Personal Info'), (2, 'Professional Details'),
                              (3, 'Final Details')]:
            Section.objects.get_or_create(
                event_key=event_key, event_type=event_type, number=number,
                defaults={'title': title, 'order': number - 1},
            )


def backwards(apps, schema_editor):
    # The columns go away with the schema migration; the sections were only
    # ever a record of the existing shape, so dropping them loses nothing.
    apps.get_model('webinar_app', 'EventFormSection').objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('webinar_app', '0004_eventformsection'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
