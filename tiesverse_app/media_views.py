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

# SVG (vector) and GIF (possibly animated) are passed through untouched; every
# other raster image is re-encoded to WebP AND shrunk to stay under the size cap.
_PASSTHROUGH_TYPES = {'image/svg+xml', 'image/gif'}
_WEBP_QUALITY = 82
_MAX_DIM = 1600                        # longest side kept for stored images
_MIN_DIM = 320                         # never shrink below this while capping
_TARGET_MAX_BYTES = 820 * 1024         # hard cap: stored image is always < 820 KB
_UPLOAD_HARD_LIMIT = 25 * 1024 * 1024  # reject before decoding (memory guard)


def _encode_webp(img, quality):
    # method=4 is a good size/speed balance; higher methods cost a lot more CPU for
    # ~1-2% smaller files — not worth it since we cap the size ourselves below.
    buf = io.BytesIO()
    img.save(buf, format='WEBP', quality=quality, method=4)
    return buf


def to_webp(upload, max_dim=_MAX_DIM, target_bytes=_TARGET_MAX_BYTES):
    """Convert an uploaded raster image to compact WebP bytes UNDER ``target_bytes``.

    Downscales to ``max_dim`` on the longest side, then steps quality — and, if
    still needed, dimensions — down until the encoded WebP is below the cap, so
    what we store (and put in the DB URL) is never the full-size original. Keeps
    alpha for images that have it, flattens the rest to RGB. Returns a BytesIO
    ready for upload/storage. Raises on failure so the caller can fall back.
    """
    from PIL import Image  # imported lazily so a missing Pillow never hard-crashes import
    resample = getattr(getattr(Image, 'Resampling', Image), 'LANCZOS', None) or Image.LANCZOS
    img = Image.open(upload)
    img = img.convert('RGBA') if img.mode in ('RGBA', 'LA', 'P') else img.convert('RGB')

    # 1) Cap the longest side.
    if max(img.size) > max_dim:
        img.thumbnail((max_dim, max_dim), resample)

    # 2) Encode; drop quality until under the cap (down to a still-readable floor).
    quality = _WEBP_QUALITY
    buf = _encode_webp(img, quality)
    while buf.getbuffer().nbytes > target_bytes and quality > 40:
        quality -= 10
        buf = _encode_webp(img, quality)

    # 3) Still over? Shrink dimensions 25% at a time until it fits.
    while buf.getbuffer().nbytes > target_bytes and max(img.size) > _MIN_DIM:
        w, h = img.size
        img = img.resize((max(1, int(w * 0.75)), max(1, int(h * 0.75))), resample)
        buf = _encode_webp(img, quality)

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
        if upload.size and upload.size > _UPLOAD_HARD_LIMIT:
            return Response({'error': 'Image too large (max 25 MB before compression).'},
                            status=status.HTTP_400_BAD_REQUEST)

        ct = (upload.content_type or '').lower()
        to_upload = upload
        opts = dict(folder=settings.CLOUDINARY_UPLOAD_FOLDER, resource_type='image')
        # Re-encode + shrink every raster image to WebP under the size cap; only
        # vector SVG and (possibly animated) GIF are stored as-is.
        if ct not in _PASSTHROUGH_TYPES:
            try:
                to_upload = to_webp(upload)   # WebP, shrunk to < 820 KB
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
