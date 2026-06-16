import sys
import time
import uuid
import datetime
import requests

BASE_URL = "http://127.0.0.1:8000"

def run_smoke_test():
    print("=== FinSight AI Integration Smoke Test ===")
    
    # Generate unique credentials
    unique_id = str(uuid.uuid4())[:8]
    username = f"smoke_{unique_id}"
    email = f"smoke_{unique_id}@finsight.ai"
    password = "password123"

    print(f"\n1. Registering test user: {email}...")
    reg_url = f"{BASE_URL}/api/auth/register/"
    reg_data = {
        "username": username,
        "email": email,
        "password": password
    }
    
    try:
        res = requests.post(reg_url, json=reg_data)
        res.raise_for_status()
        print("Registration successful!")
    except requests.exceptions.RequestException as e:
        print(f"Registration failed: {e}")
        if res := getattr(e, 'response', None):
            print(f"Details: {res.text}")
        sys.exit(1)

    print("\n2. Logging in to obtain JWT...")
    login_url = f"{BASE_URL}/api/auth/login/"
    login_data = {
        "username": username,
        "password": password
    }
    try:
        res = requests.post(login_url, json=login_data)
        res.raise_for_status()
        tokens = res.json()
        access_token = tokens["access"]
        print("Login successful! JWT acquired.")
    except requests.exceptions.RequestException as e:
        print(f"Login failed: {e}")
        sys.exit(1)

    headers = {
        "Authorization": f"Bearer {access_token}"
    }

    # Generate 35 unique daily transaction rows to meet the 30-day forecast requirement
    print("\n3. Preparing 35 days of historical transaction CSV data...")
    today = datetime.date.today()
    csv_rows = ["date,amount,category,description"]
    for i in range(36, 1, -1):
        date_str = str(today - datetime.timedelta(days=i))
        csv_rows.append(f"{date_str},100.00,Food,Daily groceries")

    csv_content = "\n".join(csv_rows)
    files = {
        "file": ("transactions.csv", csv_content, "text/csv")
    }

    print("Uploading transaction CSV...")
    upload_url = f"{BASE_URL}/api/transactions/upload/"
    try:
        res = requests.post(upload_url, files=files, headers=headers)
        res.raise_for_status()
        print(f"Upload successful: {res.json().get('message')}")
    except requests.exceptions.RequestException as e:
        print(f"CSV upload failed: {e}")
        sys.exit(1)

    print("\n4. Creating a single unclassified transaction to test ML classification pipeline...")
    tx_url = f"{BASE_URL}/api/transactions/"
    tx_data = {
        "date": str(today),
        "amount": "12.50",
        "category": "",
        "description": "Starbucks hot coffee breakfast run"
    }
    try:
        res = requests.post(tx_url, json=tx_data, headers=headers)
        res.raise_for_status()
        new_tx_id = res.json()["id"]
        print(f"Created transaction (ID: {new_tx_id}) with empty category.")
    except requests.exceptions.RequestException as e:
        print(f"Transaction creation failed: {e}")
        if 'res' in locals() and res is not None:
            print("Response text:", res.text)
        sys.exit(1)

    print("\n5. Polling until transaction is classified by Celery & ML Service...")
    classified = False
    for attempt in range(15):
        try:
            res = requests.get(tx_url, headers=headers)
            res.raise_for_status()
            results = res.json().get("results", [])
            target_tx = next((t for t in results if t["id"] == new_tx_id), None)
            
            if target_tx:
                category = target_tx.get("category")
                if category and category != "":
                    print(f"Success! Transaction classified as: '{category}' (attempt {attempt + 1}/15)")
                    classified = True
                    break
            time.sleep(2)
        except requests.exceptions.RequestException as e:
            print(f"Error polling transactions: {e}")
            break

    if not classified:
        print("Warning: Transaction classification timed out. Check if Celery worker and Redis are running.")

    print("\n6. Triggering cash flow forecasting and anomaly detection tasks...")
    forecast_gen_url = f"{BASE_URL}/api/forecasts/generate/"
    try:
        res = requests.post(forecast_gen_url, headers=headers)
        res.raise_for_status()
        print("Forecast generation request accepted (HTTP 202).")
    except requests.exceptions.RequestException as e:
        print(f"Failed to trigger forecast generation: {e}")
        sys.exit(1)

    print("\n7. Polling for latest forecast snapshot...")
    latest_forecast_url = f"{BASE_URL}/api/forecasts/latest/"
    forecast_received = False
    for attempt in range(15):
        try:
            res = requests.get(latest_forecast_url, headers=headers)
            if res.status_code == 200:
                forecast_data = res.json()
                print(f"Success! Forecast snapshot generated (attempt {attempt + 1}/15)")
                forecast_received = True
                
                # Print sample output of dashboard statistics
                forecast_points = forecast_data.get("forecast_data", {}).get("forecast", [])
                print(f"\nForecast generated with {len(forecast_points)} data points.")
                if forecast_points:
                    print("Sample forecast points:")
                    for pt in forecast_points[:3]:
                        print(f"  Date: {pt['date']} | Pred: ${pt['predicted_balance']} | Range: [${pt['lower']} - ${pt['upper']}]")
                break
            elif res.status_code == 404:
                # Still generating
                time.sleep(2)
            else:
                res.raise_for_status()
        except requests.exceptions.RequestException as e:
            print(f"Error polling forecast: {e}")
            break

    if not forecast_received:
        print("Warning: Forecast generation timed out. Check if Celery worker/beat is running.")
        sys.exit(1)

    print("\n=== Smoke Test Completed Successfully! ===")

if __name__ == "__main__":
    run_smoke_test()
