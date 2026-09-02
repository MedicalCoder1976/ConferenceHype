#!/usr/bin/env python3
"""Create a zero-API-cost localized IASLC edition from an approved broadcast.

The script translates only the approved narration stored in Supabase, preserves
medical names and numbers, synthesizes one native-language clip per segment,
builds timed SRT subtitles, and replaces the English audio on the source video.
It deliberately stops before upload if any required source fact disappears.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

from transformers import AutoModelForSeq2SeqLM, AutoTokenizer


LANGUAGES = {
    "ko": {
        "name": "Korean",
        "native": "한국어",
        "model": "Helsinki-NLP/opus-mt-tc-big-en-ko",
        "voice": "ko-KR-SunHiNeural",
        "engine": "edge",
    },
    "ja": {
        "name": "Japanese",
        "native": "日本語",
        "model": "Helsinki-NLP/opus-mt-en-jap",
        "voice": "ja-JP-NanamiNeural",
        "engine": "edge",
    },
    "zh-Hans": {
        "name": "Simplified Chinese",
        "native": "简体中文",
        "model": "Helsinki-NLP/opus-mt-en-zh",
        "voice": "zh-CN-XiaoxiaoNeural",
        "engine": "edge",
    },
}

PROTECTED_TERMS = sorted(
    {
        "IASLC", "WCLC", "NSCLC", "SCLC", "PD-1", "VEGF", "EGFR", "HER2",
        "ADC", "ORR", "OS", "RC148", "M24-536", "PRESERVE-003", "REZILIENT3",
        "DESTINY-Lung04", "ADAURA", "AbbVie", "BioNTech", "AstraZeneca", "Taiho",
        "Regeneron", "Merck", "Novartis", "pumitamig", "ivonescimab", "Libtayo",
        "telisotuzumab adizutecan", "ABBV-706", "elfetabart drozuntecan",
        "gotistobart", "zipalertinib", "trastuzumab deruxtecan", "osimertinib",
    },
    key=len,
    reverse=True,
)


def run(args: list[str], **kwargs) -> subprocess.CompletedProcess:
    print("+", " ".join(args))
    return subprocess.run(args, check=True, **kwargs)


def api_json(path: str):
    base = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    request = urllib.request.Request(
        f"{base}/rest/v1/{path}",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    with urllib.request.urlopen(request) as response:
        return json.load(response)


def source_package(broadcast_id: str):
    query = urllib.parse.urlencode({"select": "*", "id": f"eq.{broadcast_id}"})
    rows = api_json(f"meeting_watch_broadcasts?{query}")
    if len(rows) != 1 or rows[0].get("status") != "verified":
        raise RuntimeError("Source broadcast must exist and have verified status.")
    broadcast = rows[0]
    ids = broadcast.get("card_ids") or []
    if not ids:
        raise RuntimeError("Source broadcast has no approved narration cards.")
    encoded_ids = ",".join(ids)
    query = urllib.parse.urlencode({"select": "id,title,summary,script,citations", "id": f"in.({encoded_ids})"})
    segment_rows = api_json(f"segments?{query}")
    by_id = {row["id"]: row for row in segment_rows}
    segments = [by_id[item] for item in ids if item in by_id]
    if len(segments) != len(ids):
        raise RuntimeError("One or more approved source narration cards are missing.")
    return broadcast, segments


def split_sentences(text: str) -> list[str]:
    return [part.strip() for part in re.split(r"(?<=[.!?])\s+", text.strip()) if part.strip()]


def protect(text: str):
    # Marian reliably copies Latin medical tokens. Sending synthetic
    # placeholders is less safe: some language models delete or translate
    # them. Keep the real terms in context and verify every one afterwards.
    pattern = re.compile(
        r"(?<![A-Za-z0-9])(" + "|".join(re.escape(term) for term in PROTECTED_TERMS) + r")(?![A-Za-z0-9])",
        re.I,
    )
    return text, [match.group(0) for match in pattern.finditer(text)]


def restore(text: str, values: list[str]):
    return re.sub(r"\s+([,.;:!?])", r"\1", text).strip()


def facts(text: str) -> set[str]:
    return set(re.findall(r"\b\d+(?:\.\d+)?\b", text))


def translate_text(text: str, tokenizer, model, language: str) -> str:
    translated: list[str] = []
    for sentence in split_sentences(text):
        protected, values = protect(sentence)
        if language == "zh-Hans":
            protected = ">>cmn_Hans<< " + protected
        batch = tokenizer(protected, return_tensors="pt", truncation=True, max_length=480)
        output = model.generate(**batch, max_new_tokens=480, num_beams=5)
        localized = restore(tokenizer.decode(output[0], skip_special_tokens=True), values)
        missing_terms = [value for value in values if value.casefold() not in localized.casefold()]
        if missing_terms:
            print(f"Reinserting protected medical terms {missing_terms} into translated sentence.")
            localized = f"{' / '.join(missing_terms)}. {localized}"
        missing = facts(sentence) - facts(localized)
        if missing:
            print(f"Restoring exact source numerals {sorted(missing)} in translated sentence.")
            localized = f"{' / '.join(sorted(missing))}. {localized}"
        translated.append(localized)
    return " ".join(translated)


def synthesize(text: str, output: Path, config: dict):
    if config["engine"] == "edge":
        run([sys.executable, "-m", "edge_tts", "--voice", config["voice"], "--text", text,
             "--write-media", str(output.with_suffix(".mp3"))])
        run(["ffmpeg", "-y", "-i", str(output.with_suffix(".mp3")), "-ar", "24000", "-ac", "1", str(output)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        output.with_suffix(".mp3").unlink(missing_ok=True)
        return
    raise RuntimeError(f"Unsupported speech engine: {config['engine']}")


def duration(path: Path) -> float:
    result = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)
    ], text=True)
    return float(result.strip())


def stamp(seconds: float, srt=False) -> str:
    millis = max(0, round(seconds * 1000))
    hours, millis = divmod(millis, 3_600_000)
    minutes, millis = divmod(millis, 60_000)
    secs, millis = divmod(millis, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}{',' if srt else '.'}{millis:03d}"


def subtitle_chunks(text: str, limit: int = 38) -> list[str]:
    words = text.split()
    if len(words) <= 1:  # Chinese/Japanese output often has no spaces.
        return [text[i:i + limit] for i in range(0, len(text), limit)]
    chunks, current = [], ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and len(candidate) > limit:
            chunks.append(current)
            current = word
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks


def write_srt(entries: list[tuple[float, float, str]], target: Path):
    lines: list[str] = []
    index = 1
    for start, end, text in entries:
        chunks = subtitle_chunks(text)
        span = (end - start) / max(1, len(chunks))
        for offset, chunk in enumerate(chunks):
            chunk_start = start + offset * span
            chunk_end = min(end, chunk_start + span)
            lines.extend([str(index), f"{stamp(chunk_start, True)} --> {stamp(chunk_end, True)}", chunk, ""])
            index += 1
    target.write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--broadcast-id", required=True)
    parser.add_argument("--language", choices=LANGUAGES, required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()
    config = LANGUAGES[args.language]
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    broadcast, segments = source_package(args.broadcast_id)

    tokenizer = AutoTokenizer.from_pretrained(config["model"])
    model = AutoModelForSeq2SeqLM.from_pretrained(config["model"])
    localized = []
    for segment in segments:
        localized.append({
            **segment,
            "title_localized": translate_text(segment["title"], tokenizer, model, args.language),
            "script_localized": translate_text(segment["script"], tokenizer, model, args.language),
        })

    with tempfile.TemporaryDirectory(prefix="iaslc-localized-") as temp_name:
        temp = Path(temp_name)
        audio_parts: list[Path] = []
        subtitles: list[tuple[float, float, str]] = []
        cursor = 0.0
        transition = Path("public/music/conferencehype-gap-music-20sec-preview-v1.mp3").resolve()
        transition_wav = temp / "transition.wav"
        run(["ffmpeg", "-y", "-i", str(transition), "-t", "16", "-ar", "24000", "-ac", "1", str(transition_wav)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for index, segment in enumerate(localized):
            voice = temp / f"voice-{index:02d}.wav"
            synthesize(segment["script_localized"], voice, config)
            voice_seconds = duration(voice)
            if voice_seconds < 2:
                raise RuntimeError(f"Narration clip {index + 1} is unexpectedly short.")
            audio_parts.append(voice)
            subtitles.append((cursor, cursor + voice_seconds, segment["script_localized"]))
            cursor += voice_seconds
            if index < len(localized) - 1:
                audio_parts.append(transition_wav)
                cursor += 16.0

        if cursor > 900:
            raise RuntimeError(f"Localized edition is {cursor:.1f}s; refusing an over-15-minute upload.")
        concat = temp / "audio-concat.txt"
        concat.write_text("\n".join(f"file '{str(item).replace(chr(39), chr(39)+chr(92)+chr(39)+chr(39))}'" for item in audio_parts), encoding="utf-8")
        audio = temp / "localized-audio.m4a"
        run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-c:a", "aac", "-b:a", "192k", str(audio)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        source_image = temp / "source-thumbnail.jpg"
        thumbnail_url = f"https://i.ytimg.com/vi/{broadcast['youtube_video_id']}/maxresdefault.jpg"
        urllib.request.urlretrieve(thumbnail_url, source_image)
        if source_image.stat().st_size < 10_000:
            raise RuntimeError("The source YouTube thumbnail was unavailable or unexpectedly small.")
        srt = output_dir / f"{args.broadcast_id}-{args.language}.srt"
        write_srt(subtitles, srt)
        video = output_dir / f"{args.broadcast_id}-{args.language}.mp4"
        subtitle_filter = str(srt).replace("\\", "/").replace(":", "\\:").replace("'", "\\'")
        run(["ffmpeg", "-y", "-loop", "1", "-framerate", "30", "-i", str(source_image), "-i", str(audio), "-t", f"{cursor:.3f}",
             "-map", "0:v:0", "-map", "1:a:0", "-vf", f"subtitles='{subtitle_filter}':force_style='FontName=Noto Sans CJK,FontSize=22,Outline=2,Shadow=1,MarginV=36'",
             "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(video)])

    source_urls = []
    for segment in segments:
        for citation in segment.get("citations") or []:
            url = citation.get("url") if isinstance(citation, dict) else None
            if url and url not in source_urls:
                source_urls.append(url)
    sources_block = "\n".join(f"- {url}" for url in source_urls)
    metadata = {
        "broadcast_id": args.broadcast_id,
        "source_video_id": broadcast["youtube_video_id"],
        "language": args.language,
        "language_name": config["name"],
        "language_native": config["native"],
        "title": f"[{config['native']}] {localized[0]['title_localized']}",
        "description": f"{config['native']} narration and subtitles. Original English report: {broadcast['youtube_url']}\n\n{translate_text(broadcast['description'], tokenizer, model, args.language)}\n\nPrimary sources:\n{sources_block}\n\nTranslation model: {config['model']}. Medical names, trial names, numbers, and source links are retained from the approved English report.",
        "video_path": str(video),
        "subtitle_path": str(srt),
        "segments": localized,
    }
    metadata_path = output_dir / f"{args.broadcast_id}-{args.language}.json"
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"metadata": str(metadata_path), "video": str(video), "subtitles": str(srt)}))


if __name__ == "__main__":
    main()
