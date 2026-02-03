from pydub import AudioSegment
import glob

# Replace this path with whatever 'which ffmpeg' gave you
AudioSegment.converter = "/opt/homebrew/bin/ffmpeg"

for f in glob.glob("evaluation/audio/*.m4a"):
    wav_file = f.replace(".m4a", ".wav")
    print(f"Converting {f} → {wav_file}")
    AudioSegment.from_file(f, format="m4a").export(wav_file, format="wav")
    print("Done.")