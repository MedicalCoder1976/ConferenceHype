import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { buildRequiredSectionSummary } from "@/lib/segments/sectionSummary";
import { normalizeLegacySegment } from "@/lib/segments/normalizeLegacy";
import { fetchJournalArticleAbstract } from "@/lib/sources/rss";
import type { Citation, Segment } from "@/lib/types";

loadEnvConfig(process.cwd());

type SegmentRow = {
  id: string;
  title: string;
  summary: string;
  script: string;
  content_type: Segment["contentType"];
  persona_id: string;
  persona_name: string;
  hype_level: Segment["hypeLevel"];
  language: string;
  status: Segment["status"];
  citations: Citation[] | null;
  social_buzz_items: Citation[] | null;
  risk_flags: string[] | null;
  confidence_score: number;
  created_at: string;
  approved_at?: string | null;
  updated_at?: string | null;
};

const articleishPattern =
  /\b(article|abstract|journal|trial|study|results?|cohort|methods?|discussion|diagnosis|treatment|oncology|cancer|leukemia|lymphoma|myeloma|glioblastoma|carcinoma)\b/i;

function toSegment(row: SegmentRow): Segment {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    script: row.script,
    contentType: row.content_type,
    personaId: row.persona_id,
    personaName: row.persona_name,
    hypeLevel: row.hype_level,
    language: row.language,
    status: row.status,
    citations: row.citations ?? [],
    socialBuzzItems: row.social_buzz_items ?? [],
    riskFlags: row.risk_flags ?? [],
    confidenceScore: row.confidence_score,
    createdAt: row.created_at,
    approvedAt: row.approved_at ?? undefined,
    updatedAt: row.updated_at ?? undefined
  };
}

function isArticleCard(segment: Segment) {
  const text = `${segment.title} ${segment.summary} ${segment.script} ${segment.citations
    .map((citation) => citation.label)
    .join(" ")}`;
  return (
    segment.contentType === "abstract_buzz" ||
    segment.contentType === "media_roundup" ||
    articleishPattern.test(text)
  );
}

function isJournalCard(segment: Segment) {
  return /\b(journal|jama|lancet|nejm|nature|annals|leukemia|bmj|blood cancer)\b/i.test(
    `${segment.title} ${segment.summary} ${segment.citations.map((citation) => citation.label).join(" ")}`
  );
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function removeBatchPrefix(value: string) {
  return clean(
    value
      .replace(/^One-hour batch\s+.*?UTC:\s*/i, "")
      .replace(/^Batch pick:\s*/i, "")
  );
}

function monthEdition(segment: Segment) {
  return (
    `${segment.summary} ${segment.script}`.match(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i
    )?.[0] ?? "current"
  );
}

function sourceName(segment: Segment) {
  return (
    segment.citations[0]?.label.split(":")[0]?.trim() ||
    `${segment.summary} ${segment.script}`.match(
      /\b(Journal of Clinical Oncology|JCO Oncology Practice|JCO Precision Oncology|Annals of Oncology|Blood Cancer Journal|British Journal of Cancer|JAMA|Leukemia|Nature Cancer|Nature Medicine|The BMJ|The Lancet(?: Oncology| Haematology)?|The New England Journal of Medicine|New England Journal of Medicine)\b/i
    )?.[0] ||
    "the cited source"
  );
}

async function fetchBestSourceText(segment: Segment) {
  const url = segment.citations.find((citation) => /^https?:\/\//i.test(citation.url))?.url;
  if (!url) {
    return "";
  }
  return fetchJournalArticleAbstract(url);
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase admin environment variables.");
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  const { data, error } = await supabase
    .from("segments")
    .select("*")
    .in("status", ["pending_review", "approved"])
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as SegmentRow[];
  let considered = 0;
  let updated = 0;
  const examples: Array<{ id: string; title: string }> = [];

  for (const row of rows) {
    const original = toSegment(row);
    if (!isArticleCard(original)) {
      continue;
    }
    considered += 1;
    const legacyNormalized = normalizeLegacySegment(original);
    const fetchedText = await fetchBestSourceText(legacyNormalized);
    const topic = removeBatchPrefix(legacyNormalized.title);
    const source = sourceName(legacyNormalized);
    const sectionSummary = buildRequiredSectionSummary({
      title: topic,
      sourceName: source,
      text: fetchedText || `${legacyNormalized.summary} ${legacyNormalized.script}`,
      issueDetails: legacyNormalized.summary
    });
    const journal = isJournalCard(legacyNormalized);
    const summary = journal
      ? `From the ${monthEdition(legacyNormalized)} edition of ${source}. ${sectionSummary}`
      : `${source}. ${sectionSummary}`;
    const script = journal
      ? `From the ${monthEdition(legacyNormalized)} edition of ${source}, this review looks at ${topic}. ${sectionSummary}`
      : `${source} review: ${topic}. ${sectionSummary}`;
    const nextRiskFlags = Array.from(
      new Set([
        ...legacyNormalized.riskFlags,
        "structured_background_methods_results_discussion"
      ])
    );

    if (
      summary === row.summary &&
      script === row.script &&
      legacyNormalized.contentType === row.content_type
    ) {
      continue;
    }

    const { error: updateError } = await supabase
      .from("segments")
      .update({
        summary,
        script,
        content_type: journal ? "abstract_buzz" : legacyNormalized.contentType,
        risk_flags: nextRiskFlags,
        updated_at: new Date().toISOString()
      })
      .eq("id", row.id);

    if (updateError) {
      throw updateError;
    }
    updated += 1;
    if (examples.length < 8) {
      examples.push({ id: row.id, title: topic });
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        considered,
        updated,
        examples
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
