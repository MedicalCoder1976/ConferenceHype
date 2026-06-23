"use client";

import { WandSparkles } from "lucide-react";
import { useState, useTransition } from "react";

export function RunRealAiBatchButton() {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const run = () => {
    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/run-generate", { method: "POST" });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Could not start the real-AI batch.");
        }
        setMessage(
          "Real-AI batch started in GitHub Actions. This spends Grok credit — roughly a few cents per run."
        );
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not start the real-AI batch.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="inline-flex min-h-10 items-center justify-center gap-2 bg-broadcast px-4 text-xs font-black uppercase text-white disabled:opacity-50"
        disabled={pending}
        onClick={run}
      >
        <WandSparkles className="h-4 w-4" />
        {pending ? "Starting..." : "Run real-AI batch now (~$0.05)"}
      </button>
      {message ? (
        <div className="max-w-sm border border-ink/10 bg-paper px-3 py-2 text-xs font-bold leading-5 text-ink/70">
          {message}
        </div>
      ) : null}
    </div>
  );
}
