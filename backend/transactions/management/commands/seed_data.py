import datetime
import random
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from transactions.models import Transaction

class Command(BaseCommand):
    help = 'Seeds the database with a test user and 6 months of realistic synthetic transactions.'

    def handle(self, *args, **kwargs):
        # 1. Create or get test user
        username = 'demo@finsight.ai'
        email = 'demo@finsight.ai'
        password = 'demo1234'
        
        self.stdout.write(self.style.WARNING(f"Checking for user {username}..."))
        user, created = User.objects.get_or_create(username=username, defaults={'email': email})
        user.set_password(password)
        user.save()
        if created:
            self.stdout.write(self.style.SUCCESS(f"User {username} created."))
        else:
            self.stdout.write(self.style.SUCCESS(f"User {username} already existed, password updated."))

        # 2. Clear existing transactions for this user to make it clean & repeatable
        self.stdout.write(self.style.WARNING(f"Clearing existing transactions for {username}..."))
        deleted_count, _ = Transaction.objects.filter(user=user).delete()
        self.stdout.write(self.style.SUCCESS(f"Deleted {deleted_count} existing transactions."))

        # 3. Generate 6 months of synthetic transactions
        self.stdout.write(self.style.WARNING("Generating 6 months of synthetic transactions..."))
        
        # Categories & realistic descriptions with amount ranges in INR
        data_templates = {
            "Food": [
                ("Starbucks Coffee", 250.00, 450.00),
                ("Whole Foods Grocery", 800.00, 2500.00),
                ("McDonalds Lunch", 250.00, 500.00),
                ("Local Diner Lunch", 300.00, 800.00),
                ("Trader Joe's Groceries", 700.00, 2200.00),
                ("Sushi Dinner", 1200.00, 3000.00),
                ("UberEats Delivery", 400.00, 1500.00),
                ("Chipotle Dinner", 350.00, 800.00),
            ],
            "Transport": [
                ("Uber Ride", 150.00, 450.00),
                ("Lyft Ride", 200.00, 500.00),
                ("Shell Gas Station", 1500.00, 3500.00),
                ("Chevron Fuel", 1800.00, 3800.00),
                ("Metro Transit Fare", 50.00, 150.00),
                ("Parking Garage Fee", 100.00, 300.00),
            ],
            "Entertainment": [
                ("Netflix Subscription", 649.00, 649.00),
                ("Spotify Premium", 119.00, 119.00),
                ("AMC Movie Tickets", 300.00, 900.00),
                ("Steam Game Purchase", 500.00, 3500.00),
                ("Concert Ticket", 1000.00, 4500.00),
                ("Hulu Subscription", 499.00, 499.00),
            ],
            "Utilities": [
                ("Electric Bill", 1200.00, 3000.00),
                ("Water Bill", 500.00, 1200.00),
                ("Comcast Internet", 999.00, 999.00),
                ("Verizon Phone Bill", 699.00, 1500.00),
            ],
            "Shopping": [
                ("Amazon Purchase", 500.00, 8000.00),
                ("Target Store Purchase", 800.00, 6000.00),
                ("Nike Shoes", 4000.00, 9500.00),
                ("Zara Clothing Store", 2000.00, 12000.00),
                ("Costco Wholesale", 4500.00, 15000.00),
            ],
            "Health": [
                ("CVS Pharmacy", 200.00, 1500.00),
                ("Walgreens Pharmacy", 300.00, 1800.00),
                ("Gym Membership", 1500.00, 1500.00),
                ("Doctor Office Copay", 500.00, 1500.00),
            ],
            "Other": [
                ("Office Supplies", 300.00, 1800.00),
                ("Dry Cleaning", 250.00, 900.00),
                ("Hardware Store", 400.00, 3500.00),
                ("Haircut Salon", 400.00, 1500.00),
            ],
        }

        today = datetime.date.today()
        transactions = []
        
        # We want to loop back 180 days (6 months)
        for days_ago in range(180, -1, -1):
            date = today - datetime.timedelta(days=days_ago)
            
            # Monthly recurring bills (on the 1st, 5th, 10th of each month)
            if date.day == 1:
                # Rent Payment rescaled to INR (₹15,000-₹40,000 scale, let's fix it at ₹25,000)
                transactions.append(Transaction(
                    user=user,
                    date=date,
                    amount=Decimal("25000.00"),
                    category="Other",
                    description="Monthly Rent Payment",
                    is_anomaly=False
                ))
            if date.day == 5:
                # Electric bill
                desc, min_val, max_val = data_templates["Utilities"][0]
                val = round(random.uniform(min_val, max_val), 2)
                transactions.append(Transaction(
                    user=user,
                    date=date,
                    amount=Decimal(str(val)),
                    category="Utilities",
                    description=desc,
                    is_anomaly=False
                ))
                # Internet bill
                desc, min_val, max_val = data_templates["Utilities"][2]
                transactions.append(Transaction(
                    user=user,
                    date=date,
                    amount=Decimal(str(min_val)),
                    category="Utilities",
                    description=desc,
                    is_anomaly=False
                ))
            if date.day == 10:
                # Water bill
                desc, min_val, max_val = data_templates["Utilities"][1]
                val = round(random.uniform(min_val, max_val), 2)
                transactions.append(Transaction(
                    user=user,
                    date=date,
                    amount=Decimal(str(val)),
                    category="Utilities",
                    description=desc,
                    is_anomaly=False
                ))
                # Phone bill
                desc, min_val, max_val = data_templates["Utilities"][3]
                val = round(random.uniform(min_val, max_val), 2)
                transactions.append(Transaction(
                    user=user,
                    date=date,
                    amount=Decimal(str(val)),
                    category="Utilities",
                    description=desc,
                    is_anomaly=False
                ))
            if date.day == 15:
                # Gym membership
                desc, min_val, max_val = data_templates["Health"][2]
                transactions.append(Transaction(
                    user=user,
                    date=date,
                    amount=Decimal(str(min_val)),
                    category="Health",
                    description=desc,
                    is_anomaly=False
                ))

            # Daily normal transactions (85% chance of 1 to 3 transactions)
            if random.random() < 0.85:
                num_tx = random.randint(1, 3)
                for _ in range(num_tx):
                    category = random.choice(list(data_templates.keys()))
                    # Avoid duplicate monthly bills in this section
                    if category == "Utilities":
                        continue
                    template = random.choice(data_templates[category])
                    desc, min_val, max_val = template
                    val = round(random.uniform(min_val, max_val), 2)
                    
                    transactions.append(Transaction(
                        user=user,
                        date=date,
                        amount=Decimal(str(val)),
                        category=category,
                        description=desc,
                        is_anomaly=False
                    ))
        
        # 4. Insert intentional anomalies at specific times (Rescaled to INR)
        # Let's insert 3 distinct anomalies at fixed days_ago so they are reliably placed
        anomalies = [
            # One huge purchase: Luxury jewelry / watch (₹85,000.00)
            (today - datetime.timedelta(days=45), Decimal("85000.00"), "Shopping", "Luxury Jewelry / Watch Purchase"),
            # Another anomaly: Emergency appliance replacement (₹65,000.00)
            (today - datetime.timedelta(days=120), Decimal("65000.00"), "Other", "Emergency Home Appliance Replacement"),
            # Third anomaly: VIP Concert & VIP Travel package (₹58,000.00)
            (today - datetime.timedelta(days=15), Decimal("58000.00"), "Entertainment", "VIP Concert and Travel Package"),
        ]
        
        for date, amount, category, description in anomalies:
            transactions.append(Transaction(
                user=user,
                date=date,
                amount=amount,
                category=category,
                description=description,
                is_anomaly=True
            ))

        # Sort all transactions by date ascending, then write to database
        transactions.sort(key=lambda t: t.date)
        
        self.stdout.write(self.style.WARNING(f"Bulk inserting {len(transactions)} transactions..."))
        Transaction.objects.bulk_create(transactions)
        
        self.stdout.write(self.style.SUCCESS(f"Successfully seeded database with {len(transactions)} transactions for user {username}!"))
