from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    WebinarEventViewSet, CalendarEventViewSet,
    register_for_event, list_registrations,
    create_payment_order, verify_payment, razorpay_webhook, payment_reminder,
    coupons, coupon_detail, validate_coupon,
    form_questions, form_question_detail, reorder_form_questions,
    mark_attended, list_registrations_extended,
    event_certificate_link,
    list_public_events,
    webinar_broadcast, webinar_send_history,
    generate_webinar_meeting, webinar_meeting_guests,
)

router = DefaultRouter()
router.register(r'events', WebinarEventViewSet)
router.register(r'calendar-events', CalendarEventViewSet)

urlpatterns = [
    # Public endpoints (no auth required)
    path('public-events/', list_public_events, name='webinar-public-events'),
    path('register/', register_for_event, name='webinar-register'),
    path('registrations/', list_registrations, name='webinar-registrations'),
    path('registrations-full/', list_registrations_extended, name='webinar-registrations-full'),

    # Coupons
    path('coupons/', coupons, name='webinar-coupons'),
    path('coupons/<int:coupon_id>/', coupon_detail, name='webinar-coupon-detail'),
    path('validate-coupon/', validate_coupon, name='webinar-validate-coupon'),

    # Paid flow
    path('create-order/', create_payment_order, name='webinar-create-order'),
    path('verify-payment/', verify_payment, name='webinar-verify-payment'),
    path('payment-reminder/', payment_reminder, name='webinar-payment-reminder'),
    path('razorpay-webhook/', razorpay_webhook, name='razorpay-webhook'),

    # Form questions (custom registration fields per event/webinar)
    path('form-questions/', form_questions, name='webinar-form-questions'),
    path('form-questions/<int:pk>/', form_question_detail, name='webinar-form-question-detail'),
    path('form-questions/reorder/', reorder_form_questions, name='webinar-form-questions-reorder'),

    # Attendee tracking
    path('mark-attended/', mark_attended, name='webinar-mark-attended'),

    # Certificate link
    path('event-certificate/', event_certificate_link, name='webinar-event-certificate'),

    # Per-webinar mail automation + send analytics
    path('broadcast/', webinar_broadcast, name='webinar-broadcast'),
    path('send-history/', webinar_send_history, name='webinar-send-history'),

    # Meeting (one Google Meet per event)
    path('generate-meeting/', generate_webinar_meeting, name='webinar-generate-meeting'),
    path('meeting-guests/', webinar_meeting_guests, name='webinar-meeting-guests'),

    path('', include(router.urls)),
]
