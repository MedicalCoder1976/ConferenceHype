from __future__ import annotations

import argparse
import os
import warnings
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline


SAMPLE_RATE = 24000
DEFAULT_VOICES = ("am_puck", "am_fenrir", "am_adam")
VOICE_TITLES = {
    "am_puck": "TumorCrusher Puck",
    "am_fenrir": "TumorCrusher Fenrir",
    "am_adam": "TumorCrusher Adam",
}


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

TRIO_PERFORMANCES = {
    "am_puck": [
        {"speed": 1.04, "pause": 0.18, "text": "TumorCrusher on the ASCO Hype desk."},
        {"speed": 1.08, "pause": 0.22, "text": "ASCO 2026 is officially in launch mode."},
        {"speed": 1.06, "pause": 0.34, "text": "Day 1 is not a warm-up. Day 1 is the first big swing of the meeting."},
        {"speed": 1.02, "pause": 0.24, "text": "Seven o'clock Central, Friday May 29. The badge is on, the app is open, and the room map matters."},
        {"speed": 1.12, "pause": 0.16, "text": "Quick hits."},
        {"speed": 1.08, "pause": 0.18, "text": "Twenty-four agenda sessions."},
        {"speed": 1.08, "pause": 0.18, "text": "Sixty-seven timed oral abstract presentations."},
        {"speed": 1.04, "pause": 0.22, "text": "Pediatric Oncology and Medical Education lead the early watch board."},
        {"speed": 1.02, "pause": 0.20, "text": "Lymphoma and CLL is warming up the afternoon radar."},
        {"speed": 1.04, "pause": 0.26, "text": "Metastatic non-small cell lung cancer is circled in bold."},
        {"speed": 0.96, "pause": 0.24, "text": "This is interactive conference commentary, not official reporting and not medical advice."},
        {"speed": 1.10, "pause": 0.18, "text": "Coming across the desk next, Fenrir grabs the room map and turns up the signal."},
        {"speed": 1.12, "pause": 0.0, "text": "ASCO Hype stays live. Keep it moving."},
    ],
    "am_fenrir": [
        {"speed": 1.02, "pause": 0.16, "text": "Fenrir on the TumorCrusher desk, taking the handoff."},
        {"speed": 1.04, "pause": 0.20, "text": "Here is the conference path through the noise."},
        {"speed": 1.01, "pause": 0.18, "text": "Circle one PM Central."},
        {"speed": 1.00, "pause": 0.18, "text": "Lymphoma and CLL in E450a."},
        {"speed": 1.00, "pause": 0.18, "text": "Metastatic non-small cell lung cancer in Hall D2."},
        {"speed": 1.00, "pause": 0.22, "text": "Then two forty-five for Medical Education in E450b."},
        {"speed": 0.94, "pause": 0.28, "text": "Verify rooms before walking. Rooms move. Lines form. The app wins."},
        {"speed": 1.08, "pause": 0.14, "text": "Set the map."},
        {"speed": 1.08, "pause": 0.14, "text": "Mark the rooms."},
        {"speed": 1.10, "pause": 0.24, "text": "Move when the day moves."},
        {"speed": 1.04, "pause": 0.18, "text": "If the hallway buzz clears review, it can hit the stream."},
        {"speed": 1.06, "pause": 0.20, "text": "Coffee line, snack win, poster crowd, media moment."},
        {"speed": 1.12, "pause": 0.18, "text": "Tag hashtag ASCO Hype."},
        {"speed": 1.06, "pause": 0.20, "text": "Adam is next on closeout duty with the final hype sweep."},
        {"speed": 1.12, "pause": 0.0, "text": "Desk two is clear. Send it."},
    ],
    "am_adam": [
        {"speed": 1.03, "pause": 0.16, "text": "Adam on the TumorCrusher desk, final minute, final sweep."},
        {"speed": 1.07, "pause": 0.20, "text": "ASCO 2026 Day 1 is on the board."},
        {"speed": 1.04, "pause": 0.20, "text": "The opening window is the ramp. The afternoon is where the movement starts."},
        {"speed": 1.05, "pause": 0.18, "text": "Pediatric Oncology, Medical Education, Lymphoma and CLL, lung cancer, care delivery."},
        {"speed": 1.10, "pause": 0.16, "text": "That is the board. That is the pulse."},
        {"speed": 0.96, "pause": 0.24, "text": "Keep your badge close, keep your room list tighter, and verify every room before you walk."},
        {"speed": 1.08, "pause": 0.14, "text": "Coffee line."},
        {"speed": 1.10, "pause": 0.14, "text": "Snack win."},
        {"speed": 1.08, "pause": 0.14, "text": "Poster crowd."},
        {"speed": 1.10, "pause": 0.14, "text": "Media moment."},
        {"speed": 1.12, "pause": 0.22, "text": "Hallway buzz."},
        {"speed": 1.06, "pause": 0.20, "text": "Tag hashtag ASCO Hype if something deserves the desk."},
        {"speed": 0.95, "pause": 0.22, "text": "Reminder, this is interactive AI commentary only. Not official reporting. Not medical advice."},
        {"speed": 1.07, "pause": 0.16, "text": "TumorCrusher here, three voices strong."},
        {"speed": 1.12, "pause": 0.0, "text": "ASCO 2026 Day 1 is on."},
    ],
}


