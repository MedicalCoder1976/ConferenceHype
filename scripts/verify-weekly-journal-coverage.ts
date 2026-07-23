import { loadEnvConfig } from "@next/env";
import { createAdminClient } from "@/lib/supabase/admin";

loadEnvConfig(process.cwd());

const maxAgeHours = Math.max(1, Math.min(Number(process.env.JOURNAL_COVERAGE_MAX_AGE_HOURS ?? 12), 168));

function ageHours(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(value).getTime()) / 3_600_000;
}

async function main() {
  const supabase = createAdminClient();
  const [{ data: journals, error: journalError }, { data: states, error: stateError }] = await Promise.all([
    supabase.from("oncology_journals").select("id,name").eq("enabled", true).order("name"),
    supabase.from("journal_article_sync_state").select("journal_id,status,last_completed_at,articles_found,cards_eligible,cards_created,error_message")
  ]);
  if (journalError) throw journalError;
  if (stateError) throw stateError;

  const stateByJournal = new Map((states ?? []).map((state) => [state.journal_id, state]));
  const missed = (journals ?? []).flatMap((journal) => {
    const state = stateByJournal.get(journal.id);
    const reasons: string[] = [];
    if (!state) reasons.push("no sync state");
    else {
      if (!["complete", "complete_with_warnings"].includes(state.status)) reasons.push(`status=${state.status}`);
      if (ageHours(state.last_completed_at) > maxAgeHours) reasons.push(`last completion is older than ${maxAgeHours} hours`);
    }
    return reasons.length ? [{ journal: journal.name, reasons, state }] : [];
  });

  const { count: unlinkedEligible, error: eligibleError } = await supabase
    .from("journal_articles")
    .select("id", { count: "exact", head: true })
    .eq("eligibility_status", "eligible")
    .is("card_segment_id", null)
    .gte("last_checked_at", new Date(Date.now() - maxAgeHours * 3_600_000).toISOString());
  if (eligibleError) throw eligibleError;

  const summary = {
    ok: missed.length === 0 && (unlinkedEligible ?? 0) === 0,
    enabledJournals: journals?.length ?? 0,
    completedJournals: (journals?.length ?? 0) - missed.length,
    missed,
    eligibleArticlesWithoutCards: unlinkedEligible ?? 0
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) throw new Error(`Weekly journal coverage incomplete: ${missed.length} journal(s) missed; ${summary.eligibleArticlesWithoutCards} eligible article(s) lack cards.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
