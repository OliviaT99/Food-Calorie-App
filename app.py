from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import tempfile
import shutil
from PIL import Image
import asyncio
from concurrent.futures import ThreadPoolExecutor
from fastapi import Form
from ml_service.inference import analyze_food

app = FastAPI(
    title="Food Analyzer API",
    description="Uploads an image and returns a food analysis with plate type, total grams, and item breakdown.",
    version="1.1.0"
)

# -----------------------------
# Thread pool for blocking CPU/GPU tasks
# -----------------------------
executor = ThreadPoolExecutor(max_workers=1)  # you can increase if you have multiple CPUs

# -----------------------------
# Helper to downscale images
# -----------------------------
def preprocess_image(file_path: str, max_size: int = 512) -> str:
    """Downscale image to max_size x max_size to speed up inference."""
    with Image.open(file_path) as img:
        img = img.convert("RGB")
        img.thumbnail((max_size, max_size))
        tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
        img.save(tmp_file.name)
    return tmp_file.name

# -----------------------------
# Async endpoint
# -----------------------------
@app.post("/predict", response_class=JSONResponse)
async def predict(
    file: UploadFile = File(...),
    userId: str = Form(...),
    top_k: int = Form(default=10)
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")

    # Save uploaded file temporarily
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name
    finally:
        file.file.close()

    # Downscale image
    preprocessed_path = preprocess_image(tmp_path)

    # Run blocking inference in thread
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(executor, analyze_food, preprocessed_path, top_k)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")

    # Include userId in the response
    return {"userId": userId, "analysis": result}

# -----------------------------
# Root endpoint (optional)
# -----------------------------
@app.get("/")
async def root():
    return {"message": "Welcome to Food Analyzer API. Use /predict endpoint to analyze images."}

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "ml-food-analyzer"
    }

