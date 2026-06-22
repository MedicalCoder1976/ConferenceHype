from __future__ import annotations

import argparse
import os
import warnings
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline


SAMPLE_RATE = 24000
DEFAULT_VOICES = (
    "am_fenrir",
    "af_heart",
    "af_bella",
    "am_michael",
    "bm_lewis",
    "af_sarah",
    "am_echo",
    "am_adam",
)
VOICE_TITLES = {
    "am_fenrir": "TumorCrusher Fenrir",
    "af_heart": "TumorCrusher Marisol",
    "af_bella": "TumorCrusher Rebecca",
    "am_michael": "TumorCrusher Jax",
    "bm_lewis": "TumorCrusher AussieOnc",
    "af_sarah": "TumorCrusher Maya",
    "am_echo": "TumorCrusher Cole",
    "am_adam": "TumorCrusher Adam",
    "am_eric": "TumorCrusher Eric",
    "am_liam": "TumorCrusher Liam",
    "am_onyx": "TumorCrusher Onyx",
    "am_puck": "TumorCrusher Puck",
    "bm_daniel": "TumorCrusher Daniel",
    "af_nova": "TumorCrusher Nova",
    "af_jessica": "TumorCrusher Jessica",
    "af_kore": "TumorCrusher Kore",
    "bf_emma": "TumorCrusher Emma",
}
# Gain/bass tuning is an ear-tuned default per voice; adjust after listening to a render.
VOICE_MIX = {
    "am_fenrir": {"gain": 1.0, "bass": 0.0},
    "af_heart": {"gain": 1.08, "bass": 0.14},
    "af_bella": {"gain": 1.05, "bass": 0.12},
    "am_michael": {"gain": 1.06, "bass": 0.26},
    "bm_lewis": {"gain": 1.08, "bass": 0.28},
    "af_sarah": {"gain": 1.04, "bass": 0.1},
    "am_echo": {"gain": 1.05, "bass": 0.22},
    "am_adam": {"gain": 1.08, "bass": 0.42},
    "am_eric": {"gain": 1.06, "bass": 0.2},
    "am_liam": {"gain": 1.05, "bass": 0.16},
    "am_onyx": {"gain": 1.07, "bass": 0.34},
    "am_puck": {"gain": 1.06, "bass": 0.24},
    "bm_daniel": {"gain": 1.07, "bass": 0.3},
    "af_nova": {"gain": 1.06, "bass": 0.12},
    "af_jessica": {"gain": 1.05, "bass": 0.1},
    "af_kore": {"gain": 1.07, "bass": 0.16},
    "bf_emma": {"gain": 1.06, "bass": 0.14},
}


PERFORMANCE_LINES = [
    {"speed": 1.04, "pause": 0.16, "text": "TumorCrusher on the ConferenceHype desk."},
    {"speed": 1.08, "pause": 0.20, "text": "ConferenceHype is officially in launch mode."},
    {"speed": 1.06, "pause": 0.34, "text": "ConferenceHype is live, and this is not a warm-up."},
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
    {"speed": 0.95, "pause": 0.30, "text": "Check rooms before walking."},
    {"speed": 0.98, "pause": 0.18, "text": "Rooms move. Lines form. The app wins."},
    {"speed": 1.02, "pause": 0.24, "text": "That is the path through the noise."},
    {"speed": 1.13, "pause": 0.09, "text": "Source line."},
    {"speed": 1.14, "pause": 0.09, "text": "Source win."},
    {"speed": 1.12, "pause": 0.09, "text": "Poster crowd."},
    {"speed": 1.13, "pause": 0.09, "text": "Media moment."},
    {"speed": 1.14, "pause": 0.22, "text": "Hallway buzz."},
    {"speed": 1.08, "pause": 0.24, "text": "Tag ConferenceHype."},
    {"speed": 0.98, "pause": 0.22, "text": "If it clears review, it can hit the stream."},
    {
        "speed": 0.96,
        "pause": 0.20,
        "text": "Interactive AI commentary only. Not official reporting or medical advice.",
    },
    {"speed": 1.06, "pause": 0.14, "text": "Keep your badge close and your room list tighter."},
    {"speed": 1.10, "pause": 0.0, "text": "TumorCrusher here. ConferenceHype is on."},
]

