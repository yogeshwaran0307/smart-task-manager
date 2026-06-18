"""
tenant_middleware.py — Add to api/ folder.

Resolves request.tenant for every authenticated request, and exposes
request.is_superadmin so views can decide whether to skip tenant filtering.

Add to MIDDLEWARE in settings.py, AFTER AuthenticationMiddleware:

    MIDDLEWARE = [
        ...
        'django.contrib.auth.middleware.AuthenticationMiddleware',
        'api.tenant_middleware.TenantMiddleware',   # <-- add this line
        ...
    ]
"""
from django.http import JsonResponse


class TenantMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.tenant = None
        request.is_superadmin = False

        user = getattr(request, 'user', None)
        if user is not None and user.is_authenticated:
            if user.role == 'superadmin':
                request.is_superadmin = True
                # Superadmin has no single tenant — request.tenant stays None.
                # Views must check request.is_superadmin to allow cross-tenant access.
            else:
                if not user.tenant_id:
                    return JsonResponse(
                        {'error': 'Your account is not assigned to a company. Contact your admin.'},
                        status=403
                    )
                if not user.tenant.is_active:
                    return JsonResponse(
                        {'error': 'Your company\'s access is inactive. Contact your admin.'},
                        status=403
                    )
                request.tenant = user.tenant

        return self.get_response(request)
