import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { buildReporterPrompt } from "@/lib/generation/prompts";
import { getPersona } from "@/lib/generation/personas";
import { withSpokenDisclaimer } from "@/lib/generation/disclaimers";
import type { HypeLevel, IngestedItem, Segment } from "@/lib/types";

export async function generateSegmentFromSources({
  sources,
  personaId = "echo-sage",
  language = "English",
  hypeLevel = "standard",
  contentType,
  editorialInstruction
}: {
  sources: IngestedItem[];
  personaId?: string;
  language?: string;
  hypeLevel?: HypeLevel;
  contentType?: Segment["contentType"];
  editorialInstruction?: string;
}): Promise<Segment> {
  const persona = getPersona(personaId);
  const social = sources.some((source) => source.sourceType.includes("social"));
  const resolvedContentType = contentType ?? (social ? "social_signal" : "media_roundup");

  if (!env.LLM_API_KEY) {
    return {
      id: `draft-${randomUUID()}`,
      title: social
        ? "Tagged social buzz enters the ASCO Hype desk"
        : "ASCO Hype source roundup is ready for review",
      summary:
        "Mock generation is active because no LLM_API_KEY is configured. Add a key to generate full reporter scripts.",
      script: withSpokenDisclaimer(
        `The ${persona.name} desk is tracking ${sources.length} source items. ${
          social
            ? "Audience posts tagged to ASCO Hype are being treated as social buzz until reviewed."
            : "Official and media sources are being ranked ahead of general chatter."
        }`
      ),
      contentType: resolvedContentType,
      personaId: persona.id,
      personaName: persona.name,
      hypeLevel,
      language,
      status: "pending_review",
      citations: sources.slice(0, 4).map((source) => ({
        label: source.sourceName,
        url: source.url,
        sourceType: source.sourceType
      })),
      socialBuzzItems: sources
        .filter((source) => source.sourceType.includes("social"))
        .map((source) => ({
          label: source.title,
          url: source.url,
          sourceType: source.sourceType
        })),
      riskFlags: social ? ["social_buzz_requires_review"] : [],
      confidenceScore: social ? 76 : 86,
      createdAt: new Date().toISOString()
    };
  }

  const client = new OpenAI({
    apiKey: env.LLM_API_KEY,
    baseURL: env.LLM_BASE_URL
  });
  const prompt = buildReporterPrompt({
    persona,
    sources,
    language,
    hypeLevel,
    editorialInstruction
  });
  const response = await client.chat.completions.create({
    model: env.LLM_MODEL,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: hypeLevel === "high_energy" ? 0.75 : 0.45
  });
  const raw = response.choices[0]?.message.content ?? "{}";
  const parsed = JSON.parse(raw) as {
    title?: string;
    summary?: string;
    script?: string;
    citations?: Array<{ label: string; url: string }>;
    social_buzz_items?: Array<{ label: string; url: string }>;
    risk_flags?: string[];
  };

  return {
    id: `draft-${randomUUID()}`,
    title: parsed.title ?? "Generated ASCO Hype segment",
    summary: parsed.summary ?? "Generated reporter-style segment for review.",
    script: withSpokenDisclaimer(parsed.script ?? ""),
    contentType: resolvedContentType,
    personaId: persona.id,
    personaName: persona.name,
    hypeLevel,
    language,
    status: "pending_review",
    citations: (parsed.citations ?? []).map((citation) => ({
      ...citation,
      sourceType: social ? "general_social" : "media"
    })),
    socialBuzzItems: (parsed.social_buzz_items ?? []).map((item) => ({
      ...item,
      sourceType: "general_social"
    })),
    riskFlags: parsed.risk_flags ?? [],
    confidenceScore: social ? 76 : 88,
    createdAt: new Date().toISOString()
  };
}
