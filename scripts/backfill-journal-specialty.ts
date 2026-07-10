import { loadEnvConfig } from "@next/env";
import { oncologyJournalSeeds } from "@/lib/catalog/oncologyJournalSeeds";

loadEnvConfig(process.cwd());

async function main() {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();

  let updated = 0;
  let skipped = 0;

  for (const journal of oncologyJournalSeeds) {
    if (!journal.specialty) {
      skipped += 1;
      continue;
    }
    const { data, error } = await supabase
      .from("oncology_journals")
      .update({ specialty: journal.specialty })
      .eq("rss_url", journal.rssUrl)
      .select("id");
    if (error) {
      throw new Error(`Failed to backfill "${journal.name}": ${error.message}`);
    }
    updated += data?.length ?? 0;
  }

  console.log(`Backfilled specialty on ${updated} existing journal row(s). Skipped ${skipped} seed(s) with no specialty.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
