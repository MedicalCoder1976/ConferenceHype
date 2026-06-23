"use client";

import { RefreshCcw } from "lucide-react";
import { useState, useTransition } from "react";

export function RunWeeklyBatchButton() {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const run = () => {
    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/run-weekly-batch", { method: "POST" });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Could not start the weekly batch.");
        }
        setMessage(
          "Weekly batch started in GitHub Actions. New cards for every conference, journal, and newspaper land in Brand New Ready Cards when it finishes — no Grok cost."
        );
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not start the weekly batch.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="inline-flex min-h-10 items-center justify-center gap-2 border border-ink bg-white px-4 text-xs font-black uppercase text-ink disabled:opacity-50"
        disabled={pending}
        onClick={run}
      >
        <RefreshCcw className="h-4 w-4" />
        {pending ? "Starting..." : "Run weekly batch now (free)"}
      </button>
      {message ? (
        <div className="max-w-sm border border-ink/10 bg-paper px-3 py-2 text-xs font-bold leading-5 text-ink/70">
          {message}
        </div>
      ) : null}
    </div>
  );
}
