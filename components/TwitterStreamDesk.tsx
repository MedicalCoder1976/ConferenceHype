"use client";

import { useMemo, useState } from "react";
import type { StationDailySchedule } from "@/lib/station/types";

type Replay = {
  id: string;
  specialty: string;
  journal: string;
  title: string;
  videoId: string;
  scheduleDate: string;
};

function previousVerifiedReplays(schedules: StationDailySchedule[], today: string) {
  const seen = new Set<string>();
  return schedules
    .filter((schedule) => schedule.scheduleDate < today)
    .flatMap((schedule) => schedule.programs.map((program) => ({ schedule, program })))
    .filter(({ program }) => program.status === "verified" && Boolean(program.youtubeVideoId) && program.programType !== "fallback")
    .sort((left, right) => right.schedule.scheduleDate.localeCompare(left.schedule.scheduleDate) || left.program.position - right.program.position)
    .flatMap(({ schedule, program }) => {
      const videoId = program.youtubeVideoId!;
      if (seen.has(videoId)) return [];
      seen.add(videoId);
      return [{
        id: program.id,
        specialty: program.specialty,
        journal: program.journalName,
        title: program.title || `${program.journalName} journal broadcast`,
        videoId,
        scheduleDate: schedule.scheduleDate
      } satisfies Replay];
    });
}

function addMinutes(time: string, minutes: number) {
  const [hour, minute] = time.split(":").map(Number);
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function TwitterStreamDesk({ schedules, today }: { schedules: StationDailySchedule[]; today: string }) {
  const replays = useMemo(() => previousVerifiedReplays(schedules, today), [schedules, today]);
  const specialties = [...new Set(replays.map((replay) => replay.specialty))].sort();
  const [specialty, setSpecialty] = useState(specialties[0] ?? "");
  const [startTime, setStartTime] = useState("08:00");
  const [hours, setHours] = useState(5);
  const [copied, setCopied] = useState(false);
  const eligible = replays.filter((replay) => replay.specialty === specialty);
  const slots = Array.from({ length: hours * 2 }, (_, index) => ({
    at: addMinutes(startTime, index * 30),
    replay: eligible[index % Math.max(eligible.length, 1)]
  }));

  const copyPlan = async () => {
    const text = slots.map(({ at, replay }) => replay
      ? `${at} ET | ${replay.journal} | ${replay.title} | https://youtu.be/${replay.videoId}`
      : `${at} ET | No verified ${specialty} replay available`).join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  return (
    <section className="border border-ink/10 bg-white p-5 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase text-broadcast">Zero-cost replay planner</p>
          <h2 className="mt-1 text-2xl font-black text-ink">Twitter / X Stream</h2>
          <p className="mt-2 max-w-3xl text-sm text-ink/65">
            Build a same-specialty stream from verified previous journal broadcasts. The plan schedules two broadcasts per hour, one at each half-hour boundary, and reuses existing videos without new rendering or AI cost.
          </p>
        </div>
        <button type="button" onClick={copyPlan} disabled={!eligible.length} className="min-h-11 bg-ink px-4 text-xs font-black uppercase text-white disabled:cursor-not-allowed disabled:opacity-40">
          {copied ? "Plan copied" : "Copy run plan"}
        </button>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <label className="grid gap-1 text-xs font-black uppercase text-ink/70">Specialty
          <select value={specialty} onChange={(event) => { setSpecialty(event.target.value); setCopied(false); }} className="min-h-11 border border-ink/20 bg-white px-3 text-sm font-semibold normal-case text-ink">
            {specialties.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-black uppercase text-ink/70">Start time (ET)
          <input type="time" value={startTime} onChange={(event) => { setStartTime(event.target.value); setCopied(false); }} className="min-h-11 border border-ink/20 px-3 text-sm font-semibold normal-case text-ink" />
        </label>
        <label className="grid gap-1 text-xs font-black uppercase text-ink/70">Duration
          <select value={hours} onChange={(event) => { setHours(Number(event.target.value)); setCopied(false); }} className="min-h-11 border border-ink/20 bg-white px-3 text-sm font-semibold normal-case text-ink">
            {[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{value} hour{value === 1 ? "" : "s"}</option>)}
          </select>
        </label>
      </div>

      {!eligible.length ? (
        <p className="mt-5 border border-broadcast/30 bg-broadcast/5 p-4 text-sm font-semibold text-ink">No prior verified replay is available for this specialty.</p>
      ) : (
        <div className="mt-5 grid gap-2">
          {slots.map(({ at, replay }, index) => replay && (
            <div key={`${at}-${index}`} className="grid gap-2 border border-ink/10 p-3 text-sm md:grid-cols-[5rem_1fr_auto] md:items-center">
              <span className="font-black text-broadcast">{at} ET</span>
              <span><strong>{replay.journal}</strong> — {replay.title}</span>
              <a href={`https://youtu.be/${replay.videoId}`} target="_blank" rel="noreferrer" className="font-black uppercase text-ink underline">Replay</a>
            </div>
          ))}
        </div>
      )}

      <p className="mt-5 border-l-4 border-gold bg-gold/10 p-3 text-sm text-ink/75">
        Live X delivery still requires an X Media Studio Producer ingest destination and a persistent local encoder. This tab deliberately does not claim the stream is live until those account capabilities pass a private test.
      </p>
    </section>
  );
}
