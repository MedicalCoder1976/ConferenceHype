"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

// Reuses the existing /api/admin/approve endpoint -- it already sets
// status: "approved" regardless of the segment's current status, so
// "sending back" an already-rendered card for future re-presentation is
// just a normal approval, not a new backend action.
export function SendBackButton({ segmentId, script }: { segmentId: string; script: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  const sendBack = () => {
    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ segmentId, action: "approve", script })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(
            Array.isArray(payload.errors) ? payload.errors.join(" ") : (payload.error ?? "Could not send this card back.")
          );
        }
        setMessage("Sent back — ready to be scheduled into a future hour again.");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not send this card back.");
      }
    });
  };

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button
        type="button"
        disabled={pending}
        onClick={sendBack}
        className="inline-flex min-h-8 items-center justify-center gap-1 border border-ink/20 bg-white px-3 text-[11px] font-black uppercase text-ink disabled:opacity-50"
      >
        {pending ? "Sending back" : "Send back for re-presentation"}
      </button>
      {message ? (
        <div className="max-w-[220px] text-left text-[10px] font-bold text-ink/60 sm:text-right">{message}</div>
      ) : null}
    </div>
  );
}
