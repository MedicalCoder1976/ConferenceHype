"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

// Calls /api/admin/dub-korean, which dispatches the dub-korean-broadcast.yml
// GitHub Actions workflow -- the real translate/synthesize/render/upload work
// never runs in the Vercel-hosted app itself, same pattern as every other
// admin action that renders video (RunJournalBroadcastButton, StartStreamButton).
export function DubToKoreanButton({
  writeoutId,
  status
}: {
  writeoutId: string;
  status: "none" | "pending" | "processing" | "done" | "failed";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  const dub = () => {
    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/dub-korean", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ writeoutId })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Could not start the Korean dub.");
        }
        setMessage("Started — this runs in the background and can take a while.");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not start the Korean dub.");
      }
    });
  };

  if (status === "pending" || status === "processing") {
    return (
      <span className="inline-flex items-center gap-2 border border-ink/20 bg-paper/60 px-3 py-2 text-[11px] font-black uppercase text-ink/60">
        Korean dub {status}…
      </span>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={dub}
        className="inline-flex min-h-8 items-center justify-center gap-1 border border-ink/20 bg-white px-3 text-[11px] font-black uppercase text-ink disabled:opacity-50"
      >
        {pending ? "Starting…" : status === "failed" ? "Retry Korean dub" : "Dub to Korean"}
      </button>
      {message ? (
        <div className="max-w-[260px] text-left text-[10px] font-bold text-ink/60">{message}</div>
      ) : null}
    </div>
  );
}
