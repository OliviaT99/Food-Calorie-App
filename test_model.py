import torch
from PIL import Image
from transformers import Mask2FormerForUniversalSegmentation, Mask2FormerImageProcessor

# -----------------------------
# Load processor & model
# -----------------------------
processor = Mask2FormerImageProcessor.from_pretrained(
    "facebook/mask2former-swin-small-ade-semantic"
)

model = Mask2FormerForUniversalSegmentation.from_pretrained(
    "ml_service/model/checkpoints/epoch_1",
    ignore_mismatched_sizes=True
)

device = "cuda" if torch.cuda.is_available() else "cpu"
model.to(device)
model.eval()

print("✅ Model loaded")

# -----------------------------
# Load test image
# -----------------------------
image = Image.open("/Users/oliviat/Documents/Uni/WS25_26/DBSM/Project/ml_service/test_image.png").convert("RGB")

inputs = processor(images=image, return_tensors="pt")
inputs = {k: v.to(device) for k, v in inputs.items()}

# -----------------------------
# Forward pass
# -----------------------------
with torch.no_grad():
    outputs = model(**inputs)

print("✅ Forward pass successful")
print("Class logits:", outputs.class_queries_logits.shape)
print("Mask logits:", outputs.masks_queries_logits.shape)