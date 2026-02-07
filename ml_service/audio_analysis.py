import os
import json
import traceback
from mistralai import Mistral

# ---------- Transcription ----------
def transcribe_audio(file_path: str, model=None) -> str:
    """
    Transcribe an audio file using Whisper.
    Requires model to be passed (preloaded at FastAPI startup).
    """
    if model is None:
        raise ValueError("Whisper model not provided. Pass the preloaded model.")

    print(f"[INFO] Starting transcription of {file_path}")
    segments, info = model.transcribe(file_path, beam_size=1)

    transcript = " ".join(seg.text.strip() for seg in segments)
    print(f"[INFO] Transcription complete. Length: {len(transcript)} chars")
    print(f"[INFO] Transcript: {transcript}")
    return transcript

# ---------- Mistral Client ----------
api_key = os.getenv("MISTRAL_API_KEY")
if not api_key:
    print("[WARNING] MISTRAL_API_KEY not found! Mistral extraction will fail.")
    mistral_client = None
else:
    mistral_client = Mistral(api_key=api_key)
    print("[INFO] Mistral client initialized")

# ---------- Food extraction ----------
def extract_food_items_with_grams(text: str) -> dict:
    """
    Use Mistral to extract food items and their grams from a text transcript.
    Returns a dictionary with 'items' and 'has_grams'.
    """
    print(f"[INFO] Extracting food items from transcript: '{text[:100]}...'")

    if mistral_client is None:
        print("[ERROR] Mistral client not initialized - API key missing!")
        return {"items": [], "has_grams": False, "error": "MISTRAL_API_KEY not set"}

    prompt = f"""
Extract food items and their grams from the text below.
Rules:
- Return ONLY valid JSON
- Output format:
{{
  "items": [
    {{ "name": "food", "grams": number_or_null }}
  ]
}}
- If grams are not mentioned, use null
- Do not estimate or guess grams
- No explanations

Text:
\"\"\"{text}\"\"\"
"""

    try:
        print("[INFO] Calling Mistral API...")
        response = mistral_client.chat.complete(
            model="mistral-small-latest",
            messages=[{"role": "user", "content": prompt}],
            stream=False,
            response_format={"type": "text"}
        )

        content = response.choices[0].message.content.strip()
        print(f"[INFO] Mistral raw response: {content}")

        # Clean code blocks if any
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()

        data = json.loads(content)
        items = data.get("items", [])

        result = {
            "items": [
                {
                    "name": str(it.get("name")).strip(),
                    "grams": it.get("grams") if isinstance(it.get("grams"), (int, float)) else None
                }
                for it in items
                if it.get("name")
            ],
            "has_grams": any(it.get("grams") is not None for it in items)
        }

        print(f"[SUCCESS] Extracted {len(result['items'])} food items: {result['items']}")
        return result

    except json.JSONDecodeError as e:
        print(f"[ERROR] Failed to parse JSON from Mistral: {e}")
        print(f"[ERROR] Raw content was: {content}")
        return {"items": [], "has_grams": False, "error": "Invalid JSON from Mistral"}

    except Exception as e:
        print(f"[ERROR] Mistral API call failed: {type(e).__name__}: {e}")
        traceback.print_exc()
        return {"items": [], "has_grams": False, "error": str(e)}