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

    class Meta:
        db_table = 'event_form_questions'
        ordering = ['order', 'id']

    def __str__(self):
        return f'[{self.event_key}] {self.label}'


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
