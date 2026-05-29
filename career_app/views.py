from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Position, Enrollment, OfferLetter
from .serializers import PositionSerializer, EnrollmentSerializer, OfferLetterSerializer

class PositionViewSet(viewsets.ModelViewSet):
    queryset = Position.objects.all()
    serializer_class = PositionSerializer

class EnrollmentViewSet(viewsets.ModelViewSet):
    queryset = Enrollment.objects.all()
    serializer_class = EnrollmentSerializer

    @action(detail=True, methods=['patch'])
    def update_status(self, request, pk=None):
        enrollment = self.get_object()
        new_status = request.data.get('status')
        if new_status in dict(Enrollment.STATUS_CHOICES):
            enrollment.status = new_status
            enrollment.save()
            return Response({'status': 'Status updated to {}'.format(new_status)})
        return Response({'error': 'Invalid status'}, status=status.HTTP_400_BAD_REQUEST)

class OfferLetterViewSet(viewsets.ModelViewSet):
    queryset = OfferLetter.objects.all()
    serializer_class = OfferLetterSerializer

    @action(detail=False, methods=['post'])
    def generate(self, request):
        applicant_id = request.data.get('applicant')
        salary = request.data.get('salary')
        joining_date = request.data.get('joining_date')
        
        try:
            applicant = Enrollment.objects.get(id=applicant_id)
            offer = OfferLetter.objects.create(
                applicant=applicant,
                salary=salary,
                joining_date=joining_date
            )
            return Response({'status': 'Offer letter generated', 'offer_id': offer.id})
        except Enrollment.DoesNotExist:
            return Response({'error': 'Applicant not found'}, status=status.HTTP_404_NOT_FOUND)
