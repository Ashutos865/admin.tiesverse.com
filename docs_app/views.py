from rest_framework import viewsets, permissions
from rest_framework.response import Response

from .models import DocSpace, DocPage
from .serializers import DocSpaceSerializer, DocPageSerializer, DocPageTreeSerializer


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
            qs = qs.filter(title__icontains=search) | qs.filter(body__icontains=search)
        return qs

    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)


class DocTreeView(viewsets.ViewSet):
    """GET /api/docs/tree -> [{space, pages:[...]}] for the left navigation."""
    permission_classes = [DocPermission]

    def list(self, request):
        out = []
        for s in DocSpace.objects.all():
            pages = DocPageTreeSerializer(s.pages.filter(is_published=True), many=True).data
            out.append({'space': DocSpaceSerializer(s).data, 'pages': pages})
        return Response(out)
