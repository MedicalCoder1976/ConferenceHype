"use client";

import { Ban, Trophy, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
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
  const router = useRouter();
  const [visibleLeaders, setVisibleLeaders] = useState(leaders);
  const [pendingHandle, setPendingHandle] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setVisibleLeaders(leaders);
  }, [leaders]);

  const blacklist = (leader: SocialVoiceLeader) => {
    setPendingHandle(leader.handle);
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/social-voices/blacklist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            handle: leader.handle,
            label: leader.label
          })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Could not blacklist voice.");
        }
        setVisibleLeaders((current) =>
          current.filter((item) => item.handle.toLowerCase() !== leader.handle.toLowerCase())
        );
        setMessage(`${leader.handle} blacklisted and removed from social voice competition.`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not blacklist voice.");
      } finally {
        setPendingHandle("");
      }
    });
  };

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
      {message ? (
        <div className="mt-3 border border-ink/10 bg-paper p-3 text-sm font-bold text-ink">
          {message}
        </div>
      ) : null}
      <div className="mt-4 grid gap-3">
        {visibleLeaders.map((leader, index) => (
          <div
            key={leader.handle}
            className="grid gap-3 border border-ink/10 p-3 sm:grid-cols-[auto_1fr_auto_auto]"
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
            <button
              type="button"
              className="inline-flex min-h-9 items-center justify-center gap-2 border border-ink bg-white px-3 text-xs font-black uppercase text-ink disabled:opacity-50"
              disabled={pending}
              onClick={() => blacklist(leader)}
            >
              <Ban className="h-4 w-4" />
              {pendingHandle === leader.handle ? "Blacklisting" : "Blacklist"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
