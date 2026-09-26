"""Render reviewed Korean/Japanese copy with native narration and readable slides."""
import argparse
import asyncio
import hashlib
import json
import re
import subprocess
from pathlib import Path

import edge_tts
from PIL import Image, ImageDraw, ImageFont

VOICES = {"ko": "ko-KR-SunHiNeural", "ja": "ja-JP-NanamiNeural"}
LABELS = {"ko": "한국어 · 종양학", "ja": "日本語 · 腫瘍学"}
FONT = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"


def run(args):
    result = subprocess.run(["ffmpeg", "-hide_banner", "-y", *map(str, args)], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-4000:])
    return result.stderr


def wrap(text, size, width):
    font = ImageFont.truetype(FONT, size)
    lines, line = [], ""
    for char in text:
        if char == "\n" or (line and font.getlength(line + char) > width):
            lines.append(line.strip())
            line = "" if char == "\n" else char
        else:
            line += char
    if line.strip():
        lines.append(line.strip())
    return lines


def slide(title, body, language, output, footer):
    image = Image.new("RGB", (1280, 720), "#101721")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1280, 9), fill="#ef5449")
    draw.text((55, 30), f"CONFERENCEHYPE / {LABELS[language]}", font=ImageFont.truetype(FONT, 25), fill="#59c6cf")
    title_lines = wrap(title, 37, 1170)
    if len(title_lines) > 3:
        raise ValueError("Slide heading exceeds three lines")
    for index, line in enumerate(title_lines):
        draw.text((55, 85 + index * 46), line, font=ImageFont.truetype(FONT, 37), fill="#efbb53")
    for index, line in enumerate(body):
        draw.text((55, 255 + index * 43), line, font=ImageFont.truetype(FONT, 29), fill="#f3f4f6")
    draw.line((55, 655, 1225, 655), fill="#364354", width=2)
    draw.text((55, 674), footer, font=ImageFont.truetype(FONT, 18), fill="#aab4c1")
    image.save(output)


def stamp(seconds):
    minutes, milliseconds = divmod(round(seconds * 1000), 60000)
    hours, minutes = divmod(minutes, 60)
    seconds, milliseconds = divmod(milliseconds, 1000)
    return f"{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}"


def thumbnail(title, language, output):
    image = Image.new("RGB", (1280, 720), "#101721")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1280, 14), fill="#ef5449")
    draw.text((60, 55), "CONFERENCEHYPE", font=ImageFont.truetype(FONT, 35), fill="#59c6cf")
    draw.text((60, 123), LABELS[language], font=ImageFont.truetype(FONT, 36), fill="#f3f4f6")
    lines = wrap(title, 64, 1150)
    if len(lines) > 4:
        raise ValueError("Thumbnail headline is too long")
    for index, line in enumerate(lines):
        draw.text((60, 230 + index * 87), line, font=ImageFont.truetype(FONT, 64), fill="#efbb53")
    draw.rectangle((0, 706, 1280, 720), fill="#59c6cf")
    image.save(output)


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--package", required=True)
    parser.add_argument("--language", choices=VOICES, required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    package_path = Path(args.package)
    package = json.loads(package_path.read_text(encoding="utf-8"))
    edition = package["editions"][args.language]
    if not edition.get("reviewed") or len(edition["segments"]) < 5:
        raise ValueError("A reviewed edition with all five stories is required")
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    segments = list(edition["segments"])
    engagement = json.loads((Path(__file__).resolve().parents[1] / "lib/broadcast/engagement.json").read_text(encoding="utf-8"))
    if edition.get("append_engagement", True):
        segments.append({"title": "ConferenceHype", "script": engagement[args.language]})
    parts, cues, quality = [], [], []
    cursor = 0.0
    for index, segment in enumerate(segments):
        if not segment["script"].strip():
            raise ValueError("Empty narration")
        pages, current = [], ""
        for sentence in re.split(r"(?<=[.!?。！？])\s+|(?<=[。！？])", segment["script"]):
            candidate = f"{current} {sentence}".strip()
            if current and len(wrap(candidate, 29, 1165)) > 8:
                pages.append(current)
                current = sentence
            else:
                current = candidate
        if current:
            pages.append(current)
        for page, text in enumerate(pages):
            body = wrap(text, 29, 1165)
            if len(body) > 8:
                raise ValueError("Narration sentence is too long for a slide")
            key = f"{index:02}-{page:03}"
            image, audio, clip = (output / f"{key}.{extension}" for extension in ["png", "mp3", "mp4"])
            slide(segment["title"], body, args.language, image, f"{edition.get('event', 'WCLC 2026')} | {index + 1}/{len(segments)} | {page + 1}/{len(pages)}")
            for attempt in range(3):
                try:
                    await edge_tts.Communicate(text, VOICES[args.language]).save(str(audio))
                    break
                except Exception:
                    if attempt == 2:
                        raise
                    await asyncio.sleep(3)
            seconds = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(audio)], text=True).strip())
            volume = run(["-i", audio, "-af", "volumedetect", "-f", "null", "-"])
            match = re.search(r"mean_volume: ([-\d.]+) dB", volume)
            if not match or float(match.group(1)) < -40 or seconds < 1 or audio.stat().st_size < 2000:
                raise ValueError(f"Missing or inaudible narration: {key}")
            run(["-loop", "1", "-framerate", "15", "-i", image, "-i", audio, "-t", seconds, "-c:v", "libx264", "-preset", "veryfast", "-tune", "stillimage", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-ar", "24000", "-ac", "1", clip])
            parts.append(clip)
            cues.append((cursor, cursor + seconds, text))
            quality.append({"page": key, "seconds": seconds, "mean_db": float(match.group(1)), "characters": len(text)})
            cursor += seconds
            print(f"Rendered {key}: {seconds:.1f}s", flush=True)
    if cursor > 7200:
        raise ValueError("Edition exceeds two-hour limit")
    concat = output / "concat.txt"
    concat.write_text("\n".join(f"file '{part.as_posix()}'" for part in parts), encoding="utf-8")
    video = output / "edition.mp4"
    run(["-f", "concat", "-safe", "0", "-i", concat, "-c", "copy", "-movflags", "+faststart", video])
    subtitles = output / "edition.srt"
    subtitles.write_text("\n\n".join(f"{i + 1}\n{stamp(start)} --> {stamp(end)}\n{text}" for i, (start, end, text) in enumerate(cues)) + "\n", encoding="utf-8")
    thumbnail(edition.get("thumbnail_title", edition["title"]), args.language, output / "thumbnail.png")
    metadata = {**edition, "language": args.language, "broadcast_id": package["broadcast_id"], "source_video_id": package["source_video_id"], "video_path": "edition.mp4", "subtitle_path": "edition.srt", "thumbnail_path": "thumbnail.png", "duration_seconds": cursor, "package_sha256": hashlib.sha256(package_path.read_bytes()).hexdigest(), "video_sha256": hashlib.sha256(video.read_bytes()).hexdigest(), "quality": {"narration_pages": quality, "music_windows": 0}}
    (output / "release.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Complete: {cursor:.1f} seconds, {len(parts)} narration pages", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
