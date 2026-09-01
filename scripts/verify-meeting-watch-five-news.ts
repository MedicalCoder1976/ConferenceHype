import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePreparedNarrative, preparedNarrativeSegments } from "@/lib/meetingWatch/preparedNarrative";

const payloadPath = process.argv[2];
const narration = "This source-grounded meeting update explains the study design, principal result, reported numbers, clinical context, important limitations, and what physicians should watch next. It avoids unsupported conclusions and keeps the evidence tied to the cited primary source. The finding may inform practice discussions, but implementation still requires review of the complete publication and patient-specific considerations. Further follow-up will clarify durability, safety, and generalizability.";
const fixture = {
  schema_version: "conferencehype_meeting_watch_five_news_v1", status: "ready",
  meeting: { name: "ERS Congress", year: 2026, dates: "September 5-9, 2026", specialty: "Respiratory Medicine", specialist_alert: "PULMONOLOGIST ALERT", eye_catching_topic: "PULMONOLOGIST ALERT: ERS 2026 (Sept 5-9): AstraZeneca, GSK, BI, Roche - COPD, Asthma, IPF Dominance" },
  news_items: Array.from({ length: 5 }, (_, index) => ({ position: index + 1, headline: `Complete source-grounded finding ${index + 1}`, visible_text: `Finding ${index + 1}`, narration, primary_source_url: `https://example.com/source-${index + 1}`, source_label: `Primary source ${index + 1}`, study_name: `Study ${index + 1}`, pharma_companies: [["AstraZeneca"], ["GSK"], ["Boehringer Ingelheim"], ["Roche"], []][index], reported_numbers: [], limitations: [] })),
  disclaimer: "This educational update does not constitute medical advice.", closing: "Review the five primary sources and subscribe for the next meeting update.", quality_report: {}
};
const normalized = parsePreparedNarrative(payloadPath ? readFileSync(payloadPath, "utf8") : JSON.stringify(fixture));
assert.ok(normalized.package.program.title.length <= 150);
assert.match(normalized.package.program.title, /AstraZeneca.*GSK.*Boehringer Ingelheim/);
assert.equal(normalized.package.cards.length, 5);
assert.deepEqual(normalized.package.transitions.map((transition) => transition.duration_seconds), [20, 20, 20, 20]);
assert.equal(new Set(preparedNarrativeSegments(normalized.package).flatMap((segment) => segment.citations.map((citation) => citation.url))).size, 5);
console.log("Meeting Watch five-news verification passed.");
