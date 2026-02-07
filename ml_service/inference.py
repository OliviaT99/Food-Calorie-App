"""
Inference adapter for backend consumption.
Loads Mask2Former once and exposes analyze_food().
"""
import json
from pathlib import Path
from PIL import Image
import torch
from transformers import (
    Mask2FormerForUniversalSegmentation,
    Mask2FormerImageProcessor
)
from .predict import grams_from_segmentation
import time

# -----------------------------
# Paths
# -----------------------------
MODEL_DIR = Path(__file__).parent / "model"
CHECKPOINT_DIR = MODEL_DIR / "checkpoints" / "epoch_1"
BASE_MODEL = "facebook/mask2former-swin-small-ade-semantic"

# -----------------------------
# Global model (loaded lazily)
# -----------------------------
_processor = None
_model = None
_ID2LABEL = None

def _load_model():
    """Lazy load the model on first use"""
    global _processor, _model, _ID2LABEL

    if _model is not None:
        return  # Already loaded

    print(f"[INFO] Loading model from {CHECKPOINT_DIR}")
    try:
        start = time.time()

        # Load processor
        _processor = Mask2FormerImageProcessor.from_pretrained(BASE_MODEL)

        # Try to load from checkpoint
        if CHECKPOINT_DIR.exists():
            _model = Mask2FormerForUniversalSegmentation.from_pretrained(
                CHECKPOINT_DIR,
                ignore_mismatched_sizes=True,
            )
            print(f"[INFO] Loaded local checkpoint from {CHECKPOINT_DIR}")
        else:
            print(f"[WARNING] Checkpoint not found at {CHECKPOINT_DIR}")
            print("[INFO] Falling back to Hugging Face pretrained model...")
            _model = Mask2FormerForUniversalSegmentation.from_pretrained(BASE_MODEL)

        _model.eval()

        # Load labels
        config_file = CHECKPOINT_DIR / "config.json"
        if config_file.exists():
            with open(config_file, "r", encoding="utf-8") as f:
                config = json.load(f)
            _ID2LABEL = {int(k): v for k, v in config["id2label"].items()}
        else:
            raise FileNotFoundError(f"Config file not found: {config_file}")

        print(f"[INFO] Model loaded successfully in {time.time() - start:.1f}s!")

    except Exception as e:
        print(f"[ERROR] Failed to load model: {e}")
        raise

# -----------------------------
# Preload model at import time to avoid first-request timeout
# -----------------------------
_load_model()

# -----------------------------
# Public API
# -----------------------------
def analyze_food(image_path: str, top_k: int = 10) -> dict:
    """
    Backend-facing inference function.
    """
    start = time.time()
    image = Image.open(image_path).convert("RGB")
    inputs = _processor(images=image, return_tensors="pt")

    with torch.no_grad():
        outputs = _model(**inputs)

    seg = _processor.post_process_semantic_segmentation(
        outputs, target_sizes=[image.size[::-1]]
    )[0].cpu().numpy()

    raw = grams_from_segmentation(seg, _ID2LABEL)

    items = [
        {
            "name": r["label"],
            "grams": round(r["grams_est"], 1)
        }
        for r in raw["items"][:top_k]
    ]

    print(f"[INFO] Inference completed in {time.time() - start:.1f}s")

    return {
        "plate_type": raw["plate_type"],
        "total_grams": round(raw["total_grams_est"], 1),
        "items": items
    }


