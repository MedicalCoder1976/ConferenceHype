import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { buildReporterPrompt } from "@/lib/generation/prompts";
import { getPersona } from "@/lib/generation/personas";
import { withSpokenDisclaimer } from "@/lib/generation/disclaimers";
import { applySpokenPronunciations } from "@/lib/media/tts";
import type { HypeLevel, IngestedItem, Segment } from "@/lib/types";

type GeneratedCitation = string | { label?: string; url?: string };

function normalizeGeneratedCitations(
  items: GeneratedCitation[] | undefined,
  sourceType: Segment["citations"][number]["sourceType"]
) {
  return (items ?? [])
    .map((item) => {
      if (typeof item === "string") {
        return {
          label: item,
          url: "",
          sourceType
        };
      }
      return {
        label: item.label ?? "Generated source",
        url: item.url ?? "",
        sourceType
      };
    })
    .filter((item) => item.label.trim().length > 0);
}

export async function generateSegmentFromSources({
  sources,
  personaId = "echo-sage",
  language = "English",
  hypeLevel = "standard",
  contentType,
  editorialInstruction,
  status
}: {
  sources: IngestedItem[];
  personaId?: string;
  language?: string;
  hypeLevel?: HypeLevel;
  contentType?: Segment["contentType"];
  editorialInstruction?: string;
  status?: Segment["status"];
}): Promise<Segment> {
  const persona = getPersona(personaId);
  const social = sources.some((source) => source.sourceType.includes("social"));
  const resolvedContentType = contentType ?? (social ? "social_signal" : "media_roundup");
  const citationSourceType =
    social && status === "approved" ? "verified_social" : social ? "general_social" : "media";

  if (!env.LLM_API_KEY) {
    throw new Error(
      "Real script generation is required, but LLM_API_KEY is not configured."
    );
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
    citations?: GeneratedCitation[];
    social_buzz_items?: GeneratedCitation[];
    risk_flags?: string[];
  };
  if (!parsed.script?.trim()) {
    throw new Error("LLM returned no real script content.");
  }

  return {
    id: `draft-${randomUUID()}`,
    title: parsed.title ?? "Generated ASCO Hype segment",
    summary: parsed.summary ?? "Generated reporter-style segment for review.",
    script: withSpokenDisclaimer(applySpokenPronunciations(parsed.script ?? "")),
    contentType: resolvedContentType,
    personaId: persona.id,
    personaName: persona.name,
    hypeLevel,
    language,
    status: status ?? "pending_review",
    citations: normalizeGeneratedCitations(
      parsed.citations,
      citationSourceType
    ),
    socialBuzzItems: normalizeGeneratedCitations(
      parsed.social_buzz_items,
      citationSourceType
    ),
    riskFlags: parsed.risk_flags ?? [],
    confidenceScore: social ? 76 : 88,
    createdAt: new Date().toISOString()
  };
}
