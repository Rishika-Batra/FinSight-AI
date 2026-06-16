import requests
import sqlite3
import datetime
import os

def check():
    db_path = "../backend/db.sqlite3"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT amount, date, category FROM transactions_transaction WHERE user_id=1")
    rows = cursor.fetchall()
    
    payload = []
    for amount, date_str, category in rows:
        payload.append({
            "amount": float(amount),
            "date": date_str,
            "category": category if category else "Other"
        })
        
    res = requests.post("http://127.0.0.1:8001/anomaly/", json=payload)
    print("FastAPI Response Status:", res.status_code)
    if res.status_code == 200:
        data = res.json()
        anomalies = [item for item in data if item["is_anomaly"]]
        print("Number of anomalies returned from FastAPI:", len(anomalies))
        for item in anomalies[:5]:
            print(item)
    else:
        print(res.text)

if __name__ == "__main__":
    check()
