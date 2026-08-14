from django.db import models


class EventFormQuestion(models.Model):
    FIELD_TYPES = [
        ('text',     'Short Text'),
        ('textarea', 'Long Text'),
        ('email',    'Email'),
        ('phone',    'Phone'),
        ('select',   'Dropdown'),
        ('radio',    'Radio Buttons'),
        ('checkbox', 'Checkboxes'),
    ]
    event_key   = models.CharField(max_length=255)         # slugified title or id
    event_type  = models.CharField(max_length=20)          # 'event' | 'webinar'
    event_title = models.CharField(max_length=255, blank=True)
    label       = models.CharField(max_length=255)
    field_type  = models.CharField(max_length=20, choices=FIELD_TYPES, default='text')
    placeholder = models.CharField(max_length=255, blank=True)
    options     = models.TextField(blank=True)             # comma-separated for select/radio/checkbox
    required    = models.BooleanField(default=True)
    order       = models.PositiveIntegerField(default=0)
    created_at  = models.DateTimeField(auto_now_add=True)

    # Which step of the form this question is asked on. Sections are named per
    # event, so they can be renamed, reordered or added to without touching the
    # questions themselves.
    section     = models.PositiveIntegerField(default=1)

    # The registration column this answer belongs in, when it is one the rest
    # of the system depends on. 'name' and 'email' are the two that matter:
    # every confirmation, reminder and certificate is addressed from those
    # columns, so a question carrying maps_to cannot be deleted or have its
    # binding changed — only its wording. Everything else has maps_to='' and
    # is stored as a free-form answer.
    maps_to     = models.CharField(max_length=40, blank=True, default='')

    # A locked question may be reworded and moved, never removed: without a
    # name and an email there is nobody to write to.
    LOCKED_FIELDS = ('name', 'email')

    @property
    def is_locked(self):
        return self.maps_to in self.LOCKED_FIELDS

    class Meta:
        db_table = 'event_form_questions'
        ordering = ['order', 'id']

    def __str__(self):
        return f'[{self.event_key}] {self.label}'


class EventFormSection(models.Model):
    """A step of the registration form.

    Sections exist per event so one webinar can ask in three steps and another
    in five. A question points at a section by number rather than by row, so
    renaming or reordering sections never orphans a question — and deleting a
    section moves its questions rather than taking them with it.
    """
    event_key  = models.CharField(max_length=255)
    event_type = models.CharField(max_length=20)
    number     = models.PositiveIntegerField(default=1)     # matches question.section
    title      = models.CharField(max_length=120)
    subtitle   = models.CharField(max_length=255, blank=True)
    order      = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'event_form_sections'
        ordering = ['order', 'number', 'id']
        unique_together = [('event_key', 'event_type', 'number')]

    def __str__(self):
        return f'[{self.event_key}] {self.number}. {self.title}'


# The three steps the form has always had. Used when an event has no sections
# of its own, so an existing webinar keeps the shape people already know.
DEFAULT_SECTIONS = [
    (1, 'Personal Info', ''),
    (2, 'Professional Details', ''),
    (3, 'Final Details', ''),
]


class WebinarEvent(models.Model):
    title = models.CharField(max_length=255)
    speaker = models.CharField(max_length=255)
    scheduled_time = models.DateTimeField()
    meeting_link = models.URLField(blank=True, null=True)

    def __str__(self):
        return self.title

class RegistrationForm(models.Model):
    PAYMENT_STATUS_CHOICES = [
        ('Pending', 'Pending'),
        ('Success', 'Success'),
        ('Failed', 'Failed'),
    ]
    webinar = models.ForeignKey(WebinarEvent, on_delete=models.CASCADE)
    user_name = models.CharField(max_length=255)
    user_email = models.EmailField()
    date_of_filling = models.DateTimeField(auto_now_add=True)
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    payment_status = models.CharField(max_length=50, choices=PAYMENT_STATUS_CHOICES, default='Pending')
    is_accepted = models.BooleanField(default=False)
    notification_sent = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.user_name} - {self.webinar.title}"

class CalendarEvent(models.Model):
    webinar = models.ForeignKey(WebinarEvent, on_delete=models.CASCADE)
    calendar_id = models.CharField(max_length=255)
    sync_status = models.BooleanField(default=False)

    def __str__(self):
        return f"Calendar sync for {self.webinar.title}"
