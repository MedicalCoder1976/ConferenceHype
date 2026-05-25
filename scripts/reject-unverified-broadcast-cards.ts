import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const unsafePattern =
  /\b(early social chatter|unverified buzz|operator-selected audience tip|audience tip|rising energy|snack|coffee|hallway energy|pending review|use only the source-attributed material|do not add unsourced names|use it only if that source has not already been placed)\b/i;

async function main() {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("segments")
    .select("id,title,summary,script,status")
    .in("status", ["pending_review", "approved"]);

  if (error) {
    throw error;
  }

  const matches = (data ?? []).filter((row) =>
    unsafePattern.test([row.title, row.summary, row.script].join("\n"))
  );

  for (const row of matches) {
    const { error: updateError } = await supabase
      .from("segments")
      .update({
        status: "rejected",
        updated_at: new Date().toISOString()
      })
      .eq("id", row.id);

    if (updateError) {
      throw updateError;
    }
  }

  console.log(
    JSON.stringify(
      {
        checked: data?.length ?? 0,
        rejected: matches.length,
        titles: matches.map((row) => row.title)
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
