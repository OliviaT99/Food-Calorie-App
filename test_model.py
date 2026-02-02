from pathlib import Path
import torch
from transformers import Mask2FormerForUniversalSegmentation, Mask2FormerImageProcessor

CHECKPOINT_DIR = Path("ml_service/model/checkpoints/epoch_1")
device = "cuda" if torch.cuda.is_available() else "cpu"

# processor
processor = Mask2FormerImageProcessor.from_pretrained("facebook/mask2former-swin-small-ade-semantic")

# load model
model = Mask2FormerForUniversalSegmentation.from_pretrained(
    CHECKPOINT_DIR,
    ignore_mismatched_sizes=True
)
model.to(device)
model.eval()
print("✅ Model loaded successfully!")
