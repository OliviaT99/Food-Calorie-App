import os
import json
import time
import logging
import torch
import numpy as np
from datasets import load_dataset
from torch.utils.data import DataLoader, Dataset
import evaluate
from transformers import (
    Mask2FormerConfig,
    Mask2FormerForUniversalSegmentation,
    Mask2FormerImageProcessor,
)
import albumentations as A
from tqdm.auto import tqdm

# --- less log spam
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("albumentations").setLevel(logging.WARNING)

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

BASELINE_NAME = "facebook/mask2former-swin-small-ade-semantic"
FINETUNED_DIR = r"C:\Users\Leoni\Athlete_nutrition_final\Food-Calorie-App\ml_service\model\checkpoints\epoch_1"
FINETUNED_CONFIG_JSON = os.path.join(FINETUNED_DIR, "config.json")

# FoodSeg103 has train + validation (no official test)
SPLIT = "validation"

# FULL EVAL: evaluate all samples in that split
MAX_SAMPLES = None  # keep None for full split

IGNORE_INDEX = 0

RESULT_DIR = os.path.join("evaluation", "results_full")
os.makedirs(RESULT_DIR, exist_ok=True)


class ImageSegmentationDataset(Dataset):
    def __init__(self, dataset, transform=None):
        self.dataset = dataset
        self.transform = transform

    def __len__(self):
        return len(self.dataset)

    def __getitem__(self, idx):
        item = self.dataset[idx]
        image = np.array(item["image"])
        label = np.array(item["label"]).astype(np.int64)

        original_image = image.copy()
        original_label = label.copy()

        if self.transform is not None:
            augmented = self.transform(image=image, mask=label)
            image = augmented["image"]
            label = augmented["mask"]

        return image, label, original_image, original_label


