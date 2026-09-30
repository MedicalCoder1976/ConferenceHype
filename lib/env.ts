import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.string().url().optional(),
  LLM_MODEL: z.string().default("grok-4.20-0309-non-reasoning"),
  VOICE_API_URL: z.string().url().optional(),
  // Deliberately separate from LLM_API_KEY, which points at a Grok-compatible
  // endpoint (see LLM_MODEL's default), not real OpenAI -- Korean TTS needs
  // OpenAI's actual /v1/audio/speech endpoint, so this must be a genuine
  // OpenAI API key.
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_TTS_KOREAN_VOICE: z.string().default("onyx"),
  X_BEARER_TOKEN: z.string().optional(),
  X_API_KEY: z.string().optional(),
  X_API_SECRET: z.string().optional(),
  X_ACCESS_TOKEN: z.string().optional(),
  X_ACCESS_TOKEN_SECRET: z.string().optional(),
  YOUTUBE_RTMP_URL: z.string().optional(),
  YOUTUBE_STREAM_KEY: z.string().optional(),
  GITHUB_DISPATCH_TOKEN: z.string().optional(),
  GITHUB_DISPATCH_REPO: z.string().default("MedicalCoder1976/ConferenceHype"),
  ADMIN_SHARED_SECRET: z.string().optional(),
  JUDGE_ADMIN_SHARED_SECRET: z.string().optional(),
  NEXT_PUBLIC_YOUTUBE_VIDEO_ID: z.string().optional(),
  NEXT_PUBLIC_HLS_URL: z.string().optional()
});

export const env = envSchema.parse(process.env);

export function hasSupabase() {
  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL &&
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      env.SUPABASE_SERVICE_ROLE_KEY
  );
}
