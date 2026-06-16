import requests
import uuid

BASE_URL = "http://127.0.0.1:8000"

def get_traceback():
    unique_id = str(uuid.uuid4())[:8]
    username = f"check_{unique_id}"
    email = f"check_{unique_id}@finsight.ai"
    password = "password123"

    # Register
    res = requests.post(f"{BASE_URL}/api/auth/register/", json={
        "username": username,
        "email": email,
        "password": password
    })
    res.raise_for_status()

    # Login
    res = requests.post(f"{BASE_URL}/api/auth/login/", json={
        "username": username,
        "password": password
    })
    res.raise_for_status()
    token = res.json()["access"]

    # Post transaction
    headers = {"Authorization": f"Bearer {token}"}
    res = requests.post(f"{BASE_URL}/api/transactions/", json={
        "date": "2026-06-14",
        "amount": "12.50",
        "category": "",
        "description": "Starbucks coffee"
    }, headers=headers)
    
    print("Status:", res.status_code)
    if res.status_code != 201:
        text = res.text
        if "Traceback" in text:
            # Try to print lines around Traceback
            idx = text.find("Traceback")
            print(text[idx:idx+2000])
        else:
            print(text[:2000])

if __name__ == "__main__":
    get_traceback()
