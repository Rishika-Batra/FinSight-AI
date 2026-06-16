import os
import random
# pyrefly: ignore [missing-import]
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report
# pyrefly: ignore [missing-import]
import joblib

# Set random seed for reproducibility
random.seed(42)
np.random.seed(42)

# Templates for synthetic transaction descriptions per category
templates = {
    "Food": [
        "Lunch at {restaurant}", "Dinner with family at {restaurant}", "{coffee_shop} coffee",
        "Uber Eats delivery from {restaurant}", "Grocery shopping at {grocery}", "Grocery shopping at {grocery} supermarket",
        "Breakfast at {coffee_shop} bakery", "Pizza delivery from {restaurant}", "Sushi dinner at {restaurant}",
        "Cafe latte and croissant at {coffee_shop}", "Burger and fries at {restaurant}", "Taco bell order",
        "Subway sandwich lunch", "Supermarket food items", "Dunkin Donuts morning run", "Whole Foods grocery items"
    ],
    "Transport": [
        "Uber ride to {city}", "Lyft trip to downtown", "Gas station fill up at {gas_station}",
        "{gas_station} fuel purchase", "Subway train transit fare", "Metro transit ticket", "Bus ticket travel",
        "Parking garage fee at {city}", "Train ticket to Boston", "Auto repair and oil change service",
        "Car wash service and detailing", "Toll road bridge payment", "{gas_station} gasoline fillup",
        "Avis car rental deposit", "Transit pass monthly top up", "Gasoline purchase"
    ],
    "Entertainment": [
        "Netflix monthly subscription payment", "Spotify premium music subscription", "Movie theater tickets",
        "Concert tickets event", "Steam video game purchase", "PlayStation network game store",
        "Bowling alley weekend outing", "Museum ticket admission", "Theme park daily ticket",
        "Hulu streaming subscription", "Disney Plus membership subscription", "Arcade games session",
        "Concert venue ticketing", "Bookstore novel purchase", "Eventbrite event registration", "Audible audiobook credit"
    ],
    "Utilities": [
        "Electric bill payment utility", "Water utility monthly bill", "Comcast internet service payment",
        "AT&T mobile phone bill", "Trash collection monthly fee", "Gas heating energy bill",
        "Verizon wireless phone invoice", "Electricity bill utility payment", "Sewer utility charge",
        "Broadband high speed internet", "Power and light company payment", "Gas utility service billing",
        "Internet provider service invoice", "Cellular monthly phone plan", "Waste management pickup fee"
    ],
    "Shopping": [
        "Amazon order online checkout", "Target store items purchase", "Nike sports sneakers shoes",
        "Clothing apparel items at H&M", "Zara fashion jacket", "Electronics purchase at Best Buy",
        "Home Depot home improvement tools", "IKEA furniture household items", "Macy's department store shopping",
        "Apple Store online purchase", "eBay online auction bid", "Nordstrom shoes and apparel",
        "Walmart shopping department store", "Costco wholesale bulk purchase", "TJ Maxx clothing checkout"
    ],
    "Health": [
        "Pharmacy medicine prescription refill at CVS", "CVS prescription refills", "Doctor copay office visit",
        "Dentist teeth cleaning checkup", "Gym membership monthly dues", "Walgreens pharmacy first aid items",
        "Yoga class drop in session", "Eye doctor clinic glasses purchase", "Health insurance monthly premium",
        "Massage therapy session recovery", "Vitamin supplements health store", "Physical therapy clinic session",
        "Dental care checkup", "Chiropractor appointment fee", "Medical clinic blood test"
    ],
    "Other": [
        "Cash withdrawal at ATM terminal", "Monthly apartment rent payment", "Bank wire transfer fees",
        "Birthday gift item checkout", "Donation payment to Red Cross", "Office supplies at Staples store",
        "Post office shipping package label", "Tax preparation service fee", "Legal consultation fees invoice",
        "Dry cleaning laundry pickup", "Tuition fees installment", "Storage unit monthly rental",
        "Charity donation payment", "Late payment fee charge", "Foreign transaction exchange charge"
    ]
}

# Template filler words
fills = {
    "restaurant": ["Olive Garden", "McDonalds", "Burger King", "Domino's Pizza", "Chipotle", "Subway", "Taco Bell", "Starbucks", "Panda Express", "Sushi House"],
    "coffee_shop": ["Starbucks", "Dunkin", "Peet's Coffee", "Blue Bottle", "Local Cafe", "Espresso Bar"],
    "grocery": ["Walmart", "Whole Foods", "Kroger", "Trader Joe's", "Safeway", "Target", "Aldi", "Costco"],
    "city": ["New York", "Boston", "San Francisco", "Chicago", "Los Angeles", "Seattle", "Austin"],
    "gas_station": ["Shell", "Chevron", "ExxonMobil", "BP", "7-Eleven", "Texaco", "Mobil"],
}

def generate_random_description(category):
    # Select random template
    tpl = random.choice(templates[category])
    
    # Fill in template placeholders
    args = {}
    for placeholder, choices in fills.items():
        if f"{{{placeholder}}}" in tpl:
            args[placeholder] = random.choice(choices)
            
    desc = tpl.format(**args)
    
    # Add a random transaction code/number or location to make it look authentic
    suffix_type = random.choice(["code", "number", "city_tag", "date_tag", "none"])
    if suffix_type == "code":
        desc += f" #{random.randint(1000, 9999)}"
    elif suffix_type == "number":
        desc += f" {random.randint(100, 999)}"
    elif suffix_type == "city_tag":
        desc += f" {random.choice(['NY', 'SF', 'TX', 'CA', 'MA', 'IL'])}"
    elif suffix_type == "date_tag":
        desc += f" {random.choice(['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'])}"
        
    return desc

def generate_dataset(num_samples=600):
    X = []
    y = []
    categories = list(templates.keys())
    
    # Evenly distribute categories
    samples_per_cat = num_samples // len(categories)
    extra_samples = num_samples % len(categories)
    
    for cat in categories:
        count = samples_per_cat
        if extra_samples > 0:
            count += 1
            extra_samples -= 1
            
        for _ in range(count):
            X.append(generate_random_description(cat))
            y.append(cat)
            
    return X, y

def train_and_save():
    # 1. Generate dataset of 600 samples
    X, y = generate_dataset(600)
    
    print(f"Generated {len(X)} synthetic transaction descriptions.")
    
    # 2. Split train/test
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )
    
    # 3. Create pipeline
    pipeline = Pipeline([
        ('tfidf', TfidfVectorizer(ngram_range=(1, 2), stop_words='english', min_df=1)),
        ('clf', RandomForestClassifier(n_estimators=100, random_state=42))
    ])
    
    # 4. Train
    print("Training Random Forest Classifier pipeline...")
    pipeline.fit(X_train, y_train)
    
    # 5. Evaluate
    y_pred = pipeline.predict(X_test)
    print("\nEvaluation Results (20% Holdout):")
    report = classification_report(y_test, y_pred)
    print(report)
    
    # 6. Save model
    models_dir = os.path.join(os.path.dirname(__file__), "models")
    os.makedirs(models_dir, exist_ok=True)
    model_path = os.path.join(models_dir, "classifier.joblib")
    
    joblib.dump(pipeline, model_path)
    print(f"Saved trained classifier pipeline to: {model_path}")

if __name__ == "__main__":
    train_and_save()
