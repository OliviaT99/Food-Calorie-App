from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import tempfile
import shutil
import torch
from ml_service.inference import analyze_food # backend/app.py
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from ml_service.inference import analyze_food


app = FastAPI(
    title="Food Analyzer API",
    description="Uploads an image and returns a food analysis with plate type, total grams, and item breakdown.",
    version="1.0.0"
)

# -----------------------------
# Check if GPU is available
# -----------------------------
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Running inference on {DEVICE}")

# -----------------------------
# Async endpoint
# -----------------------------
@app.post("/predict", response_class=JSONResponse)
async def predict(file: UploadFile = File(...), top_k: int = 10):
    """
    Accepts an uploaded image and returns food analysis.

    - **file**: Image file to analyze (jpg, png, etc.)
    - **top_k**: Maximum number of items to return (default: 10)
    """
    # Validate file type
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")

    # Save uploaded file temporarily
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name
    finally:
        file.file.close()

    # Run inference (analyze_food reads image from path)
    try:
        result = analyze_food(tmp_path, top_k=top_k)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")

    return result

# -----------------------------
# Root endpoint (optional)
# -----------------------------
@app.get("/")
async def root():
    return {"message": "Welcome to Food Analyzer API. Use /predict endpoint to analyze images."}

