from __future__ import annotations

import argparse
import os
import warnings
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline


SAMPLE_RATE = 24000


PERFORMANCE_LINES = [
    {"speed": 1.04, "pause": 0.16, "text": "TumorCrusher on the ASCO Hype desk."},
    {"speed": 1.08, "pause": 0.20, "text": "ASCO 2026 is officially in launch mode."},
    {"speed": 1.06, "pause": 0.34, "text": "ASCO 2026 is live, and Day 1 is not a warm-up."},
    {
        "speed": 1.01,
        "pause": 0.22,
        "text": "Day 1 is the signal check, the hallway pulse, and the first big swing of the meeting.",
    },
    {"speed": 0.98, "pause": 0.28, "text": "Seven o'clock Central, Friday May 29."},
    {"speed": 1.05, "pause": 0.36, "text": "This is the one-minute lock-in."},
    {"speed": 1.12, "pause": 0.16, "text": "Quick hits."},
    {"speed": 1.09, "pause": 0.16, "text": "Here is the energy board."},
    {"speed": 1.07, "pause": 0.16, "text": "Twenty-four agenda sessions."},
    {"speed": 1.08, "pause": 0.18, "text": "Sixty-seven timed oral abstract presentations."},
    {
        "speed": 1.03,
        "pause": 0.24,
        "text": "Pediatric Oncology and Medical Education lead the board.",
    },
    {"speed": 1.03, "pause": 0.20, "text": "Lymphoma and CLL is on the afternoon radar."},
    {
        "speed": 1.04,
        "pause": 0.28,
        "text": "Metastatic non-small cell lung cancer is circled in bold.",
    },
    {"speed": 0.94, "pause": 0.24, "text": "Now breathe for the desk reset."},
    {"speed": 0.98, "pause": 0.22, "text": "This opening window is the ramp."},
    {"speed": 1.11, "pause": 0.10, "text": "Set the map."},
    {"speed": 1.10, "pause": 0.10, "text": "Mark the rooms."},
    {"speed": 1.12, "pause": 0.28, "text": "Move when the day moves."},
    {"speed": 1.02, "pause": 0.18, "text": "Circle one PM Central."},
    {"speed": 1.00, "pause": 0.18, "text": "Lymphoma and CLL in E450a."},
    {
        "speed": 1.00,
        "pause": 0.18,
        "text": "Metastatic non-small cell lung cancer in Hall D2.",
    },
    {
        "speed": 1.00,
        "pause": 0.24,
        "text": "Then two forty-five for Medical Education in E450b.",
    },
    {"speed": 0.95, "pause": 0.30, "text": "Verify rooms before walking."},
    {"speed": 0.98, "pause": 0.18, "text": "Rooms move. Lines form. The app wins."},
    {"speed": 1.02, "pause": 0.24, "text": "That is the path through the noise."},
    {"speed": 1.13, "pause": 0.09, "text": "Coffee line."},
    {"speed": 1.14, "pause": 0.09, "text": "Snack win."},
    {"speed": 1.12, "pause": 0.09, "text": "Poster crowd."},
    {"speed": 1.13, "pause": 0.09, "text": "Media moment."},
    {"speed": 1.14, "pause": 0.22, "text": "Hallway buzz."},
    {"speed": 1.08, "pause": 0.24, "text": "Tag hashtag ASCO Hype."},
    {"speed": 0.98, "pause": 0.22, "text": "If it clears review, it can hit the stream."},
    {
        "speed": 0.96,
        "pause": 0.20,
        "text": "Interactive AI commentary only. Not official reporting or medical advice.",
    },
    {"speed": 1.06, "pause": 0.14, "text": "Keep your badge close and your room list tighter."},
    {"speed": 1.10, "pause": 0.0, "text": "TumorCrusher here. ASCO 2026 Day 1 is on."},
]


def trim_silence(audio: np.ndarray, threshold: float = 0.006, padding: int = 1200) -> np.ndarray:
    loud = np.flatnonzero(np.abs(audio) > threshold)
    if loud.size == 0:
        return audio
    start = max(int(loud[0]) - padding, 0)
    end = min(int(loud[-1]) + padding, audio.shape[0])
    return audio[start:end]


def synthesize(output: Path, voice: str) -> None:
    warnings.filterwarnings("ignore", category=UserWarning)
    pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
    chunks: list[np.ndarray] = []

    for line in PERFORMANCE_LINES:
        generated = []
        for result in pipeline(
            line["text"],
            voice=voice,
            speed=float(line["speed"]),
            split_pattern=None,
        ):
            generated.append(result.audio.detach().cpu().numpy())
        if not generated:
            continue
        phrase = trim_silence(np.concatenate(generated).astype(np.float32))
        chunks.append(phrase)
        pause = float(line["pause"])
        if pause > 0:
            chunks.append(np.zeros(int(SAMPLE_RATE * pause), dtype=np.float32))

    audio = np.concatenate(chunks)
    peak = float(np.max(np.abs(audio)))
    if peak > 0:
        audio = audio / peak * 0.92
    output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output, audio, SAMPLE_RATE)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--voice", default=os.environ.get("KOKORO_DJ_VOICE", "am_puck"))
    args = parser.parse_args()
    synthesize(Path(args.output), args.voice)


if __name__ == "__main__":
    main()
