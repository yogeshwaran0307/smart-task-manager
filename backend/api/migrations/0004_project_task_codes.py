from django.db import migrations, models
import re


def generate_project_codes(apps, schema_editor):
    """Backfill project_code for any existing projects that don't have one."""
    Project = apps.get_model('api', 'Project')
    for project in Project.objects.filter(project_code__isnull=True).order_by('id'):
        name = project.name or 'XX'
        prefix = ''.join([c for c in name.upper() if c.isalpha()][:2]).ljust(2, 'X')
        pattern = re.compile(rf'^{re.escape(prefix)}-(\d+)$')
        existing = Project.objects.filter(project_code__startswith=f'{prefix}-').values_list('project_code', flat=True)
        max_num = 0
        for code in existing:
            m = pattern.match(code)
            if m:
                max_num = max(max_num, int(m.group(1)))
        project.project_code = f"{prefix}-{max_num + 1:03d}"
        project.save()


def generate_task_codes(apps, schema_editor):
    """Backfill task_code for any existing tasks that don't have one."""
    Task = apps.get_model('api', 'Task')
    Project = apps.get_model('api', 'Project')
    for task in Task.objects.filter(task_code__isnull=True).order_by('id'):
        if task.project_id:
            try:
                project = Project.objects.get(id=task.project_id)
                prefix = project.project_code or 'XX-000'
                pattern = re.compile(rf'^{re.escape(prefix)}-T(\d+)$')
                existing = Task.objects.filter(project_id=task.project_id).values_list('task_code', flat=True)
                max_num = 0
                for code in existing:
                    m = pattern.match(code)
                    if m:
                        max_num = max(max_num, int(m.group(1)))
                task.task_code = f"{prefix}-T{max_num + 1:03d}"
            except Project.DoesNotExist:
                pattern = re.compile(r'^TSK-(\d+)$')
                existing = Task.objects.filter(project__isnull=True).values_list('task_code', flat=True)
                max_num = 0
                for code in existing:
                    m = pattern.match(code)
                    if m:
                        max_num = max(max_num, int(m.group(1)))
                task.task_code = f"TSK-{max_num + 1:03d}"
        else:
            pattern = re.compile(r'^TSK-(\d+)$')
            existing = Task.objects.filter(project__isnull=True).values_list('task_code', flat=True)
            max_num = 0
            for code in existing:
                m = pattern.match(code)
                if m:
                    max_num = max(max_num, int(m.group(1)))
            task.task_code = f"TSK-{max_num + 1:03d}"
        task.save()


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0003_add_eta_fields'),
    ]

    operations = [
        # Add nullable first so existing rows don't violate NOT NULL
        migrations.AddField(
            model_name='project',
            name='project_code',
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
        migrations.AddField(
            model_name='task',
            name='task_code',
            field=models.CharField(blank=True, max_length=30, null=True),
        ),
        # Backfill codes for existing rows
        migrations.RunPython(generate_project_codes, migrations.RunPython.noop),
        migrations.RunPython(generate_task_codes, migrations.RunPython.noop),
        # Now enforce uniqueness (NULLs are excluded from unique check in most DBs,
        # but all rows should be filled by now)
        migrations.AlterField(
            model_name='project',
            name='project_code',
            field=models.CharField(blank=True, max_length=20, unique=True),
        ),
        migrations.AlterField(
            model_name='task',
            name='task_code',
            field=models.CharField(blank=True, max_length=30, unique=True),
        ),
    ]
