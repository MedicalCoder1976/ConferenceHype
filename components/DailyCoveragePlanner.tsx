"use client";

import { CalendarCheck, ExternalLink, Plus, Radio, Save, Send, X, Youtube } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { CardDeckSummary } from "@/components/CardDeckSummary";
import { RunJournalBroadcastButton } from "@/components/RunJournalBroadcastButton";
import { SpecialtyJournalTabs } from "@/components/SpecialtyJournalTabs";
import { SingleJournalPicker } from "@/components/SingleJournalPicker";
import {
  createDefaultDailyCoveragePlan,
  normalizeLegacyDailyCoverageDefaults
} from "@/lib/dailyCoverage";
import { EMPTY_CARD_DECK, type EntityCardDeck } from "@/lib/cardDeck";
import { errorMessage } from "@/lib/errors";
import { isGenericConferenceLandingItem } from "@/lib/intakeSelection";
import { conferenceLinkedSourceIds } from "@/lib/sources/socialLinks";
import { sortWeeklyReadySegmentsForSelection } from "@/lib/weeklySourceCards";
import type {
  DailyCoveragePlan,
  IngestedItem,
  JournalBroadcastSlot,
  MedicalConference,
  OncologyJournal,
  SourceConfig,
  Segment
} from "@/lib/types";

function journalSlotDeliveryLabel(status: JournalBroadcastSlot["youtubeStatus"]) {
  return status.replaceAll("_", " ");
}

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
  scheduledCount?: number;
  overflowCount?: number;
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

const DAILY_COVERAGE_SELECTION_EVENT = "conferencehype:daily-coverage-selection";

function selectedRealSourceIds(sourceIds: string[]) {
  return sourceIds.filter(
    (id) =>
      !id.startsWith("daily-journal-") &&
      !id.startsWith("daily-conference-") &&
      !id.startsWith("daily-custom-")
  );
}

