"use client";

import { AlertCircle, CalendarDays, Clock3, GripVertical, Mic2, Music2, RefreshCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { buildBroadcastHourBuckets, buildBroadcastSlots } from "@/lib/rundown/slots";
import type { Segment } from "@/lib/types";

async function rejectSegment(segment: Segment) {
  const response = await fetch("/api/admin/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      segmentId: segment.id,
      action: "reject",
      script: segment.script
    })
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

async function scheduleSegment(segmentId: string, approvedAt: string, script?: string) {
  const response = await fetch("/api/admin/schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segmentId, approvedAt, script })
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(
      payload.error ??
        (Array.isArray(payload.errors) ? payload.errors.join(" ") : "Could not schedule card.")
    );
  }
  return payload.segment as Segment;
}

async function replaceSegment({
  targetSegmentId,
  replacementSegmentId,
  approvedAt,
  script
}: {
  targetSegmentId?: string;
  replacementSegmentId: string;
  approvedAt: string;
  script: string;
}) {
  const response = await fetch("/api/admin/replace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      targetSegmentId:
        targetSegmentId && !targetSegmentId.startsWith("virtual-")
          ? targetSegmentId
          : undefined,
      replacementSegmentId,
      approvedAt,
      script
    })
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(
      payload.error ??
        (Array.isArray(payload.errors) ? payload.errors.join(" ") : "Could not replace card.")
    );
  }
  return payload.segment as Segment;
}

function timeLabel(value?: string | Date) {
  if (!value) {
    return "queued";
  }
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short"
  }).format(date);
}

function fullDateLabel(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short"
  }).format(value);
}

function contentLabel(segment?: Segment) {
  if (!segment) {
    return "";
  }
  if (segment.contentType === "industry_floor") {
    return "exhibitor chatter";
  }
  if (segment.contentType === "abstract_buzz") {
    return "abstract chatter";
  }
  return segment.contentType.replace(/_/g, " ");
}

