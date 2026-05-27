"use client";

import { Check, Clapperboard, Edit3, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { Segment } from "@/lib/types";

type Action = "approve" | "reject" | "clip";

async function submitAction(segmentId: string, action: Action, script: string) {
  const endpoint =
    action === "clip" ? "/api/clips/create" : "/api/admin/approve";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segmentId, action, script })
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

export function ReviewQueue({ segments }: { segments: Segment[] }) {
  const router = useRouter();
  const [visibleSegments, setVisibleSegments] = useState(segments);
  const [drafts, setDrafts] = useState(
    Object.fromEntries(segments.map((segment) => [segment.id, segment.script]))
  );
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setVisibleSegments(segments);
    setDrafts((current) => ({
      ...Object.fromEntries(segments.map((segment) => [segment.id, segment.script])),
      ...current
    }));
  }, [segments]);

  const run = (segment: Segment, action: Action) => {
    startTransition(async () => {
      try {
        await submitAction(segment.id, action, drafts[segment.id] ?? "");
        if (action === "approve" || action === "reject") {
          setVisibleSegments((current) =>
            current.filter((item) => item.id !== segment.id)
          );
        }
        const actionLabel =
          action === "approve"
            ? "approved for broadcast"
            : action === "reject"
              ? "rejected"
              : "clip queued";
        setMessage(`${segment.title}: ${actionLabel}`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Action failed");
      }
    });
  };

  return (
    <section className="border border-ink/10 bg-white shadow-panel">
      <div className="border-b border-ink/10 p-5">
        <h2 className="text-2xl font-black text-ink">Human review queue</h2>
        <p className="mt-2 text-sm font-semibold text-ink/60">
          Approve before placement. Broadcast-ready items must come from
          source-backed sources, articles, monitored X voices, operator
          statements, or sponsor messages.
        </p>
        {message ? (
          <div className="mt-3 border border-cyanline/30 bg-cyanline/10 p-3 text-sm font-bold text-ink">
            {message}
          </div>
        ) : null}
      </div>
      <div className="grid gap-5 p-5">
        {visibleSegments.length === 0 ? (
          <div className="border border-dashed border-ink/20 bg-paper/60 p-5">
            <h3 className="text-lg font-black text-ink">
              No items are waiting for approval right now
            </h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-ink/65">
              Use Focus a URL, X post, or Instagram post to send a source into
              this queue. Once an item appears here, edit the script if needed
              and click Approve for broadcast.
            </p>
          </div>
        ) : null}
        {visibleSegments.map((segment) => (
          <article key={segment.id} className="border border-ink/10 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-broadcast px-3 py-1 text-xs font-black uppercase text-white">
                {segment.contentType.replace("_", " ")}
              </span>
              <span className="bg-ink px-3 py-1 text-xs font-black uppercase text-white">
                {segment.personaName}
              </span>
              <span className="border border-ink/15 px-3 py-1 text-xs font-bold uppercase text-ink/70">
                confidence {segment.confidenceScore}%
              </span>
            </div>
            <h3 className="mt-4 text-xl font-black text-ink">
              {segment.title}
            </h3>
            <textarea
              className="mt-3 min-h-52 w-full resize-y border border-ink/20 p-3 text-sm leading-6 outline-none focus:border-cyanline"
              value={drafts[segment.id] ?? ""}
              onChange={(event) =>
                setDrafts((current) => ({
                  ...current,
                  [segment.id]: event.target.value
                }))
              }
            />
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <button
                className="inline-flex items-center justify-center gap-2 bg-mint px-4 py-3 text-sm font-black uppercase text-white disabled:opacity-50"
                disabled={pending}
                onClick={() => run(segment, "approve")}
              >
                <Check className="h-4 w-4" />
                Approve for broadcast
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 bg-gold px-4 py-3 text-sm font-black uppercase text-ink disabled:opacity-50"
                disabled={pending}
                onClick={() => run(segment, "clip")}
              >
                <Clapperboard className="h-4 w-4" />
                Create clip
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 border border-ink px-4 py-3 text-sm font-black uppercase text-ink disabled:opacity-50"
                disabled={pending}
                onClick={() => run(segment, "reject")}
              >
                <Trash2 className="h-4 w-4" />
                Reject
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs font-bold uppercase text-ink/55">
              <Edit3 className="h-3 w-3" />
              Operator edits are saved with the decision record.
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
