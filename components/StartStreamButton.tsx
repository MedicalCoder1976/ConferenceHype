"use client";

import { Radio } from "lucide-react";
import { useState, useTransition } from "react";

export function StartStreamButton({
  initialEnabled
}: {
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const updateStream = () => {
    const startAt = new Date().toISOString();
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
            : `Continuous broadcasting started at ${new Date(startAt).toLocaleString()}.`
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
            : "Start continuous feed"}
      </button>
      {message ? (
        <div className="max-w-sm border border-ink/10 bg-paper px-3 py-2 text-xs font-bold leading-5 text-ink/70">
          {message}
        </div>
      ) : null}
    </div>
  );
}
