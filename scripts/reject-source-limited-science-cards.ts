import { loadEnvConfig } from "@next/env";
import type { ContentType, Segment } from "@/lib/types";

loadEnvConfig(process.cwd());

type SegmentRow = {
  id: string;
  title: string | null;
  summary: string | null;
  script: string | null;
  citations: Segment["citations"] | null;
  content_type: ContentType | null;
  risk_flags: string[] | null;
  status: string | null;
};

function isSourceLimitedScienceFailure(errors: string[]) {
  return errors.some(
    (error) =>
      error.includes("only listing metadata") ||
      error.includes("source-grounded Background, Methods, Results, and Discussion")
  );
}

async function main() {
  const [{ hasSupabase }, { createAdminClient }, { validateSegmentForApproval }] = await Promise.all([
    import("@/lib/env"),
    import("@/lib/supabase/admin"),
    import("@/lib/generation/validator")
  ]);

  if (!hasSupabase()) {
    throw new Error("Supabase is not configured.");
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("segments")
    .select("id,title,summary,script,citations,content_type,risk_flags,status")
    .in("status", ["approved", "pending_review"])
    .limit(2000);
  if (error) {
    throw error;
  }

  const rows = (data ?? []) as SegmentRow[];
  const invalid = rows
    .map((row) => ({
      row,
      errors: validateSegmentForApproval({
        title: row.title ?? "",
        summary: row.summary ?? "",
        script: row.script ?? "",
        citations: row.citations ?? [],
        contentType: row.content_type ?? "agenda_preview",
        riskFlags: row.risk_flags ?? []
      })
    }))
    .filter((entry) => isSourceLimitedScienceFailure(entry.errors));

  for (const { row } of invalid) {
    const nextRiskFlags = Array.from(
      new Set([...(row.risk_flags ?? []), "rejected_source_limited_science_card"])
    );
    const { error: updateError } = await supabase
      .from("segments")
      .update({
        status: "rejected",
        approved_at: null,
        risk_flags: nextRiskFlags,
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
        ok: true,
        inspected: rows.length,
        rejected: invalid.length,
        rejectedCards: invalid.slice(0, 25).map(({ row, errors }) => ({
          id: row.id,
          title: row.title,
          status: row.status,
          errors
        }))
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
