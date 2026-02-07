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
* **Training data**: Fine-tuned on FoodSeg103
* **Task**: Food segmentation and portion estimation
* **Training details**:

  * Trained on a few thousand images
  * Only one training epoch available
  * Small test dataset

The image model outputs detected food items and estimated grams per item, which are aggregated into a meal-level analysis.

### Audio analysis

* **Speech-to-text**: Local Whisper model
* **Semantic parsing**: Mistral API (LLM)
* **Task**: Extract food items and quantities from spoken descriptions

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

If `requirements.txt` is unavailable, required libraries include:

* torch, torchvision, torchaudio
* transformers
* fastapi, uvicorn
* gradio
* pydantic

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

Start the FastAPI server:

```bash
uvicorn app:app --host 0.0.0.0 --port 5002
```

The service will expose:

* `POST /predict`
* `POST /analyze-audio`

---

## Running inference locally

### Programmatic image inference

```python
from ml_service.predict import predict_from_image
result = predict_from_image("/path/to/image.jpg")
```

### Gradio demo (optional)

```bash
python -m ml_service.gradio_app.app
```

---

## Evaluation (audio model)

The audio analysis pipeline was evaluated on a small test set of 20 simple recordings:

* Precision: **100.00%**
* Recall: **81.25%**
* F1-score: **89.66%**
* Accuracy: **97.00%**

Evaluation scripts and results are stored in a separate evaluation folder.

---

## Performance notes

* Audio analysis: a few seconds per request
* Image analysis: slightly longer inference time due to segmentation model
* CPU-only execution supported; GPU improves throughput

---

## Limitations

* Image model trained on a limited dataset
* Only one training epoch available
* Small test dataset for image evaluation
* Not optimized for production-scale throughput

This service is intended as an educational prototype demonstrating ML system integration rather than a fully production-ready solution.

---

## Troubleshooting

* **Model load errors**: verify checkpoint paths and compatibility with config
* **Slow inference**: ensure GPU is available if expected
* **Dependency issues**: confirm virtual environment is active

---

## License / usage

This module is part of a university project and intended for academic use.