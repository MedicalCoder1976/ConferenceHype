import { loadEnvConfig } from "@next/env";
import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";
import { fetchCompletePubMedJournalInventory, fetchPubMedArticlesByIds } from "@/lib/sources/pubmed";
import { fetchRssSource } from "@/lib/sources/rss";
import { buildDeterministicJournalCard } from "@/lib/journalCardsV2/builder";
import { classifyJournalArticle, resolveJournalArticleLedgerStatus, validateJournalCardCopy } from "@/lib/journalCardsV2/quality";
import type { OncologyJournal, Segment } from "@/lib/types";

loadEnvConfig(process.cwd());

let createAdminClient: typeof import("@/lib/supabase/admin")["createAdminClient"];
let getOncologyJournalsFromDb: typeof import("@/lib/db")["getOncologyJournalsFromDb"];
let saveGeneratedSegmentsToDb: typeof import("@/lib/db")["saveGeneratedSegmentsToDb"];

async function loadDependencies() {
  ({ createAdminClient } = await import("@/lib/supabase/admin"));
  ({ getOncologyJournalsFromDb, saveGeneratedSegmentsToDb } = await import("@/lib/db"));
}

const enabled = process.env.JOURNAL_CARD_V2_SHADOW === "true";
const createPending = process.env.JOURNAL_CARD_V2_CREATE_PENDING === "true";
const days = Math.max(1, Math.min(Number(process.env.JOURNAL_CARD_V2_LOOKBACK_DAYS ?? 14), 90));
const onlyJournal = process.env.JOURNAL_CARD_V2_JOURNAL_ID;

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
function pmidFromSegment(segment: { citations?: Array<{ url?: string }> | null; risk_flags?: string[] | null }) {
  const flag = (segment.risk_flags ?? []).find((value) => value.startsWith("pmid:"));
  if (flag) return flag.slice(5);
  for (const citation of segment.citations ?? []) {
    const match = citation.url?.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
    if (match) return match[1];
  }
  return "";
}

function abstractStructure(abstract: string) {
  const has = (label: string) => new RegExp(`\\b${label}\\s*:`, "i").test(abstract);
  return {
    background: has("Background|Purpose|Objectives?|Importance"),
    methods: has("Materials? and Methods|Methods|Design"),
    results: has("Results|Findings"),
    discussion: has("Discussion|Conclusions?")
  };
}