export function BroadcastRundown({
  segments,
  reviewSegments,
  scheduleSegments,
  socialVoiceSegments,
  baseTime,
  hours = 1
}: {
  segments: Segment[];
  reviewSegments: Segment[];
  scheduleSegments: Segment[];
  socialVoiceSegments: Segment[];
  baseTime: string;
  hours?: number;
}) {
  const router = useRouter();
  const [visibleSegments, setVisibleSegments] = useState(segments);
  const [visibleReviewSegments, setVisibleReviewSegments] = useState(reviewSegments);
  const [drafts, setDrafts] = useState(
    Object.fromEntries(reviewSegments.map((segment) => [segment.id, segment.script]))
  );
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const messageRef = useRef<HTMLDivElement>(null);
  const [pendingId, setPendingId] = useState("");
  const [draggingId, setDraggingId] = useState("");
  const [selectedSlotAt, setSelectedSlotAt] = useState("");
  const [replaceTarget, setReplaceTarget] = useState<{
    at: string;
    segmentId?: string;
    title?: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const baseDate = useMemo(() => new Date(baseTime), [baseTime]);
  const buckets = useMemo(
    () =>
      buildBroadcastHourBuckets(
        buildBroadcastSlots({
          segments: visibleSegments,
          reviewSegments: visibleReviewSegments,
          scheduleSegments,
          socialVoiceSegments,
          baseTime: baseDate,
          hours
        }),
        baseDate,
        hours
      ),
    [visibleSegments, visibleReviewSegments, scheduleSegments, socialVoiceSegments, baseDate, hours]
  );

  useEffect(() => {
    setVisibleSegments(segments);
  }, [segments]);

  useEffect(() => {
    setVisibleReviewSegments(reviewSegments);
    setDrafts((current) => ({
      ...Object.fromEntries(reviewSegments.map((segment) => [segment.id, segment.script])),
      ...current
    }));
  }, [reviewSegments]);

  const showSuccess = (text: string) => {
    setIsError(false);
    setMessage(text);
  };

  const showError = (text: string) => {
    setIsError(true);
    setMessage(text);
    // Bring the message into view so errors can't be missed.
    setTimeout(() => messageRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  };

  const discard = (segment: Segment) => {
    setPendingId(segment.id);
    startTransition(async () => {
      try {
        await rejectSegment(segment);
        setVisibleReviewSegments((current) => current.filter((item) => item.id !== segment.id));
        showSuccess(`${segment.title} discarded.`);
        router.refresh();
      } catch (error) {
        showError(error instanceof Error ? error.message : "Could not discard card.");
      } finally {
        setPendingId("");
      }
    });
  };

  const reject = (segment: Segment) => {
    setPendingId(segment.id);
    startTransition(async () => {
      try {
        await rejectSegment(segment);
        setVisibleSegments((current) => current.filter((item) => item.id !== segment.id));
        setVisibleReviewSegments((current) =>
          current.filter((item) => item.id !== segment.id)
        );
        showSuccess(`${segment.title} rejected and removed from rundown.`);
        router.refresh();
      } catch (error) {
        showError(error instanceof Error ? error.message : "Could not reject statement.");
      } finally {
        setPendingId("");
      }
    });
  };

  const moveToSlot = (segmentId: string, at: Date) => {
    if (!segmentId) {
      return;
    }
    setPendingId(segmentId);
    startTransition(async () => {
      try {
        const updated = await scheduleSegment(segmentId, at.toISOString());
        setVisibleSegments((current) =>
          current.some((segment) => segment.id === segmentId)
            ? current.map((segment) => (segment.id === segmentId ? updated : segment))
            : [...current, updated]
        );
        setVisibleReviewSegments((current) =>
          current.filter((segment) => segment.id !== segmentId)
        );
        showSuccess(`${updated.title} moved to ${timeLabel(at)}.`);
        router.refresh();
      } catch (error) {
        showError(error instanceof Error ? error.message : "Could not move card.");
      } finally {
        setPendingId("");
        setDraggingId("");
      }
    });
  };

  const replaceWithCard = (segment: Segment) => {
    if (!replaceTarget) {
      showError("Select a target slot first — click the Replace button on a presentation queue card, then come back here.");
      return;
    }
    const at = new Date(replaceTarget.at);
    setPendingId(segment.id);
    startTransition(async () => {
      try {
        const replacedSegment = replaceTarget.segmentId
          ? visibleSegments.find((item) => item.id === replaceTarget.segmentId)
          : undefined;
        const updated = await replaceSegment({
          targetSegmentId: replaceTarget.segmentId,
          replacementSegmentId: segment.id,
          approvedAt: at.toISOString(),
          script: drafts[segment.id] ?? segment.script
        });
        setVisibleSegments((current) => [
          ...current.filter(
            (item) => item.id !== replaceTarget.segmentId && item.id !== segment.id
          ),
          updated
        ]);
        setVisibleReviewSegments((current) => {
          const withoutReplacement = current.filter((item) => item.id !== segment.id);
          if (
            replacedSegment &&
            replacedSegment.id !== segment.id &&
            !replacedSegment.id.startsWith("virtual-")
          ) {
            return [
              {
                ...replacedSegment,
                status: "pending_review",
                approvedAt: undefined
              },
              ...withoutReplacement.filter((item) => item.id !== replacedSegment.id)
            ];
          }
          return withoutReplacement;
        });
        showSuccess(`${updated.title} replaced ${replaceTarget.title ?? "the selected card"} at ${timeLabel(at)}.`);
        setReplaceTarget(null);
        router.refresh();
      } catch (error) {
        showError(error instanceof Error ? error.message : "Could not replace card.");
      } finally {
        setPendingId("");
      }
    });
  };

  return (
    <section className="border border-ink/10 bg-white shadow-panel">
      <div className="border-b border-ink/10 p-5">
        <div className="flex items-center gap-2">
          <Clock3 className="h-5 w-5 text-broadcast" />
          <h2 className="text-2xl font-black text-ink">Presentation sequence</h2>
        </div>
        <p className="mt-2 text-sm font-semibold leading-6 text-ink/60">
          Every hour runs 60 content cards at 40 seconds each, each followed by
          a 20-second gap-clip music break (60 pairs × 60 s = 1 h). Voices are
          assigned across cards; every script starts with the voice name here
          from ASCO, then moves directly into the narrative.
        </p>
        <div className="mt-3 inline-flex items-center gap-2 border border-ink/10 bg-paper px-3 py-2 text-xs font-black uppercase text-ink/70">
          <CalendarDays className="h-4 w-4 text-broadcast" />
          Window starts {fullDateLabel(baseDate)}
        </div>
        {message ? (
          <div
            ref={messageRef}
            className={`mt-3 flex items-start gap-2 p-3 text-sm font-bold ${
              isError
                ? "border border-red-400/50 bg-red-50 text-red-800"
                : "border border-cyanline/30 bg-cyanline/10 text-ink"
            }`}
          >
            {isError ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" /> : null}
            <span>{message}</span>
          </div>
        ) : null}
        {replaceTarget ? (
          <div className="mt-3 border border-broadcast/30 bg-broadcast/10 p-3 text-sm font-bold text-ink">
            Replacing {replaceTarget.title ?? "selected card"} at{" "}
            {timeLabel(replaceTarget.at)}. Click &quot;Replace with this&quot; on a brand
            new card.
          </div>
        ) : null}
      </div>
      <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] xl:items-start">
        {visibleSegments.length === 0 && scheduleSegments.length === 0 ? (
          <div className="border border-dashed border-ink/20 bg-paper/60 p-5 xl:col-start-1">
            <h3 className="text-lg font-black text-ink">
              Nothing is queued for the next hour
            </h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-ink/65">
              Approve segments or run generation to load the next-hour rundown.
            </p>
          </div>
        ) : null}
        <div className="border border-ink/10 bg-paper/60 p-4 xl:col-start-2 xl:row-start-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-black text-ink">Brand new ready cards</h3>
            <span className="text-xs font-black uppercase text-ink/50">
              {visibleReviewSegments.length} replacement candidates
            </span>
          </div>
          <p className="mt-2 text-xs font-bold uppercase leading-5 text-ink/50">
            These are the only cards outside the presentation queue. Use them to
            replace existing queue cards, or drag one onto a selected time.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {visibleReviewSegments.length === 0 ? (
              <div className="border border-dashed border-ink/20 bg-white p-4 text-sm font-bold text-ink/55 md:col-span-2">
                No brand new cards are waiting. Run ingest/generation or add an
                operator, emergency, or sponsor message below.
              </div>
            ) : null}
            {visibleReviewSegments.map((segment) => (
              <article
                key={segment.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", segment.id);
                  setDraggingId(segment.id);
                }}
                onDragEnd={() => setDraggingId("")}
                className={`border border-ink/15 bg-white p-3 shadow-sm ${
                  draggingId === segment.id ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  <GripVertical className="mt-1 h-4 w-4 shrink-0 text-ink/40" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="bg-broadcast px-2 py-1 text-[11px] font-black uppercase text-white">
                        New
                      </span>
                      <span className="border border-ink/15 px-2 py-1 text-[11px] font-bold uppercase text-ink/70">
                        {contentLabel(segment)}
                      </span>
                      <span className="text-[11px] font-bold uppercase text-ink/45">
                        {timeLabel(segment.approvedAt ?? segment.createdAt)}
                      </span>
                    </div>
                    <h4 className="mt-2 text-sm font-black leading-5 text-ink">
                      {segment.title}
                    </h4>
                    <p className="mt-1 text-xs font-semibold leading-5 text-ink/65">
                      {segment.summary}
                    </p>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[11px] font-black uppercase text-broadcast">
                        Prepared text and sources
                      </summary>
                      <p className="mt-2 whitespace-pre-wrap border border-ink/10 bg-paper/70 p-2 text-xs leading-5 text-ink/75">
                        {segment.script}
                      </p>
                      {segment.citations.length ? (
                        <ul className="mt-2 grid gap-1 text-[11px] font-semibold leading-4 text-ink/60">
                          {segment.citations.map((citation) => (
                            <li key={`${segment.id}-${citation.label}`}>
                              {citation.label}
                              {citation.url ? ` - ${citation.url}` : ""}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </details>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 bg-broadcast px-3 text-xs font-black uppercase text-white disabled:opacity-50"
                        disabled={pending || !replaceTarget}
                        onClick={() => replaceWithCard(segment)}
                      >
                        <RefreshCcw className="h-3.5 w-3.5" />
                        {pendingId === segment.id ? "Replacing…" : "Replace with this"}
                      </button>
                      <button
                        type="button"
                        className="inline-flex min-h-9 items-center justify-center gap-1 border border-ink/30 bg-white px-3 text-xs font-black uppercase text-ink/60 disabled:opacity-50"
                        disabled={pending}
                        title="Discard — remove this card from the pool"
                        onClick={() => discard(segment)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {pendingId === segment.id ? "…" : "Discard"}
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
        {buckets.map((bucket, hourIndex) => (
          <article key={bucket.start.toISOString()} className="border border-ink/10 p-4 xl:col-start-1">
            <div className="flex flex-wrap items-center gap-2">
              <Clock3 className="h-4 w-4 text-broadcast" />
              <h3 className="text-lg font-black text-ink">
                Hour {hourIndex + 1}: {timeLabel(bucket.start)}
              </h3>
              <span className="ml-auto bg-ink px-2 py-1 text-xs font-black uppercase text-white">
                {bucket.slots.filter((slot) => slot.kind !== "music").length} content / {bucket.slots.filter((slot) => slot.kind === "music").length} music
              </span>
            </div>
            <div className="mt-3 grid gap-3">
              {bucket.slots.map((slot, index) => (
                <div
                  key={`${slot.kind}-${slot.segment?.id ?? slot.at.toISOString()}-${index}`}
                  onDragOver={(event) => {
                    if (slot.kind !== "music") {
                      event.preventDefault();
                    }
                  }}
                  onDrop={(event) => {
                    if (slot.kind === "music") {
                      setMessage("Drop cards on a content slot, not the 20-second music gap card.");
                      return;
                    }
                    event.preventDefault();
                    moveToSlot(event.dataTransfer.getData("text/plain"), slot.at);
                  }}
                  onClick={() => {
                    if (slot.kind !== "music") {
                      setSelectedSlotAt(slot.at.toISOString());
                    }
                  }}
                  className={`p-3 ${
                    slot.kind === "music"
                      ? "border border-dashed border-ink/20 bg-white"
                      : slot.kind === "backup"
                        ? "border border-gold/50 bg-gold/10"
                        : "bg-paper"
                  } ${
                    selectedSlotAt === slot.at.toISOString()
                      ? "outline outline-2 outline-broadcast"
                      : ""
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-1 text-[11px] font-black uppercase text-white ${slot.kind === "music" ? "bg-ink/60" : slot.kind === "backup" ? "bg-gold text-ink" : "bg-broadcast"}`}>
                      {slot.kind}
                    </span>
                    <span className="text-xs font-bold text-ink/50">
                      {timeLabel(slot.at.toISOString())}
                    </span>
                    <span className="border border-ink/10 bg-white px-2 py-1 text-[11px] font-black uppercase text-ink/50">
                      {slot.durationSeconds === 40 ? "0:40" : slot.durationSeconds === 20 ? "0:20" : slot.durationSeconds === 10 ? "0:10" : `${String(Math.floor(slot.durationSeconds / 60)).padStart(1, "0")}:${String(slot.durationSeconds % 60).padStart(2, "0")}`}
                    </span>
                    {slot.kind !== "music" ? (
                      <button
                        type="button"
                        className="border border-broadcast bg-white px-2 py-1 text-[11px] font-black uppercase text-broadcast"
                        onClick={(event) => {
                          event.stopPropagation();
                          setReplaceTarget({
                            at: slot.at.toISOString(),
                            segmentId: slot.segment?.id,
                            title: slot.segment?.title ?? slot.label
                          });
                          setSelectedSlotAt(slot.at.toISOString());
                        }}
                      >
                        Replace
                      </button>
                    ) : null}
                    {slot.segment?.personaName ? (
                      <span className="inline-flex items-center gap-1 border border-ink/15 bg-white px-2 py-1 text-[11px] font-bold uppercase text-ink/70">
                        <Mic2 className="h-3 w-3" />
                        {slot.segment.personaName}
                      </span>
                    ) : null}
                    {slot.segment?.contentType ? (
                      <span className="border border-ink/15 bg-white px-2 py-1 text-[11px] font-bold uppercase text-ink/70">
                        {contentLabel(slot.segment)}
                      </span>
                    ) : null}
                  </div>
                  {slot.kind === "music" ? (
                    <div className="mt-2 flex items-center gap-2 text-xs font-black uppercase text-ink/50">
                      <Music2 className="h-4 w-4" />
                      Ten-second music card.
                    </div>
                  ) : (
                    <>
                      <div className="mt-2 flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-black leading-5 text-ink">
                            {slot.segment?.title ?? slot.label}
                          </h4>
                          <p className="mt-1 text-xs font-semibold leading-5 text-ink/65">
                            {slot.segment?.summary || slot.segment?.script}
                          </p>
                          {slot.segment?.script ? (
                            <details className="mt-2">
                              <summary className="cursor-pointer text-[11px] font-black uppercase text-broadcast">
                                Full prepared text
                              </summary>
                              <p className="mt-2 whitespace-pre-wrap border border-ink/10 bg-white/70 p-2 text-xs leading-5 text-ink/75">
                                {slot.segment.script}
                              </p>
                            </details>
                          ) : null}
                        </div>
                        {slot.segment && !slot.segment.id.startsWith("virtual-") ? (
                          <button
                            className="inline-flex items-center gap-1 border border-ink px-2 py-2 text-[11px] font-black uppercase text-ink disabled:opacity-50"
                            disabled={pending}
                            onClick={() => reject(slot.segment!)}
                          >
                            <Trash2 className="h-3 w-3" />
                            {pendingId === slot.segment.id ? "Rejecting" : "Reject"}
                          </button>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
