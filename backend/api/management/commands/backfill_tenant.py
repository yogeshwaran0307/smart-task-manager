"""
backfill_tenant.py
Django management command — assigns a default Tenant to all existing
rows that currently have tenant_id = NULL.

Usage:
    python manage.py backfill_tenant

Safe to run multiple times (idempotent — only touches rows where tenant is NULL).
"""
import uuid
from django.core.management.base import BaseCommand
from django.db import transaction
from api.models import (
    Tenant, User, Project, Task, Department, Role, Channel, ExtensionRequest
)

# Real tenant UUID pulled from the SaaS Platform's `tenants` table (yogesh / TRIAL plan)
DEFAULT_TENANT_ID = uuid.UUID("13b1f303-75a3-4de6-b7d9-2ae34ed6e1db")
DEFAULT_TENANT_NAME = "yogesh"
DEFAULT_TENANT_PLAN_CODE = "SMART_TASK_BASIC"   # matches the active Basic license seen in the UI
DEFAULT_TENANT_MAX_USERS = 10                   # matches the Basic license's user limit


class Command(BaseCommand):
    help = "Backfill tenant_id on all existing rows using the real default tenant."

    def handle(self, *args, **options):
        with transaction.atomic():
            tenant, created = Tenant.objects.get_or_create(
                id=DEFAULT_TENANT_ID,
                defaults={
                    "name": DEFAULT_TENANT_NAME,
                    "plan_code": DEFAULT_TENANT_PLAN_CODE,
                    "max_users": DEFAULT_TENANT_MAX_USERS,
                    "is_active": True,
                },
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f"Created Tenant: {tenant.id} ({tenant.name})"))
            else:
                self.stdout.write(f"Tenant already exists: {tenant.id} ({tenant.name})")

            models_to_backfill = [
                (User, "users"),
                (Project, "projects"),
                (Task, "tasks"),
                (Department, "departments"),
                (Role, "roles"),
                (Channel, "channels"),
                (ExtensionRequest, "extension requests"),
            ]

            for model, label in models_to_backfill:
                updated = model.objects.filter(tenant__isnull=True).update(tenant=tenant)
                self.stdout.write(f"Backfilled {updated} {label} -> tenant {tenant.id}")

        self.stdout.write(self.style.SUCCESS("Backfill complete."))