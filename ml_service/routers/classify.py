from typing import List
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

router = APIRouter()

class TransactionItem(BaseModel):
    description: str
    amount: float

class ClassificationResponse(BaseModel):
    description: str
    predicted_category: str
    confidence: float

@router.post("/", response_model=List[ClassificationResponse])
async def classify_transactions(request: Request, items: List[TransactionItem]):
    classifier = getattr(request.app.state, "classifier", None)
    results = []

    if not items:
        return results

    if classifier is not None:
        try:
            descriptions = [item.description for item in items]
            
            # Perform batch prediction for efficiency
            predictions = classifier.predict(descriptions)
            probabilities = classifier.predict_proba(descriptions)
            classes = classifier.classes_
            
            for item, pred, probs in zip(items, predictions, probabilities):
                prob_dict = dict(zip(classes, probs))
                confidence = float(prob_dict[pred])
                results.append(ClassificationResponse(
                    description=item.description,
                    predicted_category=pred,
                    confidence=round(confidence, 4)
                ))
        except Exception as e:
            # Handle prediction errors by falling back
            for item in items:
                results.append(ClassificationResponse(
                    description=item.description,
                    predicted_category="Other",
                    confidence=0.50
                ))
    else:
        # Fallback heuristic classifier if model is not loaded
        for item in items:
            desc = item.description.lower()
            if any(w in desc for w in ["eat", "restaurant", "food", "starbucks", "coffee", "pizza", "grocery", "cafe"]):
                pred = "Food"
            elif any(w in desc for w in ["uber", "lyft", "gas", "fuel", "transit", "bus", "train", "taxi", "parking"]):
                pred = "Transport"
            elif any(w in desc for w in ["netflix", "spotify", "movie", "concert", "game", "hulu", "disney", "theater"]):
                pred = "Entertainment"
            elif any(w in desc for w in ["bill", "utility", "internet", "phone", "electric", "water", "comcast", "verizon"]):
                pred = "Utilities"
            elif any(w in desc for w in ["amazon", "target", "nike", "shop", "purchase", "zara", "walmart", "costco"]):
                pred = "Shopping"
            elif any(w in desc for w in ["pharmacy", "cvs", "doctor", "gym", "health", "dentist", "medical", "walgreens"]):
                pred = "Health"
            else:
                pred = "Other"
                
            results.append(ClassificationResponse(
                description=item.description,
                predicted_category=pred,
                confidence=0.70
            ))

    return results
