from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    webinar_registration_qr,
    WebinarEventViewSet, CalendarEventViewSet,
    register_for_event, list_registrations,
    create_payment_order, verify_payment, razorpay_webhook, payment_reminder,
    refund_registration, sync_registration_payment,
    coupons, coupon_detail, validate_coupon,
    form_questions, form_question_detail, reorder_form_questions,
    form_sections, form_section_detail, reorder_form_sections,
    mark_attended, list_registrations_extended,
    event_certificate_link,
    list_public_events,
    webinar_broadcast, webinar_send_history,
    generate_webinar_meeting, webinar_meeting_guests, webinar_meeting_guest_manage,
    webinar_revenue,
    webinar_my_access, webinar_access_admin,
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
    path('refund/', refund_registration, name='webinar-refund'),
    path('sync-payment/', sync_registration_payment, name='webinar-sync-payment'),

    # Form questions (custom registration fields per event/webinar)
    path('form-questions/', form_questions, name='webinar-form-questions'),
    path('form-questions/<int:pk>/', form_question_detail, name='webinar-form-question-detail'),
    path('form-questions/reorder/', reorder_form_questions, name='webinar-form-questions-reorder'),
    path('form-sections/', form_sections, name='webinar-form-sections'),
    path('form-sections/<int:pk>/', form_section_detail, name='webinar-form-section-detail'),
    path('form-sections/reorder/', reorder_form_sections, name='webinar-form-sections-reorder'),

    # Attendee tracking
    path('mark-attended/', mark_attended, name='webinar-mark-attended'),

    # Paid-webinar revenue (advisory/admin only)
    path('revenue/', webinar_revenue, name='webinar-revenue'),

    # Certificate link
    path('event-certificate/', event_certificate_link, name='webinar-event-certificate'),

    # Per-webinar mail automation + send analytics
    path('broadcast/', webinar_broadcast, name='webinar-broadcast'),
    path('send-history/', webinar_send_history, name='webinar-send-history'),

    # Meeting (one Google Meet per event)
    path('generate-meeting/', generate_webinar_meeting, name='webinar-generate-meeting'),
    path('meeting-guests/', webinar_meeting_guests, name='webinar-meeting-guests'),
    path('meeting-guests/manage/', webinar_meeting_guest_manage, name='webinar-meeting-guest-manage'),

    # Registration QR (PNG) for posters and slides
    path('registration-qr/', webinar_registration_qr, name='webinar-registration-qr'),

    # Granular access control
    path('my-access/', webinar_my_access, name='webinar-my-access'),
    path('access/', webinar_access_admin, name='webinar-access'),

    path('', include(router.urls)),
]
