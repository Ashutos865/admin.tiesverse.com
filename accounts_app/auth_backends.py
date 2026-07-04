from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend
from django.db.models import Q


class EmailOrUsernameBackend(ModelBackend):
    """Authenticate with either the username OR the email address.

    The login form accepts "Username or Email", but the default ModelBackend
    only matches the username field. This backend also resolves by email so a
    member whose username differs from their email can still sign in with either.
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        User = get_user_model()
        if username is None:
            username = kwargs.get(User.USERNAME_FIELD)
        if username is None or password is None:
            return None

        try:
            user = User.objects.get(Q(username__iexact=username) | Q(email__iexact=username))
        except User.DoesNotExist:
            # Run the hasher once to reduce timing differences between
            # "user missing" and "wrong password".
            User().set_password(password)
            return None
        except User.MultipleObjectsReturned:
            # Same string matched more than one account (emails aren't unique).
            # Prefer an exact username match, then the oldest account.
            user = (
                User.objects.filter(username__iexact=username).order_by('id').first()
                or User.objects.filter(email__iexact=username).order_by('id').first()
            )
            if user is None:
                return None

        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
