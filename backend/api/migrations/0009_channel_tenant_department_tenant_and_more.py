from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0008_user_department_user_tenant'),
    ]

    operations = [
        migrations.AddField(
            model_name='channel',
            name='tenant',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='channels', to='api.tenant'),
        ),
        migrations.AddField(
            model_name='department',
            name='tenant',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='departments', to='api.tenant'),
        ),
        migrations.AddField(
            model_name='extensionrequest',
            name='tenant',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='extension_requests', to='api.tenant'),
        ),
        migrations.AddField(
            model_name='project',
            name='tenant',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='projects', to='api.tenant'),
        ),
        migrations.AddField(
            model_name='role',
            name='tenant',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='roles', to='api.tenant'),
        ),
        migrations.AddField(
            model_name='task',
            name='tenant',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='tasks', to='api.tenant'),
        ),
    ]