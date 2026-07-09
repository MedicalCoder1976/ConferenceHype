"use client";

import { Radio, StopCircle } from "lucide-react";
import { useState, useTransition } from "react";

// Two explicit, always-visible actions instead of one state-dependent toggle
// button. Scheduled-only (continuous off) is the default/expected mode —
// continuous mode is the opt-in exception an operator deliberately chooses,
// not something a single ambiguous "Start"/"Stop" toggle should make easy to
// leave on by accident.
export function StartStreamButton({
  initialEnabled,
  startAt,
  label
}: {
  initialEnabled: boolean;
  startAt: string;
  label: string;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [message, setMessage] = useState("");
  const [pendingAction, setPendingAction] = useState<"start" | "stop" | null>(null);
  const [, startTransition] = useTransition();

  const runAction = (action: "start" | "stop") => {
    setMessage("");
    setPendingAction(action);
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/start-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            startAt,
            durationMinutes: "60"
          })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Could not update the stream.");
        }
        setEnabled(action === "start");
        setMessage(
          action === "stop"
            ? "Continuous mode stopped. Only explicitly scheduled hours will air from here."
            : `Continuous mode enabled — broadcast workflow started for ${label}, and future hours will keep airing automatically until stopped.`
        );
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not update the stream.");
      } finally {
        setPendingAction(null);
      }
    });
  };

  const pending = pendingAction !== null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex min-h-10 items-center justify-center gap-2 bg-ink px-4 text-xs font-black uppercase text-white disabled:opacity-50"
          disabled={pending || !enabled}
          onClick={() => runAction("stop")}
        >
          <StopCircle className="h-4 w-4" />
          {pendingAction === "stop" ? "Stopping" : enabled ? "Stop continuous / scheduled only" : "Scheduled only (active)"}
        </button>
        <button
          type="button"
          className="inline-flex min-h-10 items-center justify-center gap-2 bg-broadcast px-4 text-xs font-black uppercase text-white disabled:opacity-50"
          disabled={pending || enabled}
          onClick={() => runAction("start")}
        >
          <Radio className="h-4 w-4" />
          {pendingAction === "start" ? "Starting" : enabled ? "Continuous mode (active)" : "Allow continuous mode"}
        </button>
      </div>
      <div className="max-w-sm text-[11px] font-bold uppercase leading-4 text-ink/50">
        {enabled
          ? "Continuous mode is on — new hours keep airing automatically until stopped."
          : `Scheduled only. Enabling continuous mode now starts the workflow at ${label}.`}
      </div>
      {message ? (
        <div className="max-w-sm border border-ink/10 bg-paper px-3 py-2 text-xs font-bold leading-5 text-ink/70">
          {message}
        </div>
      ) : null}
    </div>
  );
}
