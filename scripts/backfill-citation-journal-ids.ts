import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

// One-time backfill: citations created before Citation.journalId existed
// (or before pubMedRescueJournalItems' bare-id path was recognized by
// isJournalItem, see dead_card_misclassification_bugs.md) have no journalId
// even when the citation label's "<Journal Name>: <article title>" prefix
// unambiguously names a real catalog journal. Missing journalId is why
// buildBroadcastMetadata() can't find a dominant journal for an hour and
// falls back to the generic "<conference> live programming" title/no-date
// chapter list, even for a genuinely journal-heavy hour. Matches on an exact
// (case-insensitive) journal name prefix only -- no fuzzy matching, so a
// miss just leaves journalId unset (safe) rather than risking a wrong
// attribution.
async function main() {
  const { createAdminClient } = await import("../lib/supabase/admin");
  const { getOncologyJournalsFromDb } = await import("../lib/db");
  const supabase = createAdminClient();

  const journals = (await getOncologyJournalsFromDb()) ?? [];
  const journalByLowerName = new Map(journals.map((j) => [j.name.toLowerCase(), j]));

  const { data, error } = await supabase
    .from("segments")
    .select("id,citations")
    .not("citations", "is", null);
  if (error) throw error;

  let checked = 0;
  let updated = 0;
  for (const row of data as any[]) {
    const citations = row.citations ?? [];
    if (citations.length === 0) continue;
    checked++;
    let changed = false;
    const nextCitations = citations.map((citation: any) => {
      if (citation.journalId || !citation.label) return citation;
      const prefixMatch = String(citation.label).match(/^([^:]+):\s/);
      if (!prefixMatch) return citation;
      const journal = journalByLowerName.get(prefixMatch[1].trim().toLowerCase());
      if (!journal) return citation;
      changed = true;
      return { ...citation, journalId: journal.id };
    });
    if (changed) {
      const { error: updateError } = await supabase
        .from("segments")
        .update({ citations: nextCitations })
        .eq("id", row.id);
      if (updateError) {
        console.warn(`Failed to update ${row.id}: ${updateError.message}`);
        continue;
      }
      updated++;
    }
  }
  console.log(`Checked ${checked} segments with citations, backfilled journalId on ${updated}.`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
