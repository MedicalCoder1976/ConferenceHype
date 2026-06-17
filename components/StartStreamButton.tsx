"use client";

import { Radio } from "lucide-react";
import { useState, useTransition } from "react";

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
  const [pending, startTransition] = useTransition();

  const updateStream = () => {
    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/start-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: enabled ? "stop" : "start",
            startAt,
            durationMinutes: "60"
          })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Could not start stream.");
        }
        setEnabled(!enabled);
        setMessage(
          enabled
            ? "Continuous broadcasting will stop after the current hour."
            : `Broadcast workflow started for ${label}.`
        );
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not start stream.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="inline-flex min-h-10 items-center justify-center gap-2 bg-broadcast px-4 text-xs font-black uppercase text-white disabled:opacity-50"
        disabled={pending}
        onClick={updateStream}
      >
        <Radio className="h-4 w-4" />
        {pending
          ? enabled
            ? "Stopping"
            : "Starting"
          : enabled
            ? "Stop continuous feed"
            : "Start selected hour"}
      </button>
      {!enabled ? (
        <div className="max-w-sm text-[11px] font-bold uppercase leading-4 text-ink/50">
          Starts the workflow at {label}
        </div>
      ) : null}
      {message ? (
        <div className="max-w-sm border border-ink/10 bg-paper px-3 py-2 text-xs font-bold leading-5 text-ink/70">
          {message}
        </div>
      ) : null}
    </div>
  );
}
