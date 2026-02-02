import torch
from transformers import Mask2FormerForUniversalSegmentation, Mask2FormerImageProcessor

# 1️⃣ Processor from HF hub
processor = Mask2FormerImageProcessor.from_pretrained(
    "facebook/mask2former-swin-small-ade-semantic"
)

# 2️⃣ Model from local checkpoint
model = Mask2FormerForUniversalSegmentation.from_pretrained(
    "ml_service/model/checkpoints/epoch_1",
    ignore_mismatched_sizes=True
)

device = "cuda" if torch.cuda.is_available() else "cpu"
model.to(device)
model.eval()

print("✅ Model and processor loaded successfully!")