function revealPresentationSequence() {
  const target = document.getElementById("presentation-sequence");
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  if (target instanceof HTMLElement) {
    target.focus({ preventScroll: true });
  }
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
  journalBroadcastSlots,
  sources,
  planningDays,
  activePlanningKey,
  selectedStartsAt,
  initialBatchItems,
  initialReadySegments,
  conferenceCardDecks = {},
  journalCardDecks = {},
  sourceCardDecks = {}
}: {
  initialPlan: DailyCoveragePlan;
  conferences: MedicalConference[];
  journals: OncologyJournal[];
  journalBroadcastSlots: JournalBroadcastSlot[];
  sources: SourceConfig[];
  planningDays: PlanningDay[];
  activePlanningKey: string;
  selectedStartsAt: string;
  initialBatchItems: IngestedItem[];
  initialReadySegments: Segment[];
  conferenceCardDecks?: Record<string, EntityCardDeck>;
  journalCardDecks?: Record<string, EntityCardDeck>;
  sourceCardDecks?: Record<string, EntityCardDeck>;
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
  const [pendingReadyId, setPendingReadyId] = useState("");
  const [pendingBatch, setPendingBatch] = useState(false);
  const [pendingBroadcast, setPendingBroadcast] = useState(false);
  const [broadcastStatus, setBroadcastStatus] = useState<BatchStatus>({
    state: "idle",
    text: ""
  });
  // Two independent 30-minute single-journal show slots per selected hour
  // (:00 and :30) -- each picks its own journal and provisions its own
  // journal_broadcast_slots row, separate from the hour's conference
  // broadcast controls above.
  const [journalSlotIdFirstHalf, setJournalSlotIdFirstHalf] = useState<string | undefined>(undefined);
  const [journalSlotIdSecondHalf, setJournalSlotIdSecondHalf] = useState<string | undefined>(undefined);
  const [pendingJournalSlotFirstHalf, setPendingJournalSlotFirstHalf] = useState(false);
  const [pendingJournalSlotSecondHalf, setPendingJournalSlotSecondHalf] = useState(false);
  const [journalSlotStatusFirstHalf, setJournalSlotStatusFirstHalf] = useState<BatchStatus>({
    state: "idle",
    text: ""
  });
  const [journalSlotStatusSecondHalf, setJournalSlotStatusSecondHalf] = useState<BatchStatus>({
    state: "idle",
    text: ""
  });
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

  const selectedConferences = useMemo(
    () => conferences.filter((conference) => plan.conferenceIds.includes(conference.id)),
    [conferences, plan.conferenceIds]
  );
  const selectedJournals = useMemo(
    () => journals.filter((journal) => plan.journalIds.includes(journal.id)),
    [journals, plan.journalIds]
  );
  const journalsById = useMemo(
    () => new Map(journals.map((journal) => [journal.id, journal])),
    [journals]
  );
  const sortedJournalBroadcastSlots = useMemo(
    () =>
      [...journalBroadcastSlots].sort(
        (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
      ),
    [journalBroadcastSlots]
  );
  const realSourceIds = useMemo(
    () => selectedRealSourceIds(plan.sourceIds),
    [plan.sourceIds]
  );
  // A conference's official sub-pages (program, abstract library, etc.) are
  // covered automatically once the conference itself is selected, so they
  // should never appear as independently-selectable newspaper tiles.
  const conferenceLinkedSourceIdSet = useMemo(() => {
    const ids = new Set<string>();
    for (const conference of conferences) {
      for (const source of conferenceLinkedSourceIds(conference, sources)) {
        ids.add(source.id);
      }
    }
    return ids;
  }, [conferences, sources]);
  const hasAnySelection =
    selectedConferences.length > 0 || selectedJournals.length > 0 || realSourceIds.length > 0;

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(DAILY_COVERAGE_SELECTION_EVENT, {
        detail: {
          selection: hasAnySelection
            ? {
                conferences: selectedConferences,
                journals: selectedJournals,
                sourceIds: realSourceIds
              }
            : null
        }
      })
    );
  }, [hasAnySelection, selectedConferences, selectedJournals, realSourceIds]);

  const matchingWeeklyReadySegments = sortWeeklyReadySegmentsForSelection(initialReadySegments, {
    conferences: selectedConferences,
    journals: selectedJournals,
    sourceIds: realSourceIds
  }).slice(0, 24);
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
        item.sourceId === `daily-conference-${conference.id}` ||
        item.sourceId?.startsWith(`daily-conference-${conference.id}-`)
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

  const scheduleReadyCard = (segmentId: string, title: string) => {
    setPendingReadyId(segmentId);
    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/intake-cards/hour/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startsAt: selectedStartsAt, segmentIds: [segmentId] })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(
            Array.isArray(payload.errors) ? payload.errors.join(" ") : (payload.error ?? "Could not schedule card.")
          );
        }
        setMessage(
          `"${title}" added to the presentation sequence. Use "Create broadcast" when ready to air this hour.`
        );
        router.refresh();
        window.setTimeout(revealPresentationSequence, 150);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not schedule card.");
      } finally {
        setPendingReadyId("");
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
            // Every non-cached candidate is enriched with a live, throttled
            // (350ms-serialized) PubMed lookup before this route can respond,
            // and the route is capped at maxDuration = 60s. 120 candidates
            // routinely blew that budget, killing the function mid-request
            // and returning Vercel's crash page instead of JSON. 40 leaves
            // headroom for the 24/hour actually scheduled plus some overflow
            // buffer without risking the timeout.
            maxCards: 40
          })
        });
        const batchPayload = await batchResponse.json();
        if (!batchResponse.ok || !batchPayload.ok) {
          throw new Error(
            Array.isArray(batchPayload.errors)
              ? batchPayload.errors.join(" ")
              : errorMessage(batchPayload.error, "Could not create one-hour ready cards.")
          );
        }
        const createdTitles = Array.isArray(batchPayload.segments)
          ? batchPayload.segments
              .map((segment: { title?: string }) => segment.title)
              .filter(Boolean)
              .slice(0, 4)
          : [];
        const slotNote = " Cards are queued only — use \"Create broadcast\" when ready to air them.";
        const sourceModeText =
            batchPayload.sourceMode === "weekly_ready_pool"
              ? `Batch complete with ${batchPayload.reusedCount ?? 0} unused weekly ready cards first. ${batchPayload.scheduledCount ?? 0} cards moved into the selected hour; overflow remains in Brand New Ready Cards.`
              : batchPayload.sourceMode === "on_demand_ingest"
                ? `Batch complete after an on-demand source fetch. ${batchPayload.scheduledCount ?? 0} cards moved into the selected hour; overflow remains in Brand New Ready Cards.`
                : batchPayload.sourceMode === "selected_conference_context"
                  ? `Batch complete from selected official conference context. ${batchPayload.scheduledCount ?? 0} cards moved into the selected hour; overflow remains in Brand New Ready Cards.`
                  : `Batch complete from stored prior-day intake. ${batchPayload.scheduledCount ?? 0} cards moved into the selected hour; overflow remains in Brand New Ready Cards.`;
        setBatchStatus({
          state: "done",
          text: sourceModeText + slotNote,
          count: batchPayload.count,
          titles: createdTitles,
          scheduledCount: batchPayload.scheduledCount,
          overflowCount: batchPayload.overflowCount
        });
        setMessage(
          `${batchPayload.scheduledCount ?? 0} cards queued into the selected one-hour presentation sequence. ${batchPayload.overflowCount ?? 0} remaining cards are in Brand New Ready Cards. Use "Create broadcast" when ready to air this hour.`
        );
        router.refresh();
        window.setTimeout(revealPresentationSequence, 150);
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

  const createBroadcastSlot = () => {
    setMessage("");
    setPendingBroadcast(true);
    setBroadcastStatus({ state: "creating", text: "Provisioning the broadcast slot for the selected hour." });
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/coverage-slots/create-broadcast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startsAt: selectedStartsAt,
            conferenceId: plan.conferenceIds[0]
          })
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(errorMessage(payload.error, "Could not create the broadcast slot."));
        }
        setBroadcastStatus({
          state: "done",
          text: "Broadcast slot provisioned — the stream will build and go live automatically at the selected hour."
        });
        setMessage("Broadcast slot provisioned — the stream will build and go live automatically at the selected hour.");
        router.refresh();
      } catch (error) {
        const text = errorMessage(error, "Could not create the broadcast slot.");
        setBroadcastStatus({ state: "error", text });
        setMessage(text);
      } finally {
        setPendingBroadcast(false);
      }
    });
  };

  const createJournalBroadcastSlot = (half: "first" | "second") => {
    const journalId = half === "first" ? journalSlotIdFirstHalf : journalSlotIdSecondHalf;
    if (!journalId) {
      setMessage("Select a journal before creating a journal broadcast slot.");
      return;
    }
    const setPending = half === "first" ? setPendingJournalSlotFirstHalf : setPendingJournalSlotSecondHalf;
    const setStatus = half === "first" ? setJournalSlotStatusFirstHalf : setJournalSlotStatusSecondHalf;
    const startsAt =
      half === "first"
        ? selectedStartsAt
        : new Date(new Date(selectedStartsAt).getTime() + 30 * 60 * 1000).toISOString();
    setMessage("");
    setPending(true);
    setStatus({ state: "creating", text: "Provisioning the 30-minute journal broadcast slot." });
    startTransition(async () => {
      try {
        const createResponse = await fetch("/api/admin/journal-broadcast-slots/create-broadcast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startsAt, journalId })
        });
        const createPayload = await createResponse.json();
        if (!createResponse.ok || !createPayload.ok) {
          throw new Error(errorMessage(createPayload.error, "Could not create the journal broadcast slot."));
        }
        setStatus({ state: "creating", text: "Slot created — starting the broadcast now." });

        const runResponse = await fetch("/api/admin/run-journal-broadcast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slotId: createPayload.journalBroadcastSlotId,
            journalId,
            startAt: startsAt
          })
        });
        const runPayload = await runResponse.json();
        if (!runResponse.ok || !runPayload.ok) {
          throw new Error(errorMessage(runPayload.error, "Slot was created, but could not start the broadcast."));
        }
        setStatus({
          state: "done",
          text: "Broadcast starting now — rendering, then it will go live automatically at its scheduled time."
        });
        router.refresh();
      } catch (error) {
        const text = errorMessage(error, "Could not start the journal broadcast.");
        setStatus({ state: "error", text });
        setMessage(text);
      } finally {
        setPending(false);
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
          <button
            type="button"
            disabled={pending || pendingBroadcast}
            onClick={createBroadcastSlot}
            className="inline-flex min-h-11 items-center justify-center gap-2 bg-broadcast px-4 text-xs font-black uppercase text-white disabled:opacity-50"
          >
            <Radio className="h-4 w-4" />
            {pendingBroadcast ? "Creating broadcast" : "Create broadcast"}
          </button>
        </div>
        {broadcastStatus.state !== "idle" ? (
          <div
            className={`mt-3 border p-3 text-sm font-bold ${
              broadcastStatus.state === "error"
                ? "border-red-400/50 bg-red-50 text-red-800"
                : broadcastStatus.state === "done"
                  ? "border-cyanline/40 bg-cyanline/10 text-ink"
                  : "border-gold/50 bg-gold/10 text-ink"
            }`}
            aria-live="polite"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-ink px-2 py-1 text-[11px] font-black uppercase text-white">
                Broadcast status
              </span>
              <span className="text-xs font-black uppercase">{broadcastStatus.state}</span>
            </div>
            <p className="mt-2 leading-6">{broadcastStatus.text}</p>
          </div>
        ) : null}
        <div className="mt-4 border border-ink/10 bg-paper/60 p-3">
          <div className="text-xs font-black uppercase text-ink/50">
            Journal-only broadcasts for this hour
          </div>
          <p className="mt-1 text-xs font-semibold leading-5 text-ink/60">
            Runs alongside the conference broadcast above, not instead of it — an
            hour with an approved conference slot airs that instead. Each half
            hour is its own independent 30-minute show, one journal, one voice.
          </p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {(
              [
                {
                  half: "first" as const,
                  startsAt: selectedStartsAt,
                  selectedJournalId: journalSlotIdFirstHalf,
                  setSelectedJournalId: setJournalSlotIdFirstHalf,
                  pending: pendingJournalSlotFirstHalf,
                  status: journalSlotStatusFirstHalf
                },
                {
                  half: "second" as const,
                  startsAt: new Date(new Date(selectedStartsAt).getTime() + 30 * 60 * 1000).toISOString(),
                  selectedJournalId: journalSlotIdSecondHalf,
                  setSelectedJournalId: setJournalSlotIdSecondHalf,
                  pending: pendingJournalSlotSecondHalf,
                  status: journalSlotStatusSecondHalf
                }
              ]
            ).map((panel) => (
              <div key={panel.half} className="border border-ink/10 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-black text-ink">
                    {new Intl.DateTimeFormat("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                      timeZoneName: "short"
                    }).format(new Date(panel.startsAt))}
                  </div>
                  <button
                    type="button"
                    disabled={pending || panel.pending || !panel.selectedJournalId}
                    onClick={() => createJournalBroadcastSlot(panel.half)}
                    className="inline-flex min-h-9 items-center justify-center gap-2 bg-broadcast px-3 text-xs font-black uppercase text-white disabled:opacity-50"
                  >
                    <Radio className="h-3.5 w-3.5" />
                    {panel.pending ? "Starting" : "Start journal broadcast"}
                  </button>
                </div>
                <div className="mt-3 max-h-72 overflow-y-auto">
                  <SingleJournalPicker
                    journals={journals}
                    selectedJournalId={panel.selectedJournalId}
                    onSelect={panel.setSelectedJournalId}
                    journalCardDecks={journalCardDecks}
                  />
                </div>
                {panel.status.state !== "idle" ? (
                  <div
                    className={`mt-3 border p-2 text-xs font-bold ${
                      panel.status.state === "error"
                        ? "border-red-400/50 bg-red-50 text-red-800"
                        : panel.status.state === "done"
                          ? "border-cyanline/40 bg-cyanline/10 text-ink"
                          : "border-gold/50 bg-gold/10 text-ink"
                    }`}
                    aria-live="polite"
                  >
                    {panel.status.text}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-ink/10 pt-3">
            <div className="text-xs font-black uppercase text-ink/50">
              Journal broadcasts on the schedule
            </div>
            {sortedJournalBroadcastSlots.length === 0 ? (
              <p className="mt-2 text-xs font-semibold text-ink/50">
                None provisioned yet.
              </p>
            ) : (
              <div className="mt-2 divide-y divide-ink/10 border border-ink/10 bg-white">
                {sortedJournalBroadcastSlots.map((slot) => (
                  <div
                    key={slot.id}
                    className={`grid gap-2 px-3 py-2 md:grid-cols-[190px_1fr_130px_auto] md:items-center ${
                      slot.enabled ? "" : "opacity-50"
                    }`}
                  >
                    <div className="text-xs font-black">
                      {new Intl.DateTimeFormat("en-US", {
                        month: "short",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                        timeZoneName: "short"
                      }).format(new Date(slot.startsAt))}
                    </div>
                    <div className="truncate text-xs font-bold text-ink/80">
                      {journalsById.get(slot.journalId)?.name ?? "Unknown journal"}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-black uppercase">
                        <Youtube className="h-3.5 w-3.5 text-red-600" />
                        {journalSlotDeliveryLabel(slot.youtubeStatus)}
                      </div>
                      {slot.deliveryError ? (
                        <div className="mt-1 text-xs font-semibold text-red-700">
                          {slot.deliveryError}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      {slot.youtubeUrl ? (
                        <a
                          href={slot.youtubeUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 border border-red-200 px-2 py-1 text-xs font-black uppercase text-red-700"
                        >
                          Video <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                      {slot.workflowUrl ? (
                        <a
                          href={slot.workflowUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 border border-ink/20 px-2 py-1 text-xs font-black uppercase"
                        >
                          Run <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                      {["not_scheduled", "failed"].includes(slot.youtubeStatus) ? (
                        <RunJournalBroadcastButton
                          slotId={slot.id}
                          journalId={slot.journalId}
                          startsAt={slot.startsAt}
                        />
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] font-semibold text-ink/45">
              Journal slots are not on the hourly cron yet -- each one needs
              &quot;Run now&quot; clicked (or a scheduled slot will sit at
              &quot;not scheduled&quot; forever). It renders now and holds the
              live stream until the slot&apos;s start time.
            </p>
          </div>
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
                  <CardDeckSummary
                    deck={conferenceCardDecks[conference.id] ?? EMPTY_CARD_DECK}
                    autoExpand={plan.conferenceIds.includes(conference.id)}
                    entityType="conference"
                    entityId={conference.id}
                  />
                </span>
              </label>
            );
          })}
        </SelectionGroup>

        <SelectionGroup title="Journal RSS feeds" count={plan.journalIds.length}>
          <SpecialtyJournalTabs
            journals={journals}
            journalIds={plan.journalIds}
            toggle={toggle}
            journalCardDecks={journalCardDecks}
          />
        </SelectionGroup>

        <SelectionGroup title="Clinical news and newspapers" count={plan.sourceIds.length}>
          {sources
            .filter((source) => source.type !== "general_social" && source.type !== "manual")
            .filter((source) => !conferenceLinkedSourceIdSet.has(source.id))
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
                  <CardDeckSummary
                    deck={sourceCardDecks[source.id] ?? EMPTY_CARD_DECK}
                    autoExpand={plan.sourceIds.includes(source.id)}
                    entityType="source"
                    entityId={source.id}
                  />
                </span>
              </label>
            ))}
        </SelectionGroup>

        <section className="border border-ink/10 bg-paper/50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-ink">Weekly ready-card pool</h3>
              <p className="mt-1 text-sm font-semibold leading-6 text-ink/60">
                Unused weekly cards for the selected conference, journal, or news source appear here first. Create one-hour batch cards will reuse these before creating new cards.
              </p>
            </div>
            <span className="border border-ink/10 bg-white px-3 py-2 text-xs font-black uppercase text-ink/60">
              {matchingWeeklyReadySegments.length} ready
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {matchingWeeklyReadySegments.length === 0 ? (
              <div className="border border-dashed border-ink/20 bg-white p-4 text-sm font-bold text-ink/55 md:col-span-2 xl:col-span-3">
                No unused weekly ready cards match this selected source mix yet.
              </div>
            ) : null}
            {matchingWeeklyReadySegments.map((segment) => (
              <article key={segment.id} className="grid gap-3 border border-ink/10 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="bg-ink px-2 py-1 text-[11px] font-black uppercase text-white">
                    ready card
                  </span>
                  <span className="text-[11px] font-bold uppercase text-ink/45">
                    {segment.personaName}
                  </span>
                </div>
                <h4 className="text-sm font-black leading-5 text-ink">{segment.title}</h4>
                <p className="whitespace-pre-wrap text-xs font-semibold leading-5 text-ink/65">
                  {segment.script || "No script on this card — flag for review."}
                </p>
                <button
                  type="button"
                  disabled={pending || !!pendingReadyId}
                  onClick={() => scheduleReadyCard(segment.id, segment.title)}
                  className="inline-flex min-h-9 items-center justify-center gap-2 bg-broadcast px-3 text-xs font-black uppercase text-white disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {pendingReadyId === segment.id ? "Scheduling…" : "Schedule this card"}
                </button>
              </article>
            ))}
          </div>
        </section>
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
