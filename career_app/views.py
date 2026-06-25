from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import DjangoModelPermissions, IsAuthenticated
from rest_framework.response import Response

from .models import Position, Enrollment, OfferLetter
from .serializers import PositionSerializer, EnrollmentSerializer, OfferLetterSerializer
from . import cloudflare_proxy


class StaffModelPermissions(DjangoModelPermissions):
    perms_map = {
        'GET': ['%(app_label)s.view_%(model_name)s'],
        'OPTIONS': [], 'HEAD': [],
        'POST': ['%(app_label)s.add_%(model_name)s'],
        'PUT': ['%(app_label)s.change_%(model_name)s'],
        'PATCH': ['%(app_label)s.change_%(model_name)s'],
        'DELETE': ['%(app_label)s.delete_%(model_name)s'],
    }


class PositionViewSet(viewsets.ModelViewSet):
    queryset = Position.objects.all()
    serializer_class = PositionSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]


class EnrollmentViewSet(viewsets.ViewSet):
    """
    Proxies candidate data from Cloudflare D1 (the real applicant store).
    Falls back to an error response if D1 is unreachable.
    """
    permission_classes = [IsAuthenticated]

    def list(self, request):
        candidates = cloudflare_proxy.get_candidates()
        if candidates is None:
            return Response(
                {'error': 'Cloudflare D1 unreachable', 'results': []},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(candidates)

    def retrieve(self, request, pk=None):
        candidates = cloudflare_proxy.get_candidates()
        if candidates is None:
            return Response({'error': 'Cloudflare D1 unreachable'}, status=503)
        match = next((c for c in candidates if str(c.get('id')) == str(pk)), None)
        if not match:
            return Response({'error': 'Not found'}, status=404)
        return Response(match)

    @action(detail=True, methods=['patch'])
    def update_status(self, request, pk=None):
        ok = cloudflare_proxy.update_candidate(
            row_id=pk,
            interview_status=request.data.get('interview_status', ''),
            interviewer=request.data.get('interviewer', ''),
            rating=request.data.get('rating', 0),
            final_decision=request.data.get('final_decision', 'Under Review'),
        )
        if ok:
            return Response({'status': 'updated'})
        return Response({'error': 'Update failed'}, status=503)


class OfferLetterViewSet(viewsets.ModelViewSet):
    queryset = OfferLetter.objects.all()
    serializer_class = OfferLetterSerializer
    permission_classes = [IsAuthenticated, StaffModelPermissions]

    @action(detail=False, methods=['post'])
    def generate(self, request):
        applicant_id = request.data.get('applicant')
        salary = request.data.get('salary')
        joining_date = request.data.get('joining_date')
        try:
            applicant = Enrollment.objects.get(id=applicant_id)
            offer = OfferLetter.objects.create(
                applicant=applicant, salary=salary, joining_date=joining_date
            )
            return Response({'status': 'Offer letter generated', 'offer_id': offer.id})
        except Enrollment.DoesNotExist:
            return Response({'error': 'Applicant not found'}, status=404)
