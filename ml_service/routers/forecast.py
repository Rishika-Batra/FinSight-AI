import logging
from typing import List
from fastapi import APIRouter, Request, HTTPException, status
from pydantic import BaseModel, field_validator
import pandas as pd
from prophet import Prophet

router = APIRouter()
logger = logging.getLogger("ml_service.forecast")

MIN_DATA_POINTS = 30

class DataPoint(BaseModel):
    ds: str  # Date string in YYYY-MM-DD format
    y: float

    @field_validator("ds")
    @classmethod
    def validate_date_format(cls, v: str) -> str:
        try:
            pd.to_datetime(v, format="%Y-%m-%d")
        except (ValueError, TypeError):
            raise ValueError(f"Invalid date format '{v}'. Expected YYYY-MM-DD.")
        return v

class ForecastRequest(BaseModel):
    data: List[DataPoint]

class ForecastPoint(BaseModel):
    date: str
    predicted_balance: float
    lower: float
    upper: float

class ForecastResponse(BaseModel):
    forecast: List[ForecastPoint]

@router.post("/", response_model=ForecastResponse)
async def generate_forecast(request: Request, payload: ForecastRequest):
    if len(payload.data) < MIN_DATA_POINTS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Insufficient data: {len(payload.data)} data point(s) provided. "
                f"At least {MIN_DATA_POINTS} daily data points are required to fit a forecast."
            )
        )

    # Build DataFrame for Prophet
    df = pd.DataFrame([{"ds": point.ds, "y": point.y} for point in payload.data])
    df["ds"] = pd.to_datetime(df["ds"])
    df = df.drop_duplicates(subset="ds").sort_values("ds").reset_index(drop=True)

    # Validate that we still have enough data after deduplication
    if len(df) < MIN_DATA_POINTS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Insufficient unique data: only {len(df)} unique dates after deduplication. "
                f"At least {MIN_DATA_POINTS} unique daily data points are required."
            )
        )

    # Fit a fresh Prophet model on each request
    try:
        model = Prophet(
            weekly_seasonality=True,
            yearly_seasonality=False,
            daily_seasonality=False,
            interval_width=0.95  # 95% confidence interval
        )
        # Suppress verbose Prophet logging
        model.fit(df)
    except Exception as e:
        logger.error(f"Prophet model fitting failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Model fitting failed: {str(e)}"
        )

    # Create a future dataframe for the next 30 days
    future = model.make_future_dataframe(periods=30, freq="D")

    # Generate predictions
    try:
        prediction = model.predict(future)
    except Exception as e:
        logger.error(f"Prophet prediction failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Forecast prediction failed: {str(e)}"
        )

    # Only return the 30 future forecast days (not the training period)
    last_training_date = df["ds"].max()
    future_forecast = prediction[prediction["ds"] > last_training_date].head(30)

    result = [
        ForecastPoint(
            date=row["ds"].strftime("%Y-%m-%d"),
            predicted_balance=round(float(row["yhat"]), 2),
            lower=round(float(row["yhat_lower"]), 2),
            upper=round(float(row["yhat_upper"]), 2)
        )
        for _, row in future_forecast.iterrows()
    ]

    return ForecastResponse(forecast=result)
