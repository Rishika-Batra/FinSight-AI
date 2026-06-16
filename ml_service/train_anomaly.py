import os
import random
# pyrefly: ignore [missing-import]
import numpy as np
from sklearn.ensemble import IsolationForest
# pyrefly: ignore [missing-import]
import joblib

# Set random seeds for reproducibility
random.seed(42)
np.random.seed(42)

CATEGORIES = ["Food", "Transport", "Entertainment", "Utilities", "Shopping", "Health", "Other"]

def generate_synthetic_data(num_samples=1000):
    # Generate typical transaction features
    # 1. Amount: normal transactions in INR are usually between ₹50 and ₹40,000.
    # We model this as a mixture:
    # - 90% typical daily/weekly transactions centered around ₹900 (using lognormal)
    # - 10% larger monthly/occasional bills/shopping between ₹5,000 and ₹40,000 (using uniform)
    num_large = int(num_samples * 0.10)
    num_small = num_samples - num_large
    
    small_amounts = np.random.lognormal(mean=6.8, sigma=0.9, size=num_small)
    large_amounts = np.random.uniform(5000, 40000, size=num_large)
    
    amounts = np.concatenate([small_amounts, large_amounts])
    np.random.shuffle(amounts)
    
    # Clip any extremely low/high values to the ₹50–₹40,000 boundaries
    amounts = np.clip(amounts, 50.0, 40000.0)
    
    # 2. Day of week: 0 (Monday) to 6 (Sunday)
    days_of_week = np.random.randint(0, 7, size=num_samples)
    
    # 3. Hour of day: 0 to 23 (primarily daytime, e.g. 8 AM to 10 PM)
    hours_of_day = np.random.randint(8, 23, size=num_samples)
    
    # 4. Category encoded: mapped to category index with specific frequencies
    cat_weights = [0.25, 0.20, 0.15, 0.10, 0.15, 0.10, 0.05] # Food, Transport, etc.
    categories_encoded = np.random.choice(range(len(CATEGORIES)), size=num_samples, p=cat_weights)
    
    # Combine into a single matrix (num_samples, 4)
    X = np.column_stack((amounts, days_of_week, hours_of_day, categories_encoded))
    return X

def train_and_save():
    # Generate normal transactions dataset
    X = generate_synthetic_data(1000)
    print(f"Generated {X.shape[0]} normal transactions for training with features: amount, day_of_week, hour_of_day, category_encoded")
    
    # Train Isolation Forest
    # contamination=0.05 means ~5% of normal data could be classified as anomalies (false positive threshold)
    model = IsolationForest(contamination=0.05, random_state=42)
    print("Training IsolationForest model...")
    model.fit(X)
    
    # Evaluate model predictions
    # IsolationForest.predict returns -1 for anomalies and 1 for inliers
    preds = model.predict(X)
    num_anomalies = np.sum(preds == -1)
    print(f"Model trained. Found {num_anomalies} anomalies out of {X.shape[0]} training samples (contamination = {num_anomalies/X.shape[0]:.2%})")
    
    # Save model to disk
    models_dir = os.path.join(os.path.dirname(__file__), "models")
    os.makedirs(models_dir, exist_ok=True)
    model_path = os.path.join(models_dir, "anomaly.joblib")
    
    joblib.dump(model, model_path)
    print(f"Saved anomaly detector model to: {model_path}")

if __name__ == "__main__":
    train_and_save()
