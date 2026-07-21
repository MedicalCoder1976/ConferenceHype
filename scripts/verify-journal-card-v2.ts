import assert from "node:assert/strict";
import { classifyJournalArticle, resolveJournalArticleLedgerStatus, validateJournalCardCopy } from "@/lib/journalCardsV2/quality";
import {
  buildDeterministicJournalCard,
  journalSourceRiskFlag,
  withJournalSourceRiskFlag
} from "@/lib/journalCardsV2/builder";
import { oncologyJournalSeeds } from "@/lib/catalog/oncologyJournalSeeds";
import { buildJournalCardDecks } from "@/lib/cardDeck";
import { buildJournalShowSlots } from "@/lib/rundown/slots";
import type { OncologyJournal } from "@/lib/types";

const article = {
  pmid: "99999999",
  doi: "10.1000/example",
  title: "A structured cholangiocarcinoma study",
  abstract: "BACKGROUND: Cholangiocarcinoma outcomes remain poor, and evidence for treatment selection remains limited across diverse clinical settings. METHODS: We studied 120 adults receiving treatment across three centers using a prespecified observational protocol and standardized follow-up. RESULTS: Median survival was 18 months and response was observed in 42 percent of participants, with outcomes recorded for the complete study population. CONCLUSIONS: The findings support further prospective evaluation of this approach while recognizing the limitations of the observational design.",
  publicationTypes: ["Clinical Trial"],
  url: "https://pubmed.ncbi.nlm.nih.gov/99999999/",
  publishedAt: "2026-07-20"
};
const journal: OncologyJournal = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "British Journal of Cancer",
  abbreviation: "BJC",
  rssUrl: "https://www.nature.com/bjc.rss",
  officialUrl: "https://www.nature.com/bjc/",
  specialty: "Oncology",
  enabled: true
};
assert.equal(classifyJournalArticle(article).status, "eligible");
const built = buildDeterministicJournalCard({ article, journal });
assert.equal(built.quality.passed, true);
assert.match(built.segment.script, /Background:/);
assert.match(built.segment.script, /Discussion:/);
assert.ok(built.segment.riskFlags.includes("pmid:99999999"));
assert.ok(built.segment.riskFlags.includes(journalSourceRiskFlag(journal.id)));
assert.equal(buildJournalCardDecks([built.segment], [journal])[journal.id].total, 1);
assert.deepEqual(
  withJournalSourceRiskFlag(["journal_card_v2", "pmid:99999999"], journal.id),
  ["journal_card_v2", "pmid:99999999", journalSourceRiskFlag(journal.id)]
);
assert.deepEqual(
  withJournalSourceRiskFlag(
    ["journal_card_v2", "pmid:99999999", journalSourceRiskFlag(journal.id)],
    journal.id
  ),
  ["journal_card_v2", "pmid:99999999", journalSourceRiskFlag(journal.id)]
);

// Catch-up cards are pending review and therefore cannot enter a journal
// broadcast sequence. Adding/removing the deck-routing flag from an already
// approved card must not change the content-card sequence or its order.
assert.equal(
  buildJournalShowSlots({
    segments: [built.segment],
    journalId: journal.id,
    baseTime: new Date("2026-07-21T12:00:00Z")
  }).length,
  0
);
const approvedBuilt = {
  ...built.segment,
  status: "approved" as const,
  approvedAt: "2026-07-21T11:00:00Z"
};
const contentIds = (segments: typeof approvedBuilt[]) =>
  buildJournalShowSlots({
    segments,
    journalId: journal.id,
    baseTime: new Date("2026-07-21T12:00:00Z")
  })
    .filter((slot) => slot.segment && !slot.segment.riskFlags.includes("journal_show_outro"))
    .map((slot) => slot.segment?.id);
assert.deepEqual(
  contentIds([approvedBuilt]),
  contentIds([{
    ...approvedBuilt,
    riskFlags: approvedBuilt.riskFlags.filter((flag) => !flag.startsWith("source_id:"))
  }])
);

for (const methodsLabel of ["MATERIALS AND METHODS", "MATERIAL AND METHODS"]) {
  const radiologyArticle = {
    ...article,
    pmid: methodsLabel === "MATERIALS AND METHODS" ? "42468161" : "42470753",
    abstract: `OBJECTIVES: This study evaluated a clinically important imaging question in a representative patient population. ${methodsLabel}: Investigators applied a prespecified imaging protocol and compared measurements with the reference standard. RESULTS: The response rate was 67.3% vs. 51.9%, supporting a meaningful difference across the complete validation cohort. CONCLUSIONS: The findings support prospective validation before routine clinical adoption.`
  };
  const radiologyCard = buildDeterministicJournalCard({ article: radiologyArticle, journal });
  assert.equal(radiologyCard.quality.passed, true, radiologyCard.quality.errors.join("; "));
  assert.doesNotMatch(radiologyCard.segment.script, /(?:OBJECTIVES|MATERIALS? AND METHODS):/);
}

const duplicated = validateJournalCardCopy({
  structured: true,
  script: "Background: A complete background sentence is available here. Methods: A complete methods sentence is available here. Results: Survival improved significantly in the treatment group during follow-up. Discussion: Survival improved significantly in the treatment group during follow-up."
});
assert.equal(duplicated.passed, false);
assert.match(duplicated.errors.join(" "), /duplicated/i);

assert.equal(classifyJournalArticle({ ...article, abstract: "" }).status, "awaiting_abstract");
assert.equal(classifyJournalArticle({ ...article, publicationTypes: ["Published Erratum"] }).status, "excluded_erratum");
assert.equal(resolveJournalArticleLedgerStatus({
  sourceStatus: "eligible",
  existingStatus: "quality_failed",
  hasLinkedCard: false,
  candidateQualityPassed: false
}), "quality_failed");
assert.equal(resolveJournalArticleLedgerStatus({
  sourceStatus: "awaiting_abstract",
  existingStatus: "quality_failed",
  hasLinkedCard: false
}), "awaiting_abstract");
assert.equal(resolveJournalArticleLedgerStatus({
  sourceStatus: "eligible",
  existingStatus: "operator_rejected",
  hasLinkedCard: false,
  candidateQualityPassed: true
}), "operator_rejected");
assert.equal(new Set(oncologyJournalSeeds.map((item) => item.rssUrl)).size, oncologyJournalSeeds.length);
for (const required of ["Blood", "Circulation", "Journal of the American College of Cardiology", "Gastroenterology", "Radiology", "Pediatrics", "Annals of Surgery"]) {
  assert.ok(oncologyJournalSeeds.some((item) => item.name === required), `${required} must be in the journal catalog`);
}
console.log("Journal card V2 verification passed.");