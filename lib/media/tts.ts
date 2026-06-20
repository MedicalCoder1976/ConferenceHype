import { spawn } from "node:child_process";
import { rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { env } from "@/lib/env";
import type { Persona } from "@/lib/types";

// Convert Roman numerals to digits so TTS doesn't read "eye-eye-eye" instead of "three".
// Context-aware for Stage/Phase/Type/Grade/Arm/Line (catches I–XII after those words).
// Safe standalone replacements for multi-char forms that have no other meaning (II, III,
// VI, VII, VIII, IX). Leaves standalone I (pronoun), IV (intravenous), V, X alone.
function expandRomanNumerals(text: string): string {
  const contextWords = "stage|phase|type|grade|arm|line|tier|class|part";
  const romanMap: Record<string, string> = {
    XII: "12", XI: "11", X: "10", IX: "9", VIII: "8",
    VII: "7", VI: "6", V: "5", IV: "4", III: "3", II: "2", I: "1"
  };
  // After a context word: replace I–XII
  let out = text.replace(
    new RegExp(`\\b(${contextWords})\\s+(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)\\b`, "gi"),
    (_m, prefix: string, roman: string) => `${prefix} ${romanMap[roman.toUpperCase()]}`
  );
  // Standalone multi-char Roman numerals that are unambiguous
  out = out
    .replace(/\bXII\b/g, "12")
    .replace(/\bXI\b/g, "11")
    .replace(/\bVIII\b/g, "8")
    .replace(/\bVII\b/g, "7")
    .replace(/\bVI\b/g, "6")
    .replace(/\bIX\b/g, "9")
    .replace(/\bIII\b/g, "3")
    .replace(/\bII\b/g, "2");
  return out;
}

export function applySpokenPronunciations(script: string) {
  return expandRomanNumerals(script)
    // Rule 1: strip URLs — TTS would read out raw links character-by-character
    .replace(/https?:\/\/[^\s)\]}>]+/g, "")
    .replace(/\bwww\.\S+/g, "")
    // Rule 3: strip internal process labels that sneak into scripts
    .replace(/\boperator[- ](?:added|selected)\b[^.!?\n]*/gi, "")
    .replace(/\bsource[- ]only\s+schedule\b[^.!?\n]*(?:[.!?]|\n|$)/gi, "")
    .replace(/\bcheck(?:ing)?\s+using\s+official\s+meeting\s+sources\b[^.!?\n]*(?:[.!?]|\n|$)/gi, "")
    .replace(/\bofficial\s+source\s+desk\s+is\s+monitoring\b[^.!?\n]*(?:[.!?]|\n|$)/gi, "")
    .replace(/\bConference\s*Hype\s+ASCO\s+energy\s+all\s+day\s+long\b[.!?]?\s*/gi, "")
    .replace(/\bmonitored\s+X\s+(?:voice|narrative|voices)\b/gi, "")
    .replace(/\bsource[- ]backed\s+\w+\s+narrative\b/gi, "")
    .replace(/\bapproved\s+for\s+broadcast\b/gi, "")
    .replace(/\baudience\s+tip\b/gi, "")
    // Rule 4: ≈ → "approximately"
    .replace(/≈/g, "approximately")
    // Rule 6: @ and # in social posts — drop @ entirely, keep hashtag word
    .replace(/@\w{1,15}/g, "")
    .replace(/#(\w+)/g, "$1")
    // Punctuation: replace colons (not in time like 9:30) with a pause comma
    .replace(/(?<!\d):(?!\d{2})/g, ",")
    // Em dashes and en dashes → natural pause
    .replace(/\s*[—–]\s*/g, ", ")
    // Bullet points → sentence break
    .replace(/[•·]\s*/g, ". ")
    // Remove brackets and parentheses (often contain meta info like citations)
    .replace(/\[[^\]]{1,80}\]/g, "")
    .replace(/\([^)]{1,80}\)/g, "")
    // Percent sign → "percent"
    .replace(/(\d)\s*%/g, "$1 percent")
    .replace(/\bASCO\b/g, "Ask-ho")
    .replace(/\bIb\b/g, "one B")
    .replace(/\b1b\b/gi, "one B")
    // Clean up stray commas and double spaces left behind
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function runProcess(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "pipe" });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `${path.basename(command)} exited with code ${code}: ${stderr.slice(0, 300)}`
          )
        );
      }
    });
  });
}

export async function synthesizeSpeech({
  script,
  persona
}: {
  script: string;
  persona: Persona;
}) {
  const voiceName = process.env[persona.voiceEnvKey];
  if (!voiceName) {
    return {
      provider: "skipped",
      audioPath: null,
      note: `TTS skipped — set ${persona.voiceEnvKey} to a Kokoro voice ID (e.g. am_fenrir).`
    };
  }

  const processedScript = applySpokenPronunciations(script);

  // HTTP mode — if VOICE_API_URL is set, call a hosted Kokoro FastAPI endpoint
  if (env.VOICE_API_URL) {
    const response = await fetch(`${env.VOICE_API_URL}/v1/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "kokoro",
        input: processedScript,
        voice: voiceName,
        response_format: "mp3"
      })
    });
    if (!response.ok) {
      throw new Error(`Kokoro TTS failed: ${response.status} ${await response.text()}`);
    }
    return {
      provider: "kokoro-http",
      audioBuffer: Buffer.from(await response.arrayBuffer()),
      note: "Audio generated by Kokoro (HTTP)."
    };
  }

  // Local Python mode — spawn scripts/generate-kokoro-dj-voice.py directly.
  // Requires: pip install kokoro numpy soundfile
  // Voice IDs: am_fenrir, af_heart, af_bella, am_michael, bm_lewis, af_sarah, am_echo, am_adam
  const tempId = `kokoro-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tempWav = path.join(tmpdir(), `${tempId}.wav`);
  const tempMp3 = path.join(tmpdir(), `${tempId}.mp3`);
  const pyScript = path.resolve("scripts/generate-kokoro-dj-voice.py");
  const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";

  // KOKORO_PYTHON_CMD overrides auto-detection.
  // Default: "py -3.12" on Windows, "python3" on Linux/macOS.
  const rawPyCmd = process.env.KOKORO_PYTHON_CMD;
  const [pyCmd, ...pyPrefix] = rawPyCmd
    ? rawPyCmd.split(/\s+/)
    : process.platform === "win32"
      ? ["py", "-3.12"]
      : ["python3"];

  try {
    await runProcess(pyCmd, [
      ...pyPrefix,
      pyScript,
      "--mode",
      "stinger",
      "--voice",
      voiceName,
      "--output",
      tempWav,
      "--text",
      processedScript
    ]);

    // Convert WAV → MP3 with FFmpeg
    await runProcess(ffmpeg, [
      "-y",
      "-i",
      tempWav,
      "-c:a",
      "libmp3lame",
      "-b:a",
      "128k",
      tempMp3
    ]);

    const audioBuffer = await readFile(tempMp3);
    return {
      provider: "kokoro-local",
      audioBuffer,
      note: "Audio generated by local Kokoro Python library."
    };
  } finally {
    await Promise.all([
      rm(tempWav, { force: true }).catch(() => {}),
      rm(tempMp3, { force: true }).catch(() => {})
    ]);
  }
}
