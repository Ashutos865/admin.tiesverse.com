class AppRouter:
    """
    A router to control all database operations on models in the
    tiesverse_app and webinar_app applications, plus the Setting model from accounts_app.
    """
    route_app_labels = {'tiesverse_app', 'webinar_app'}

    def db_for_read(self, model, **hints):
        if model._meta.app_label == 'tiesverse_app' or (model._meta.app_label == 'accounts_app' and model.__name__ == 'Setting'):
            return 'tiesverse_db'
        elif model._meta.app_label == 'webinar_app':
            return 'webinar_db'
        return 'default'

    def db_for_write(self, model, **hints):
        if model._meta.app_label == 'tiesverse_app' or (model._meta.app_label == 'accounts_app' and model.__name__ == 'Setting'):
            return 'tiesverse_db'
        elif model._meta.app_label == 'webinar_app':
            return 'webinar_db'
        return 'default'

    def allow_relation(self, obj1, obj2, **hints):
        # Allow relations if a model in the same app is involved
        if obj1._meta.app_label == 'tiesverse_app' and obj2._meta.app_label == 'tiesverse_app':
            return True
        elif obj1._meta.app_label == 'webinar_app' and obj2._meta.app_label == 'webinar_app':
            return True
        elif (obj1._meta.app_label == 'accounts_app' and obj1.__class__.__name__ == 'Setting') and obj2._meta.app_label == 'tiesverse_app':
            return True
        elif obj1._meta.app_label not in self.route_app_labels and obj2._meta.app_label not in self.route_app_labels:
            return True
        # Cross-db relations are generally not allowed
        return False

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if app_label == 'tiesverse_app' or (app_label == 'accounts_app' and model_name == 'setting'):
            return db == 'tiesverse_db'
        elif app_label == 'webinar_app':
            return db == 'webinar_db'
        
        # Ensure default app models aren't migrated to the custom databases
        if db in ('tiesverse_db', 'webinar_db'):
            return False
            
        return db == 'default'
