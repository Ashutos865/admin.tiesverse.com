import cloudinary
import cloudinary.api
import cloudinary.uploader
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

# Initialize Cloudinary configuration using settings
cloudinary.config(
    cloud_name=settings.CLOUDINARY_STORAGE.get('CLOUD_NAME'),
    api_key=settings.CLOUDINARY_STORAGE.get('API_KEY'),
    api_secret=settings.CLOUDINARY_STORAGE.get('API_SECRET')
)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def cloudinary_list_images(request):
    """
    List uploaded assets in the 'admin_assets' folder from Cloudinary library.
    """
    try:
        result = cloudinary.api.resources(
            type="upload",
            prefix="admin_assets/",
            max_results=100
        )
        resources = result.get('resources', [])
        return Response(resources)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def cloudinary_delete_image(request):
    """
    Delete an asset from Cloudinary using its public_id.
    """
    public_id = request.data.get('public_id')
    if not public_id:
        return Response({"error": "public_id is required"}, status=status.HTTP_400_BAD_REQUEST)
    try:
        result = cloudinary.uploader.destroy(public_id)
        if result.get('result') == 'ok' or result.get('result') == 'not found':
            return Response({"success": True, "result": result})
        return Response({"error": f"Failed to delete image: {result}"}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
