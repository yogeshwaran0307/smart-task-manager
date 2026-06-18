"""
sso_views.py  ─ Add this file to your api/ folder in Smart Task backend
Handles SSO login from SaaS Platform.
"""
import os, json, hmac, hashlib, base64, time, uuid

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth import get_user_model

from .models import User, ActivityLog, Tenant

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
      3. Resolve the Tenant from tenantId in the token
      4. Find an existing user already tied to that tenant (created via the
         license-provisioning webhook) — DO NOT create a brand new
         disconnected user. If no tenant or no matching admin exists yet,
         this means the license-provision webhook hasn't run for this
         tenant, so we reject rather than silently creating an orphan
         account with no tenant isolation.
      5. Return our own auth token for the frontend to use
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
    user_id_from_saas = payload.get('sub', '')
    tenant_id_raw      = payload.get('tenantId', '')
    roles               = payload.get('roles', [])

    if not tenant_id_raw:
        return JsonResponse({'error': 'SSO token missing tenantId'}, status=400)

    try:
        tenant_id = uuid.UUID(str(tenant_id_raw))
    except ValueError:
        return JsonResponse({'error': 'Invalid tenantId in SSO token'}, status=400)

    # ── Resolve the Tenant ─────────────────────────────────────────────────
    tenant = Tenant.objects.filter(id=tenant_id).first()
    if not tenant:
        return JsonResponse(
            {'error': 'This company is not yet provisioned in Smart Task. '
                      'Ask your platform admin to complete license setup.'},
            status=403
        )
    if not tenant.is_active:
        return JsonResponse({'error': 'This tenant is inactive. Contact your admin.'}, status=403)

    # ── Find an existing user tied to this tenant ──────────────────────────
    # Prefer an exact saas-user mapping if one exists from a prior SSO login;
    # otherwise fall back to the tenant's admin account provisioned by the
    # license webhook (covers the very first SSO click before any per-user
    # mapping exists).
    saas_username = f"saas_{user_id_from_saas}"
    user = User.objects.filter(username=saas_username, tenant=tenant).first()

    if not user:
        user = User.objects.filter(tenant=tenant, role='admin').order_by('id').first()

    if not user:
        return JsonResponse(
            {'error': 'No Smart Task account exists for this tenant yet. '
                      'Ask your platform admin to complete license setup.'},
            status=403
        )

    if not user.is_active:
        return JsonResponse(
            {'error': 'Your Smart Task account is inactive. Contact your admin.'},
            status=403
        )

    # ── Issue Smart Task auth token ────────────────────────────────────────────
    token = _make_token(user.id)

    ActivityLog.objects.create(
        action=f"SSO login via SaaS Platform (tenant: {tenant.id}, saas_user: {user_id_from_saas})",
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
        'tenant': {
            'id': str(tenant.id),
            'name': tenant.name,
            'plan_code': tenant.plan_code,
        },
        'sso':     True,
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
