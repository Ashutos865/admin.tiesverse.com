from django.apps import AppConfig


class WebinarAppConfig(AppConfig):
    name = 'webinar_app'

    def ready(self):
        try:
            from . import turso_client
            if turso_client.is_configured():
                turso_client.setup_tables()
        except Exception:
            pass
