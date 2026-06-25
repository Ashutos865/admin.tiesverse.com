class AppRouter:
    """
    A router to control all database operations on models in the
    tiesverse_app, career_app, and webinar_app applications.
    """
    route_app_labels = {'tiesverse_app', 'career_app', 'webinar_app'}

    def db_for_read(self, model, **hints):
        if model._meta.app_label in self.route_app_labels:
            return 'turso_db'
        return 'default'

    def db_for_write(self, model, **hints):
        if model._meta.app_label in self.route_app_labels:
            return 'turso_db'
        return 'default'

    def allow_relation(self, obj1, obj2, **hints):
        # Allow relations if both models are in the turso_db apps
        if obj1._meta.app_label in self.route_app_labels and obj2._meta.app_label in self.route_app_labels:
            return True
        # Allow relations if both models are in the default db apps
        elif obj1._meta.app_label not in self.route_app_labels and obj2._meta.app_label not in self.route_app_labels:
            return True
        # Cross-db relations are generally not allowed
        return False

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if app_label in self.route_app_labels:
            return db == 'turso_db'
        
        # Ensure default app models aren't migrated to the custom databases
        if db == 'turso_db':
            return False
            
        return db == 'default'
