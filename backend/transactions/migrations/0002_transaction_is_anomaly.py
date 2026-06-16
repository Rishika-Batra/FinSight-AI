# pyrefly: ignore [missing-import]
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('transactions', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='transaction',
            name='is_anomaly',
            field=models.BooleanField(blank=True, db_index=True, null=True),
        ),
        migrations.AlterField(
            model_name='transaction',
            name='category',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
    ]
