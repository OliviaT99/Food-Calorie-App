import torch
import numpy as np
from PIL import Image
from transformers import Mask2FormerForUniversalSegmentation, Mask2FormerImageProcessor
import json
from pathlib import Path

CHECKPOINT_DIR = Path("checkpoints/epoch_1")

# Basismodell, von dem wir den Processor laden (gleich wie im Training)
BASE_MODEL = "facebook/mask2former-swin-small-ade-semantic"


def load_model():
    # 1) Processor kommt vom Basismodell (weil im Checkpoint nicht gespeichert)
    processor = Mask2FormerImageProcessor.from_pretrained(BASE_MODEL)

    # 2) Model-Architektur aus deinem Checkpoint laden (config.json vorhanden)
    model = Mask2FormerForUniversalSegmentation.from_pretrained(
        CHECKPOINT_DIR,
        ignore_mismatched_sizes=True,  # sicherheitshalber
    )

    model.eval()
    return processor, model


def predict(image_path, top_k=5):
    processor, model = load_model()

    image = Image.open(image_path).convert("RGB")
    inputs = processor(images=image, return_tensors="pt")

    with torch.no_grad():
        outputs = model(**inputs)

    # predicted segmentation map
    seg = processor.post_process_semantic_segmentation(
        outputs, target_sizes=[image.size[::-1]]
    )[0]

    seg = seg.cpu().numpy()

    # load id2label
    with open(CHECKPOINT_DIR / "config.json") as f:
        config = json.load(f)
    id2label = {int(k): v for k, v in config["id2label"].items()}

    # count pixels per class
    unique, counts = np.unique(seg, return_counts=True)
    areas = dict(zip(unique, counts))

    # sort by area
    ranked = sorted(areas.items(), key=lambda x: x[1], reverse=True)

    results = [
        {
            "label": id2label.get(cls_id, "unknown"),
            "pixel_count": int(px)
        }
        for cls_id, px in ranked[:top_k]
    ]

    return results


if __name__ == "__main__":
    image_path = "test_image.png"
    results = predict(image_path)

    print("Top erkannte Lebensmittel:")
    for r in results:
        print(f"- {r['label']}: {r['pixel_count']} Pixel")