def load_id2label_from_finetuned(cfg_path: str) -> dict:
    with open(cfg_path, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    id2label = cfg.get("id2label", {})
    return {int(k): v for k, v in id2label.items()}


def build_loader(hf_dataset, batch_size=2, num_workers=0):
    transform = A.Compose(
        [
            A.Resize(width=512, height=512),
            A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )

    ds = ImageSegmentationDataset(dataset=hf_dataset, transform=transform)

    processor = Mask2FormerImageProcessor(
        ignore_index=IGNORE_INDEX,
        do_resize=False,
        do_rescale=False,
        do_normalize=False,
    )

    def collate_fn(batch):
        inputs = list(zip(*batch))
        images = inputs[0]
        seg_maps = inputs[1]
        out = processor(images, segmentation_maps=seg_maps, return_tensors="pt")
        out["original_images"] = inputs[2]
        out["original_segmentation_maps"] = inputs[3]
        return out

    loader = DataLoader(
        ds,
        batch_size=batch_size,
        shuffle=False,
        collate_fn=collate_fn,
        num_workers=num_workers,
        pin_memory=False,
    )
    return loader, processor


def _update_confusion_matrix(cm: np.ndarray, pred: np.ndarray, gt: np.ndarray, num_labels: int, ignore_index: int):
    mask = gt != ignore_index
    gt_f = gt[mask].astype(np.int64)
    pr_f = pred[mask].astype(np.int64)

    valid = (gt_f >= 0) & (gt_f < num_labels) & (pr_f >= 0) & (pr_f < num_labels)
    gt_f = gt_f[valid]
    pr_f = pr_f[valid]

    idx = gt_f * num_labels + pr_f
    binc = np.bincount(idx, minlength=num_labels * num_labels)
    cm += binc.reshape(num_labels, num_labels)


def _prf_from_confusion_matrix(cm: np.ndarray, ignore_index: int, id2label: dict):
    eps = 1e-12
    num_labels = cm.shape[0]
    labels = [i for i in range(num_labels) if i != ignore_index]

    tp = np.diag(cm).astype(np.float64)
    fp = cm.sum(axis=0).astype(np.float64) - tp
    fn = cm.sum(axis=1).astype(np.float64) - tp

    precision = tp / np.maximum(tp + fp, eps)
    recall = tp / np.maximum(tp + fn, eps)
    f1 = 2 * precision * recall / np.maximum(precision + recall, eps)

    per_class = {}
    for i in labels:
        name = id2label.get(i, str(i))
        support = float(cm[i, :].sum())
        per_class[str(i)] = {
            "label": name,
            "support_pixels": support,
            "precision": float(precision[i]),
            "recall": float(recall[i]),
            "f1": float(f1[i]),
        }

    macro_precision = float(np.mean([precision[i] for i in labels]))
    macro_recall = float(np.mean([recall[i] for i in labels]))
    macro_f1 = float(np.mean([f1[i] for i in labels]))

    tp_sum = float(np.sum([tp[i] for i in labels]))
    fp_sum = float(np.sum([fp[i] for i in labels]))
    fn_sum = float(np.sum([fn[i] for i in labels]))

    micro_precision = tp_sum / max(tp_sum + fp_sum, eps)
    micro_recall = tp_sum / max(tp_sum + fn_sum, eps)
    micro_f1 = 2 * micro_precision * micro_recall / max(micro_precision + micro_recall, eps)

    total = float(np.sum(cm[np.ix_(labels, labels)]))
    correct = float(np.sum([cm[i, i] for i in labels]))
    overall_acc_no_bg = correct / max(total, eps)

    return {
        "macro_precision": macro_precision,
        "macro_recall": macro_recall,
        "macro_f1": macro_f1,
        "micro_precision": float(micro_precision),
        "micro_recall": float(micro_recall),
        "micro_f1": float(micro_f1),
        "overall_accuracy_no_bg": float(overall_acc_no_bg),
        "per_class": per_class,
    }


@torch.no_grad()
def eval_model(model, loader, processor, num_labels: int, desc: str, id2label: dict):
    metric_iou = evaluate.load("mean_iou")
    cm = np.zeros((num_labels, num_labels), dtype=np.int64)

    model.to(DEVICE)
    model.eval()

    for batch in tqdm(loader, desc=desc, total=len(loader)):
        outputs = model(
            pixel_values=batch["pixel_values"].to(DEVICE),
            mask_labels=[x.to(DEVICE) for x in batch["mask_labels"]],
            class_labels=[x.to(DEVICE) for x in batch["class_labels"]],
        )

        target_sizes = [(img.shape[0], img.shape[1]) for img in batch["original_images"]]
        preds = processor.post_process_semantic_segmentation(outputs, target_sizes=target_sizes)
        gts = batch["original_segmentation_maps"]

        metric_iou.add_batch(references=gts, predictions=preds)

        for pred_map, gt_map in zip(preds, gts):
            pred_np = np.array(pred_map, dtype=np.int64)
            gt_np = np.array(gt_map, dtype=np.int64)
            _update_confusion_matrix(cm, pred_np, gt_np, num_labels, IGNORE_INDEX)

    iou_res = metric_iou.compute(num_labels=num_labels, ignore_index=IGNORE_INDEX)
    prf_res = _prf_from_confusion_matrix(cm, IGNORE_INDEX, id2label)

    return {
        "iou_metrics": iou_res,
        "prf_metrics": prf_res,
    }


def _to_jsonable(x):
    if isinstance(x, np.ndarray):
        return x.tolist()
    if isinstance(x, (np.floating,)):
        return float(x)
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, dict):
        return {k: _to_jsonable(v) for k, v in x.items()}
    if isinstance(x, list):
        return [_to_jsonable(v) for v in x]
    return x


def save_json(path, obj):
    obj = _to_jsonable(obj)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2)


