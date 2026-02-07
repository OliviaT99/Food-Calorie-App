import requests
import os

ML_URL = "http://127.0.0.1:5002/predict"
TEST_IMAGE = "/Users/oliviat/Documents/Uni/WS25_26/DBSM/Project/ml_service/test_image.png"
USER_ID = "4fdc090a-84a7-40d7-941d-eba81e38baf3123"

print(f"[INFO] Sending request to {ML_URL}...")

with open(TEST_IMAGE, "rb") as f:
    files = {"image": ("test_image.png", f, "image/png")}
    data = {"userId": USER_ID, "top_k": 5}
    
    # Debug: print what we're sending
    print(f"[DEBUG] Files: {list(files.keys())}")
    print(f"[DEBUG] Data: {data}")
    
    response = requests.post(
        ML_URL,
        files=files,
        data=data,
        timeout=120
    )

print(f"[INFO] Status: {response.status_code}")
print(f"[INFO] Response: {response.text}")