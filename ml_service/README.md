# ml_service

## Overview

`ml_service` is a standalone machine-learning microservice for the Food Calorie App. It provides image-based food analysis and audio-based food description analysis via a FastAPI application. The service is responsible for running trained ML models, performing inference, and returning structured analysis results to the backend API.

The service can be run independently and is consumed by the Node.js backend via HTTP.

---

## Responsibilities

* Image-based food item detection and portion estimation
* Audio transcription and semantic food extraction
* Model loading, preprocessing, and inference
* Exposing ML functionality via REST endpoints

---

## Architecture position

```
Frontend → Node.js Backend → ml_service (FastAPI) → ML Models
```

The backend sends image or audio data to `ml_service` and receives structured JSON results that are stored and displayed to the user.

---

## Repository structure (key files)

* `app.py` — FastAPI application exposing inference endpoints
* `predict.py` — high-level image inference helpers
* `inference.py` — core image model loading and inference utilities
* `audio_analysis.py` — audio preprocessing, transcription, and LLM-based analysis
* `test_inference.py` — unit/integration tests for inference logic
* `model/config.yaml` — model configuration and preprocessing settings
* `model/checkpoints/` — serialized model weights
* `gradio_app/` — optional demo UI for manual testing

---

## Models used

### Image analysis

* **Model**: Mask2Former
* **Architecture source**: `FoodSeg_mask2former` (GitHub, Nima Vahdat)
* **Base checkpoint**: `facebook/mask2former-swin-small-ade-semantic` (pretrained on ADE20K)
* **Fine-tuning dataset**: FoodSeg103
* **Task**: Pixel-wise food segmentation and portion estimation (103 food classes)

**Training and model details**

The image segmentation pipeline is based on the open-source GitHub repository **FoodSeg_mask2former**. A pretrained Mask2Former checkpoint from Hugging Face (`facebook/mask2former-swin-small-ade-semantic`), originally trained on the ADE20K dataset, is fine-tuned on the **FoodSeg103** dataset using the training scripts provided in the repository.

The resulting FoodSeg103-specific checkpoint is stored in Hugging Face format (`config.json`, `model.safetensors`) and performs pixel-wise food segmentation for all 103 FoodSeg103 classes. The segmentation output is post-processed to derive detected food items and approximate portion sizes (in grams), which are aggregated into a meal-level analysis.

Training was performed on a few thousand images, with **one available training epoch**, reflecting limited training time and computational resources.

**Evaluation (image model)**

Evaluation of the image segmentation model is performed on the validation split of the official FoodSeg103 dataset hosted on Hugging Face (`EduardoPacheco/FoodSeg103`). Due to the limited training regime and dataset size, image evaluation results should be interpreted as indicative and suitable for prototypical system validation rather than production-grade benchmarking.

**Quantitative results (FoodSeg103 validation set)**

* **Mean Intersection over Union (mIoU)**: **0.1369**
  Average overlap quality between predicted and ground-truth segments per class (standard semantic segmentation metric).
* **Overall pixel accuracy**: **0.4912**
  Global pixel-level accuracy across all classes combined; dominated by frequent and visually large classes.
* **Mean class accuracy**: **0.2130**
  Average per-class accuracy, reflecting how much of each true class is correctly recovered.

**Qualitative observations**

* **56 out of 103 classes** were not detected at all (no true positives), indicating limited class coverage.
* Best performance is observed for **frequent, large, and visually distinctive ingredients** (e.g. broccoli, tomato, rice, noodles).
* Weakest performance occurs for **rare, small, or garnish-like ingredients**, which are underrepresented in the training data.

---

### Audio analysis

* **Speech-to-text**: Local Whisper model
* **Semantic parsing**: Mistral API (LLM)
* **Task**: Extract food items and quantities from spoken descriptions

## Evaluation (audio model)

The audio analysis pipeline was evaluated on a small test set of 20 simple recordings:

* Precision: **100.00%**
* Recall: **81.25%**
* F1-score: **89.66%**
* Accuracy: **97.00%**

---

## API endpoints

### `POST /predict`

Performs image-based food analysis.

**Input**

* Image file upload (JPEG / PNG)

**Output (example)**

```json
{
  "userId": "4fdc090a-84a7-40d7-941d-eba81e38baf3123",
  "analysis": {
    "plate_type": "flat",
    "total_grams": 347.2,
    "items": [
      {"name": "rice", "grams": 137.9},
      {"name": "broccoli", "grams": 126.2},
      {"name": "chicken duck", "grams": 83.1}
    ]
  }
}
```

---

### `POST /analyze-audio`

Performs audio transcription and food extraction.

**Input**

* Audio file upload (e.g. WAV, MP3)

**Output (example)**

```json
{
  "transcript": "I ate a banana.",
  "items": [{"name": "banana", "grams": null}],
  "has_grams": false,
  "error": null
}
```

---

## Prerequisites

* Python 3.10+
* Virtual environment recommended
* GPU optional (CPU supported)

---

## Installation

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

---

## Configuration

* `model/config.yaml` defines model parameters and preprocessing settings
* Model checkpoints must be placed under `model/checkpoints/`
* Update paths in config if checkpoints are moved

---

## Environment variables

The service relies on environment variables defined in the project root `.env` file:

* `ML_SERVICE_URL` — URL of this service (used by backend)
* `FASTAPI_AUDIO_URL` — Audio analysis endpoint
* `MISTRAL_API_KEY` — Required for LLM-based audio analysis

Do **not** commit `.env` files to version control.

---

## Running the service

```bash
uvicorn app:app --host 0.0.0.0 --port 5002
```

---

## Performance notes

* Audio analysis: a few seconds per request
* Image analysis: slightly longer inference time due to segmentation model
* CPU-only execution supported; GPU improves throughput

---

## Limitations

* Image model trained on a limited dataset
* Only one training epoch available
* Small validation dataset for image evaluation
* Not optimized for production-scale throughput

This service is intended as an educational prototype demonstrating ML system integration rather than a fully production-ready solution.

---

## License / usage

This module is part of a university project and intended for academic use.
