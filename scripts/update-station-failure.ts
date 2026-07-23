import { updateStationBreakInDeliveryInDb, updateStationProgramDeliveryInDb } from "@/lib/station/delivery";

const reason = process.env.STATION_FAILURE_REASON ?? "The isolated station workflow failed before YouTube verification. The current public broadcast was not changed.";

async function main() {
  if (process.env.STATION_BREAKIN_ID) {
    await updateStationBreakInDeliveryInDb(process.env.STATION_BREAKIN_ID, { status: "failed", failureReason: reason });
  }
  if (process.env.STATION_PROGRAM_ID) {
    await updateStationProgramDeliveryInDb(process.env.STATION_PROGRAM_ID, { status: "failed", failureReason: reason });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
