import { loadEnvConfig } from "@next/env";
import { createAdminClient } from "@/lib/supabase/admin";

loadEnvConfig(process.cwd());

async function main() {
  const reason = process.env.JOURNAL_CARD_V2_FINALIZE_REASON ?? "Journal card workflow ended before journal completion";
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("journal_article_sync_state")
    .update({
      status: "failed",
      error_message: reason,
      updated_at: new Date().toISOString()
    })
    .eq("status", "running")
    .select("journal_id");
  if (error) throw error;
  console.log(JSON.stringify({ ok: true, finalizedInterruptedJournals: data?.length ?? 0 }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});