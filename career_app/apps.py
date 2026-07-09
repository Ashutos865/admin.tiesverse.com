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
        # CORS for the standalone Data API is handled by
        # career_app.middleware.DataApiCorsMiddleware (see settings.MIDDLEWARE).
