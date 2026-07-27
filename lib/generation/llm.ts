import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { buildReporterPrompt } from "@/lib/generation/prompts";
import { getPersona } from "@/lib/generation/personas";
import { withSpokenDisclaimer } from "@/lib/generation/disclaimers";
import { getUnsafeGeneratedSourceErrors } from "@/lib/generation/sourceSafety";
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

  const segment = {
    id: `draft-${randomUUID()}`,
    title: parsed.title ?? "Generated ConferenceHype segment",
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
    riskFlags: Array.from(new Set([...(parsed.risk_flags ?? []), "genuine_source_rewrite"])),
    confidenceScore: social ? 76 : 88,
    createdAt: new Date().toISOString()
  };
  const safetyErrors = getUnsafeGeneratedSourceErrors({ segment, sources });
  if (safetyErrors.length > 0) {
    throw new Error(`Unsafe generated segment blocked: ${safetyErrors.join(" ")}`);
  }
  return segment;
}

// One real source (e.g. a single meeting-highlights article) can legitimately
// support several distinct short cards -- one on design/population, one on
// the primary result, one on safety/implication -- as long as every fact
// used is actually present in the source excerpt. This is a sibling to
// generateSegmentFromSources (which always returns exactly one longer
// segment): here the caller asks for cardCount short (~75s) cards from a
// single source in one LLM call, mirroring the one-call-returns-many-cards
// shape already used by lib/editorial/packages.ts's generateSection, but
// scoped to one source instead of a pooled section.
export async function generateCardsFromSource({
  source,
  cardCount,
  meetingLabel,
  personaId = "echo-sage"
}: {
  source: IngestedItem;
  cardCount: number;
  meetingLabel: string;
  personaId?: string;
}): Promise<Segment[]> {
  if (!env.LLM_API_KEY) {
    throw new Error("Real script generation is required, but LLM_API_KEY is not configured.");
  }
  const persona = getPersona(personaId);
  const client = new OpenAI({ apiKey: env.LLM_API_KEY, baseURL: env.LLM_BASE_URL });
  const response = await client.chat.completions.create({
    model: env.LLM_MODEL,
    messages: [{
      role: "user",
      content: `Create exactly ${cardCount} distinct spoken cards for a ConferenceHype Meeting Watch broadcast on ${meetingLabel}, all from this single source article. Each card is fresh, source-attributed spoken copy of about 70-85 words, covering a genuinely different fact from the source (e.g. one on trial design/population, one on the primary efficacy result with real numbers, one on safety or clinical implication) -- never repeat the same fact across two cards. Use only facts stated in the source below. Do not invent numbers, quotes, investigator names, or clinical significance not present in the source. Do not give medical advice. Do not copy long phrases verbatim from the source -- rewrite in new sentence structure for spoken narration.

Return JSON: {"cards":[{"title":"...","script":"..."}]}

Source:
Title: ${source.title}
Byline/source: ${source.sourceName}${source.author ? ` (${source.author})` : ""}
URL: ${source.url}
Facts: ${source.excerpt}`
    }],
    response_format: { type: "json_object" },
    temperature: 0.35
  });
  const parsed = JSON.parse(response.choices[0]?.message.content ?? "{}") as {
    cards?: Array<{ title?: string; script?: string }>;
  };
  const cards = (parsed.cards ?? []).slice(0, cardCount);
  if (cards.length !== cardCount) {
    throw new Error(`Expected ${cardCount} cards for "${source.title}" but got ${cards.length}.`);
  }
  return cards.map((card, index) => {
    const script = card.script?.trim();
    if (!script) {
      throw new Error(`Card ${index + 1} for "${source.title}" returned no script.`);
    }
    const segment = {
      id: `draft-${randomUUID()}`,
      title: card.title?.trim() || `${source.title} - card ${index + 1}`,
      summary: script,
      script: withSpokenDisclaimer(applySpokenPronunciations(script)),
      contentType: "media_roundup" as const,
      personaId: persona.id,
      personaName: persona.name,
      hypeLevel: "standard" as const,
      language: "English",
      status: "pending_review" as const,
      citations: [{ label: `${source.sourceName}: ${source.title}`, url: source.url, sourceType: source.sourceType }],
      socialBuzzItems: [],
      riskFlags: ["meeting_watch", "genuine_source_rewrite"],
      confidenceScore: 88,
      createdAt: new Date().toISOString()
    };
    const safetyErrors = getUnsafeGeneratedSourceErrors({ segment, sources: [source] });
    if (safetyErrors.length > 0) {
      throw new Error(`Unsafe generated card blocked for "${source.title}": ${safetyErrors.join(" ")}`);
    }
    return segment;
  });
}
