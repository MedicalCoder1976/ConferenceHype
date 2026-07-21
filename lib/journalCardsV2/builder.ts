import { randomUUID } from "node:crypto";
import { getPersona } from "@/lib/generation/personas";
import { buildRequiredSectionSummary } from "@/lib/segments/sectionSummary";
import type { OncologyJournal, Segment } from "@/lib/types";
import type { PubMedJournalArticle } from "@/lib/sources/pubmed";
import { isStructuredJournalArticle, validateJournalCardCopy } from "@/lib/journalCardsV2/quality";

export function journalSourceRiskFlag(journalId: string) {
  return `source_id:${journalId}`;
}

export function withJournalSourceRiskFlag(riskFlags: string[], journalId: string) {
  const sourceFlag = journalSourceRiskFlag(journalId);
  return riskFlags.includes(sourceFlag) ? riskFlags : [...riskFlags, sourceFlag];
}

function completeSentences(value: string, maxWords = 145) {
  const sentences = value.replace(/\b(?:OBJECTIVES?|FINDINGS|CONCLUSIONS?|PURPOSE|IMPORTANCE)\s*:/gi, "")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 20);
  const selected: string[] = [];
  let words = 0;
  for (const sentence of sentences) {
    const count = sentence.split(/\s+/).length;
    if (selected.length && words + count > maxWords) break;
    selected.push(sentence);
    words += count;
  }
  return selected.join(" ");
}

export function buildDeterministicJournalCard({
  article,
  journal,
  index = 0
}: {
  article: PubMedJournalArticle;
  journal: OncologyJournal;
  index?: number;
}) {
  const structured = isStructuredJournalArticle(article);
  const body = structured
    ? buildRequiredSectionSummary({ title: article.title, sourceName: journal.name, text: article.abstract })
    : completeSentences(article.abstract);
  const edition = article.publishedAt || new Date().toISOString().slice(0, 10);
  const script = `From the ${edition} edition of ${journal.name}. ${body}`;
  const quality = validateJournalCardCopy({ script, structured });
  const persona = getPersona(index % 2 === 0 ? "echo-sage" : "nova-quinn");
  const now = new Date().toISOString();
  const segment: Segment = {
    id: `journal-v2-${randomUUID()}`,
    title: article.title,
    summary: body,
    script,
    contentType: "abstract_buzz",
    personaId: persona.id,
    personaName: persona.name,
    hypeLevel: "standard",
    language: "English",
    status: "pending_review",
    citations: [{
      label: `${journal.name}: ${article.title}`,
      url: article.url,
      sourceType: "official",
      journalId: journal.id,
      publishedAt: article.publishedAt
    }],
    socialBuzzItems: [],
    riskFlags: withJournalSourceRiskFlag([
      "journal_card_v2",
      `pmid:${article.pmid}`,
      structured ? "structured_article_card" : "narrative_review_card",
      quality.passed ? "journal_quality_passed" : "journal_quality_failed"
    ], journal.id),
    confidenceScore: quality.passed ? 95 : 40,
    createdAt: now,
    updatedAt: now
  };
  return { segment, quality, structured };
}