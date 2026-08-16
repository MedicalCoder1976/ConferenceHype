import { loadEnvConfig } from "@next/env";
import { updateRegionalProgramDelivery } from "@/lib/regionalJournalClub/db";

loadEnvConfig(process.cwd());

const id = process.env.REGIONAL_PROGRAM_ID;
if (!id) throw new Error("REGIONAL_PROGRAM_ID is required.");
updateRegionalProgramDelivery(id, { status: "failed", failureReason: process.env.REGIONAL_FAILURE_REASON ?? "Regional Journal Club workflow failed." })
  .catch((error) => { console.error(error); process.exitCode = 1; });
