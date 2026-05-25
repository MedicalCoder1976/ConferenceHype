"use client";

import { Trophy, Zap } from "lucide-react";
import type { SocialVoiceLeader } from "@/lib/types";

function momentumLabel(momentum: SocialVoiceLeader["momentum"]) {
  if (momentum === "rising") {
    return "rising fast";
  }
  if (momentum === "steady") {
    return "on the board";
  }
  return "new challenger";
}

export function SocialVoiceCompetition({
  leaders,
  cadence,
  dueNow
}: {
  leaders: SocialVoiceLeader[];
  cadence: string;
  dueNow: boolean;
}) {
  return (
    <section className="border border-ink/10 bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <Trophy className="h-5 w-5 text-gold" />
        <h2 className="text-xl font-black text-ink">Social voice competition</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-ink/65">
        The top ASCO voices are ranked from recent X search results, watched
        handles, mention counts, and engagement signals. High-traction voices
        are automatically added to Source intake as X follows so the next
        social ingest can monitor them.
      </p>
      <div className="mt-3 border border-cyanline/30 bg-cyanline/10 p-3 text-sm font-bold text-ink">
        {dueNow ? "Competition segment is due in this 3-hour block." : cadence}
      </div>
      <div className="mt-4 grid gap-3">
        {leaders.map((leader, index) => (
          <div
            key={leader.handle}
            className="grid gap-3 border border-ink/10 p-3 sm:grid-cols-[auto_1fr_auto]"
          >
            <div className="flex h-10 w-10 items-center justify-center bg-ink text-sm font-black text-white">
              {`#${index + 1}`}
            </div>
            <div>
              <div className="text-sm font-black text-ink">
                {leader.label} <span className="text-broadcast">{leader.handle}</span>
              </div>
              <div className="mt-1 text-xs font-bold uppercase text-ink/50">
                {momentumLabel(leader.momentum)} - {leader.note}
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm font-black text-ink">
              <Zap className="h-4 w-4 text-broadcast" />
              {leader.score}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
