"""Cloudinary-backed image upload + listing for the admin content portals.

Admins upload an image file → Cloudinary → we return its `secure_url`, which
the SPA stores in the model's `*_url` field (photo_url / cover_url / etc.).
"""
import io

from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework import status

import cloudinary.uploader
import cloudinary.api

# Raster formats we re-encode to WebP for minimum storage. SVG (vector) and GIF
# (may be animated) are passed through untouched.
_CONVERT_TYPES = {'image/png', 'image/jpeg', 'image/jpg', 'image/bmp', 'image/tiff'}
_WEBP_QUALITY = 82


def to_webp(upload):
    """Convert an uploaded raster image to compact WebP bytes.

    Keeps alpha for images that have it, flattens the rest to RGB. Returns a
    BytesIO ready to hand to cloudinary.uploader.upload(). Raises on failure so
    the caller can fall back to the original file.
    """
    from PIL import Image  # imported lazily so a missing Pillow never hard-crashes import
    img = Image.open(upload)
    img = img.convert('RGBA') if img.mode in ('RGBA', 'LA', 'P') else img.convert('RGB')
    buf = io.BytesIO()
    img.save(buf, format='WEBP', quality=_WEBP_QUALITY, method=6)
    buf.seek(0)
    return buf


class MediaUploadView(APIView):
    """POST a multipart `file` → convert to WebP → Cloudinary → {secure_url, public_id}."""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        upload = request.FILES.get('file')
        if not upload:
            return Response({'error': 'No file provided (field name: file).'},
                            status=status.HTTP_400_BAD_REQUEST)
        if not (upload.content_type or '').startswith('image/'):
            return Response({'error': 'Only image files are allowed.'},
                            status=status.HTTP_400_BAD_REQUEST)

        ct = (upload.content_type or '').lower()
        to_upload = upload
        opts = dict(folder=settings.CLOUDINARY_UPLOAD_FOLDER, resource_type='image')
        if ct in _CONVERT_TYPES:
            try:
                to_upload = to_webp(upload)
                opts['format'] = 'webp'
            except Exception:
                # Pillow missing or a corrupt image → keep the original rather than fail.
                upload.seek(0)
                to_upload = upload

        try:
            result = cloudinary.uploader.upload(to_upload, **opts)
        except Exception as e:
            return Response({'error': f'Cloudinary upload failed: {e}'},
                            status=status.HTTP_502_BAD_GATEWAY)
        return Response({
            'secure_url': result.get('secure_url'),
            'public_id': result.get('public_id'),
            'format': result.get('format'),
        }, status=status.HTTP_201_CREATED)


_DOC_MAX = 15 * 1024 * 1024   # 15 MB per file
_ALLOWED_DOC_EXT = {
    'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx',
    'txt', 'csv', 'png', 'jpg', 'jpeg', 'webp',
}


class DocumentUploadView(APIView):
    """POST a multipart `file` (PDF / doc / etc.) → Cloudinary (raw) → {url, filename}.

    Used for email attachments in the webinar broadcast composer. Unlike
    MediaUploadView this keeps the original file (no WebP conversion) and allows
    document types, not just images.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        upload = request.FILES.get('file')
        if not upload:
            return Response({'error': 'No file provided (field name: file).'},
                            status=status.HTTP_400_BAD_REQUEST)
        name = upload.name or 'attachment'
        ext = (name.rsplit('.', 1)[-1] if '.' in name else '').lower()
        if ext not in _ALLOWED_DOC_EXT:
            return Response({'error': f'Unsupported file type “.{ext}”. Allowed: PDF, Word, PowerPoint, Excel, images.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if upload.size and upload.size > _DOC_MAX:
            return Response({'error': 'File too large (max 15 MB per file).'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            result = cloudinary.uploader.upload(
                upload,
                resource_type='raw',
                folder=f'{settings.CLOUDINARY_UPLOAD_FOLDER}/attachments',
                use_filename=True,
                unique_filename=True,
            )
        except Exception as e:  # noqa: BLE001
            return Response({'error': f'Upload failed: {e}'}, status=status.HTTP_502_BAD_GATEWAY)
        return Response({
            'url': result.get('secure_url'),
            'filename': name,
            'bytes': result.get('bytes'),
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
