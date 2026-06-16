import os
import logging
from contextlib import asynccontextmanager
# pyrefly: ignore [missing-import]
from fastapi import FastAPI
# pyrefly: ignore [missing-import]
import joblib

from routers import classify, anomaly, forecast

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ml_service")

# Suppress verbose third-party library logging
logging.getLogger("prophet").setLevel(logging.WARNING)
logging.getLogger("cmdstanpy").setLevel(logging.WARNING)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup lifecycle: Load serialized models
    models_dir = os.path.join(os.path.dirname(__file__), "models")
    
    classifier_path = os.path.join(models_dir, "classifier.joblib")
    anomaly_path = os.path.join(models_dir, "anomaly.joblib")
    forecaster_path = os.path.join(models_dir, "prophet_forecaster.joblib")

    # Load Category Classifier
    if os.path.exists(classifier_path):
        try:
            app.state.classifier = joblib.load(classifier_path)
            logger.info("Category classifier loaded successfully.")
        except Exception as e:
            logger.error(f"Error loading category classifier: {str(e)}")
            app.state.classifier = None
    else:
        logger.warning(f"Category classifier not found at {classifier_path}. Using fallback.")
        app.state.classifier = None

    # Load Anomaly Detector
    if os.path.exists(anomaly_path):
        try:
            app.state.anomaly_detector = joblib.load(anomaly_path)
            logger.info("Anomaly detector loaded successfully.")
        except Exception as e:
            logger.error(f"Error loading anomaly detector: {str(e)}")
            app.state.anomaly_detector = None
    else:
        logger.warning(f"Anomaly detector not found at {anomaly_path}. Using fallback.")
        app.state.anomaly_detector = None

    # Load Prophet Forecaster
    if os.path.exists(forecaster_path):
        try:
            app.state.forecaster = joblib.load(forecaster_path)
            logger.info("Prophet forecaster loaded successfully.")
        except Exception as e:
            logger.error(f"Error loading prophet forecaster: {str(e)}")
            app.state.forecaster = None
    else:
        logger.warning(f"Prophet forecaster not found at {forecaster_path}. Using fallback.")
        app.state.forecaster = None

    yield
    
    # Shutdown lifecycle: Cleanup models
    logger.info("Lifespan shutdown: cleaning up models from state.")
    app.state.classifier = None
    app.state.anomaly_detector = None
    app.state.forecaster = None

app = FastAPI(
    title="FinSight AI ML Service",
    description="Machine Learning service for classification, anomaly detection, and forecasting.",
    version="1.0.0",
    lifespan=lifespan
)

# Register routers
app.include_router(classify.router, prefix="/classify", tags=["classification"])
app.include_router(anomaly.router, prefix="/anomaly", tags=["anomaly_detection"])
app.include_router(forecast.router, prefix="/forecast", tags=["forecasting"])

@app.get("/")
async def root():
    return {
        "service": "FinSight AI ML Service",
        "status": "active"
    }
