from typing import List
from datetime import datetime
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
import numpy as np

router = APIRouter()

CATEGORIES = ["Food", "Transport", "Entertainment", "Utilities", "Shopping", "Health", "Other"]
category_map = {cat.lower(): idx for idx, cat in enumerate(CATEGORIES)}

class AnomalyItem(BaseModel):
    amount: float
    date: str
    category: str

class AnomalyResponse(BaseModel):
    amount: float
    date: str
    category: str
    is_anomaly: bool
    anomaly_score: float

def parse_date_features(date_str: str):
    date_str = date_str.strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(date_str, fmt)
            # If date format has no time, default to 12 PM
            hour = dt.hour if fmt != "%Y-%m-%d" else 12
            return dt.weekday(), hour
        except ValueError:
            continue
    try:
        # Fallback to general ISO parsing
        dt = datetime.fromisoformat(date_str)
        return dt.weekday(), dt.hour
    except Exception:
        # Default to Monday, 12 PM if parsing fails
        return 0, 12

@router.post("/", response_model=List[AnomalyResponse])
async def detect_anomalies(request: Request, items: List[AnomalyItem]):
    anomaly_detector = getattr(request.app.state, "anomaly_detector", None)
    results = []

    if not items:
        return results

    if anomaly_detector is not None:
        try:
            X = []
            for item in items:
                day_of_week, hour_of_day = parse_date_features(item.date)
                cat_idx = category_map.get(item.category.lower().strip(), 6) # default to Other (6)
                X.append([item.amount, day_of_week, hour_of_day, cat_idx])
            
            # Predict and score in batch
            preds = anomaly_detector.predict(X)
            scores = anomaly_detector.decision_function(X) # raw decision function: lower means more anomalous
            
            for item, pred, score in zip(items, preds, scores):
                is_anomaly = bool(pred == -1)
                # Invert decision score so higher value represents higher anomaly likelihood
                anomaly_score = float(-score)
                results.append(AnomalyResponse(
                    amount=item.amount,
                    date=item.date,
                    category=item.category,
                    is_anomaly=is_anomaly,
                    anomaly_score=round(anomaly_score, 4)
                ))
        except Exception as e:
            # Fallback if prediction fails
            for item in items:
                results.append(AnomalyResponse(
                    amount=item.amount,
                    date=item.date,
                    category=item.category,
                    is_anomaly=item.amount > 5000.0,
                    anomaly_score=0.0
                ))
    else:
        # Fallback heuristic if model is not loaded
        for item in items:
            is_anomaly = item.amount > 3000.0 or item.amount < 0.0
            anomaly_score = 0.8 if is_anomaly else 0.1
            results.append(AnomalyResponse(
                amount=item.amount,
                date=item.date,
                category=item.category,
                is_anomaly=is_anomaly,
                anomaly_score=anomaly_score
            ))

    return results
