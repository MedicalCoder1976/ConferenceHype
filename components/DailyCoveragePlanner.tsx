"use client";

import {
  CalendarCheck,
  Check,
  ChevronDown,
  ExternalLink,
  Plus,
  Radio,
  Save,
  Send,
  X,
  Youtube
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { CardDeckSummary } from "@/components/CardDeckSummary";
import { RunJournalBroadcastButton } from "@/components/RunJournalBroadcastButton";
import { SingleJournalPicker } from "@/components/SingleJournalPicker";
import { EMPTY_CARD_DECK, type EntityCardDeck } from "@/lib/cardDeck";
import { errorMessage } from "@/lib/errors";
import { isGenericConferenceLandingItem } from "@/lib/intakeSelection";
import { contentSignature } from "@/lib/segments/contentSignature";
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

// The weekly batch and the one-hour batch can each independently pick the
// same underlying article (different segment rows, same citation url) --
// confirmed live 2026-07-18: a single JCO Oncology Practice article had 54
// separate segment rows across past runs, several still pending review at
// once, which rendered as multiple identical-looking "ready card" tiles
// here. Dedupe by content signature (same pattern already used for the
// final broadcast card list, see lib/segments/contentSignature.ts) before
// display -- keeps whichever of the duplicate set sorts first under the
// existing ordering, since the content is identical either way.
function dedupeByContentSignature(segments: Segment[]) {
  const seen = new Set<string>();
  return segments.filter((segment) => {
    const signature = contentSignature(segment);
    if (seen.has(signature)) {
      return false;
    }
    seen.add(signature);
    return true;
  });
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
  const [journalScheduleExpanded, setJournalScheduleExpanded] = useState(true);
  const [pendingApproveAllFirstHalf, setPendingApproveAllFirstHalf] = useState(false);
  const [pendingApproveAllSecondHalf, setPendingApproveAllSecondHalf] = useState(false);
  const [approveAllStatusFirstHalf, setApproveAllStatusFirstHalf] = useState<BatchStatus>({
    state: "idle",
    text: ""
  });
  const [approveAllStatusSecondHalf, setApproveAllStatusSecondHalf] = useState<BatchStatus>({
    state: "idle",
    text: ""
  });
  const [pendingReleaseAll, setPendingReleaseAll] = useState(false);
  const [releaseAllStatus, setReleaseAllStatus] = useState<BatchStatus>({
    state: "idle",
    text: ""
  });
  const [pending, startTransition] = useTransition();
  const [customLabel, setCustomLabel] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [customNotes, setCustomNotes] = useState("");
  const [priorityText, setPriorityText] = useState(initialPlan.priorityTopics.join("\n"));
  const [exclusionsText, setExclusionsText] = useState(initialPlan.exclusions.join("\n"));

  // There is no more manual conference/journal/source picker -- every
  // enabled entry in the catalog feeds the hourly broadcast automatically
  // (mirrors buildAllCatalogCoveragePlan's own filters in
  // lib/weeklySourceCards.ts, which the weekly "scope: all" batch already
  // uses for the same "everything enabled, no manual picking" behavior).
  const selectedConferences = useMemo(
    () => conferences.filter((conference) => conference.enabled),
    [conferences]
  );
  const selectedJournals = useMemo(
    () => journals.filter((journal) => journal.enabled),
    [journals]
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
  // "Archived" = the slot reached a terminal state (aired or gave up
  // retrying isn't forced -- failed slots still keep their Run now retry
  // button, just moved out of the active list) OR it's a not_scheduled slot
  // whose start time has already passed -- nobody dispatched it in time, so
  // it's dead weight rather than something still worth acting on today.
  // Non-destructive on purpose: nothing gets deleted, so the row (and its
  // Run now retry button, if someone really wants to fire it late) is still
  // there in the archive, just out of the way of the active list.
  const isJournalSlotArchived = (slot: JournalBroadcastSlot) =>
    ["completed", "failed"].includes(slot.youtubeStatus) ||
    (slot.youtubeStatus === "not_scheduled" && new Date(slot.startsAt).getTime() < Date.now());
  const activeJournalBroadcastSlots = useMemo(
    () => sortedJournalBroadcastSlots.filter((slot) => !isJournalSlotArchived(slot)),
    [sortedJournalBroadcastSlots]
  );
  const archivedJournalBroadcastSlots = useMemo(
    () =>
      [...sortedJournalBroadcastSlots]
        .filter((slot) => isJournalSlotArchived(slot))
        .reverse(),
    [sortedJournalBroadcastSlots]
  );
  // A conference's official sub-pages (program, abstract library, etc.) are
  // covered automatically once the conference itself is selected, so they
  // should never be double-counted as independent newspaper/source ids.
  const conferenceLinkedSourceIdSet = useMemo(() => {
    const ids = new Set<string>();
    for (const conference of conferences) {
      for (const source of conferenceLinkedSourceIds(conference, sources)) {
        ids.add(source.id);
      }
    }
    return ids;
  }, [conferences, sources]);
  const realSourceIds = useMemo(
    () =>
      selectedRealSourceIds(
        sources
          .filter((source) => source.enabled && source.type !== "manual")
          .filter((source) => !conferenceLinkedSourceIdSet.has(source.id))
          .map((source) => source.id)
      ),
    [sources, conferenceLinkedSourceIdSet]
  );
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

  // sortWeeklyReadySegmentsForSelection ranks cards by relevance (this week
  // + real content over stale/announcement filler) -- keep that ranking,
  // then re-sort by journal name so cards from the same journal cluster
  // together for review, instead of interleaving by creation time.
  // Non-journal cards (conference/source content with no
  // citations[0].journalId) sort after all named journals, grouped under
  // "Other" rather than scattered by name lookup misses.
  //
  // Cap raised from 24 to 300 (2026-07-19): there's no per-journal filter
  // in this panel -- `selectedJournals` above is just every *enabled*
  // journal, not an operator-narrowable subset -- so a flat top-24 cut
  // across every journal combined could (and did, confirmed live) exclude
  // a journal's cards entirely whenever other journals' content happened
  // to rank higher, with no way to reach them. This is a pure review/
  // browse list, not anything broadcast-facing, so a much higher cap (the
  // page just grows, no special layout constraint needs exactly 24) is
  // safe and guarantees every journal's pending cards are reachable here.
  const matchingWeeklyReadySegments = dedupeByContentSignature(
    sortWeeklyReadySegmentsForSelection(initialReadySegments, {
      conferences: selectedConferences,
      journals: selectedJournals,
      sourceIds: realSourceIds
    })
  )
    .slice(0, 300)
    .map((segment, index) => ({ segment, index }))
    .sort((a, b) => {
      const aName = journalsById.get(a.segment.citations[0]?.journalId ?? "")?.name;
      const bName = journalsById.get(b.segment.citations[0]?.journalId ?? "")?.name;
      if (aName && bName) {
        const compared = aName.localeCompare(bName);
        if (compared !== 0) {
          return compared;
        }
      } else if (aName !== bName) {
        // Exactly one has a resolvable journal name -- named journals first.
        return aName ? -1 : 1;
      }
      // Same journal (or same "no journal" bucket) -- preserve the
      // relevance order sortWeeklyReadySegmentsForSelection already chose.
      return a.index - b.index;
    })
    .map(({ segment }) => segment);
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
    const sourceMatch = Boolean(item.sourceId && realSourceIds.includes(item.sourceId));
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
          `"${title}" added to the presentation sequence. Use "Create one-hour broadcast" to schedule this hour if it isn't already.`
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
      text: "Saving today's priorities before card creation."
    });
    setPendingBatch(true);
    startTransition(async () => {
      try {
        const priorityTopics = listFromText(priorityText);
        const exclusions = listFromText(exclusionsText);
        // No manual conference/journal/source picker anymore -- every
        // enabled entry in the catalog (selectedConferences/selectedJournals/
        // realSourceIds, computed above) feeds this hour automatically.
        const planToSave = {
          ...plan,
          conferenceIds: selectedConferences.map((conference) => conference.id),
          journalIds: selectedJournals.map((journal) => journal.id),
          sourceIds: realSourceIds,
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
          text: sourceModeText,
          count: batchPayload.count,
          titles: createdTitles,
          scheduledCount: batchPayload.scheduledCount,
          overflowCount: batchPayload.overflowCount
        });

        setPendingBroadcast(true);
        setBroadcastStatus({ state: "creating", text: "Cards created — scheduling the broadcast now." });
        const broadcastResponse = await fetch("/api/admin/coverage-slots/create-broadcast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startsAt: selectedStartsAt
          })
        });
        const broadcastPayload = await broadcastResponse.json();
        if (!broadcastResponse.ok || !broadcastPayload.ok) {
          throw new Error(errorMessage(broadcastPayload.error, "Cards were created, but could not schedule the broadcast."));
        }
        setBroadcastStatus({
          state: "done",
          text: "Broadcast scheduled — it will build and go live automatically at the selected hour."
        });
        setMessage(
          `${batchPayload.scheduledCount ?? 0} cards queued and the broadcast is scheduled for ${new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short" }).format(new Date(selectedStartsAt))}. ${batchPayload.overflowCount ?? 0} remaining cards are in Brand New Ready Cards.`
        );
        router.refresh();
        window.setTimeout(revealPresentationSequence, 150);
      } catch (error) {
        const text =
          errorMessage(error, "Could not create the one-hour broadcast.");
        setBatchStatus((current) => (current.state === "done" ? current : { state: "error", text }));
        setBroadcastStatus((current) => (current.state === "done" ? current : { state: "error", text }));
        setMessage(text);
      } finally {
        setPendingBatch(false);
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

  // Bulk-approves every pending_review card for one 30-minute slot panel's
  // selected journal -- added 2026-07-19 after two real journal broadcasts
  // (British Journal of Cancer, Blood Cancer Journal) both failed on 0
  // approved segments while each journal had a dozen-plus cards sitting
  // unreviewed. Originally a single shared button below both panels
  // together, scoped to the union of both selections -- moved to one
  // button per panel (same day) after an operator report of not finding it
  // for a specific slot: a shared control below two independently-selected
  // panels is easy to miss and ambiguous about which panel it acts on, so
  // each panel now gets its own, scoped only to that panel's own journal.
  // Reuses the same /api/admin/approve route the (unused) human review
  // queue and the "Discard" button already call -- approves each card's
  // script exactly as generated, in place (no scheduled-copy, no hour
  // pinning), which is all journal30's buildJournalShowSlots needs
  // (status: "approved" + matching citations[0].journalId).
  const approveAllForJournal = (half: "first" | "second") => {
    const journalId = half === "first" ? journalSlotIdFirstHalf : journalSlotIdSecondHalf;
    const setPendingHalf = half === "first" ? setPendingApproveAllFirstHalf : setPendingApproveAllSecondHalf;
    const setStatusHalf = half === "first" ? setApproveAllStatusFirstHalf : setApproveAllStatusSecondHalf;
    if (!journalId) {
      setMessage("Select a journal in this 30-minute slot first.");
      return;
    }
    const candidates = (journalCardDecks[journalId]?.cards ?? [])
      .map((card) => card.segment)
      .filter((segment) => segment.status === "pending_review");
    if (candidates.length === 0) {
      setStatusHalf({
        state: "done",
        text: "No pending cards to approve for this journal — they may already be approved or none have been generated yet."
      });
      return;
    }
    setPendingHalf(true);
    setStatusHalf({
      state: "creating",
      text: `Approving ${candidates.length} card${candidates.length === 1 ? "" : "s"}...`
    });
    startTransition(async () => {
      let approved = 0;
      const failures: string[] = [];
      for (const segment of candidates) {
        try {
          const response = await fetch("/api/admin/approve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ segmentId: segment.id, action: "approve", script: segment.script })
          });
          const payload = await response.json();
          if (!response.ok || !payload.ok) {
            failures.push(`${segment.title}: ${errorMessage(payload.error ?? payload.errors, "approval failed")}`);
            continue;
          }
          approved += 1;
        } catch (error) {
          failures.push(`${segment.title}: ${errorMessage(error, "approval failed")}`);
        }
      }
      setStatusHalf({
        state: failures.length > 0 && approved === 0 ? "error" : "done",
        text:
          `Approved ${approved} of ${candidates.length} card${candidates.length === 1 ? "" : "s"}.` +
          (failures.length > 0 ? ` ${failures.length} failed: ${failures.slice(0, 3).join("; ")}` : "")
      });
      setPendingHalf(false);
      router.refresh();
    });
  };

  // Releases every pending_review card system-wide (not just the two
  // selected journals above) that has no already-approved-or-rendered
  // sibling and clears the same quality gates a manual approve already
  // enforces (filterBroadcastReadySegments + validateSegmentForApproval,
  // both run server-side in /api/admin/approve/release-all). Added
  // 2026-07-19, explicit operator request: "release all the cards to
  // rebroadcast queue that have not been broadcast as long as the cards
  // meet quality standards." Unlike the per-panel approve buttons, this is
  // deliberately global and does one bulk DB update server-side rather than
  // one request per card -- confirmed live the pending pool alone was 1468
  // rows, far too many for a per-card client round trip loop.
  const releaseAllReadyCards = () => {
    setPendingReleaseAll(true);
    setReleaseAllStatus({ state: "creating", text: "Checking every pending card against quality standards..." });
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/approve/release-all", { method: "POST" });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(errorMessage(payload.error, "Could not release cards."));
        }
        setReleaseAllStatus({
          state: "done",
          text:
            `Approved ${payload.approved} of ${payload.totalPending} pending cards. ` +
            `${payload.alreadyBroadcastOrQueued} already covered by an approved/rendered sibling, ` +
            `${payload.duplicateWithinPending} duplicate of another pending card, ` +
            `${payload.failedQualityFilter} failed the broadcast-readiness filter, ` +
            `${payload.failedValidation} failed approval validation.`
        });
        router.refresh();
      } catch (error) {
        setReleaseAllStatus({ state: "error", text: errorMessage(error, "Could not release cards.") });
      } finally {
        setPendingReleaseAll(false);
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

  const renderJournalSlotRow = (slot: JournalBroadcastSlot) => (
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
          <div className="mt-1 text-xs font-semibold text-red-700">{slot.deliveryError}</div>
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
  );

  return (
    <section className="border border-ink/10 bg-white shadow-panel">
      <div className="border-b border-ink/10 p-5">
        <div className="mb-2 text-xs font-black uppercase text-ink/50">
          One-hour planning slots - 24 h back through next 48 h
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
            disabled={pending || pendingBatch || pendingBroadcast}
            onClick={createHourBatch}
            className="inline-flex min-h-11 items-center justify-center gap-2 bg-broadcast px-4 text-xs font-black uppercase text-white disabled:opacity-50"
          >
            <Radio className="h-4 w-4" />
            {pendingBroadcast ? "Scheduling broadcast" : pendingBatch ? "Creating cards" : "Create one-hour broadcast"}
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
                  status: journalSlotStatusFirstHalf,
                  pendingApprove: pendingApproveAllFirstHalf,
                  approveStatus: approveAllStatusFirstHalf
                },
                {
                  half: "second" as const,
                  startsAt: new Date(new Date(selectedStartsAt).getTime() + 30 * 60 * 1000).toISOString(),
                  selectedJournalId: journalSlotIdSecondHalf,
                  setSelectedJournalId: setJournalSlotIdSecondHalf,
                  pending: pendingJournalSlotSecondHalf,
                  status: journalSlotStatusSecondHalf,
                  pendingApprove: pendingApproveAllSecondHalf,
                  approveStatus: approveAllStatusSecondHalf
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
                <div className="mt-3">
                  <button
                    type="button"
                    disabled={pending || panel.pendingApprove || !panel.selectedJournalId}
                    onClick={() => approveAllForJournal(panel.half)}
                    className="inline-flex min-h-9 w-full items-center justify-center gap-2 border border-broadcast bg-broadcast/10 px-3 text-xs font-black uppercase text-broadcast disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {panel.pendingApprove ? "Approving…" : "Approve all cards for this journal"}
                  </button>
                  {panel.approveStatus.state !== "idle" ? (
                    <div
                      className={`mt-2 border p-2 text-xs font-bold ${
                        panel.approveStatus.state === "error"
                          ? "border-red-400/50 bg-red-50 text-red-800"
                          : panel.approveStatus.state === "done"
                            ? "border-cyanline/40 bg-cyanline/10 text-ink"
                            : "border-gold/50 bg-gold/10 text-ink"
                      }`}
                      aria-live="polite"
                    >
                      {panel.approveStatus.text}
                    </div>
                  ) : null}
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
            <button
              type="button"
              onClick={() => setJournalScheduleExpanded((current) => !current)}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <span className="text-xs font-black uppercase text-ink/50">
                Journal broadcasts on the schedule
                {activeJournalBroadcastSlots.length > 0
                  ? ` (${activeJournalBroadcastSlots.length})`
                  : ""}
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-ink/40 transition-transform ${
                  journalScheduleExpanded ? "rotate-180" : ""
                }`}
              />
            </button>
            {journalScheduleExpanded ? (
              <>
                {activeJournalBroadcastSlots.length === 0 ? (
                  <p className="mt-2 text-xs font-semibold text-ink/50">
                    None provisioned yet.
                  </p>
                ) : (
                  <div className="mt-2 divide-y divide-ink/10 border border-ink/10 bg-white">
                    {activeJournalBroadcastSlots.map(renderJournalSlotRow)}
                  </div>
                )}
                <p className="mt-2 text-[11px] font-semibold text-ink/45">
                  Journal slots are not on the hourly cron yet -- each one needs
                  &quot;Run now&quot; clicked (or a scheduled slot will sit at
                  &quot;not scheduled&quot; forever). It renders now and holds the
                  live stream until the slot&apos;s start time.
                </p>
                <div className="mt-4 border-t border-ink/10 pt-3">
                  <div className="text-xs font-black uppercase text-ink/50">
                    Journal broadcast archive
                    {archivedJournalBroadcastSlots.length > 0
                      ? ` (${archivedJournalBroadcastSlots.length})`
                      : ""}
                  </div>
                  {archivedJournalBroadcastSlots.length === 0 ? (
                    <p className="mt-2 text-xs font-semibold text-ink/50">
                      Nothing has aired or failed yet.
                    </p>
                  ) : (
                    <div className="mt-2 divide-y divide-ink/10 border border-ink/10 bg-white">
                      {archivedJournalBroadcastSlots.map(renderJournalSlotRow)}
                    </div>
                  )}
                  <p className="mt-2 text-[11px] font-semibold text-ink/45">
                    Completed and failed shows move here automatically. A failed
                    show keeps its &quot;Run now&quot; button so it can be
                    retried without re-provisioning the slot.
                  </p>
                </div>
              </>
            ) : null}
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
        {message ? (
          <div className="mt-3 border border-cyanline/30 bg-cyanline/10 p-3 text-sm font-bold">
            {message}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 p-5">
        <section className="border border-ink/10 bg-paper/50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-ink">Weekly ready-card pool</h3>
              <p className="mt-1 text-sm font-semibold leading-6 text-ink/60">
                Unused weekly cards for the selected conference, journal, or news source appear here first. Create one-hour broadcast will reuse these before creating new cards.
              </p>
            </div>
            <span className="border border-ink/10 bg-white px-3 py-2 text-xs font-black uppercase text-ink/60">
              {matchingWeeklyReadySegments.length} ready
            </span>
          </div>
          <div className="mt-3">
            <button
              type="button"
              disabled={pending || pendingReleaseAll}
              onClick={releaseAllReadyCards}
              className="inline-flex min-h-9 items-center justify-center gap-2 border border-broadcast bg-broadcast/10 px-3 text-xs font-black uppercase text-broadcast disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              {pendingReleaseAll
                ? "Checking and releasing…"
                : "Release all ready cards to rebroadcast queue"}
            </button>
            <p className="mt-1 text-[11px] font-bold uppercase leading-4 text-ink/45">
              Approves every not-yet-broadcast card system-wide that passes the same quality
              checks a manual approval already enforces — not just this selected source mix.
            </p>
            {releaseAllStatus.state !== "idle" ? (
              <div
                className={`mt-2 border p-2 text-xs font-bold ${
                  releaseAllStatus.state === "error"
                    ? "border-red-400/50 bg-red-50 text-red-800"
                    : releaseAllStatus.state === "done"
                      ? "border-cyanline/40 bg-cyanline/10 text-ink"
                      : "border-gold/50 bg-gold/10 text-ink"
                }`}
                aria-live="polite"
              >
                {releaseAllStatus.text}
              </div>
            ) : null}
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
                  <span className="border border-broadcast/40 bg-broadcast/10 px-2 py-1 text-[11px] font-black uppercase text-broadcast">
                    {journalsById.get(segment.citations[0]?.journalId ?? "")?.name ?? "Other"}
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
