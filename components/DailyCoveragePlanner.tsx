"use client";

import { CalendarCheck, CheckCircle2, ExternalLink, Plus, Save, Send, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createDefaultDailyCoveragePlan,
  normalizeLegacyDailyCoverageDefaults
} from "@/lib/dailyCoverage";
import { errorMessage } from "@/lib/errors";
import { isGenericConferenceLandingItem } from "@/lib/intakeSelection";
import type {
  DailyCoveragePlan,
  IngestedItem,
  MedicalConference,
  OncologyJournal,
  SourceConfig
} from "@/lib/types";

type PlanningDay = {
  key: string;
  label: string;
  slots: Array<{
    href: string;
    label: string;
    selected: boolean;
  }>;
};

type BatchStatus = {
  state: "idle" | "saving" | "creating" | "done" | "error";
  text: string;
  count?: number;
  titles?: string[];
  segmentIds?: string[];
  scheduledCount?: number;
};

function listFromText(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isOngoing(conference: MedicalConference, date: string) {
  return Boolean(
    conference.startDate &&
      conference.endDate &&
      date >= conference.startDate &&
      date <= conference.endDate
  );
}

function SelectionGroup({
  title,
  count,
  children
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <details open className="border border-ink/10 bg-paper/50">
      <summary className="cursor-pointer list-none p-3 text-sm font-black uppercase text-ink">
        {title} <span className="text-broadcast">({count} selected)</span>
      </summary>
      <div className="grid gap-2 border-t border-ink/10 p-3 sm:grid-cols-2 xl:grid-cols-3">
        {children}
      </div>
    </details>
  );
}

export function DailyCoveragePlanner({
  initialPlan,
  conferences,
  journals,
  sources,
  planningDays,
  activePlanningKey,
  selectedStartsAt,
  initialBatchItems
}: {
  initialPlan: DailyCoveragePlan;
  conferences: MedicalConference[];
  journals: OncologyJournal[];
  sources: SourceConfig[];
  planningDays: PlanningDay[];
  activePlanningKey: string;
  selectedStartsAt: string;
  initialBatchItems: IngestedItem[];
}) {
  const router = useRouter();
  const [plan, setPlan] = useState(initialPlan);
  const [batchItems, setBatchItems] = useState(initialBatchItems);
  const [message, setMessage] = useState("");
  const [batchStatus, setBatchStatus] = useState<BatchStatus>({
    state: "idle",
    text: ""
  });
  const [pendingItemId, setPendingItemId] = useState("");
  const [pendingBatch, setPendingBatch] = useState(false);
  const [pendingScheduleBatch, setPendingScheduleBatch] = useState(false);
  const [pending, startTransition] = useTransition();
  const [customLabel, setCustomLabel] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [customNotes, setCustomNotes] = useState("");
  const [priorityText, setPriorityText] = useState(initialPlan.priorityTopics.join("\n"));
  const [exclusionsText, setExclusionsText] = useState(initialPlan.exclusions.join("\n"));

  const toggle = (
    field: "conferenceIds" | "journalIds" | "sourceIds",
    id: string
  ) => {
    setPlan((current) => ({
      ...current,
      [field]: current[field].includes(id)
        ? current[field].filter((item) => item !== id)
        : [...current[field], id]
    }));
  };

  const loadDate = (coverageDate: string) => {
    setMessage("");
    startTransition(async () => {
      try {
        const [coverageResponse, intakeResponse] = await Promise.all([
          fetch(`/api/admin/daily-coverage?date=${encodeURIComponent(coverageDate)}`),
          fetch(`/api/admin/intake-cards?date=${encodeURIComponent(coverageDate)}`)
        ]);
        const payload = await coverageResponse.json();
        const intakePayload = await intakeResponse.json();
        if (!coverageResponse.ok || !payload.ok) {
          throw new Error(payload.error ?? "Could not load coverage plan.");
        }
        if (!intakeResponse.ok || !intakePayload.ok) {
          throw new Error(intakePayload.error ?? "Could not load batch intake cards.");
        }
        const nextPlan = normalizeLegacyDailyCoverageDefaults({
          plan:
            payload.plan ??
            createDefaultDailyCoveragePlan({
              coverageDate,
              conferences
            }),
          journals,
          sources
        });
        setPlan(nextPlan);
        setBatchItems(intakePayload.items ?? []);
        setPriorityText(nextPlan.priorityTopics.join("\n"));
        setExclusionsText(nextPlan.exclusions.join("\n"));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not load coverage plan.");
      }
    });
  };

  const selectedConferences = conferences.filter((conference) =>
    plan.conferenceIds.includes(conference.id)
  );
  const selectedJournals = journals.filter((journal) =>
    plan.journalIds.includes(journal.id)
  );
  const hasAnySelection =
    selectedConferences.length > 0 || plan.journalIds.length > 0 || plan.sourceIds.length > 0;
  const matchingBatchItems = batchItems.filter((item) => {
    if (isGenericConferenceLandingItem(item)) {
      return false;
    }
    if (!hasAnySelection) {
      return false;
    }
    const conferenceMatch = selectedConferences.some(
      (conference) =>
        item.sourceId === conference.id ||
        item.sourceId === `daily-conference-${conference.id}`
    );
    const journalMatch = selectedJournals.some((journal) =>
      item.sourceId === journal.id ||
      item.sourceId === `daily-journal-${journal.id}`
    );
    const sourceMatch = Boolean(item.sourceId && plan.sourceIds.includes(item.sourceId));
    return conferenceMatch || journalMatch || sourceMatch;
  }).slice(0, 24);

  const addBatchCard = (item: IngestedItem) => {
    setPendingItemId(item.id);
    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/intake-cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: item.id })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Could not create ready card.");
        }
        setMessage(`${payload.segment.title} added to Brand New Ready Cards for review.`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not create ready card.");
      } finally {
        setPendingItemId("");
      }
    });
  };

  const createHourBatch = () => {
    setMessage("");
    setBatchStatus({
      state: "saving",
      text: "Saving the selected conference, journal, and source choices before card creation."
    });
    setPendingBatch(true);
    startTransition(async () => {
      try {
        const priorityTopics = listFromText(priorityText);
        const exclusions = listFromText(exclusionsText);
        const planToSave = {
          ...plan,
          priorityTopics,
          exclusions
        };
        const saveResponse = await fetch("/api/admin/daily-coverage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(planToSave)
        });
        const savePayload = await saveResponse.json();
        if (!saveResponse.ok || !savePayload.ok) {
          throw new Error(savePayload.error ?? "Could not save coverage plan.");
        }
        const savedPlan = savePayload.plan as DailyCoveragePlan;
        setPlan(savedPlan);
        setBatchStatus({
          state: "creating",
          text:
            "Creating source-grounded ready cards for the selected one-hour slot. If stored prior-day matches are empty, the server will fetch the selected sources now."
        });

        const batchResponse = await fetch("/api/admin/intake-cards/hour", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            coverageDate: savedPlan.coverageDate,
            startsAt: selectedStartsAt,
            conferenceIds: savedPlan.conferenceIds,
            journalIds: savedPlan.journalIds,
            sourceIds: savedPlan.sourceIds,
            priorityTopics,
            exclusions,
            maxCards: 24
          })
        });
        const batchPayload = await batchResponse.json();
        if (!batchResponse.ok || !batchPayload.ok) {
          throw new Error(errorMessage(batchPayload.error, "Could not create one-hour ready cards."));
        }
        const createdTitles = Array.isArray(batchPayload.segments)
          ? batchPayload.segments
              .map((segment: { title?: string }) => segment.title)
              .filter(Boolean)
              .slice(0, 4)
          : [];
        const createdSegmentIds = Array.isArray(batchPayload.segments)
          ? batchPayload.segments
              .map((segment: { id?: string }) => segment.id)
              .filter(Boolean)
          : [];
        setBatchStatus({
          state: "done",
          text:
            batchPayload.sourceMode === "on_demand_ingest"
              ? "Batch complete after an on-demand source fetch. Review the cards in Brand New Ready Cards, or accept them now to schedule this selected hour."
              : "Batch complete from stored prior-day intake. Review the cards in Brand New Ready Cards, or accept them now to schedule this selected hour.",
          count: batchPayload.count,
          titles: createdTitles,
          segmentIds: createdSegmentIds
        });
        setMessage(
          `${batchPayload.count} one-hour batch cards added to Brand New Ready Cards. Use Accept and schedule this hour to place them into the selected slot, or edit/drag/replace them manually.`
        );
        router.refresh();
      } catch (error) {
        const text =
          errorMessage(error, "Could not create one-hour ready cards.");
        setBatchStatus({
          state: "error",
          text
        });
        setMessage(text);
      } finally {
        setPendingBatch(false);
      }
    });
  };

  const scheduleCreatedBatch = () => {
    if (!batchStatus.segmentIds?.length) return;
    setPendingScheduleBatch(true);
    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/intake-cards/hour/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startsAt: selectedStartsAt,
            segmentIds: batchStatus.segmentIds
          })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          const detail = Array.isArray(payload.errors) ? payload.errors.join(" ") : payload.error;
          throw new Error(detail ?? "Could not schedule the created batch cards.");
        }
        setBatchStatus((current) => ({
          ...current,
          text:
            "Accepted. These cards were copied into the selected hour as approved scheduled cards. The originals remain in Brand New Ready Cards for reuse.",
          scheduledCount: payload.count
        }));
        setMessage(`${payload.count} cards scheduled into the selected one-hour broadcast slot.`);
        router.refresh();
      } catch (error) {
        const text =
          error instanceof Error ? error.message : "Could not schedule the created batch cards.";
        setBatchStatus((current) => ({
          ...current,
          state: "error",
          text
        }));
        setMessage(text);
      } finally {
        setPendingScheduleBatch(false);
      }
    });
  };

  const save = () => {
    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/daily-coverage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...plan,
            priorityTopics: listFromText(priorityText),
            exclusions: listFromText(exclusionsText)
          })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Could not save coverage plan.");
        }
        setPlan(payload.plan);
        setMessage(`Coverage decisions saved for ${plan.coverageDate}.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not save coverage plan.");
      }
    });
  };

  const addCustomItem = () => {
    if (!customLabel.trim()) return;
    setPlan((current) => ({
      ...current,
      customItems: [
        ...current.customItems,
        {
          id: crypto.randomUUID(),
          label: customLabel.trim(),
          url: customUrl.trim() || undefined,
          notes: customNotes.trim() || undefined
        }
      ]
    }));
    setCustomLabel("");
    setCustomUrl("");
    setCustomNotes("");
  };

  return (
    <section className="border border-ink/10 bg-white shadow-panel">
      <div className="border-b border-ink/10 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-broadcast" />
              <h2 className="text-2xl font-black text-ink">Daily coverage decisions</h2>
            </div>
            <p className="mt-2 text-sm font-semibold leading-6 text-ink/65">
              These selections determine which conference sites, journal RSS feeds,
              clinical news outlets, and operator priorities enter today&apos;s intake.
            </p>
          </div>
          <label className="text-xs font-black uppercase text-ink/60">
            Coverage date
            <input
              type="date"
              value={plan.coverageDate}
              onChange={(event) => loadDate(event.target.value)}
              className="ml-3 border border-ink/20 px-3 py-2 text-sm font-semibold normal-case"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 border border-ink/10 bg-paper/60 p-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-black uppercase text-ink/50">
              Selected one-hour slot
            </div>
            <div className="text-sm font-black text-ink">
              {new Intl.DateTimeFormat("en-US", {
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
                timeZoneName: "short"
              }).format(new Date(selectedStartsAt))}
            </div>
          </div>
          <button
            type="button"
            disabled={pending || pendingBatch}
            onClick={createHourBatch}
            className="inline-flex min-h-11 items-center justify-center gap-2 bg-ink px-4 text-xs font-black uppercase text-white disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {pendingBatch ? "Creating batch" : "Create one-hour batch cards"}
          </button>
        </div>
        {batchStatus.state !== "idle" ? (
          <div
            className={`mt-3 border p-3 text-sm font-bold ${
              batchStatus.state === "error"
                ? "border-red-400/50 bg-red-50 text-red-800"
                : batchStatus.state === "done"
                  ? "border-cyanline/40 bg-cyanline/10 text-ink"
                  : "border-gold/50 bg-gold/10 text-ink"
            }`}
            aria-live="polite"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-ink px-2 py-1 text-[11px] font-black uppercase text-white">
                Batch status
              </span>
              <span className="text-xs font-black uppercase">
                {batchStatus.state === "done"
                  ? `${batchStatus.count ?? 0} cards created`
                  : batchStatus.state}
              </span>
            </div>
            <p className="mt-2 leading-6">{batchStatus.text}</p>
            {batchStatus.titles?.length ? (
              <ul className="mt-2 grid gap-1 text-xs font-semibold leading-5 text-ink/65">
                {batchStatus.titles.map((title) => (
                  <li key={title}>Created: {title}</li>
                ))}
              </ul>
            ) : null}
            {batchStatus.state === "done" && batchStatus.segmentIds?.length ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={pending || pendingScheduleBatch || Boolean(batchStatus.scheduledCount)}
                  onClick={scheduleCreatedBatch}
                  className="inline-flex min-h-10 items-center justify-center gap-2 bg-broadcast px-4 text-xs font-black uppercase text-white disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {batchStatus.scheduledCount
                    ? `${batchStatus.scheduledCount} cards scheduled`
                    : pendingScheduleBatch
                      ? "Scheduling"
                      : "Accept and schedule this hour"}
                </button>
                <span className="text-xs font-semibold leading-5 text-ink/55">
                  Created cards are only ready-card candidates until they are scheduled.
                  Scheduled cards show as approved in the presentation sequence below.
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="mt-4">
          <div className="mb-2 text-xs font-black uppercase text-ink/50">
            One-hour planning slots - 24 h back through next week
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {planningDays.map((day) => (
              <details
                key={day.key}
                open={day.key === activePlanningKey}
                className="border border-ink/10 bg-paper/60"
              >
                <summary className="cursor-pointer list-none px-3 py-2 text-xs font-black uppercase text-ink/70">
                  {day.label} <span className="text-broadcast">({day.slots.length})</span>
                </summary>
                <div className="grid grid-cols-2 gap-2 border-t border-ink/10 p-2 sm:grid-cols-3">
                  {day.slots.map((item) => (
                    <Link
                      key={item.href}
                      className={`min-h-9 border px-2 py-2 text-center text-xs font-black uppercase ${
                        item.selected
                          ? "border-ink bg-ink text-white"
                          : "border-ink/10 bg-white text-ink/70 hover:border-broadcast"
                      }`}
                      href={item.href}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
        {message ? (
          <div className="mt-3 border border-cyanline/30 bg-cyanline/10 p-3 text-sm font-bold">
            {message}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 p-5">
        <SelectionGroup title="Conferences and meetings" count={plan.conferenceIds.length}>
          {conferences.map((conference) => {
            const ongoing = isOngoing(conference, plan.coverageDate);
            return (
              <label key={conference.id} className="flex gap-3 border border-ink/10 bg-white p-3">
                <input
                  type="checkbox"
                  checked={plan.conferenceIds.includes(conference.id)}
                  onChange={() => toggle("conferenceIds", conference.id)}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-black">{conference.name}</span>
                  <span className="block text-xs font-semibold text-ink/50">
                    {conference.startDate ?? `${conference.year}-${String(conference.month).padStart(2, "0")}`}
                    {ongoing ? " - ongoing today" : ""}
                  </span>
                </span>
              </label>
            );
          })}
        </SelectionGroup>

        <SelectionGroup title="Journal RSS feeds" count={plan.journalIds.length}>
          {journals.map((journal) => (
            <label key={journal.id} className="flex gap-3 border border-ink/10 bg-white p-3">
              <input
                type="checkbox"
                checked={plan.journalIds.includes(journal.id)}
                onChange={() => toggle("journalIds", journal.id)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-black">{journal.name}</span>
                <span className="block truncate text-xs font-semibold text-ink/50">
                  {journal.rssUrl}
                </span>
              </span>
            </label>
          ))}
        </SelectionGroup>

        <SelectionGroup title="Clinical news and newspapers" count={plan.sourceIds.length}>
          {sources
            .filter((source) => source.type !== "general_social" && source.type !== "manual")
            .map((source) => (
              <label key={source.id} className="flex gap-3 border border-ink/10 bg-white p-3">
                <input
                  type="checkbox"
                  checked={plan.sourceIds.includes(source.id)}
                  onChange={() => toggle("sourceIds", source.id)}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-black">{source.name}</span>
                  <span className="block truncate text-xs font-semibold text-ink/50">
                    {source.url}
                  </span>
                </span>
              </label>
            ))}
        </SelectionGroup>

        <section className="border border-ink/10 bg-paper/50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-ink">Previous-day batch intake cards</h3>
              <p className="mt-1 text-sm font-semibold leading-6 text-ink/60">
                To keep costs low, the admin desk uses yesterday&apos;s batch-ingested conference, journal, and clinical-news items here. Selecting a card creates a detailed summary segment in Brand New Ready Cards for review and placement.
              </p>
            </div>
            <span className="border border-ink/10 bg-white px-3 py-2 text-xs font-black uppercase text-ink/60">
              {matchingBatchItems.length} visible
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {matchingBatchItems.length === 0 ? (
              <div className="border border-dashed border-ink/20 bg-white p-4 text-sm font-bold text-ink/55 md:col-span-2 xl:col-span-3">
                No previous-day batch cards match the selected conference, journal, or clinical-news sources yet. Run the ingest/generation batch for the prior day, then return here.
              </div>
            ) : null}
            {matchingBatchItems.map((item) => {
              const detail = item.excerpt.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
              return (
                <article key={item.id} className="grid gap-3 border border-ink/10 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="bg-ink px-2 py-1 text-[11px] font-black uppercase text-white">
                      {item.sourceType.replace(/_/g, " ")}
                    </span>
                    <span className="text-[11px] font-bold uppercase text-ink/45">
                      {item.sourceName}
                    </span>
                  </div>
                  <h4 className="text-sm font-black leading-5 text-ink">{item.title}</h4>
                  <p className="text-xs font-semibold leading-5 text-ink/65">
                    {detail ? (detail.length > 360 ? `${detail.slice(0, 357)}...` : detail) : "No excerpt was available in the batch item. Open the source before selecting."}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 border border-ink/20 px-3 text-xs font-black uppercase text-ink">
                      Open source <ExternalLink className="h-3 w-3" />
                    </a>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => addBatchCard(item)}
                      className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 bg-broadcast px-3 text-xs font-black uppercase text-white disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {pendingItemId === item.id ? "Adding" : "Add to ready cards"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-2">
          <label className="text-xs font-black uppercase text-ink/60">
            Priority topics, drugs, trials, or people
            <textarea
              value={priorityText}
              onChange={(event) => setPriorityText(event.target.value)}
              placeholder={"ctDNA\nCAR-T toxicity\nlate-breaking phase 3 trials"}
              className="mt-2 min-h-32 w-full border border-ink/20 p-3 text-sm font-semibold normal-case"
            />
          </label>
          <label className="text-xs font-black uppercase text-ink/60">
            Exclusions / do not cover
            <textarea
              value={exclusionsText}
              onChange={(event) => setExclusionsText(event.target.value)}
              placeholder={"Unattributed rumors\nNon-clinical investment speculation"}
              className="mt-2 min-h-32 w-full border border-ink/20 p-3 text-sm font-semibold normal-case"
            />
          </label>
        </div>

        <div className="border border-ink/10 bg-paper/50 p-4">
          <h3 className="text-lg font-black">Add something specifically for this day</h3>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <input value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} placeholder="Topic or source name" className="border border-ink/20 px-3 py-3" />
            <input value={customUrl} onChange={(event) => setCustomUrl(event.target.value)} placeholder="Optional source URL" className="border border-ink/20 px-3 py-3" />
            <input value={customNotes} onChange={(event) => setCustomNotes(event.target.value)} placeholder="What should we look for?" className="border border-ink/20 px-3 py-3" />
          </div>
          <button type="button" onClick={addCustomItem} disabled={!customLabel.trim()} className="mt-3 inline-flex min-h-10 items-center gap-2 bg-ink px-4 text-xs font-black uppercase text-white disabled:opacity-40">
            <Plus className="h-4 w-4" /> Add to today
          </button>
          <div className="mt-3 grid gap-2">
            {plan.customItems.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 border border-ink/10 bg-white p-3">
                <div>
                  <div className="text-sm font-black">{item.label}</div>
                  {item.notes ? <div className="mt-1 text-xs font-semibold text-ink/60">{item.notes}</div> : null}
                  {item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-broadcast">Open source <ExternalLink className="h-3 w-3" /></a> : null}
                </div>
                <button type="button" aria-label={`Remove ${item.label}`} onClick={() => setPlan((current) => ({ ...current, customItems: current.customItems.filter((candidate) => candidate.id !== item.id) }))}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[auto_1fr]">
          <label className="flex items-center gap-3 border border-ink/10 bg-paper/50 p-3 text-sm font-black">
            <input type="checkbox" checked={plan.breakingNewsEnabled} onChange={(event) => setPlan((current) => ({ ...current, breakingNewsEnabled: event.target.checked }))} />
            Allow verified breaking-news override
          </label>
          <input value={plan.notes} onChange={(event) => setPlan((current) => ({ ...current, notes: event.target.value }))} placeholder="Operator notes for today’s desk" className="border border-ink/20 px-3 py-3 text-sm font-semibold" />
        </div>

        <button type="button" onClick={save} disabled={pending} className="inline-flex min-h-12 items-center justify-center gap-2 bg-broadcast px-5 text-sm font-black uppercase text-white disabled:opacity-50">
          <Save className="h-4 w-4" /> {pending ? "Saving coverage" : "Save daily coverage"}
        </button>
      </div>
    </section>
  );
}