function qualityFingerprint(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const report = value as { passed?: boolean; errors?: string[]; checks?: Record<string, string> };
  return JSON.stringify({
    passed: report.passed,
    errors: report.errors ?? [],
    checks: Object.fromEntries(Object.entries(report.checks ?? {}).sort(([left], [right]) => left.localeCompare(right)))
  });
}
async function linkExistingCards() {
  const supabase = createAdminClient();
  const segments: Array<{
    id: string;
    title: string;
    script: string | null;
    citations: Array<{ url?: string; journalId?: string }> | null;
    risk_flags: string[] | null;
    status: string;
  }> = [];
  const ledgerRows: Array<{
    id: string;
    journal_id: string;
    pmid: string;
    card_segment_id: string | null;
    quality_report: Record<string, unknown> | null;
  }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("segments")
      .select("id,title,script,citations,risk_flags,status")
      .in("status", ["pending_review", "approved", "rendered"])
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    segments.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("journal_articles")
      .select("id,journal_id,pmid,card_segment_id,quality_report")
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    ledgerRows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  const candidates = segments.map((segment) => ({
    segment,
    pmid: pmidFromSegment(segment),
    journalId: (segment.citations ?? []).find((citation) => citation.journalId)?.journalId ?? ""
  })).filter((entry) => entry.pmid && entry.journalId);
  const ledgerByKey = new Map(ledgerRows.map((row) => [`${row.journal_id}:${row.pmid}`, row]));
  const missingPmids = candidates.filter(({ pmid, journalId }) => !ledgerByKey.has(`${journalId}:${pmid}`)).map(({ pmid }) => pmid);
  const missingArticles = new Map((await fetchPubMedArticlesByIds(missingPmids)).map((article) => [article.pmid, article]));

  let linked = 0;
  for (const { segment, pmid, journalId } of candidates) {
    const legacyQuality = validateJournalCardCopy({
      script: segment.script ?? "",
      structured: !(segment.risk_flags ?? []).includes("narrative_review_card")
    });
    const ledgerKey = `${journalId}:${pmid}`;
    let ledger = ledgerByKey.get(ledgerKey);
    if (!ledger) {
      const article = missingArticles.get(pmid);
      if (!article) {
        const sourceUrl = (segment.citations ?? []).find((citation) =>
          /pubmed\.ncbi\.nlm\.nih\.gov\/\d+/i.test(citation.url ?? "")
        )?.url ?? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
        const { data: inserted, error: insertError } = await supabase.from("journal_articles").upsert({
          journal_id: journalId,
          pmid,
          doi: null,
          title: segment.title,
          publication_date: null,
          publication_types: [],
          abstract_text: "",
          abstract_structure: {},
          source_url: sourceUrl,
          discovered_via: "pubmed",
          eligibility_status: "card_created",
          eligibility_reason: "Existing PMID-cited card recorded; PubMed no longer returned this record during reconciliation.",
          quality_report: { existing_card: legacyQuality },
          card_segment_id: segment.id,
          last_checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: "journal_id,pmid" }).select("id,journal_id,pmid,card_segment_id,quality_report").single();
        if (insertError) throw insertError;
        ledgerByKey.set(ledgerKey, inserted);
        linked += 1;
        continue;
      }
      const { data: inserted, error: insertError } = await supabase.from("journal_articles").upsert({
        journal_id: journalId,
        pmid: article.pmid,
        doi: article.doi || null,
        title: article.title,
        publication_date: article.publishedAt ?? null,
        publication_types: article.publicationTypes,
        abstract_text: article.abstract,
        abstract_structure: abstractStructure(article.abstract),
        source_url: article.url,
        discovered_via: "pubmed",
        eligibility_status: "card_created",
        eligibility_reason: "Existing PMID-grounded card imported into the reconciliation ledger without changing the card.",
        quality_report: { existing_card: legacyQuality },
        card_segment_id: segment.id,
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: "journal_id,pmid" }).select("id,journal_id,pmid,card_segment_id,quality_report").single();
      if (insertError) throw insertError;
      ledger = inserted;
      ledgerByKey.set(ledgerKey, inserted);
      linked += 1;
      continue;
    }
    if (ledger.card_segment_id && ledger.card_segment_id !== segment.id) continue;
    const existingQuality = ledger.quality_report?.existing_card;
    if (
      ledger.card_segment_id === segment.id &&
      qualityFingerprint(existingQuality) === qualityFingerprint(legacyQuality)
    ) continue;
    const qualityReport = {
      ...(ledger.quality_report && typeof ledger.quality_report === "object" ? ledger.quality_report : {}),
      existing_card: legacyQuality
    };
    const { error: updateError } = await supabase
      .from("journal_articles")
      .update({ eligibility_status: "card_created", card_segment_id: segment.id, quality_report: qualityReport, updated_at: new Date().toISOString() })
      .eq("id", ledger.id);
    if (updateError) throw updateError;
    if (!ledger.card_segment_id) {
      linked += 1;
      ledger.card_segment_id = segment.id;
    }
  }
  return linked;
}
function normalizedTitle(value: string) {
  return value.toLowerCase().replace(/^\[[^\]]+\]\s*/, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function rssSurrogate(url: string, title: string) {
  return `rss:${createHash("sha256").update(`${url}|${title}`.toLowerCase()).digest("hex").slice(0, 24)}`;
}

async function reconcilePublisherFeed({
  journal,
  pubmedArticles
}: {
  journal: OncologyJournal;
  pubmedArticles: Awaited<ReturnType<typeof fetchCompletePubMedJournalInventory>>;
}) {
  if (journal.rssUrl.includes("pubmed.ncbi.nlm.nih.gov/")) {
    return { found: 0, unmatched: 0, warning: "" };
  }
  try {
    const items = await fetchRssSource({
      id: journal.id,
      name: journal.name,
      url: journal.rssUrl,
      type: "official",
      rank: 1,
      enabled: true
    }, { enrichJournalAbstract: false });
    const pubmedByTitle = new Map(pubmedArticles.map((article) => [normalizedTitle(article.title), article]));
    const supabase = createAdminClient();
    let unmatched = 0;
    for (const item of items) {
      const match = pubmedByTitle.get(normalizedTitle(item.title));
      const surrogate = rssSurrogate(item.url, item.title);
      if (match) {
        await supabase.from("journal_articles").update({
          eligibility_status: "reconciled_pubmed",
          eligibility_reason: `Publisher-feed record reconciled to PMID ${match.pmid}.`,
          reconciled_pmid: match.pmid,
          last_checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq("journal_id", journal.id).eq("pmid", surrogate);
        continue;
      }
      unmatched += 1;
      const { error } = await supabase.from("journal_articles").upsert({
        journal_id: journal.id,
        pmid: surrogate,
        doi: null,
        title: item.title,
        publication_date: item.publishedAt ?? null,
        publication_types: [],
        abstract_text: item.excerpt,
        abstract_structure: {},
        source_url: item.url,
        discovered_via: "rss_reconciliation",
        eligibility_status: "awaiting_abstract",
        eligibility_reason: "Publisher-feed article is not yet matched to a PubMed record; no card created.",
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: "journal_id,pmid" });
      if (error) throw error;
    }
    return { found: items.length, unmatched, warning: "" };
  } catch (error) {
    return { found: 0, unmatched: 0, warning: `RSS reconciliation failed: ${errorText(error)}` };
  }
}
function pubmedJournalQuery(journal: OncologyJournal) {
  if (!journal.rssUrl.includes("pubmed.ncbi.nlm.nih.gov/")) return journal.name;
  try {
    const term = new URL(journal.rssUrl).searchParams.get("term") ?? "";
    return term.replace(/\[Journal\]/gi, "").replace(/^"|"$/g, "").trim() || journal.name;
  } catch {
    return journal.name;
  }
}
async function processJournal(journal: OncologyJournal, since: string) {
  const supabase = createAdminClient();
  await supabase.from("journal_article_sync_state").upsert({
    journal_id: journal.id,
    status: "running",
    window_start: since,
    error_message: null,
    updated_at: new Date().toISOString()
  });
  try {
    const primaryQuery = pubmedJournalQuery(journal);
    let articles = await fetchCompletePubMedJournalInventory({ journalName: primaryQuery, since });
    if (!articles.length && journal.abbreviation && journal.abbreviation.toLowerCase() !== primaryQuery.toLowerCase()) {
      articles = await fetchCompletePubMedJournalInventory({ journalName: journal.abbreviation, since });
    }
    const { data: existingLedger, error: existingLedgerError } = await supabase
      .from("journal_articles")
      .select("pmid,eligibility_status,card_segment_id")
      .eq("journal_id", journal.id);
    if (existingLedgerError) throw existingLedgerError;
    const existingByPmid = new Map((existingLedger ?? []).map((row) => [row.pmid, row]));
    const rows = articles.map((article) => {
      const eligibility = classifyJournalArticle(article);
      const existing = existingByPmid.get(article.pmid);
      const shadowCandidate = eligibility.status === "eligible"
        ? buildDeterministicJournalCard({ article, journal })
        : null;
      const protectedStatus = resolveJournalArticleLedgerStatus({
        sourceStatus: eligibility.status,
        existingStatus: existing?.eligibility_status,
        hasLinkedCard: Boolean(existing?.card_segment_id),
        candidateQualityPassed: shadowCandidate?.quality.passed
      });
      return {
        journal_id: journal.id,
        pmid: article.pmid,
        doi: article.doi || null,
        title: article.title,
        publication_date: article.publishedAt ?? null,
        publication_types: article.publicationTypes,
        abstract_text: article.abstract,
        abstract_structure: abstractStructure(article.abstract),
        source_url: article.url,
        discovered_via: "pubmed",
        eligibility_status: protectedStatus,
        eligibility_reason: shadowCandidate && !shadowCandidate.quality.passed
          ? `${eligibility.reason} Shadow quality warnings: ${shadowCandidate.quality.errors.join(" ")}`
          : eligibility.reason,
        quality_report: shadowCandidate?.quality ?? {},
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    });
    if (rows.length) {
      const { error } = await supabase.from("journal_articles").upsert(rows, { onConflict: "journal_id,pmid" });
      if (error) throw error;
    }

    const rss = await reconcilePublisherFeed({ journal, pubmedArticles: articles });

    let cardsCreated = 0;
    const candidateQualityFailed = rows.filter((row) => {
      const report = row.quality_report as { passed?: boolean };
      return typeof report?.passed === "boolean" && !report.passed;
    }).length;
    let qualityFailed = createPending ? 0 : candidateQualityFailed;
    if (createPending) {
      const { data: ledgerRows, error: ledgerError } = await supabase
        .from("journal_articles")
        .select("id,pmid,card_segment_id")
        .eq("journal_id", journal.id)
        .eq("eligibility_status", "eligible")
        .is("card_segment_id", null);
      if (ledgerError) throw ledgerError;
      const ledgerByPmid = new Map((ledgerRows ?? []).map((row) => [row.pmid, row]));
      for (let index = 0; index < articles.length; index += 1) {
        const article = articles[index];
        const ledger = ledgerByPmid.get(article.pmid);
        if (!ledger) continue;
        const built = buildDeterministicJournalCard({ article, journal, index });
        if (!built.quality.passed) {
          qualityFailed += 1;
          await supabase.from("journal_articles").update({
            eligibility_status: "quality_failed",
            eligibility_reason: built.quality.errors.join(" "),
            quality_report: built.quality,
            updated_at: new Date().toISOString()
          }).eq("id", ledger.id);
          continue;
        }
        const { data: duplicateCards, error: duplicateError } = await supabase
          .from("segments")
          .select("id")
          .contains("risk_flags", [`pmid:${article.pmid}`])
          .limit(1);
        if (duplicateError) throw duplicateError;
        const duplicate = duplicateCards?.[0];
        if (duplicate) {
          await supabase.from("journal_articles").update({
            eligibility_status: "card_created",
            card_segment_id: duplicate.id,
            quality_report: built.quality,
            updated_at: new Date().toISOString()
          }).eq("id", ledger.id);
          continue;
        }
        const saved = await saveGeneratedSegmentsToDb([built.segment]) as Segment[] | null;
        const segment = saved?.[0];
        if (!segment) throw new Error(`Card save returned no segment for PMID ${article.pmid}`);
        await supabase.from("journal_articles").update({
          eligibility_status: "card_created",
          card_segment_id: segment.id,
          quality_report: built.quality,
          updated_at: new Date().toISOString()
        }).eq("id", ledger.id);
        cardsCreated += 1;
      }
    }

    const sourceDecisions = articles.map(classifyJournalArticle);
    const eligible = sourceDecisions.filter((decision) => decision.status === "eligible").length;
    const awaiting = sourceDecisions.filter((decision) => decision.status === "awaiting_abstract").length;
    const excluded = sourceDecisions.length - eligible - awaiting;
    const { error: stateError } = await supabase.from("journal_article_sync_state").upsert({
      journal_id: journal.id,
      status: rss.warning ? "complete_with_warnings" : "complete",
      window_start: since,
      last_completed_at: new Date().toISOString(),
      articles_found: rows.length,
      cards_eligible: eligible,
      cards_created: cardsCreated,
      awaiting_abstract: awaiting,
      excluded,
      rss_items_found: rss.found,
      rss_unmatched: rss.unmatched,
      error_message: rss.warning || null,
      updated_at: new Date().toISOString()
    });
    if (stateError) throw stateError;
    return { journal: journal.name, articles: rows.length, eligible, awaiting, excluded, rssItems: rss.found, rssUnmatched: rss.unmatched, rssWarning: rss.warning, cardsCreated, qualityFailed };
  } catch (error) {
    await supabase.from("journal_article_sync_state").upsert({
      journal_id: journal.id,
      status: "failed",
      window_start: since,
      error_message: errorText(error),
      updated_at: new Date().toISOString()
    });
    throw error;
  }
}

async function finalizeInterruptedJournalSync(reason: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("journal_article_sync_state")
    .update({
      status: "failed",
      error_message: reason,
      updated_at: new Date().toISOString()
    })
    .eq("status", "running");
  if (error) console.error("Could not finalize interrupted journal sync state:", error.message);
}

function installInterruptionCleanup() {
  const handle = (signal: NodeJS.Signals) => {
    void finalizeInterruptedJournalSync("Journal card inventory interrupted by " + signal)
      .finally(() => process.exit(128 + (signal === "SIGINT" ? 2 : 15)));
  };
  process.once("SIGINT", handle);
  process.once("SIGTERM", handle);
}

function writeGitHubSummary(summary: {
  shadow: boolean;
  results: Array<{ articles: number; cardsCreated: number; qualityFailed: number; rssWarning?: string | null }>;
  failures: Array<{ journal: string; error: string }>;
  rssWarnings: Array<{ journal: string; rssWarning?: string | null }>;
}) {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;
  const total = (key: "articles" | "cardsCreated" | "qualityFailed") =>
    summary.results.reduce((sum, result) => sum + result[key], 0);
  const warningRows = summary.rssWarnings.length
    ? summary.rssWarnings.map((result) => "| " + result.journal + " | " + String(result.rssWarning).replace(/\|/g, "\\|") + " |").join("\n")
    : "| None | None |";
  const failureRows = summary.failures.length
    ? summary.failures.map((failure) => "| " + failure.journal + " | " + failure.error.replace(/\|/g, "\\|") + " |").join("\n")
    : "| None | None |";
  appendFileSync(path, [
    "## Journal card V2 result",
    "",
    "- Mode: " + (summary.shadow ? "shadow inventory" : "create pending-review cards"),
    "- Journals processed: " + summary.results.length,
    "- PubMed articles found: " + total("articles"),
    "- Cards created: " + total("cardsCreated"),
    "- Quality failures: " + total("qualityFailed"),
    "- RSS warnings: " + summary.rssWarnings.length,
    "- Journal failures: " + summary.failures.length,
    "",
    "### Supplemental RSS warnings",
    "",
    "| Journal | Warning |",
    "| --- | --- |",
    warningRows,
    "",
    "### Processing failures",
    "",
    "| Journal | Error |",
    "| --- | --- |",
    failureRows,
    ""
  ].join("\n"));
}
async function main() {
  await loadDependencies();
  installInterruptionCleanup();
  if (!enabled) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: "JOURNAL_CARD_V2_SHADOW is not true" }));
    return;
  }
  const journals = ((await getOncologyJournalsFromDb()) ?? [])
    .filter((journal) => journal.enabled && (!onlyJournal || journal.id === onlyJournal));
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const results = [];
  const failures = [];
  for (const journal of journals) {
    try {
      results.push(await processJournal(journal, since));
    } catch (error) {
      failures.push({ journal: journal.name, error: errorText(error) });
    }
  }
  const linkedExisting = await linkExistingCards();
  const rssWarnings = results.filter((result) => result.rssWarning);
  const summary = { ok: failures.length === 0, shadow: !createPending, since, linkedExisting, results, failures, rssWarnings };
  writeGitHubSummary(summary);
  if (rssWarnings.length) {
    console.log("::warning title=RSS supplemental-source warnings::" + rssWarnings.length + " journal RSS feeds were unavailable; PubMed processing completed. See the job summary.");
  }
  console.log(JSON.stringify(summary, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});