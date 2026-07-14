"use client";

import { Play } from "lucide-react";
import { useState, useTransition } from "react";

export function RunJournalBroadcastButton({
  slotId,
  journalId,
  startsAt
}: {
  slotId: string;
  journalId: string;
  startsAt: string;
}) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const run = () => {
    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/run-journal-broadcast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slotId, journalId, startAt: startsAt })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Could not start this journal broadcast.");
        }
        setMessage("Workflow started in GitHub Actions. Refresh in a minute to see its status.");
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Could not start this journal broadcast."
        );
      }
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        className="inline-flex items-center gap-1 border border-emerald-700 bg-emerald-700 px-2 py-1 text-xs font-black uppercase text-white disabled:opacity-50"
        disabled={pending}
        onClick={run}
      >
        <Play className="h-3 w-3" />
        {pending ? "Starting..." : "Run now"}
      </button>
      {message ? (
        <div className="max-w-[220px] text-[11px] font-semibold leading-4 text-ink/70">
          {message}
        </div>
      ) : null}
    </div>
  );
}
