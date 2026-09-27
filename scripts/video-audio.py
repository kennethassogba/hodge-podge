"""Assemble the voiceover and timeline. No network calls."""
import json
import math
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'livrables/video'
scenes = json.loads((ROOT / 'storyboard.json').read_text())
sample_rate = 24000
parts = []
cursor = 0
for scene in scenes:
    with wave.open(str(ROOT / 'assets' / (scene['id'] + '.wav')), 'rb') as src:
        assert src.getframerate() == sample_rate and src.getnchannels() == 1
        assert src.getsampwidth() == 2
        # Streaming WAV headers can declare a placeholder length. Read to EOF.
        chunks = []
        while chunk := src.readframes(4096):
            chunks.append(chunk)
        pcm = b''.join(chunks)
    duration = len(pcm) / 2 / sample_rate
    lead = .38
    tail = 2.3 if scene['id'] == 'outro' else .42
    scene.update(start=cursor, audio_start=cursor + lead, audio_duration=duration,
                 duration=lead + duration + tail)
    parts.extend([bytes(round(sample_rate * lead) * 2), pcm,
                  bytes(round(sample_rate * tail) * 2)])
    cursor += scene['duration']
# Align total duration to a frame boundary.
total = math.ceil(cursor * 24) / 24
parts.append(bytes(round((total - cursor) * sample_rate) * 2))
scenes[-1]['duration'] += total - cursor
with wave.open(str(ROOT / 'assets/narration.wav'), 'wb') as out:
    out.setparams((1, 2, sample_rate, 0, 'NONE', 'not compressed'))
    out.writeframes(b''.join(parts))
(ROOT / 'timeline.json').write_text(json.dumps(scenes, ensure_ascii=False, indent=2) + '\n')
print(f'Voiceover assembled: {total:.3f}s')
for s in scenes:
    print(f"{s['id']}: {s['start']:.2f} to {s['start']+s['duration']:.2f}")