def trim_silence(audio: np.ndarray, threshold: float = 0.006, padding: int = 1200) -> np.ndarray:
    loud = np.flatnonzero(np.abs(audio) > threshold)
    if loud.size == 0:
        return audio
    start = max(int(loud[0]) - padding, 0)
    end = min(int(loud[-1]) + padding, audio.shape[0])
    return audio[start:end]


def normalize(audio: np.ndarray, peak_target: float = 0.92) -> np.ndarray:
    peak = float(np.max(np.abs(audio)))
    if peak > 0:
        return audio / peak * peak_target
    return audio


def pad_or_trim(audio: np.ndarray, seconds: float) -> np.ndarray:
    target = int(SAMPLE_RATE * seconds)
    if audio.shape[0] > target:
        return audio[:target]
    if audio.shape[0] < target:
        return np.concatenate([audio, np.zeros(target - audio.shape[0], dtype=np.float32)])
    return audio


def crossfade_join(parts: list[np.ndarray], fade_seconds: float) -> np.ndarray:
    if not parts:
        return np.zeros(0, dtype=np.float32)
    fade = int(SAMPLE_RATE * fade_seconds)
    output = parts[0]
    for part in parts[1:]:
        actual = min(fade, output.shape[0], part.shape[0])
        if actual <= 0:
            output = np.concatenate([output, part])
            continue
        fade_out = np.linspace(1.0, 0.0, actual, dtype=np.float32)
        fade_in = np.linspace(0.0, 1.0, actual, dtype=np.float32)
        blended = output[-actual:] * fade_out + part[:actual] * fade_in
        output = np.concatenate([output[:-actual], blended, part[actual:]])
    return output


def synthesize_lines(pipeline: KPipeline, voice: str, lines: list[dict[str, object]]) -> np.ndarray:
    chunks: list[np.ndarray] = []

    for line in lines:
        generated = []
        for result in pipeline(
            str(line["text"]),
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

    return normalize(np.concatenate(chunks))


def synthesize(output: Path, voice: str) -> None:
    warnings.filterwarnings("ignore", category=UserWarning)
    pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
    audio = synthesize_lines(pipeline, voice, PERFORMANCE_LINES)
    output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output, audio, SAMPLE_RATE)


def synthesize_trio(output: Path, recordings_dir: Path, voices: tuple[str, str, str]) -> None:
    warnings.filterwarnings("ignore", category=UserWarning)
    pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
    recordings_dir.mkdir(parents=True, exist_ok=True)
    one_minute_parts = []

    for voice in voices:
        lines = TRIO_PERFORMANCES[voice]
        audio = pad_or_trim(synthesize_lines(pipeline, voice, lines), 60.0)
        one_minute_parts.append(audio)
        sf.write(recordings_dir / f"tumorcrusher-kokoro-{voice}-minute-v1.wav", audio, SAMPLE_RATE)

    combined = normalize(crossfade_join(one_minute_parts, fade_seconds=1.25))
    output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output, combined, SAMPLE_RATE)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--mode", choices=["single", "trio"], default="single")
    parser.add_argument("--voice", default=os.environ.get("KOKORO_DJ_VOICE", "am_puck"))
    parser.add_argument("--voices", default=",".join(DEFAULT_VOICES))
    parser.add_argument("--recordings-dir")
    args = parser.parse_args()
    if args.mode == "trio":
        voices = tuple(part.strip() for part in args.voices.split(",") if part.strip())
        if len(voices) != 3 or any(voice not in TRIO_PERFORMANCES for voice in voices):
            raise ValueError("Trio mode requires three supported voices: am_puck, am_fenrir, am_adam")
        if not args.recordings_dir:
            raise ValueError("--recordings-dir is required in trio mode")
        synthesize_trio(Path(args.output), Path(args.recordings_dir), voices)  # type: ignore[arg-type]
    else:
        synthesize(Path(args.output), args.voice)


if __name__ == "__main__":
    main()
