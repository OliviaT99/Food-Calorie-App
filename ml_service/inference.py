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

from ml_service.predict import grams_from_segmentation

# -----------------------------
# Paths
# -----------------------------
MODEL_DIR = Path(__file__).parent / "model"
CHECKPOINT_DIR = MODEL_DIR / "checkpoints" / "epoch_1"
BASE_MODEL = "facebook/mask2former-swin-small-ade-semantic"

# -----------------------------
# Global model (loaded once)
# -----------------------------
processor = Mask2FormerImageProcessor.from_pretrained(BASE_MODEL)
model = Mask2FormerForUniversalSegmentation.from_pretrained(
    CHECKPOINT_DIR,
    ignore_mismatched_sizes=True,
)
model.eval()

# -----------------------------
# Load labels once
# -----------------------------
with open(CHECKPOINT_DIR / "config.json", "r", encoding="utf-8") as f:
    config = json.load(f)
ID2LABEL = {int(k): v for k, v in config["id2label"].items()}


# -----------------------------
# Public API
# -----------------------------
def analyze_food(image_path: str, top_k: int = 10) -> dict:
    """
    Backend-facing inference function.

    Returns:
    {
      "plate_type": "flat",
      "total_grams": 742.3,
      "items": [
        { "name": "pasta", "grams": 520.1 },
        { "name": "cheese", "grams": 222.2 }
      ]
    }
    """

    image = Image.open(image_path).convert("RGB")
    inputs = processor(images=image, return_tensors="pt")

    with torch.no_grad():
        outputs = model(**inputs)

    seg = processor.post_process_semantic_segmentation(
        outputs, target_sizes=[image.size[::-1]]
    )[0].cpu().numpy()

    raw = grams_from_segmentation(seg, ID2LABEL)

    items = [
        {
            "name": r["label"],
            "grams": round(r["grams_est"], 1)
        }
        for r in raw["items"][:top_k]
    ]

    return {
        "plate_type": raw["plate_type"],
        "total_grams": round(raw["total_grams_est"], 1),
        "items": items
    }

