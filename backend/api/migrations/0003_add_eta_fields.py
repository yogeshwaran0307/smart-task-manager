from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0002_extensionrequest'),
    ]

    operations = [
        migrations.AddField(
            model_name='project',
            name='eta',
            field=models.CharField(max_length=200, blank=True, help_text='Estimated time to complete (e.g. 2 weeks, 3 days)'),
        ),
        migrations.AddField(
            model_name='task',
            name='eta',
            field=models.CharField(max_length=200, blank=True, help_text='Estimated time to complete (e.g. 4 hours, 2 days)'),
        ),
    ]
