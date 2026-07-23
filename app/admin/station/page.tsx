import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { StationSchedulePanel } from "@/components/StationSchedulePanel";
import { getStationBreakInsFromDb, getStationSchedulesFromDb } from "@/lib/station/db";

export const dynamic = "force-dynamic";

export default async function StationAdminPage() {
  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const [schedules, breakIns] = await Promise.all([
    getStationSchedulesFromDb(14).catch(() => []),
    getStationBreakInsFromDb(windowStart, windowEnd).catch(() => [])
  ]);

  return (
    <AdminShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink/65">
          Lightweight station controls, independent of the full editorial card inventory.
        </p>
        <Link href="/admin" className="border border-ink px-4 py-2 text-xs font-black uppercase text-ink">
          Full operator desk
        </Link>
      </div>
      <StationSchedulePanel schedules={schedules ?? []} breakIns={breakIns ?? []} />
    </AdminShell>
  );
}