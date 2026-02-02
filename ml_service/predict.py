import torch
import numpy as np
import math
from PIL import Image
from transformers import Mask2FormerForUniversalSegmentation, Mask2FormerImageProcessor
import json
from pathlib import Path

# -----------------------------
# Paths / Models
# -----------------------------
BASE_MODEL = "facebook/mask2former-swin-small-ade-semantic"
CHECKPOINT_DIR = Path(__file__).parent / "model" / "checkpoints" / "epoch_1"


def load_model():
    """Load local checkpoint if available, otherwise use HF pretrained model."""
    processor = Mask2FormerImageProcessor.from_pretrained(BASE_MODEL)

    if CHECKPOINT_DIR.exists():
        try:
            model = Mask2FormerForUniversalSegmentation.from_pretrained(
                CHECKPOINT_DIR,
                ignore_mismatched_sizes=True
            )
            print(f"[INFO] Loaded local checkpoint from {CHECKPOINT_DIR}")
        except Exception as e:
            print(f"[WARNING] Failed to load local checkpoint: {e}")
            print("[INFO] Falling back to Hugging Face pretrained model...")
            model = Mask2FormerForUniversalSegmentation.from_pretrained(BASE_MODEL)
    else:
        print(f"[INFO] Local checkpoint not found. Using Hugging Face pretrained model.")
        model = Mask2FormerForUniversalSegmentation.from_pretrained(BASE_MODEL)

    model.eval()
    return processor, model

# -----------------------------
# Plate + grams estimation MVP
# -----------------------------
PLATE_DIAMETER_CM = 26.0
PLATE_RADIUS_CM = PLATE_DIAMETER_CM / 2.0
PLATE_AREA_CM2 = math.pi * (PLATE_RADIUS_CM ** 2)

SOUP_DEEP_THRESHOLD = 0.25
DEEP_PLATE_DEPTH_CM = 2.0
DEEP_PLATE_FILL_FACTOR = 0.8

MIN_AREA_RATIO_KEEP = 0.01
MIN_SAUCE_RATIO_KEEP = 0.02

DEFAULT_DENSITY = 0.80   # g/cm^3
DEFAULT_HEIGHT = 1.50    # cm

DENSITY_BY_LABEL = {
    "soup": 1.00,
    "sauce": 1.05,
    "rice": 0.85,
    "noodles": 0.75,
    "pasta": 0.75,
    "french fries": 0.55,
    "steak": 1.05,
    "pork": 1.05,
    "chicken duck": 1.05,
    "fried meat": 1.05,
    "sausage": 1.05,
    "egg": 1.00,
    "salad": 0.25,
    "lettuce": 0.20,
    "broccoli": 0.35,
}

HEIGHT_BY_LABEL = {
    "soup": DEEP_PLATE_DEPTH_CM * DEEP_PLATE_FILL_FACTOR,
    "sauce": 0.30,
    "rice": 1.50,
    "noodles": 1.60,
    "pasta": 1.60,
    "french fries": 1.80,
    "steak": 1.20,
    "pork": 1.20,
    "chicken duck": 1.20,
    "fried meat": 1.20,
    "sausage": 1.20,
    "egg": 1.20,
    "salad": 3.00,
    "lettuce": 2.50,
    "broccoli": 2.50,
}


def estimate_plate_type(area_ratio_by_label: dict) -> str:
    soup_ratio = area_ratio_by_label.get("soup", 0.0)
    return "deep" if soup_ratio >= SOUP_DEEP_THRESHOLD else "flat"


def grams_from_segmentation(seg_np: np.ndarray, id2label: dict) -> dict:
    unique, counts = np.unique(seg_np, return_counts=True)
    areas = dict(zip(unique.tolist(), counts.tolist()))
    areas.pop(0, None)  # remove background

    total_food_pixels = sum(areas.values())
    if total_food_pixels == 0:
        return {
            "plate_type": "flat",
            "plate_area_cm2": float(PLATE_AREA_CM2),
            "total_food_pixels": 0,
            "total_grams_est": 0.0,
            "items": []
        }

    area_ratio_by_label = {}
    for cls_id, px in areas.items():
        label = id2label.get(int(cls_id), "unknown").lower()
        area_ratio_by_label[label] = area_ratio_by_label.get(label, 0.0) + (px / total_food_pixels)

    plate_type = estimate_plate_type(area_ratio_by_label)

    items = []
    for cls_id, px in areas.items():
        label = id2label.get(int(cls_id), "unknown").lower()
        ratio = px / total_food_pixels

        if label == "sauce" or ratio < MIN_AREA_RATIO_KEEP:
            continue

        area_cm2 = ratio * PLATE_AREA_CM2
        density = DENSITY_BY_LABEL.get(label, DEFAULT_DENSITY)
        height = HEIGHT_BY_LABEL.get(label, DEFAULT_HEIGHT)

        if plate_type == "flat" and label == "soup":
            height = 0.8
        if plate_type == "deep":
            height = min(height, DEEP_PLATE_DEPTH_CM)

        volume_cm3 = area_cm2 * height
        grams = volume_cm3 * density

        items.append({
            "class_id": int(cls_id),
            "label": label,
            "pixel_count": int(px),
            "area_ratio": float(ratio),
            "area_cm2": float(area_cm2),
            "grams_est": float(grams),
        })

    items.sort(key=lambda x: x["grams_est"], reverse=True)
    total_grams = float(sum(x["grams_est"] for x in items))

    return {
        "plate_type": plate_type,
        "plate_area_cm2": float(PLATE_AREA_CM2),
        "total_food_pixels": int(total_food_pixels),
        "total_grams_est": total_grams,
        "items": items
    }


def predict_grams(image_path: str, top_k: int = 10) -> dict:
    processor, model = load_model()
    image_path = Path(image_path)
    if not image_path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")

    image = Image.open(image_path).convert("RGB")
    inputs = processor(images=image, return_tensors="pt")

    with torch.no_grad():
        outputs = model(**inputs)

    seg = processor.post_process_semantic_segmentation(
        outputs, target_sizes=[image.size[::-1]]
    )[0].cpu().numpy()

    # load id2label from local checkpoint if available
    config_file = CHECKPOINT_DIR / "config.json"
    if not config_file.exists():
        raise FileNotFoundError(f"Config file not found: {config_file}")

    with open(config_file, "r", encoding="utf-8") as f:
        config = json.load(f)
    id2label = {int(k): v for k, v in config["id2label"].items()}

    out = grams_from_segmentation(seg, id2label)
    out["items"] = out["items"][:top_k]  # top-k for display
    return out


if __name__ == "__main__":
    image_path = Path(__file__).parent / "model" / "test_image.png"
    out = predict_grams(image_path, top_k=10)

    print("Plate type:", out["plate_type"])
    print("Top detected foods:")
    for r in out["items"]:
        print(f"- {r['label']}: {r['grams_est']:.1f} g | ratio={r['area_ratio']:.3f} | px={r['pixel_count']}")
    print(f"TOTAL: {out['total_grams_est']:.1f} g")
