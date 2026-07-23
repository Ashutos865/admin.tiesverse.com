from django.db.models import Q
from rest_framework import viewsets, permissions
from rest_framework.response import Response

from .models import DocSpace, DocPage
from .serializers import DocSpaceSerializer, DocPageSerializer, DocPageTreeSerializer


ENCRYPTED_VISIBILITY = 'encrypted'


def _team_keys_for_user(user):
    """Return None for unrestricted readers, else team keys this user may read.

    Doc pages store HRDepartment ids in allowed_teams. Member records store
    assigned department names, so we resolve names -> ids here and also keep the
    names as a defensive fallback for any hand-edited JSON rows.
    """
    from career_app import access
    from career_app.models import HRDepartment

    if getattr(user, 'is_superuser', False):
        return None

    scope, member = access.get_access_scope(user)
    if scope == 'all':
        return None
    if not member:
        return set()

    assigned_names = {
        str(name).strip().lower()
        for name in (member.assigned_departments or [])
        if str(name).strip()
    }
    if not assigned_names:
        return set()

    keys = set(assigned_names)
    for dept in HRDepartment.objects.all().only('id', 'name'):
        if (dept.name or '').strip().lower() in assigned_names:
            keys.add(str(dept.id))
    return keys


def _allowed_team_keys(page):
    return {
        str(team_id).strip().lower()
        for team_id in (page.allowed_teams or [])
        if str(team_id).strip()
    }


def _page_visible_to_team_keys(page, team_keys):
    if (page.visibility or 'public') != ENCRYPTED_VISIBILITY:
        return True
    if team_keys is None:
        return True
    return bool(_allowed_team_keys(page) & team_keys)


def _scope_pages_for_user(qs, user):
    team_keys = _team_keys_for_user(user)
    if team_keys is None:
        return qs

    visible_ids = [
        page.id
        for page in qs.only('id', 'visibility', 'allowed_teams')
        if _page_visible_to_team_keys(page, team_keys)
    ]
    return qs.filter(id__in=visible_ids) if visible_ids else qs.none()


class DocPermission(permissions.BasePermission):
    """Everyone authenticated can read. Writing needs the docs_app change perms
    (or superuser). Uses the standard Django model permissions the app generates."""

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.is_superuser or request.user.has_perm('docs_app.change_docpage')


class DocSpaceViewSet(viewsets.ModelViewSet):
    queryset = DocSpace.objects.all()
    serializer_class = DocSpaceSerializer
    permission_classes = [DocPermission]


class DocPageViewSet(viewsets.ModelViewSet):
    """
    /api/docs/pages                     GET (list; ?space=slug&search=), POST
    /api/docs/pages/:id                 GET / PATCH / DELETE
    /api/docs/tree                      GET spaces + their page tree (nav)
    """
    serializer_class = DocPageSerializer
    permission_classes = [DocPermission]

    def get_queryset(self):
        # NOTE: do not select_related('updated_by') — it is a cross-database FK
        # (docpages live in turso_db, auth.User in the default DB) and Django
        # cannot JOIN across databases. The serializer reads updated_by lazily,
        # which the router routes to the default DB. select_related('space') is
        # fine (same DB).
        qs = DocPage.objects.select_related('space')
        space = self.request.query_params.get('space')
        if space:
            qs = qs.filter(space__slug=space)
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(body__icontains=search))
        return _scope_pages_for_user(qs, self.request.user)

    def _save_with_editor(self, serializer):
        visibility = serializer.validated_data.get(
            'visibility',
            getattr(serializer.instance, 'visibility', 'public'),
        )
        if visibility != ENCRYPTED_VISIBILITY:
            serializer.save(updated_by=self.request.user, allowed_teams=[])
            return
        serializer.save(updated_by=self.request.user)

    def perform_create(self, serializer):
        self._save_with_editor(serializer)

    def perform_update(self, serializer):
        self._save_with_editor(serializer)


class DocTreeView(viewsets.ViewSet):
    """GET /api/docs/tree -> [{space, pages:[...]}] for the left navigation."""
    permission_classes = [DocPermission]

    def list(self, request):
        out = []
        for s in DocSpace.objects.all():
            scoped_pages = _scope_pages_for_user(s.pages.filter(is_published=True), request.user)
            pages = DocPageTreeSerializer(scoped_pages, many=True).data
            out.append({'space': DocSpaceSerializer(s).data, 'pages': pages})
        return Response(out)
