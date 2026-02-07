# test_fastapi_audio.py - quick test version
import requests
import os

url = "http://127.0.0.1:5002/analyze-audio"

# Use a shorter test file if you have one
audio_file = "/Users/oliviat/Documents/Uni/WS25_26/DBSM/Project/evaluation/audio/audio_16.wav"

print(f"File size: {os.path.getsize(audio_file) / 1024:.1f} KB")
print("Sending request (may take 1-3 minutes on first run)...\n")

with open(audio_file, "rb") as f:
    response = requests.post(
        url,
        files={"audio": ("audio.wav", f, "audio/wav")},
        timeout=300  # 5 minutes
    )

print(f"Status: {response.status_code}")
if response.ok:
    data = response.json()
    print(f"\nTranscript: {data['transcript']}")
    print(f"\nItems found: {len(data['items'])}")
    for item in data['items']:
        print(f"  - {item}")
else:
    print(f"Error: {response.text}")
