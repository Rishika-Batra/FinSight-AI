import os
import sqlite3
import joblib
import datetime

def check():
    db_path = "../backend/db.sqlite3"
    print("DB exists:", os.path.exists(db_path))
    
    # 1. Fetch transactions for demo@finsight.ai
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Find user ID
    cursor.execute("SELECT id FROM auth_user WHERE username='demo@finsight.ai'")
    user_row = cursor.fetchone()
    if not user_row:
        print("Demo user not found!")
        return
    user_id = user_row[0]
    print("User ID:", user_id)
    
    # Fetch transactions
    cursor.execute("SELECT amount, date, category, description, is_anomaly FROM transactions_transaction WHERE user_id=?", (user_id,))
    rows = cursor.fetchall()
    print("Total transactions fetched:", len(rows))
    
    # 2. Load model
    model_path = "models/anomaly.joblib"
    print("Model exists:", os.path.exists(model_path))
    if not os.path.exists(model_path):
        return
        
    model = joblib.load(model_path)
    CATEGORIES = ["Food", "Transport", "Entertainment", "Utilities", "Shopping", "Health", "Other"]
    category_map = {cat.lower(): idx for idx, cat in enumerate(CATEGORIES)}
    
    X = []
    for amount, date_str, category, desc, is_anomaly in rows:
        dt = datetime.datetime.strptime(date_str, "%Y-%m-%d")
        day_of_week = dt.weekday()
        # Default to Other (6) if category is not found
        cat_idx = category_map.get(category.lower().strip() if category else "other", 6)
        X.append([float(amount), day_of_week, 12, cat_idx])
        
    preds = model.predict(X)
    scores = model.decision_function(X)
    
    # Find anomalous records
    anomalies = []
    for idx, (p, score) in enumerate(zip(preds, scores)):
        if p == -1:
            anomalies.append((rows[idx], score))
            
    print("Number of predicted anomalies (-1):", len(anomalies))
    for (amount, date_str, category, desc, is_anomaly), score in anomalies[:10]:
        print(f"Date: {date_str} | Category: {category} | Amount: {amount} | Desc: {desc} | Score: {-score}")

if __name__ == "__main__":
    check()
