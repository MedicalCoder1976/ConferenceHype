from __future__ import annotations

import argparse
import os
import warnings
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline


SAMPLE_RATE = 24000
DEFAULT_VOICES = ("am_fenrir", "af_bella", "bm_lewis", "am_adam")
VOICE_TITLES = {
    "am_fenrir": "TumorCrusher Fenrir",
    "af_bella": "TumorCrusher Rebecca",
    "bm_lewis": "TumorCrusher AussieOnc",
    "am_adam": "TumorCrusher Adam",
}
VOICE_MIX = {
    "am_fenrir": {"gain": 1.0, "bass": 0.0},
    "af_bella": {"gain": 1.05, "bass": 0.12},
    "bm_lewis": {"gain": 1.08, "bass": 0.28},
    "am_adam": {"gain": 1.08, "bass": 0.42},
}


PERFORMANCE_LINES = [
    {"speed": 1.04, "pause": 0.16, "text": "TumorCrusher on the Ask-oh Hype desk."},
    {"speed": 1.08, "pause": 0.20, "text": "Ask-oh 2026 is officially in launch mode."},
    {"speed": 1.06, "pause": 0.34, "text": "Ask-oh 2026 is live, and Day 1 is not a warm-up."},
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
    {"speed": 1.08, "pause": 0.24, "text": "Tag hashtag Ask-oh Hype."},
    {"speed": 0.98, "pause": 0.22, "text": "If it clears review, it can hit the stream."},
    {
        "speed": 0.96,
        "pause": 0.20,
        "text": "Interactive AI commentary only. Not official reporting or medical advice.",
    },
    {"speed": 1.06, "pause": 0.14, "text": "Keep your badge close and your room list tighter."},
    {"speed": 1.10, "pause": 0.0, "text": "TumorCrusher here. Ask-oh 2026 Day 1 is on."},
]

