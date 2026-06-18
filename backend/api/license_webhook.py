"""
license_webhook.py  ─ Add this file to your api/ folder in Smart Task backend.

Handles the license-provisioning webhook called by the SaaS Platform when a
company's license for Smart Task is approved. The SaaS Platform generates a
unique admin username + password for the tenant and sends them here so the
same credentials work for logging into Smart Task directly (in addition to
SSO via "Open App").

Security: this endpoint is NOT public. Every request must include a shared
secret header matching WEBHOOK_SECRET (set in Render env vars). Anyone who
doesn't have that secret gets a 401, no exceptions.
"""
import os
import uuid

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.hashers import make_password

from .models import Tenant, User

WEBHOOK_SECRET = os.environ.get('SAAS_WEBHOOK_SECRET', '')


def _unauthorized():
    return JsonResponse({'error': 'Invalid or missing webhook secret'}, status=401)


@csrf_exempt
def license_provision(request):
    """
    POST /api/webhooks/license-provision/

    Headers:
      X-Webhook-Secret: <SAAS_WEBHOOK_SECRET>

    Body (JSON):
      {
        "tenant_id": "13b1f303-75a3-4de6-b7d9-2ae34ed6e1db",
        "tenant_name": "yogesh",
        "plan_tier": "BASIC",
        "max_users": 10,
        "admin_username": "yogesh_admin",
        "admin_password": "plaintext-generated-by-saas-platform",
        "admin_email": "yogesh@gmail.com"      (optional)
      }

    Behavior:
      - Creates the Tenant if it doesn't exist yet; updates plan_tier/max_users if it does
        (so plan upgrades/downgrades on the SaaS Platform stay in sync).
      - Creates the admin User tied to that tenant, hashing the password immediately.
      - If admin_username already exists under a DIFFERENT tenant, rejects with 409 —
        usernames must be unique across the whole system and must not be hijacked
        from another company.
      - If admin_username already exists under the SAME tenant, resets their password
        to the newly supplied one (covers re-provisioning / password reset flows) and
        leaves everything else untouched.
      - Idempotent: safe to call again with the same tenant_id.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    incoming_secret = request.headers.get('X-Webhook-Secret', '')
    if not WEBHOOK_SECRET or incoming_secret != WEBHOOK_SECRET:
        return _unauthorized()

    import json
    try:
        body = json.loads(request.body or '{}')
    except Exception:
        return JsonResponse({'error': 'Invalid JSON body'}, status=400)

    tenant_id_raw   = body.get('tenant_id', '')
    tenant_name     = body.get('tenant_name', '')
    plan_tier       = body.get('plan_tier', 'BASIC')
    max_users       = body.get('max_users')
    admin_username  = body.get('admin_username', '')
    admin_password  = body.get('admin_password', '')
    admin_email     = body.get('admin_email', '')

    # ── Validate required fields ───────────────────────────────────────────
    missing = [f for f, v in [
        ('tenant_id', tenant_id_raw),
        ('tenant_name', tenant_name),
        ('admin_username', admin_username),
        ('admin_password', admin_password),
    ] if not v]
    if missing:
        return JsonResponse({'error': f'Missing required fields: {", ".join(missing)}'}, status=400)

    try:
        tenant_id = uuid.UUID(str(tenant_id_raw))
    except ValueError:
        return JsonResponse({'error': 'tenant_id must be a valid UUID'}, status=400)

    plan_code_map = {
        'TRIAL':        'SMART_TASK_BASIC',
        'BASIC':        'SMART_TASK_BASIC',
        'PROFESSIONAL': 'SMART_TASK_PRO',
        'ENTERPRISE':   'SMART_TASK_ENT',
    }
    plan_code = plan_code_map.get(plan_tier.upper(), 'SMART_TASK_BASIC')

    # ── Create or update the Tenant ────────────────────────────────────────
    tenant, tenant_created = Tenant.objects.get_or_create(
        id=tenant_id,
        defaults={
            'name': tenant_name,
            'plan_code': plan_code,
            'max_users': max_users,
            'is_active': True,
        }
    )
    if not tenant_created:
        # Keep plan in sync on every call (covers upgrades/downgrades/renewals)
        tenant.name = tenant_name
        tenant.plan_code = plan_code
        tenant.max_users = max_users
        tenant.is_active = True
        tenant.save()

    # ── Reject if username belongs to a different tenant ──────────────────
    existing_user = User.objects.filter(username=admin_username).first()
    if existing_user and existing_user.tenant_id and existing_user.tenant_id != tenant.id:
        return JsonResponse(
            {'error': f'Username "{admin_username}" is already in use by another tenant.'},
            status=409
        )

    # ── Create or update the admin user ────────────────────────────────────
    if existing_user:
        existing_user.password = make_password(admin_password)
        existing_user.tenant = tenant
        existing_user.role = 'admin'
        existing_user.is_active = True
        if admin_email:
            existing_user.email = admin_email
        existing_user.save()
        admin_user = existing_user
        admin_created = False
    else:
        admin_user = User.objects.create(
            username=admin_username,
            email=admin_email or f"{admin_username}@{tenant.name.lower().replace(' ', '')}.local",
            name=f"{tenant_name} Admin",
            role='admin',
            tenant=tenant,
            is_active=True,
            password=make_password(admin_password),
        )
        admin_created = True

    return JsonResponse({
        'success': True,
        'tenant': {
            'id': str(tenant.id),
            'name': tenant.name,
            'plan_code': tenant.plan_code,
            'max_users': tenant.max_users,
        },
        'admin': {
            'username': admin_user.username,
            'email': admin_user.email,
            'created': admin_created,
        },
    })