def main():
    env_info_path = os.path.join(RESULT_DIR, "env_info.txt")
    with open(env_info_path, "w", encoding="utf-8") as f:
        f.write(f"timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"device: {DEVICE}\n")
        f.write(f"torch: {torch.__version__}\n")
        f.write(f"cuda_available: {torch.cuda.is_available()}\n")
        f.write(f"baseline_name: {BASELINE_NAME}\n")
        f.write(f"finetuned_dir: {FINETUNED_DIR}\n")
        f.write(f"split: {SPLIT}\n")
        f.write(f"max_samples: {MAX_SAMPLES}\n")
        f.write(f"ignore_index: {IGNORE_INDEX}\n")

    ds = load_dataset("EduardoPacheco/FoodSeg103", split=SPLIT)

    if MAX_SAMPLES is not None:
        ds = ds.select(range(min(MAX_SAMPLES, len(ds))))

    id2label = load_id2label_from_finetuned(FINETUNED_CONFIG_JSON)
    num_labels = len(id2label)

    loader, processor = build_loader(ds, batch_size=2, num_workers=0)

    # --- Baseline
    base_cfg = Mask2FormerConfig.from_pretrained(BASELINE_NAME)
    base_cfg.id2label = id2label
    base_cfg.label2id = {v: k for k, v in id2label.items()}

    baseline = Mask2FormerForUniversalSegmentation.from_pretrained(
        BASELINE_NAME, config=base_cfg, ignore_mismatched_sizes=True
    )

    print(f"\n=== Baseline FULL: {BASELINE_NAME} | split={SPLIT} | samples={len(ds)} ===")
    base_res = eval_model(baseline, loader, processor, num_labels, desc="Baseline FULL eval", id2label=id2label)
    save_json(os.path.join(RESULT_DIR, "baseline_metrics.json"), base_res)

    # --- Fine-tuned
    finetuned = Mask2FormerForUniversalSegmentation.from_pretrained(FINETUNED_DIR)

    print(f"\n=== Fine-tuned FULL: {FINETUNED_DIR} | split={SPLIT} | samples={len(ds)} ===")
    ft_res = eval_model(finetuned, loader, processor, num_labels, desc="Finetuned FULL eval", id2label=id2label)
    save_json(os.path.join(RESULT_DIR, "finetuned_metrics.json"), ft_res)

    # --- Comparison file
    comp_path = os.path.join(RESULT_DIR, "comparison.txt")
    with open(comp_path, "w", encoding="utf-8") as f:
        f.write(f"Baseline: {BASELINE_NAME}\n")
        f.write(f"Fine-tuned: {FINETUNED_DIR}\n")
        f.write(f"Dataset: EduardoPacheco/FoodSeg103 | split={SPLIT}\n")
        f.write(f"Samples evaluated: {len(ds)}\n")
        f.write(f"ignore_index: {IGNORE_INDEX}\n\n")

        b_iou = base_res["iou_metrics"].get("mean_iou", None)
        f_iou = ft_res["iou_metrics"].get("mean_iou", None)

        f.write("=== Key metrics ===\n")
        f.write(f"mean_iou baseline:  {b_iou}\n")
        f.write(f"mean_iou finetuned: {f_iou}\n")
        if b_iou is not None and f_iou is not None:
            f.write(f"delta (finetuned - baseline): {f_iou - b_iou}\n")

        f.write(f"overall_accuracy baseline:  {base_res['iou_metrics'].get('overall_accuracy', None)}\n")
        f.write(f"overall_accuracy finetuned: {ft_res['iou_metrics'].get('overall_accuracy', None)}\n")

        f.write(f"macro_f1 baseline:  {base_res['prf_metrics'].get('macro_f1', None)}\n")
        f.write(f"macro_f1 finetuned: {ft_res['prf_metrics'].get('macro_f1', None)}\n")
        f.write(f"micro_f1 baseline:  {base_res['prf_metrics'].get('micro_f1', None)}\n")
        f.write(f"micro_f1 finetuned: {ft_res['prf_metrics'].get('micro_f1', None)}\n")

        f.write(f"overall_accuracy_no_bg baseline:  {base_res['prf_metrics'].get('overall_accuracy_no_bg', None)}\n")
        f.write(f"overall_accuracy_no_bg finetuned: {ft_res['prf_metrics'].get('overall_accuracy_no_bg', None)}\n")

    print("\nSaved FULL results to:", os.path.abspath(RESULT_DIR))


if __name__ == "__main__":
    main()