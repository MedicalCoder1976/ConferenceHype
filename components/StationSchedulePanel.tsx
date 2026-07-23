"use client";

import { useState } from "react";
import type { StationBreakIn, StationDailySchedule } from "@/lib/station/types";

export function StationSchedulePanel({
  schedules,
  breakIns
}: {
  schedules: StationDailySchedule[];
  breakIns: StationBreakIn[];
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const latestSchedule = schedules[0];
  const canActivate =
    latestSchedule?.programs.length === 6 &&
    latestSchedule.programs.every((program) => program.status === "verified");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

  async function post(url: string, body: unknown) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Request failed");
      setMessage(result.dispatch?.error ?? "Saved. Refresh this page to see the updated station state.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-5 border border-ink/15 bg-white p-5 shadow-panel">
      <div>
        <div className="text-xs font-black uppercase text-broadcast">Continuous journal station</div>
        <h2 className="text-2xl font-black text-ink">Daily three-hour programming wheel</h2>
        <p className="mt-2 text-sm font-semibold text-ink/65">
          Six verified 30-minute journal programs repeat through the day. Drafts never replace the working public player.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button disabled={busy} onClick={() => post("/api/admin/station", { action: "generate_draft", scheduleDate: today, timezone: "America/New_York" })} className="bg-ink px-4 py-3 text-xs font-black uppercase text-white disabled:opacity-50">
          Generate today&apos;s draft
        </button>
        {latestSchedule && latestSchedule.status !== "active" ? (
          <button disabled={busy || !canActivate} onClick={() => post("/api/admin/station", { action: "activate", scheduleId: latestSchedule.id })} className="border border-mint px-4 py-3 text-xs font-black uppercase text-mint disabled:opacity-50">
            Activate only after all six verify
          </button>
        ) : null}
      </div>
      {latestSchedule ? (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {latestSchedule.programs.map((program) => (
            <article key={program.id} className="border border-ink/10 bg-paper/50 p-3">
              <div className="text-[11px] font-black uppercase text-broadcast">+{program.startsAtOffsetMinutes} min {" · "} {program.status}</div>
              <h3 className="mt-1 font-black text-ink">{program.journalName}</h3>
              <p className="text-xs font-semibold text-ink/60">{program.specialty} {" · "} {program.programType.replaceAll("_", " ")}</p>
              {program.programType === "new" && program.status !== "verified" ? (
                <button disabled={busy} onClick={() => post("/api/admin/station/program", { programId: program.id })} className="mt-3 border border-broadcast px-3 py-2 text-[11px] font-black uppercase text-broadcast disabled:opacity-50">
                  Approve quality-passed cards, render and verify
                </button>
              ) : null}
            </article>
          ))}
        </div>
      ) : <p className="text-sm font-semibold text-ink/60">No station draft exists yet.</p>}

      <form className="grid gap-3 border-t border-ink/10 pt-5" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void post("/api/admin/station/break-in", Object.fromEntries(data.entries()));
      }}>
        <div>
          <div className="text-xs font-black uppercase text-broadcast">Manual contingency</div>
          <h3 className="text-xl font-black">Schedule a 15-minute breaking-news break-in</h3>
          <p className="text-sm font-semibold text-ink/60">Top means the next :00 boundary; bottom means the next :30 boundary. The current public video stays in place unless rendering and upload verify.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <select name="placement" defaultValue="top" className="border border-ink/20 p-3 text-sm font-bold"><option value="top">Top of next hour (:00)</option><option value="bottom">Bottom of next hour (:30)</option></select>
          <input required name="title" placeholder="Breaking update title" className="border border-ink/20 p-3 text-sm" />
          <input required name="sourceLabel" placeholder="Source label" className="border border-ink/20 p-3 text-sm" />
          <input required type="url" name="sourceUrl" placeholder="https://source..." className="border border-ink/20 p-3 text-sm" />
        </div>
        <textarea required name="summary" placeholder="Source-grounded summary" className="min-h-24 border border-ink/20 p-3 text-sm" />
        <textarea required name="script" placeholder="Complete narration script" className="min-h-48 border border-ink/20 p-3 text-sm" />
        <button disabled={busy} className="w-fit bg-broadcast px-4 py-3 text-xs font-black uppercase text-white disabled:opacity-50">Validate, render and upload break-in</button>
      </form>
      {message ? <p role="status" className="border border-ink/10 bg-paper p-3 text-sm font-bold">{message}</p> : null}
      {breakIns.length ? <p className="text-xs font-bold text-ink/60">Latest break-in: {breakIns[0].title} {" · "} {breakIns[0].status}</p> : null}
    </section>
  );
}
