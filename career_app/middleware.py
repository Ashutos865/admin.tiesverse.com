"""CORS for the standalone Data API.

django-cors-headers only reflects origins in its allow-list; the Data API
(/api/data/v1/) must accept requests from ANY Tiesverse frontend domain, because
the real security gate is the origin-locked API key checked in the view (see
tiesverse_app/data_api.py). This middleware opens CORS for those paths only. It
must sit ABOVE CorsMiddleware in MIDDLEWARE so it can answer the OPTIONS
preflight before CorsMiddleware swallows it.
"""
from django.http import HttpResponse

DATA_API_PREFIX = '/api/data/v1/'


class DataApiCorsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not request.path.startswith(DATA_API_PREFIX):
            return self.get_response(request)

        origin = request.headers.get('Origin')
        if request.method == 'OPTIONS' and origin:
            resp = HttpResponse(status=204)
            self._apply(resp, request, origin)
            return resp

        response = self.get_response(request)
        if origin:
            self._apply(response, request, origin)
        return response

    @staticmethod
    def _apply(resp, request, origin):
        resp['Access-Control-Allow-Origin'] = origin
        resp['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        resp['Access-Control-Allow-Headers'] = request.headers.get(
            'Access-Control-Request-Headers', 'X-Api-Key, Content-Type'
        )
        resp['Access-Control-Max-Age'] = '86400'
        resp['Vary'] = 'Origin'
