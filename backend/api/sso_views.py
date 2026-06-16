"""
sso_views.py  ─ Add this file to your api/ folder in Smart Task backend
Handles SSO login from SaaS Platform.
"""
import os, json, hmac, hashlib, base64, time

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth import get_user_model

from .models import User, ActivityLog

# ── Env vars (set these in Render dashboard) ──────────────────────────────────
SAAS_SSO_SECRET   = os.environ.get('SAAS_SSO_SECRET', '')
SAAS_PRODUCT_CODE = os.environ.get('SAAS_PRODUCT_CODE', 'SMART_TASK')
SECRET            = os.environ.get('TOKEN_SECRET', 'smarttask-secret-key-dev-change-in-production')

# ── Reuse Smart Task token generator ──────────────────────────────────────────
def _make_token(user_id):
    payload = f"{user_id}:{int(time.time())}"
    sig = hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:16]
    return base64.urlsafe_b64encode(f"{payload}:{sig}".encode()).decode()

def _derive_key(secret: str) -> bytes:
    """
    Mirror of Java's toBase64Key():
    If secret is shorter than 32 bytes, SHA-256 hash it first.
    Then return raw bytes (NOT base64) for use as HMAC key.
    """
    raw = secret.encode('utf-8')
    if len(raw) < 32:
        raw = hashlib.sha256(raw).digest()
    return raw

def _verify_sso_jwt(token: str, secret: str) -> dict:
    """
    Verify the sso_jwt signed by SaaS platform's JwtService.generateSsoToken().
    Uses HS256 with a derived key (SHA-256 if secret < 32 bytes).
    Returns decoded payload dict or raises ValueError.
    """
    try:
        parts = token.split('.')
        if len(parts) != 3:
            raise ValueError("Not a valid JWT")

        header_b64, payload_b64, sig_b64 = parts

        # Verify signature
        signing_input = f"{header_b64}.{payload_b64}".encode()
        key = _derive_key(secret)
        expected_sig = base64.urlsafe_b64encode(
            hmac.new(key, signing_input, hashlib.sha256).digest()
        ).rstrip(b'=').decode()

        if not hmac.compare_digest(expected_sig, sig_b64):
            raise ValueError("Invalid signature")

        # Decode payload
        padding = 4 - len(payload_b64) % 4
        payload_json = base64.urlsafe_b64decode(payload_b64 + '=' * padding)
        payload = json.loads(payload_json)

        # Check expiry
        exp = payload.get('exp', 0)
        if exp and time.time() > exp:
            raise ValueError("SSO token expired")

        return payload

    except (ValueError, KeyError) as e:
        raise ValueError(str(e))
    except Exception as e:
        raise ValueError(f"JWT decode error: {str(e)}")


@csrf_exempt
def sso_callback(request):
    """
    SaaS Platform redirects here after user clicks 'Open App'.

    The redirect URL will be:
      https://smart-task-backend.onrender.com/api/sso/callback/?sso_jwt=<token>

    Steps:
      1. Extract sso_jwt from query params
      2. Verify signature using SAAS_SSO_SECRET
      3. Find or create user in Smart Task
      4. Return our own auth token for the frontend to use
    """
    # Accept both GET and POST
    sso_jwt = request.GET.get('sso_jwt') or request.GET.get('sso_token', '')
    if not sso_jwt and request.method == 'POST':
        try:
            body = json.loads(request.body or '{}')
            sso_jwt = body.get('sso_jwt') or body.get('sso_token', '')
        except Exception:
            pass

    if not sso_jwt:
        return JsonResponse({'error': 'Missing sso_jwt parameter'}, status=400)

    if not SAAS_SSO_SECRET:
        return JsonResponse(
            {'error': 'SAAS_SSO_SECRET not configured on this server. Add it to Render env vars.'},
            status=500
        )

    # ── Verify the JWT ─────────────────────────────────────────────────────────
    try:
        payload = _verify_sso_jwt(sso_jwt, SAAS_SSO_SECRET)
    except ValueError as e:
        return JsonResponse({'error': f'SSO verification failed: {str(e)}'}, status=401)

    # ── Extract user info ──────────────────────────────────────────────────────
    # SaaS platform puts userId in 'sub', other info in claims
    user_id_from_saas = payload.get('sub', '')
    tenant_id         = payload.get('tenantId', '')
    roles             = payload.get('roles', [])
    product_code      = payload.get('productCode', '')

    # Note: SaaS JWT doesn't include email/name directly.
    # We use tenantId + userId as the unique identifier.
    # Email will be fetched from SaaS platform OR you can add it to the JWT.
    # For now we create username from the sub (userId from SaaS).
    username = f"saas_{user_id_from_saas}"

    # ── Find or create user in Smart Task ─────────────────────────────────────
    user, created = User.objects.get_or_create(
        username=username,
        defaults={
            'email':     f"{username}@saas-sso.local",
            'name':      f"User {user_id_from_saas[:8]}",
            'role':      _map_role(roles),
            'is_active': True,
        }
    )

    if not user.is_active:
        return JsonResponse(
            {'error': 'Your Smart Task account is inactive. Contact your admin.'},
            status=403
        )

    # ── Issue Smart Task auth token ────────────────────────────────────────────
    token = _make_token(user.id)

    ActivityLog.objects.create(
        action=f"SSO login via SaaS Platform (tenant: {tenant_id}, saas_user: {user_id_from_saas})",
        user=user,
        user_name=user.display_name(),
    )

    return JsonResponse({
        'token':   token,
        'user': {
            'id':    user.id,
            'email': user.email,
            'name':  user.display_name(),
            'role':  user.role,
        },
        'sso':     True,
        'created': created,
    })


def _map_role(saas_roles: list) -> str:
    """Map SaaS platform roles to Smart Task roles."""
    if 'PLATFORM_OWNER' in saas_roles or 'TENANT_OWNER' in saas_roles:
        return 'admin'
    if 'PRODUCT_ADMIN' in saas_roles:
        return 'manager'
    return 'employee'


@csrf_exempt
def sso_verify(request):
    """Health check endpoint called by SaaS platform to confirm SSO works."""
    return JsonResponse({
        'product':        SAAS_PRODUCT_CODE,
        'name':           'Smart Task Manager',
        'sso_configured': bool(SAAS_SSO_SECRET),
        'status':         'ok',
    })
