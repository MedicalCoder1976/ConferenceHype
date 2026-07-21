import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.string().url().optional(),
  LLM_MODEL: z.string().default("grok-4.20-0309-non-reasoning"),
  VOICE_API_URL: z.string().url().optional(),
  X_BEARER_TOKEN: z.string().optional(),
  YOUTUBE_RTMP_URL: z.string().optional(),
  YOUTUBE_STREAM_KEY: z.string().optional(),
  GITHUB_DISPATCH_TOKEN: z.string().optional(),
  GITHUB_DISPATCH_REPO: z.string().default("lijosimpson/ConferenceHype"),
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
