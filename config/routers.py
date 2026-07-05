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
        labels = self.route_app_labels
        a1, a2 = obj1._meta.app_label, obj2._meta.app_label

        # Both sides in turso_db apps, or both in default-db apps.
        if (a1 in labels) == (a2 in labels):
            return True

        # Intentional cross-database FKs: career_app / webinar_app / tiesverse_app
        # models reference auth.User (created_by, approved_by_user, reviewed_by_user,
        # assigned_by_user, ...) and django_content_type. Those live in the default
        # DB. SQLite doesn't enforce FKs across separate files and Django only stores
        # the id, so these relations are safe to allow.
        if {'auth', 'contenttypes'} & {a1, a2}:
            return True

        # Any other cross-db relation stays disallowed.
        return False

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if app_label in self.route_app_labels:
            return db == 'turso_db'
        
        # Ensure default app models aren't migrated to the custom databases
        if db == 'turso_db':
            return False
            
        return db == 'default'
