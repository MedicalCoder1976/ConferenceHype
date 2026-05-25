"use client";

import { CalendarDays, Clock3, GripVertical, Mic2, Music2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
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

async function scheduleSegment(segmentId: string, approvedAt: string) {
  const response = await fetch("/api/admin/schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segmentId, approvedAt })
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Could not schedule card.");
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
  scheduleSegments,
  baseTime
}: {
  segments: Segment[];
  scheduleSegments: Segment[];
  baseTime: string;
}) {
  const router = useRouter();
  const [visibleSegments, setVisibleSegments] = useState(segments);
  const [message, setMessage] = useState("");
  const [pendingId, setPendingId] = useState("");
  const [draggingId, setDraggingId] = useState("");
  const [pending, startTransition] = useTransition();
  const baseDate = useMemo(() => new Date(baseTime), [baseTime]);
  const buckets = useMemo(
    () =>
      buildBroadcastHourBuckets(
        buildBroadcastSlots({
          segments: visibleSegments,
          scheduleSegments,
          baseTime: baseDate
        }),
        baseDate
      ),
    [visibleSegments, scheduleSegments, baseDate]
  );

  useEffect(() => {
    setVisibleSegments(segments);
  }, [segments]);

  const reject = (segment: Segment) => {
    setPendingId(segment.id);
    startTransition(async () => {
      try {
        await rejectSegment(segment);
        setVisibleSegments((current) => current.filter((item) => item.id !== segment.id));
        setMessage(`${segment.title} rejected and removed from rundown.`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not reject statement.");
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
          current.map((segment) => (segment.id === segmentId ? updated : segment))
        );
        setMessage(`${updated.title} moved to ${timeLabel(at)}.`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not move card.");
      } finally {
        setPendingId("");
        setDraggingId("");
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
          Drag prepared media, X, social, operator, or sponsor cards into a
          24-hour-clock sequence. Schedule/location breaks are capped as
          two-minute blocks with locations; music remains the designated break.
        </p>
        <div className="mt-3 inline-flex items-center gap-2 border border-ink/10 bg-paper px-3 py-2 text-xs font-black uppercase text-ink/70">
          <CalendarDays className="h-4 w-4 text-broadcast" />
          Window starts {fullDateLabel(baseDate)}
        </div>
        {message ? (
          <div className="mt-3 border border-cyanline/30 bg-cyanline/10 p-3 text-sm font-bold text-ink">
            {message}
          </div>
        ) : null}
      </div>
      <div className="grid gap-4 p-5">
        {visibleSegments.length === 0 && scheduleSegments.length === 0 ? (
          <div className="border border-dashed border-ink/20 bg-paper/60 p-5">
            <h3 className="text-lg font-black text-ink">
              Nothing is queued for the next 3 hours
            </h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-ink/65">
              Approve segments or run generation to load the next-hour rundown.
            </p>
          </div>
        ) : null}
        <div className="border border-ink/10 bg-paper/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-black text-ink">Ready cards</h3>
            <span className="text-xs font-black uppercase text-ink/50">
              {visibleSegments.length} source-backed cards
            </span>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {visibleSegments.map((segment) => (
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
                        {segment.personaName}
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
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
        {buckets.map((bucket, hourIndex) => (
          <article key={bucket.start.toISOString()} className="border border-ink/10 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Clock3 className="h-4 w-4 text-broadcast" />
              <h3 className="text-lg font-black text-ink">
                Hour {hourIndex + 1}: {timeLabel(bucket.start)}
              </h3>
              <span className="ml-auto bg-ink px-2 py-1 text-xs font-black uppercase text-white">
                {bucket.slots.filter((slot) => slot.kind === "statement" || slot.kind === "backup").length} voice cards
              </span>
            </div>
            <div className="mt-3 grid gap-3">
              {bucket.slots.map((slot, index) => (
                <div
                  key={`${slot.kind}-${slot.segment?.id ?? slot.at.toISOString()}-${index}`}
                  onDragOver={(event) => {
                    if (slot.kind !== "schedule") {
                      event.preventDefault();
                    }
                  }}
                  onDrop={(event) => {
                    if (slot.kind === "schedule") {
                      return;
                    }
                    event.preventDefault();
                    moveToSlot(event.dataTransfer.getData("text/plain"), slot.at);
                  }}
                  className={`p-3 ${
                    slot.kind === "music"
                      ? "border border-dashed border-ink/20 bg-white"
                      : slot.kind === "backup"
                        ? "border border-gold/50 bg-gold/10"
                        : "bg-paper"
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
                      {slot.durationMinutes} min
                    </span>
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
                      Drop a prepared card here to place it before/after the music break.
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