VOICE_PERFORMANCES = {
    "am_fenrir": [
        {"speed": 1.01, "pause": 0.18, "text": "Fenrir on the TumorCrusher schedule desk."},
        {"speed": 1.05, "pause": 0.20, "text": "ConferenceHype is live, and this is the room map."},
        {"speed": 1.06, "pause": 0.18, "text": "Quick schedule hit."},
        {"speed": 1.03, "pause": 0.18, "text": "Twenty-four agenda sessions are on the board."},
        {"speed": 1.03, "pause": 0.18, "text": "Sixty-seven timed oral abstract presentations are ready to move."},
        {"speed": 1.00, "pause": 0.20, "text": "Pediatric Oncology and Medical Education lead the early watch list."},
        {"speed": 1.00, "pause": 0.18, "text": "Circle one PM Central."},
        {"speed": 0.98, "pause": 0.18, "text": "Lymphoma and CLL in E450a."},
        {"speed": 0.98, "pause": 0.18, "text": "Metastatic non-small cell lung cancer in Hall D2."},
        {"speed": 0.98, "pause": 0.20, "text": "Then two forty-five for Medical Education in E450b."},
        {"speed": 0.93, "pause": 0.28, "text": "Check every room in the official conference app and on-site signage before walking."},
        {"speed": 1.05, "pause": 0.14, "text": "Set the map."},
        {"speed": 1.06, "pause": 0.14, "text": "Mark the rooms."},
        {"speed": 1.08, "pause": 0.22, "text": "Move when the day moves."},
        {"speed": 1.04, "pause": 0.20, "text": "Adam is next, reading the social feed so you do not have to."},
        {"speed": 1.10, "pause": 0.0, "text": "Schedule desk clear. Send it to social."},
    ],
    "af_heart": [
        {"speed": 1.06, "pause": 0.12, "text": "Thanks, Fenrir. Marisol Vega on the TumorCrusher Latina DJ desk."},
        {"speed": 1.12, "pause": 0.12, "text": "ConferenceHype is live, bright, and moving with serious heat."},
        {"speed": 1.10, "pause": 0.10, "text": "Breast, lung, G U, G Y N, skin, colorectal, upper G I, CNS, endocrine, sarcoma."},
        {"speed": 1.13, "pause": 0.10, "text": "Every track gets a reporter. Every source gets a label."},
        {"speed": 1.15, "pause": 0.08, "text": "No lazy hype."},
        {"speed": 1.15, "pause": 0.10, "text": "No mystery claims."},
        {"speed": 1.10, "pause": 0.12, "text": "Just clean conference energy, fast handoffs, and the room pulse."},
        {"speed": 1.12, "pause": 0.10, "text": "When the poster wall jumps, I want the why."},
        {"speed": 1.11, "pause": 0.12, "text": "When the hallway starts buzzing, I want the source."},
        {"speed": 1.14, "pause": 0.0, "text": "Marisol is in the mix. ConferenceHype, sube el volumen."},
    ],
    "af_bella": [
        {"speed": 1.06, "pause": 0.16, "text": "Thanks, Marisol. Rebecca on the TumorCrusher reporter desk, and yes, the energy is already up."},
        {"speed": 1.12, "pause": 0.16, "text": "ConferenceHype is not easing in. It is hitting the floor with motion."},
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
    "am_michael": [
        {"speed": 1.03, "pause": 0.12, "text": "Thanks, Rebecca. Jax Rivers on the TumorCrusher U.S. prime-time desk."},
        {"speed": 1.08, "pause": 0.12, "text": "ConferenceHype is running hot, and the hourly voice cycle is now loaded."},
        {"speed": 1.06, "pause": 0.10, "text": "Top of the hour, we rotate the booth."},
        {"speed": 1.10, "pause": 0.10, "text": "Schedule check. Disease desk. Social hit. Source check."},
        {"speed": 1.06, "pause": 0.12, "text": "If lung is moving, we bring the thoracic reporter."},
        {"speed": 1.06, "pause": 0.12, "text": "If G U catches fire, the G U desk takes it."},
        {"speed": 1.07, "pause": 0.12, "text": "If the room is full and the hallway is louder, we say that too."},
        {"speed": 1.08, "pause": 0.0, "text": "Jax clear. Keep the clock tight and the energy up."},
    ],
    "bm_lewis": [
        {"speed": 1.04, "pause": 0.16, "text": "Thanks, Jax. Aussie Onc on the TumorCrusher global hype desk."},
        {"speed": 1.10, "pause": 0.16, "text": "ConferenceHype is lighting up, and we are not whispering about it."},
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
    "af_sarah": [
        {"speed": 1.01, "pause": 0.12, "text": "Thanks, Aussie Onc. Maya Steele on the TumorCrusher science-to-signal desk."},
        {"speed": 1.06, "pause": 0.12, "text": "ConferenceHype has the volume, but we still read the room carefully."},
        {"speed": 1.04, "pause": 0.12, "text": "Big claims need sources. Abstract buzz needs context. Social needs a label."},
        {"speed": 1.06, "pause": 0.10, "text": "Breast and G Y N get the patient-centered lens."},
        {"speed": 1.05, "pause": 0.10, "text": "CNS and endocrine get the nuance check."},
        {"speed": 1.08, "pause": 0.10, "text": "Colorectal, upper G I, hepatobiliary, and sarcoma get the signal board."},
        {"speed": 1.07, "pause": 0.0, "text": "Maya is live. Hype stays high. Attribution stays higher."},
    ],
    "am_echo": [
        {"speed": 1.03, "pause": 0.12, "text": "Thanks, Maya. Cole Maddox on the TumorCrusher late-hour U.S. desk."},
        {"speed": 1.10, "pause": 0.10, "text": "ConferenceHype does not sleep, so neither does the coverage clock."},
        {"speed": 1.08, "pause": 0.10, "text": "Every hour gets a fresh voice, a fresh track, and a clean handoff."},
        {"speed": 1.06, "pause": 0.10, "text": "Breast to lung. G U to G Y N. Skin to colorectal."},
        {"speed": 1.05, "pause": 0.10, "text": "Upper G I and hepatobiliary. CNS. Endocrine. Soft tissue."},
        {"speed": 1.09, "pause": 0.10, "text": "If it is official, we anchor it. If it is buzz, we badge it."},
        {"speed": 1.10, "pause": 0.0, "text": "Cole clear. The cycle is alive."},
    ],
    "am_adam": [
        {"speed": 0.98, "pause": 0.18, "text": "Thanks, Cole. Adam on social, which means the internet has entered the booth."},
        {"speed": 1.06, "pause": 0.18, "text": "ConferenceHype is moving, and the feed is already doing feed things."},
        {"speed": 1.10, "pause": 0.14, "text": "Source line."},
        {"speed": 1.13, "pause": 0.12, "text": "Source win."},
        {"speed": 1.10, "pause": 0.12, "text": "Poster crowd."},
        {"speed": 1.15, "pause": 0.16, "text": "Somebody is definitely posting a hallway selfie like it is breaking news."},
        {"speed": 1.04, "pause": 0.20, "text": "Tag ConferenceHype when something actually deserves the desk."},
        {"speed": 1.05, "pause": 0.18, "text": "Steps, walks, runs, gym sessions, and workout wins go to the end-of-day shoutout queue after review."},
        {"speed": 0.98, "pause": 0.20, "text": "If it is just a blurry badge photo, congratulations, you have invented evidence-free cardio."},
        {"speed": 1.12, "pause": 0.14, "text": "Media moment."},
        {"speed": 1.12, "pause": 0.14, "text": "Hallway buzz."},
        {"speed": 1.06, "pause": 0.18, "text": "Source links are welcome. Official schedule items are welcome. Vague chatter stays outside the rundown."},
        {"speed": 0.94, "pause": 0.22, "text": "Source-attributed cards, official schedule, monitored voices, operator statements. That is what gets into the rundown."},
        {"speed": 1.06, "pause": 0.18, "text": "TumorCrusher keeps it moving: Fenrir owns the schedule, Marisol brings the Latina DJ fire, Rebecca reports the heat, Aussie Onc brings the global hype, and Adam handles the feed."},
        {"speed": 1.13, "pause": 0.0, "text": "ConferenceHype is live. Post better. We are listening."},
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


def gap_join(parts: list[np.ndarray], gap_seconds: float) -> np.ndarray:
    if not parts:
        return np.zeros(0, dtype=np.float32)
    gap = np.zeros(int(SAMPLE_RATE * gap_seconds), dtype=np.float32)
    output = parts[0]
    for part in parts[1:]:
        output = np.concatenate([output, gap, part])
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


def synthesize_stinger(output: Path, voice: str, text: str | None = None) -> None:
    warnings.filterwarnings("ignore", category=UserWarning)
    pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
    lines = [
        {"speed": 1.12, "pause": 0.10, "text": line.strip()}  # Rule 9: higher energy pace
        for line in (text or "ConferenceHype!\nConference energy all day.").splitlines()
        if line.strip()
    ]
    audio = apply_voice_mix(synthesize_lines(pipeline, voice, lines), voice)
    output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output, audio, SAMPLE_RATE)


def parse_script_file(script_file: Path) -> list[tuple[str, list[dict[str, object]]]]:
    blocks: list[tuple[str, list[dict[str, object]]]] = []
    current_voice = "am_adam"
    current_lines: list[dict[str, object]] = []

    for raw_line in script_file.read_text(encoding="utf8").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("[") and "]" in line:
            if current_lines:
                blocks.append((current_voice, current_lines))
            current_voice = line[1 : line.index("]")]
            if current_voice not in VOICE_MIX:
                supported = ", ".join(VOICE_MIX.keys())
                raise ValueError(f"Unsupported script voice {current_voice}. Use one of: {supported}")
            current_lines = []
            line = line[line.index("]") + 1 :].strip()
            if not line:
                continue
        current_lines.append({"speed": 0.98, "pause": 0.42, "text": line})

    if current_lines:
        blocks.append((current_voice, current_lines))
    return blocks


def synthesize_script_file(output: Path, script_file: Path, speaker_gap_seconds: float) -> None:
    warnings.filterwarnings("ignore", category=UserWarning)
    pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
    parts = [
        apply_voice_mix(synthesize_lines(pipeline, voice, lines), voice)
        for voice, lines in parse_script_file(script_file)
    ]
    audio = normalize(gap_join(parts, speaker_gap_seconds))
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

    combined = normalize(gap_join(one_minute_parts, gap_seconds=1.5))
    output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output, combined, SAMPLE_RATE)


def synthesize_cycle(output: Path, voices: tuple[str, ...], target_seconds: float) -> None:
    warnings.filterwarnings("ignore", category=UserWarning)
    pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
    seconds_per_voice = target_seconds / max(len(voices), 1)
    parts = []

    for voice in voices:
        lines = VOICE_PERFORMANCES[voice]
        audio = pad_or_trim(apply_voice_mix(synthesize_lines(pipeline, voice, lines), voice), seconds_per_voice)
        parts.append(audio)

    combined = normalize(gap_join(parts, gap_seconds=1.5))
    output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output, pad_or_trim(combined, target_seconds), SAMPLE_RATE)


def synthesize_batch(batch_file: Path) -> None:
    """
    Process a JSON batch file and synthesize all items in a single KPipeline session.

    Input format (array of objects):
      [{"voice": "am_fenrir", "text": "...", "output": "/tmp/card-0.wav"}, ...]

    The model is loaded once and reused for every item, which is much faster than
    spawning a separate process per card when rendering a full broadcast block.
    """
    import json

    warnings.filterwarnings("ignore", category=UserWarning)
    items = json.loads(batch_file.read_text(encoding="utf8"))
    if not items:
        print("Batch file is empty — nothing to synthesize.")
        return

    pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
    total = len(items)

    for index, item in enumerate(items):
        voice = item["voice"]
        if voice not in VOICE_MIX:
            supported = ", ".join(VOICE_MIX.keys())
            raise ValueError(f"Unsupported voice '{voice}'. Use one of: {supported}")

        text = str(item["text"])
        output = Path(item["output"])
        speed = float(item.get("speed", 1.15))  # Rule 9: higher energy — 1.15× speaking pace

        lines = [
            {"speed": speed, "pause": 0.12, "text": line.strip()}
            for line in text.splitlines()
            if line.strip()
        ]
        if not lines:
            lines = [{"speed": speed, "pause": 0.0, "text": text.strip()}]

        audio = apply_voice_mix(synthesize_lines(pipeline, voice, lines), voice)
        output.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(output), audio, SAMPLE_RATE)
        print(f"[{index + 1}/{total}] {output.name} ({voice})")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output")
    parser.add_argument(
        "--mode",
        choices=["single", "lineup", "trio", "cycle", "stinger", "script", "batch"],
        default="single",
    )
    parser.add_argument("--voice", default=os.environ.get("KOKORO_DJ_VOICE", "am_puck"))
    parser.add_argument("--voices", default=",".join(DEFAULT_VOICES))
    parser.add_argument("--recordings-dir")
    parser.add_argument("--target-seconds", type=float, default=180.0)
    parser.add_argument("--text")
    parser.add_argument("--script-file")
    parser.add_argument("--batch-file")
    parser.add_argument("--speaker-gap-seconds", type=float, default=1.5)
    args = parser.parse_args()
    if args.mode == "batch":
        if not args.batch_file:
            raise ValueError("--batch-file is required in batch mode")
        synthesize_batch(Path(args.batch_file))
    elif args.mode == "script":
        if not args.script_file:
            raise ValueError("--script-file is required in script mode")
        if not args.output:
            raise ValueError("--output is required in script mode")
        synthesize_script_file(Path(args.output), Path(args.script_file), args.speaker_gap_seconds)
    elif args.mode == "stinger":
        if args.voice not in VOICE_MIX:
            supported = ", ".join(VOICE_MIX.keys())
            raise ValueError(f"Stinger mode requires supported voice: {supported}")
        if not args.output:
            raise ValueError("--output is required in stinger mode")
        synthesize_stinger(Path(args.output), args.voice, args.text)
    elif args.mode in ("lineup", "trio", "cycle"):
        voices = tuple(part.strip() for part in args.voices.split(",") if part.strip())
        if len(voices) < 1 or any(voice not in VOICE_PERFORMANCES for voice in voices):
            supported = ", ".join(VOICE_PERFORMANCES.keys())
            raise ValueError(f"Lineup mode requires supported voices: {supported}")
        if args.mode == "cycle":
            if not args.output:
                raise ValueError("--output is required in cycle mode")
            synthesize_cycle(Path(args.output), voices, args.target_seconds)
            return
        if not args.recordings_dir:
            raise ValueError("--recordings-dir is required in lineup mode")
        if not args.output:
            raise ValueError("--output is required in lineup mode")
        synthesize_lineup(Path(args.output), Path(args.recordings_dir), voices)
    else:
        if not args.output:
            raise ValueError("--output is required in single mode")
        synthesize(Path(args.output), args.voice)


if __name__ == "__main__":
    main()
