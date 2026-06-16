# Generated migration: adds transaction_hash, DB indexes, and UserAnalytics model

# pyrefly: ignore [missing-import]
from django.conf import settings
# pyrefly: ignore [missing-import]
from django.db import migrations, models
# pyrefly: ignore [missing-import]
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('transactions', '0002_transaction_is_anomaly'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # 1. Add transaction_hash field for duplicate detection
        migrations.AddField(
            model_name='transaction',
            name='transaction_hash',
            field=models.CharField(blank=True, db_index=True, max_length=64, null=True),
        ),

        # 2. Add composite index on (user, date) for range queries
        migrations.AddIndex(
            model_name='transaction',
            index=models.Index(fields=['user', 'date'], name='tx_user_date_idx'),
        ),

        # 3. Add composite index on (user, category) for stats queries
        migrations.AddIndex(
            model_name='transaction',
            index=models.Index(fields=['user', 'category'], name='tx_user_category_idx'),
        ),

        # 4. Create UserAnalytics cache table
        migrations.CreateModel(
            name='UserAnalytics',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('total_spent', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('top_category', models.CharField(default='N/A', max_length=100)),
                ('transaction_count', models.IntegerField(default=0)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='analytics',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
        ),
    ]
