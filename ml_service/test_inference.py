from transformers import Mask2FormerForUniversalSegmentation, Mask2FormerImageProcessor
from PIL import Image

from predict import predict_grams

image_path = "ml_service/model/test_image.png"
out = predict_grams(image_path)

print("Plate type:", out["plate_type"])
print("Top detected foods:")
for item in out["items"]:
    print(f"- {item['label']}: {item['grams_est']:.1f} g")
print(f"TOTAL: {out['total_grams_est']:.1f} g")

