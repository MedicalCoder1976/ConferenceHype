import OpenAI from "openai";
import { createHash, randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { getPersona } from "@/lib/generation/personas";
import { getUnsafeGeneratedSourceErrors } from "@/lib/generation/sourceSafety";
import type {
  EditorialPackage,
  EditorialPackageSection,
  IngestedItem,
  MedicalConference,
  OncologyJournal,
  Segment
} from "@/lib/types";

const CARDS_PER_SECTION = 15;

const sectionNames = {
  journal_watch: [
    "Issue Headlines",
    "Study Designs and Findings",
    "Context and Limitations",
    "Editorials, Correspondence, and What to Watch"
  ],
  meeting_watch: [
    "Abstract Watch",
    "Exhibition Booths and Industry Floor",
    "Conference and Social Chatter",
    "Media Watch"
  ]
} as const;

export function journalEditionKey(items: IngestedItem[]) {
  const latest = items
    .map((item) => item.publishedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  return latest ? String(latest).slice(0, 10) : createHash("sha256")
    .update(items.map((item) => item.url).join("|"))
    .digest("hex")
    .slice(0, 16);
}

async function generateSection({
  category,
  subjectName,
  sectionTitle,
  sources,
  sectionIndex
}: {
  category: EditorialPackage["category"];
  subjectName: string;
  sectionTitle: string;
  sources: IngestedItem[];
  sectionIndex: number;
}): Promise<EditorialPackageSection> {
  if (!env.LLM_API_KEY) {
    throw new Error("LLM_API_KEY is required to develop an editorial package.");
  }
  const client = new OpenAI({ apiKey: env.LLM_API_KEY, baseURL: env.LLM_BASE_URL });
  const sourceText = sources.slice(0, 20).map((source, index) =>
    `${index + 1}. ${source.title}\nSource: ${source.sourceName}\nURL: ${source.url}\nExcerpt: ${source.excerpt}`
  ).join("\n\n");
  const response = await client.chat.completions.create({
    model: env.LLM_MODEL,
    messages: [{
      role: "user",
      content: `Create section ${sectionIndex + 1} of a ConferenceHype ${category === "journal_watch" ? "Journal Watch" : "Meeting Watch"} program about ${subjectName}.

Section: ${sectionTitle}
Return exactly ${CARDS_PER_SECTION} distinct cards. Each card is fresh, source-attributed spoken copy of about 70-85 words. Use only supplied facts. Do not invent people, results, quotes, booth activity, reactions, or clinical significance. Do not give medical advice. Do not recite article titles and do not copy long phrases from titles or excerpts; describe the source in new sentence structure. For conference chatter, clearly distinguish official information, media reporting, and attributed social posts. For exhibition content, discuss a booth or company only when present in a supplied source.

Return JSON: {"cards":[{"title":"...","script":"...","sourceIndex":1,"contentType":"media_roundup"}]}
Allowed contentType values: abstract_buzz, media_roundup, social_signal, industry_floor.

Sources:
${sourceText}`
    }],
    response_format: { type: "json_object" },
    temperature: 0.45
  });
  const parsed = JSON.parse(response.choices[0]?.message.content ?? "{}") as {
    cards?: Array<{
      title?: string;
      script?: string;
      sourceIndex?: number;
      contentType?: Segment["contentType"];
    }>;
  };
  const cards = (parsed.cards ?? []).slice(0, CARDS_PER_SECTION).map((card, index) => {
    const source = sources[Math.max(0, Math.min(sources.length - 1, (card.sourceIndex ?? 1) - 1))];
    const script = card.script?.trim() ?? "";
    if (!source || !script) {
      throw new Error(`${sectionTitle} returned an incomplete card.`);
    }
    const safetyErrors = getUnsafeGeneratedSourceErrors({
      segment: { title: card.title ?? sectionTitle, summary: "", script },
      sources: [source]
    });
    if (safetyErrors.length) {
      throw new Error(`${sectionTitle} card ${index + 1} failed source safety: ${safetyErrors.join(" ")}`);
    }
    const persona = getPersona(index % 2 === 0 ? "echo-sage" : category === "journal_watch" ? "sage-harlan" : "vesper-quill");
    return {
      title: card.title?.trim() || `${sectionTitle} update ${index + 1}`,
      script,
      citationLabel: `${source.sourceName}: ${source.title}`,
      citationUrl: source.url,
      contentType: card.contentType ?? "media_roundup",
      personaId: persona.id
    };
  });
  if (cards.length !== CARDS_PER_SECTION) {
    throw new Error(`${sectionTitle} returned ${cards.length} cards; ${CARDS_PER_SECTION} are required.`);
  }
  return { title: sectionTitle, cards };
}

export async function developJournalWatchPackage(
  journal: OncologyJournal,
  items: IngestedItem[]
) {
  if (!items.length) throw new Error(`No current RSS items were found for ${journal.name}.`);
  const key = `${journal.id}:${journalEditionKey(items)}`;
  const sections = await Promise.all(
    sectionNames.journal_watch.map((title, index) =>
      generateSection({
        category: "journal_watch",
        subjectName: journal.name,
        sectionTitle: title,
        sources: items,
        sectionIndex: index
      })
    )
  );
  return {
    category: "journal_watch",
    title: `Journal Watch: ${journal.name}`,
    subjectName: journal.name,
    editionKey: key,
    sourceUrl: journal.officialUrl,
    eventDate: items[0]?.publishedAt?.slice(0, 10),
    introScript: `Hi this is the ConferenceHype channel Journal Watch focussing on ${journal.name}.`,
    sections,
    status: "memory"
  } satisfies Omit<EditorialPackage, "id" | "createdAt">;
}

export async function developMeetingWatchPackage(
  conference: MedicalConference,
  items: IngestedItem[]
) {
  if (!items.length) throw new Error(`No source material was found for ${conference.name}.`);
  const date = conference.startDate ?? `${conference.year}-${String(conference.month).padStart(2, "0")}-01`;
  const sourceGroups = [
    items.filter((item) => /\b(abstract|poster|oral session|trial|study|scientific program)\b/i.test(`${item.title} ${item.excerpt}`)),
    items.filter((item) => /\b(exhibit|exhibition|exhibitor|booth|industry floor|company showcase)\b/i.test(`${item.title} ${item.excerpt}`)),
    items.filter((item) => item.sourceType.includes("social") || /\b(chatter|reaction|discussion|posted)\b/i.test(`${item.title} ${item.excerpt}`)),
    items.filter((item) => item.sourceType === "media")
  ];
  const missing = sectionNames.meeting_watch.filter((_, index) => sourceGroups[index].length === 0);
  if (missing.length) {
    throw new Error(
      `Meeting Watch needs matching source material for: ${missing.join(", ")}. Add official, media, or attributed social sources before developing the package.`
    );
  }
  const sections = await Promise.all(
    sectionNames.meeting_watch.map((title, index) =>
      generateSection({
        category: "meeting_watch",
        subjectName: conference.name,
        sectionTitle: title,
        sources: sourceGroups[index],
        sectionIndex: index
      })
    )
  );
  return {
    category: "meeting_watch",
    title: `Meeting Watch: ${conference.name}`,
    subjectName: conference.name,
    editionKey: `${conference.id}:${date}`,
    sourceUrl: conference.officialUrl,
    eventDate: date,
    introScript: `Hi this is the ConferenceHype channel Meeting Watch on ${conference.name} and date ${date}.`,
    sections,
    status: "memory"
  } satisfies Omit<EditorialPackage, "id" | "createdAt">;
}

export function packageToScheduledSegments(
  editorialPackage: EditorialPackage,
  startsAt: Date
): Segment[] {
  const cards = editorialPackage.sections.flatMap((section) => section.cards);
  return cards.map((card, index) => {
    const persona = getPersona(card.personaId);
    const approvedAt = new Date(startsAt.getTime() + index * 60_000).toISOString();
    return {
      id: `package-${randomUUID()}`,
      title: `${editorialPackage.title}: ${card.title}`,
      summary: `${editorialPackage.category === "journal_watch" ? "Journal Watch" : "Meeting Watch"} package card ${index + 1} of ${cards.length}.`,
      script: index === 0 ? `${editorialPackage.introScript} ${card.script}` : card.script,
      contentType: card.contentType,
      personaId: persona.id,
      personaName: persona.name,
      hypeLevel: "standard",
      language: "English",
      status: "approved",
      citations: [{
        label: card.citationLabel,
        url: card.citationUrl,
        sourceType: "media"
      }],
      socialBuzzItems: [],
      riskFlags: [
        "editorial_package",
        editorialPackage.category,
        `package:${editorialPackage.id}`,
        "genuine_source_rewrite"
      ],
      confidenceScore: 88,
      createdAt: new Date().toISOString(),
      approvedAt
    };
  });
}
