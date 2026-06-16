import django
django.setup()
from transactions.tasks import run_anomaly_detection
from transactions.models import Transaction
from django.contrib.auth.models import User

def run_test():
    user = User.objects.get(username='demo@finsight.ai')
    print("Pre-run: Count of anomalies for demo user:", Transaction.objects.filter(user=user, is_anomaly=True).count())
    
    # Run the task synchronously
    run_anomaly_detection(user.id)
    
    print("Post-run: Count of anomalies for demo user:", Transaction.objects.filter(user=user, is_anomaly=True).count())

if __name__ == "__main__":
    run_test()
