from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='ExtensionRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('content_type', models.CharField(max_length=20)),
                ('object_id', models.IntegerField()),
                ('reason', models.TextField()),
                ('requested_new_date', models.DateField()),
                ('original_due_date', models.DateField(blank=True, null=True)),
                ('days_requested', models.IntegerField(default=0)),
                ('status', models.CharField(
                    choices=[('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected')],
                    default='pending', max_length=20,
                )),
                ('review_note', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('requested_by', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='extension_requests',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('reviewed_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='reviewed_extensions',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
        ),
    ]