VOICE_PERFORMANCES = {
    "am_fenrir": [
        {"speed": 1.01, "pause": 0.18, "text": "Fenrir on the TumorCrusher schedule desk."},
        {"speed": 1.05, "pause": 0.20, "text": "Ask-oh 2026 Day 1 is live, and this is the room map."},
        {"speed": 1.06, "pause": 0.18, "text": "Quick schedule hit."},
        {"speed": 1.03, "pause": 0.18, "text": "Twenty-four agenda sessions are on the board."},
        {"speed": 1.03, "pause": 0.18, "text": "Sixty-seven timed oral abstract presentations are ready to move."},
        {"speed": 1.00, "pause": 0.20, "text": "Pediatric Oncology and Medical Education lead the early watch list."},
        {"speed": 1.00, "pause": 0.18, "text": "Circle one PM Central."},
        {"speed": 0.98, "pause": 0.18, "text": "Lymphoma and CLL in E450a."},
        {"speed": 0.98, "pause": 0.18, "text": "Metastatic non-small cell lung cancer in Hall D2."},
        {"speed": 0.98, "pause": 0.20, "text": "Then two forty-five for Medical Education in E450b."},
        {"speed": 0.93, "pause": 0.28, "text": "Verify every room in the Ask-oh app and on-site signage before walking."},
        {"speed": 1.05, "pause": 0.14, "text": "Set the map."},
        {"speed": 1.06, "pause": 0.14, "text": "Mark the rooms."},
        {"speed": 1.08, "pause": 0.22, "text": "Move when the day moves."},
        {"speed": 1.04, "pause": 0.20, "text": "Adam is next, reading the social feed so you do not have to."},
        {"speed": 1.10, "pause": 0.0, "text": "Schedule desk clear. Send it to social."},
    ],
    "af_bella": [
        {"speed": 1.06, "pause": 0.16, "text": "Rebecca on the TumorCrusher reporter desk, and yes, the energy is already up."},
        {"speed": 1.12, "pause": 0.16, "text": "Ask-oh 2026 Day 1 is not easing in. It is hitting the floor with motion."},
        {"speed": 1.10, "pause": 0.14, "text": "Fenrir gave you the map. I am giving you the pulse."},
        {"speed": 1.13, "pause": 0.14, "text": "Watch the posters."},
        {"speed": 1.15, "pause": 0.14, "text": "Watch the media desk."},
        {"speed": 1.14, "pause": 0.14, "text": "Watch the hallway compression when a session lets out."},
        {"speed": 1.08, "pause": 0.18, "text": "Pediatric Oncology and Medical Education are carrying early heat."},
        {"speed": 1.08, "pause": 0.18, "text": "Lymphoma and CLL, lung cancer, and care delivery are the tracks to keep warm on the board."},
        {"speed": 1.12, "pause": 0.14, "text": "This is conference reporting with the volume up."},
        {"speed": 1.07, "pause": 0.20, "text": "Not official reporting, not medical advice, and definitely not a reason to skip checking the source."},
        {"speed": 1.15, "pause": 0.12, "text": "If the room starts buzzing, we want the why."},
        {"speed": 1.13, "pause": 0.14, "text": "If the poster wall starts moving, we want the signal."},
        {"speed": 1.10, "pause": 0.18, "text": "And if social gets messy, Adam is waiting with gloves on."},
        {"speed": 1.16, "pause": 0.0, "text": "Rebecca clear. Reporter desk hot. Send it."},
    ],
    "bm_lewis": [
        {"speed": 1.04, "pause": 0.16, "text": "Aussie Onc on the TumorCrusher global hype desk."},
        {"speed": 1.10, "pause": 0.16, "text": "Ask-oh 2026 is absolutely lighting up, and we are not whispering about it."},
        {"speed": 1.08, "pause": 0.16, "text": "From the schedule desk to the poster floor, this thing has movement."},
        {"speed": 1.13, "pause": 0.12, "text": "Big room energy."},
        {"speed": 1.14, "pause": 0.12, "text": "Sharp agenda signal."},
        {"speed": 1.12, "pause": 0.16, "text": "And enough hallway noise to make the badges vibrate."},
        {"speed": 1.06, "pause": 0.18, "text": "Pediatric Oncology, Medical Education, lymphoma, lung cancer, care delivery."},
        {"speed": 1.11, "pause": 0.16, "text": "That is the radar, and the radar is loud."},
        {"speed": 1.08, "pause": 0.18, "text": "If a source is official, we say it. If it is social, we label it. If it is nonsense, Adam can roast it."},
        {"speed": 1.14, "pause": 0.14, "text": "Keep the stream hot, keep the facts clean, and keep the room map open."},
        {"speed": 1.10, "pause": 0.18, "text": "Aussie Onc is here for the global conference pulse."},
        {"speed": 1.15, "pause": 0.0, "text": "Back to the desk. Let it rip."},
    ],
    "am_adam": [
        {"speed": 0.98, "pause": 0.18, "text": "Adam on social, which means the internet has entered the booth."},
        {"speed": 1.06, "pause": 0.18, "text": "Ask-oh 2026 Day 1 is moving, and the feed is already doing feed things."},
        {"speed": 1.10, "pause": 0.14, "text": "Coffee line."},
        {"speed": 1.13, "pause": 0.12, "text": "Snack win."},
        {"speed": 1.10, "pause": 0.12, "text": "Poster crowd."},
        {"speed": 1.15, "pause": 0.16, "text": "Somebody is definitely posting a hallway selfie like it is breaking news."},
        {"speed": 1.04, "pause": 0.20, "text": "Tag hashtag Ask-oh Hype when something actually deserves the desk."},
        {"speed": 0.98, "pause": 0.20, "text": "If it is just a blurry badge photo, congratulations, you have invented evidence-free cardio."},
        {"speed": 1.12, "pause": 0.14, "text": "Media moment."},
        {"speed": 1.12, "pause": 0.14, "text": "Hallway buzz."},
        {"speed": 1.06, "pause": 0.18, "text": "Snack reports are welcome. Snack manifestos are concerning."},
        {"speed": 0.94, "pause": 0.22, "text": "Social posts are buzz until an operator reviews them. We attribute, we verify, then we air."},
        {"speed": 1.06, "pause": 0.18, "text": "TumorCrusher keeps it moving: Fenrir owns the schedule, Rebecca reports the heat, Aussie Onc brings the global hype, Adam handles the feed."},
        {"speed": 1.13, "pause": 0.0, "text": "Ask-oh Hype is live. Post better. We are listening."},
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


def bass_boost(audio: np.ndarray, amount: float) -> np.ndarray:
    if amount <= 0:
        return audio
    alpha = 0.045
    low = np.zeros_like(audio, dtype=np.float32)
    running = 0.0
    for index, sample in enumerate(audio):
        running += alpha * (float(sample) - running)
        low[index] = running
    return normalize(audio + (low * amount), peak_target=0.9)


def apply_voice_mix(audio: np.ndarray, voice: str) -> np.ndarray:
    mix = VOICE_MIX.get(voice, VOICE_MIX["am_fenrir"])
    tuned = audio * float(mix["gain"])
    tuned = bass_boost(tuned, float(mix["bass"]))
    return normalize(tuned)


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
    audio = apply_voice_mix(synthesize_lines(pipeline, voice, PERFORMANCE_LINES), voice)
    output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output, audio, SAMPLE_RATE)


def synthesize_lineup(output: Path, recordings_dir: Path, voices: tuple[str, ...]) -> None:
    warnings.filterwarnings("ignore", category=UserWarning)
    pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
    recordings_dir.mkdir(parents=True, exist_ok=True)
    one_minute_parts = []

    for voice in voices:
        lines = VOICE_PERFORMANCES[voice]
        audio = pad_or_trim(apply_voice_mix(synthesize_lines(pipeline, voice, lines), voice), 60.0)
        one_minute_parts.append(audio)
        sf.write(recordings_dir / f"tumorcrusher-kokoro-{voice}-minute-v1.wav", audio, SAMPLE_RATE)

    combined = normalize(crossfade_join(one_minute_parts, fade_seconds=1.25))
    output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output, combined, SAMPLE_RATE)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--mode", choices=["single", "lineup", "trio"], default="single")
    parser.add_argument("--voice", default=os.environ.get("KOKORO_DJ_VOICE", "am_puck"))
    parser.add_argument("--voices", default=",".join(DEFAULT_VOICES))
    parser.add_argument("--recordings-dir")
    args = parser.parse_args()
    if args.mode in ("lineup", "trio"):
        voices = tuple(part.strip() for part in args.voices.split(",") if part.strip())
        if len(voices) < 1 or any(voice not in VOICE_PERFORMANCES for voice in voices):
            raise ValueError("Lineup mode requires supported voices: am_fenrir, af_bella, bm_lewis, am_adam")
        if not args.recordings_dir:
            raise ValueError("--recordings-dir is required in lineup mode")
        synthesize_lineup(Path(args.output), Path(args.recordings_dir), voices)
    else:
        synthesize(Path(args.output), args.voice)


if __name__ == "__main__":
    main()
