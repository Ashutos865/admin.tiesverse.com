from django.http import HttpResponse, Http404
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import DjangoModelPermissions, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Position, Enrollment, OfferLetter
from .serializers import PositionSerializer, EnrollmentSerializer, OfferLetterSerializer
from . import cloudflare_proxy
from .providers import CloudflareD1Provider, ProviderError


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


# DRF router-compatible ViewSet — returns plain array from Cloudflare D1
class EnrollmentViewSet(viewsets.ViewSet):
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
            return Response({'error': 'Applicant not found'}, status=status.HTTP_404_NOT_FOUND)


# ── Additional APIViews using full CloudflareD1Provider ──────────────────────

class CandidateListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            provider = CloudflareD1Provider()
            candidates = provider.get_candidates()
            return Response({'status': 'success', 'data': candidates})
        except ProviderError as e:
            return Response({'status': 'error', 'message': str(e)}, status=500)


class CandidateDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        try:
            provider = CloudflareD1Provider()
            result = provider.update_candidate(pk, request.data)
            return Response(result)
        except ProviderError as e:
            return Response({'status': 'error', 'message': str(e)}, status=500)


class FormGateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            provider = CloudflareD1Provider()
            gates = provider.read_form_gates()
            return Response({'status': 'success', 'gates': gates})
        except ProviderError as e:
            return Response({'status': 'error', 'message': str(e)}, status=500)

    def post(self, request):
        try:
            provider = CloudflareD1Provider()
            gates = request.data.get('gates', {})
            result = provider.write_form_gates(gates)
            return Response(result)
        except ProviderError as e:
            return Response({'status': 'error', 'message': str(e)}, status=500)


class SendOfferLetterView(APIView):
    """Email a (frontend-generated) offer-letter PDF to a candidate from the
    no-reply careers address.

    Sending is STUBBED by default (settings.OFFER_EMAIL_ENABLED=False): we log
    what would be sent and return a 'stubbed' status so no real mail goes out
    until careers@tiesverse.com is verified in SES. The live SES path below is
    fully implemented — flip OFFER_EMAIL_ENABLED=True in env to enable it.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from django.conf import settings as dj_settings
        email = (request.data.get('email') or '').strip()
        name = request.data.get('name') or 'Candidate'
        pdf_base64 = request.data.get('pdf_base64') or ''
        subject = request.data.get('subject') or 'Your Offer Letter — Tiesverse'
        body_text = request.data.get('body') or (
            f"Dear {name},\n\nCongratulations! Please find your offer letter attached.\n\n"
            "Warm regards,\nTiesverse Careers"
        )
        if not email:
            return Response({'status': 'error', 'message': 'Recipient email is required.'},
                            status=status.HTTP_400_BAD_REQUEST)

        from_addr = dj_settings.SES_CAREERS_FROM_EMAIL
        if not getattr(dj_settings, 'OFFER_EMAIL_ENABLED', False):
            print(f"[OFFER EMAIL STUB] would send '{subject}' to {email} ({name}) "
                  f"from {from_addr}; pdf_base64 chars={len(pdf_base64)}")
            return Response({
                'status': 'stubbed',
                'message': f"Email sending is disabled — offer NOT sent to {email}. "
                           f"(Verify {from_addr} in SES and set OFFER_EMAIL_ENABLED=True to enable.)",
            })

        # ── Live SES send (only when explicitly enabled) ──
        import base64
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText
        from email.mime.application import MIMEApplication
        import boto3

        msg = MIMEMultipart()
        msg['Subject'] = subject
        msg['From'] = from_addr
        msg['To'] = email
        msg.attach(MIMEText(body_text, 'plain'))
        if pdf_base64:
            part = MIMEApplication(base64.b64decode(pdf_base64), _subtype='pdf')
            part.add_header('Content-Disposition', 'attachment', filename='Offer-Letter.pdf')
            msg.attach(part)
        try:
            client = boto3.client(
                'ses',
                region_name=dj_settings.AWS_SES_REGION,
                aws_access_key_id=dj_settings.AWS_SES_ACCESS_KEY_ID,
                aws_secret_access_key=dj_settings.AWS_SES_SECRET_ACCESS_KEY,
            )
            client.send_raw_email(Source=from_addr, Destinations=[email],
                                  RawMessage={'Data': msg.as_string()})
        except Exception as e:
            return Response({'status': 'error', 'message': f'SES send failed: {e}'},
                            status=status.HTTP_502_BAD_GATEWAY)
        return Response({'status': 'sent', 'message': f'Offer letter sent to {email}.'})


class ResumeDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            provider = CloudflareD1Provider()
            result = provider.get_resume(pk)
            if result.get('status') == 'error':
                raise Http404(result.get('message'))
            response = HttpResponse(result['content'], content_type=result['content_type'])
            response['Content-Disposition'] = f'inline; filename="{result["resume_name"]}"'
            return response
        except ProviderError as e:
            return HttpResponse(str(e), status=500)
