import { env } from "@/lib/env";
import type { Persona } from "@/lib/types";

export async function synthesizeSpeech({
  script,
  persona
}: {
  script: string;
  persona: Persona;
}) {
  const voiceId = process.env[persona.voiceEnvKey];
  if (!env.ELEVENLABS_API_KEY || !voiceId) {
    return {
      provider: "mock",
      audioPath: null,
      note:
        "TTS skipped. Configure ELEVENLABS_API_KEY and persona voice environment variables."
    };
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: script,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.28,
          similarity_boost: 0.8,
          style: 0.82,
          use_speaker_boost: true
        }
      })
    }
  );
  if (!response.ok) {
    throw new Error(`ElevenLabs TTS failed: ${response.status}`);
  }
  return {
    provider: "elevenlabs",
    audioBuffer: Buffer.from(await response.arrayBuffer()),
    note: "Audio generated. Worker should persist it to storage."
  };
}
