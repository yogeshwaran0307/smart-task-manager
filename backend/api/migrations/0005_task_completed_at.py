from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0004_project_task_codes'),
    ]

    operations = [
        migrations.AddField(
            model_name='task',
            name='completed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
