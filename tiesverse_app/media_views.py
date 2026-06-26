"""Cloudinary-backed image upload + listing for the admin content portals.

Admins upload an image file → Cloudinary → we return its `secure_url`, which
the SPA stores in the model's `*_url` field (photo_url / cover_url / etc.).
"""
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework import status

import cloudinary.uploader
import cloudinary.api


class MediaUploadView(APIView):
    """POST a multipart `file` → upload to Cloudinary → {secure_url, public_id}."""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        upload = request.FILES.get('file')
        if not upload:
            return Response({'error': 'No file provided (field name: file).'},
                            status=status.HTTP_400_BAD_REQUEST)
        if not upload.content_type.startswith('image/'):
            return Response({'error': 'Only image files are allowed.'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            result = cloudinary.uploader.upload(
                upload,
                folder=settings.CLOUDINARY_UPLOAD_FOLDER,
                resource_type='image',
            )
        except Exception as e:
            return Response({'error': f'Cloudinary upload failed: {e}'},
                            status=status.HTTP_502_BAD_GATEWAY)
        return Response({
            'secure_url': result.get('secure_url'),
            'public_id': result.get('public_id'),
        }, status=status.HTTP_201_CREATED)


class CloudinaryImageListView(APIView):
    """GET previously-uploaded images so the picker can show a gallery."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            result = cloudinary.api.resources(
                type='upload',
                prefix=settings.CLOUDINARY_UPLOAD_FOLDER,
                resource_type='image',
                max_results=100,
            )
        except Exception as e:
            return Response({'images': [], 'error': f'Cloudinary list failed: {e}'},
                            status=status.HTTP_502_BAD_GATEWAY)
        images = [
            {'secure_url': r.get('secure_url'), 'public_id': r.get('public_id')}
            for r in result.get('resources', [])
        ]
        return Response({'images': images})
