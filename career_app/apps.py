from django.apps import AppConfig


class CareerAppConfig(AppConfig):
    name = 'career_app'

    def ready(self):
        # career_app / webinar_app / tiesverse_app tables live in turso_db but
        # hold foreign keys to auth.User (and content types) which live in the
        # default DB. SQLite enforces FK constraints per-file, so an INSERT that
        # references auth_user fails with "no such table: auth_user". Disable FK
        # enforcement on the turso_db connection — Django still maintains
        # referential integrity at the ORM level.
        from django.db.backends.signals import connection_created

        def _disable_fk_for_turso(sender, connection, **kwargs):
            if connection.alias == 'turso_db' and connection.vendor == 'sqlite':
                with connection.cursor() as cursor:
                    cursor.execute('PRAGMA foreign_keys = OFF;')

        connection_created.connect(_disable_fk_for_turso, dispatch_uid='turso_disable_fk')

        # The headless Form API (/api/forms/v1/) is called cross-origin from other
        # Tiesverse domains. Let django-cors-headers reflect ANY origin for those
        # paths so the browser makes the call — the real gate is the origin-locked
        # API key checked in the view, not CORS.
        try:
            from corsheaders.signals import check_request_enabled

            def _cors_allow_form_api(sender, request, **kwargs):
                return request.path.startswith('/api/forms/v1/')

            check_request_enabled.connect(_cors_allow_form_api, dispatch_uid='cors_form_api')
        except Exception:  # noqa: BLE001 — never break startup over CORS wiring
            pass
