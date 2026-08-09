"use client";

import { Check, ChevronDown, ChevronUp, Clapperboard, Edit3, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { cardTypeLabel } from "@/lib/broadcast/cardTypes";
import type { Segment } from "@/lib/types";

type Action = "approve" | "reject" | "clip";
const BULK_APPROVAL_REQUEST_SIZE = 1000;

type BulkApprovalSummary = {
  approved: number;
  totalPending: number;
  failedQualityFilter: number;
  failedValidation: number;
  alreadyBroadcastOrQueued: number;
  duplicateWithinPending: number;
};

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

export function ReviewQueue({
  segments,
  title = "Journal cards awaiting approval"
}: {
  segments: Segment[];
  title?: string;
}) {
  const router = useRouter();
  const [visibleSegments, setVisibleSegments] = useState(segments);
  const [drafts, setDrafts] = useState(
    Object.fromEntries(segments.map((segment) => [segment.id, segment.script]))
  );
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(false);
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

  const approveAll = () => {
    if (!window.confirm(`Approve every quality-passing card in the full queue? ${visibleSegments.length} cards are currently awaiting review. Cards that fail validation or duplicate aired/approved material will be skipped.`)) return;
    startTransition(async () => {
      try {
        const segmentIds = visibleSegments.map((segment) => segment.id);
        const batchCount = Math.ceil(segmentIds.length / BULK_APPROVAL_REQUEST_SIZE);
        const summary: BulkApprovalSummary = {
          approved: 0,
          totalPending: 0,
          failedQualityFilter: 0,
          failedValidation: 0,
          alreadyBroadcastOrQueued: 0,
          duplicateWithinPending: 0
        };
        for (let offset = 0; offset < segmentIds.length; offset += BULK_APPROVAL_REQUEST_SIZE) {
          const batchNumber = Math.floor(offset / BULK_APPROVAL_REQUEST_SIZE) + 1;
          setMessage(`Approving batch ${batchNumber} of ${batchCount}...`);
          const response = await fetch("/api/admin/approve/release-all", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ segmentIds: segmentIds.slice(offset, offset + BULK_APPROVAL_REQUEST_SIZE) })
          });
          const responseText = await response.text();
          const payload = responseText
            ? JSON.parse(responseText)
            : { ok: false, error: `Bulk approval failed with HTTP ${response.status}.` };
          if (!response.ok || !payload.ok) throw new Error(payload.error ?? `Bulk approval batch ${batchNumber} failed`);
          for (const key of Object.keys(summary) as Array<keyof BulkApprovalSummary>) {
            summary[key] += payload[key] ?? 0;
          }
        }
        setMessage(
          `Approved ${summary.approved} of ${summary.totalPending} pending cards. ` +
          `${summary.failedQualityFilter + summary.failedValidation} failed quality checks; ` +
          `${summary.alreadyBroadcastOrQueued + summary.duplicateWithinPending} duplicates were skipped.`
        );
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Bulk approval failed");
      }
    });
  };
  return (
    <section className="border border-ink/10 bg-white shadow-panel">
      <div className="border-b border-ink/10 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-ink">{title}</h2>
            <p className="mt-1 text-sm font-black uppercase text-broadcast">{visibleSegments.length} pending</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="inline-flex min-h-11 items-center justify-center gap-2 bg-mint px-4 text-sm font-black uppercase text-white disabled:opacity-50" disabled={pending || visibleSegments.length === 0} onClick={approveAll}>
              <Check className="h-4 w-4" />
              {pending ? "Approving…" : "Approve all"}
            </button>
            <button className="inline-flex min-h-11 items-center justify-center gap-2 border border-ink px-4 text-sm font-black uppercase text-ink" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {expanded ? "Hide cards" : "View all cards"}
            </button>
          </div>
        </div>
        <p className="mt-2 text-sm font-semibold text-ink/60">
          This queue is restricted to evidence-based journal articles linked
          to a journal in the Journal catalog. Conference and newspaper cards
          belong to their own broadcast verticals.
        </p>
        {message ? (
          <div className="mt-3 border border-cyanline/30 bg-cyanline/10 p-3 text-sm font-bold text-ink">
            {message}
          </div>
        ) : null}
      </div>
      {expanded ? (
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
                {cardTypeLabel(segment)}
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
      ) : null}
    </section>
  );
}
