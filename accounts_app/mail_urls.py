"""Public mail routes: unsubscribe, resubscribe, and the staff status toggle.

Kept apart from accounts_app.urls because these are printed in email and read
by recipients — a short, neutral path that gives nothing away about the admin
application serving it.
"""
from django.urls import path

from .unsubscribe import (fix_contact_email, resubscribe,
                          set_contact_status, unsubscribe)

urlpatterns = [
    path('unsubscribe/<str:token>/', unsubscribe, name='unsubscribe'),
    path('resubscribe/<str:token>/', resubscribe, name='resubscribe'),
    path('contact-status/', set_contact_status, name='contact-status'),
    path('fix-email/', fix_contact_email, name='fix-email'),
]
