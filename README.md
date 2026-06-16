# FinSight AI

FinSight AI is a premium financial intelligence application featuring automated transaction classification, real-time transaction anomaly detection, and predictive cash flow forecasting. It is built using Django REST Framework for the core API, FastAPI for the Machine Learning service, and React (Vite + TypeScript) for the frontend dashboard.

---

## Architecture & Services Overview

The application is composed of three primary services running concurrently:
1. **Core Backend**: Django REST Framework API, handling transactions, user registration/auth, budgets, and triggering celery tasks.
2. **ML Service**: FastAPI service hosting models for anomaly detection (Isolation Forest), category classification (Random Forest), and cash flow forecasting (Prophet).
3. **Frontend Dashboard**: Vite-based React single-page application displaying clean budget graphs, transaction tables, and forecast visualisations.

---

## 1. Database & Cache Dependencies (PostgreSQL & Redis)

FinSight AI requires **PostgreSQL** (for relational database storage) and **Redis** (as the message broker for Celery). 

### Mac Installation & Startup (using Homebrew)
```bash
# Install services
brew install postgresql@14 redis

# Start services (running in the background)
brew services start postgresql@14
brew services start redis
```

### Ubuntu/Debian Installation & Startup
```bash
# Install services
sudo apt update
sudo apt install postgresql postgresql-contrib redis-server -y

# Start and enable services
sudo systemctl start postgresql
sudo systemctl enable postgresql
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

> [!NOTE]
> By default, the application runs on SQLite in development if `DB_ENGINE=sqlite` is set in the backend `.env` file, which requires no PostgreSQL setup. However, Redis is still required to run Celery task queues.

---

## 2. Core Backend Setup (Django)

Navigate to the `backend/` directory to set up the python environment and run initial migrations/seeds.

```bash
cd backend

# Create a virtual environment and activate it
python3 -m venv venv
source venv/bin/activate

# Install required python packages
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Seed synthetic transaction history & demo user
# Creates user: demo@finsight.ai / password: demo1234
python manage.py seed_data

# Start the Django development server
python manage.py runserver
```

---

## 3. Machine Learning Service Setup (FastAPI)

Navigate to the `ml_service/` directory to set up the ML service, train models, and run the FastAPI server.

```bash
cd ml_service

# Create a virtual environment and activate it
python3 -m venv venv
source venv/bin/activate

# Install required ML dependencies
pip install -r requirements.txt

# Train classification and anomaly detection models
python train_classifier.py
python train_anomaly.py

# Start the FastAPI server using Uvicorn
uvicorn main:app --port 8001 --reload
```

---

## 4. Background Workers & Schedulers (Celery)

Celery is used for fanning out background tasks (anomaly checks, classification, forecasting models). Make sure your Redis server is running, and run the following commands **from the `backend/` directory** with your active virtual environment:

### Terminal A: Start the Celery Worker
```bash
cd backend
source venv/bin/activate
celery -A core worker --loglevel=info
```

### Terminal B: Start the Celery Beat Scheduler (Periodic Tasks)
```bash
cd backend
source venv/bin/activate
celery -A core beat --loglevel=info
```

---

## 5. Frontend Dashboard Setup (React + Vite)

Navigate to the `frontend/` directory to install NPM packages and launch the Vite dev server.

```bash
cd frontend

# Install frontend dependencies
npm install

# Start the development server
npm run dev
```

---

## 6. End-to-End Integration Smoke Test

To verify that the Django Core API, FastAPI ML Service, Celery Worker/Beat, and Redis are all correctly wired and communicating, you can run the provided integration smoke test script.

This script:
1. Registers a random test user.
2. Logs in to obtain a JWT access token.
3. Uploads a 35-day historical transaction CSV to satisfy the Prophet forecasting minimum history requirement.
4. Posts a new unclassified transaction to test the asynchronous ML classification pipeline.
5. Polls until the transaction is successfully classified as `"Food"`.
6. Triggers background cash flow forecasting and anomaly detection tasks.
7. Polls until the forecast snapshot is compiled, and prints the sample forecast output.

To execute the smoke test:
```bash
# From the project root, run:
python3 scripts/smoke_test.py
```

---

## Port & Terminal Summary

To run FinSight AI in full development mode, you will need **5 active terminals** configured as follows:

| Terminal | Service / Component | Running Directory | Command | Default Port / URL |
| :--- | :--- | :--- | :--- | :--- |
| **1** | Core API (Django) | `backend/` | `python manage.py runserver` | `http://127.0.0.1:8000` |
| **2** | ML API (FastAPI) | `ml_service/` | `uvicorn main:app --port 8001 --reload` | `http://127.0.0.1:8001` |
| **3** | Celery Worker | `backend/` | `celery -A core worker --loglevel=info` | *N/A (Listens to Redis)* |
| **4** | Celery Beat | `backend/` | `celery -A core beat --loglevel=info` | *N/A (Schedules Tasks)* |
| **5** | Frontend Dev Server | `frontend/` | `npm run dev` | `http://localhost:5173` |

---

### Demo Login Credentials
* **Username / Email**: `demo@finsight.ai`
* **Password**: `demo1234`
