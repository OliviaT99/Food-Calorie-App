from fastapi import FastAPI, UploadFile, File, HTTPException, Form
import tempfile
import shutil
from PIL import Image
import asyncio
from concurrent.futures import ThreadPoolExecutor
import traceback
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="Food Analyzer API",
    description="Uploads an image and (audio) and returns a food analysis with plate type, total grams, and item breakdown.",
    version="1.1.0"
)

# -----------------------------
# Thread pool for blocking CPU/GPU tasks
# -----------------------------
executor = ThreadPoolExecutor(max_workers=1)
WHISPER_MODEL = None  # will be initialized at startup

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
# Async endpoint for image prediction
# -----------------------------
@app.post("/predict")
async def predict(
    image: UploadFile = File(...),
    userId: str = Form(...),
    top_k: int = Form(default=10)
):
    print(f"[INFO] Received prediction request for user: {userId}")
    print(f"[DEBUG] Image filename: {image.filename}")
    print(f"[DEBUG] Image content_type: {image.content_type}")
    
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")
    
    tmp_path = None
    
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
            shutil.copyfileobj(image.file, tmp)
            tmp_path = tmp.name
        
        print(f"[INFO] Saved image to {tmp_path}, size: {os.path.getsize(tmp_path)} bytes")
        
        from ml_service.inference import analyze_food
        
        print(f"[INFO] Starting inference with top_k={top_k}")
        
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            executor,
            analyze_food,
            tmp_path,
            top_k
        )
        
        print(f"[SUCCESS] Inference completed")
        
        return {
            "userId": userId,
            "analysis": result
        }
        
    except Exception as e:
        print(f"[ERROR] Prediction failed: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")
    
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except:
                pass

# -----------------------------
# Async endpoint for audio analysis
# -----------------------------
@app.post("/analyze-audio")
async def analyze_audio(audio: UploadFile = File(...)):
    if not (audio.content_type.startswith("audio/") or audio.filename.endswith(".wav")):
        raise HTTPException(status_code=400, detail="File must be audio")

    audio_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            shutil.copyfileobj(audio.file, tmp)
            audio_path = tmp.name

        loop = asyncio.get_event_loop()

        # Run transcription + extraction in executor
        def do_audio_analysis(path):
            from ml_service.audio_analysis import transcribe_audio, extract_food_items_with_grams
            transcript = transcribe_audio(path, model=WHISPER_MODEL)
            extracted = extract_food_items_with_grams(transcript)
            return transcript, extracted

        transcript, extracted = await loop.run_in_executor(executor, do_audio_analysis, audio_path)

        return {
            "transcript": transcript,
            "items": extracted.get("items", []),
            "has_grams": extracted.get("has_grams", False),
            "error": extracted.get("error")
        }

    except Exception as e:
        error_msg = f"Audio analysis error: {type(e).__name__}: {str(e)}"
        print(f"[ERROR] {error_msg}")
        traceback.print_exc()
        return {
            "transcript": "",
            "items": [],
            "has_grams": False,
            "error": error_msg
        }

    finally:
        if audio.file:
            audio.file.close()
        if audio_path and os.path.exists(audio_path):
            try:
                os.unlink(audio_path)
            except:
                pass

# -----------------------------
# Root endpoint
# -----------------------------
@app.get("/")
async def root():
    return {
        "message": "Welcome to Food Analyzer API",
        "endpoints": {
            "/predict": "POST - Analyze food image",
            "/analyze-audio": "POST - Analyze food audio",
            "/health": "GET - Health check"
        }
    }

# -----------------------------
# Health endpoint
# -----------------------------
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "ml-food-analyzer"
    }

# -----------------------------
# Startup event to preload Whisper
# -----------------------------
@app.on_event("startup")
async def startup_event():
    global WHISPER_MODEL
    print("[INFO] FastAPI server starting up...")
    print(f"[INFO] Thread pool executor initialized with max_workers=1")
    print("[INFO] Loading Whisper model at startup...")

    from faster_whisper import WhisperModel  # import directly here
    WHISPER_MODEL = WhisperModel("tiny", device="cpu", compute_type="int8")

    print("[INFO] Whisper model loaded.")

# -----------------------------
# Run server
# -----------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app, 
        host="127.0.0.1", 
        port=5002,
        log_level="info"
    )
