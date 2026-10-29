"""Free Korean narration for the Korean dub (2026-10-28).

MeloTTS (MIT license, https://github.com/myshell-ai/MeloTTS) has a Korean
voice and runs on CPU, so the dub needs no paid TTS key. Kokoro, used for the
English broadcasts, has no Korean voice.

Usage: python3 scripts/generate-melo-korean-voice.py <manifest.json>
The manifest is a JSON list of {"text": "...", "out": "/path/to/clip.wav"}.
All clips are synthesized in one process so the model loads once.
"""

import json
import os
import sys

from melo.api import TTS


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: generate-melo-korean-voice.py <manifest.json>")
    with open(sys.argv[1], encoding="utf-8") as handle:
        items = json.load(handle)
    speed = float(os.environ.get("MELO_KOREAN_SPEED", "1.0"))
    model = TTS(language="KR", device="cpu")
    speaker_id = model.hps.data.spk2id["KR"]
    for index, item in enumerate(items, start=1):
        print(f"[melo {index}/{len(items)}] {item['out']}", flush=True)
        model.tts_to_file(item["text"], speaker_id, item["out"], speed=speed, quiet=True)


if __name__ == "__main__":
    main()
