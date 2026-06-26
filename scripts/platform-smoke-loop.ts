import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteConferenceCoverageSlotInDb,
  deleteSegmentsByIdsInDb,
  finishPlatformSmokeRunInDb,
  getMedicalConferencesFromDb,
  getOncologyJournalsFromDb,
  getPreviousDayBatchItemsFromDb,
  getSourcesFromDb,
  saveGeneratedSegmentsToDb,
  startPlatformSmokeRunInDb,
} from "@/lib/db";
import { sourceRegistry } from "@/lib/sources/registry";
import { runIngestionJob } from "@/lib/jobs/ingest";
import {
  buildBatchSegment,
  buildPubMedBackedJournalItem,
  itemMatchesSelections,
  personaIdForBatchIndex
} from "@/lib/intakeCards";
import { makeScheduledCopy } from "@/lib/reusableSegments";
import { validateSegmentForApproval } from "@/lib/generation/validator";
import { verifyYoutubeDeliveryLoop } from "@/lib/media/youtubeDeliveryVerifier";
import type {
  IngestedItem,
  MedicalConference,
  OncologyJournal,
  Segment,
  SourceConfig
} from "@/lib/types";

loadEnvConfig(process.cwd());

// Tracks every smoke-test segment/slot id created during an attempt so it
// can be deleted afterward — smoke cards must never linger as real cards.
type AttemptContext = {
  segmentIds: Set<string>;
  slotId?: string;
};

type PreparedAttempt = {
  slotId: string;
  startsAt: string;
  coverageDate: string;
  conference: MedicalConference;
  journal: OncologyJournal;
  source: SourceConfig;
  readySegments: Segment[];
  scheduledSegments: Segment[];
};

type WorkflowRun = {
  id: number;
  html_url: string;
  status: "queued" | "in_progress" | "completed" | string;
  conclusion: "success" | "failure" | "cancelled" | "timed_out" | string | null;
  created_at: string;
  head_branch: string | null;
};

const CONTENT_SECONDS = 40;
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_STREAM_MINUTES = 10;

function githubOutput(key: string, value: string | number | boolean | undefined) {
  if (!process.env.GITHUB_OUTPUT || value === undefined) {
    return;
  }
  appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${String(value).replace(/\r?\n/g, " ")}\n`);
}

function rand<T>(items: T[], label: string): T {
  if (!items.length) {
    throw new Error(`No ${label} candidates are available for platform smoke testing.`);
  }
  return items[Math.floor(Math.random() * items.length)];
}

function coverageDateFor(startsAt: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(startsAt);
}

function attemptStart(minutesFromNow: number, attempt: number) {
  const now = Date.now();
  const base = now + (minutesFromNow + Math.max(0, attempt - 1) * 20) * 60_000;
  const rounded = Math.ceil(base / 60_000) * 60_000;
  return new Date(rounded);
}

function scheduleAt(startsAt: string, index: number) {
  return new Date(new Date(startsAt).getTime() + index * CONTENT_SECONDS * 1000).toISOString();
}

function smokeSegment({
  title,
  summary,
  citation,
  index
}: {
  title: string;
  summary: string;
  citation: { label: string; url: string; sourceType: Segment["citations"][number]["sourceType"] };
  index: number;
}): Segment {
  const personaId = personaIdForBatchIndex(index);
  const createdAt = new Date().toISOString();
  const script = [
    `Background: ${summary}`,
    "Methods: This automated smoke test selected one conference or meeting, one journal RSS feed, and one clinical news source, then generated only cards tied to those selected sources.",
    "Results: This card confirms the selected-source workflow produced an approved presentation-sequence item without using unselected source material.",
    "Discussion: The broadcast verifier must still prove that the scheduled cards, music transitions, ConferenceHype public page, Supabase handoff, and saved YouTube video all match."
  ].join(" ");
  return {
    id: `platform-smoke-${randomUUID()}`,
    title,
    summary: script,
    script,
    contentType: index === 0 ? "agenda_preview" : index === 1 ? "abstract_buzz" : "media_roundup",
    personaId,
    personaName: personaId
      .split("-")
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(" "),
    hypeLevel: "standard",
    language: "English",
    status: "pending_review",
    citations: [citation],
    socialBuzzItems: [],
    riskFlags: ["platform_smoke_test", "operator_selected_batch_card"],
    confidenceScore: 100,
    createdAt,
    updatedAt: createdAt
  };
}

function smokeFallbackSegments({
  conference,
  journal,
  source
}: {
  conference: MedicalConference;
  journal: OncologyJournal;
  source: SourceConfig;
}) {
  return [
    smokeSegment({
      index: 0,
      title: `Platform smoke: ${conference.acronym ?? conference.name} conference selection`,
      summary: `The selected conference or meeting for this smoke run is ${conference.name}.`,
      citation: {
        label: `${conference.name} official site`,
        url: conference.officialUrl,
        sourceType: "official"
      }
    }),
    smokeSegment({
      index: 1,
      title: `Platform smoke: ${journal.name} journal selection`,
      summary: `The selected journal RSS feed for this smoke run is ${journal.name}.`,
      citation: {
        label: `${journal.name} RSS feed`,
        url: journal.rssUrl,
        sourceType: "official"
      }
    }),
    smokeSegment({
      index: 2,
      title: `Platform smoke: ${source.name} clinical news selection`,
      summary: `The selected clinical news or media source for this smoke run is ${source.name}.`,
      citation: {
        label: `${source.name} source feed`,
        url: source.url,
        sourceType: source.type
      }
    })
  ];
}

function enabledMediaSources(sources: SourceConfig[]) {
  return sources.filter(
    (source) =>
      source.enabled &&
      source.type === "media" &&
      /\b(rss|feed|feeds)\b/i.test(source.url) &&
      !/\b(journal|jama|lancet|nejm|nature|annals|leukemia|bmj)\b/i.test(source.name)
  );
}

function toCardsForSelections({
  items,
  conferences,
  journals,
  sourceIds,
  maxCards
}: {
  items: IngestedItem[];
  conferences: MedicalConference[];
  journals: OncologyJournal[];
  sourceIds: string[];
  maxCards: number;
}) {
  return items
    .filter((item) =>
      itemMatchesSelections({
        item,
        conferences,
        journals,
        sourceIds
      })
    )
    .sort((a, b) => a.rank - b.rank)
    .slice(0, maxCards);
}

async function upsertSmokeCoverageSlot({
  conferenceId,
  startsAt
}: {
  conferenceId: string;
  startsAt: string;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("conference_coverage_slots")
    .upsert(
      {
        conference_id: conferenceId,
        starts_at: startsAt,
        duration_hours: 1,
        enabled: true,
        approval_status: "approved",
        approved_at: new Date().toISOString(),
        approval_scope: "slot",
        youtube_status: "not_scheduled",
        youtube_video_id: null,
        youtube_url: null,
        delivery_error: null,
        updated_at: new Date().toISOString()
      },
      { onConflict: "conference_id,starts_at" }
    )
    .select("id")
    .single();
  if (error) {
    throw error;
  }
  return data.id as string;
}

async function prepareAttempt(attempt: number, context: AttemptContext): Promise<PreparedAttempt> {
  const conferences = (await getMedicalConferencesFromDb()) ?? [];
  const journals = ((await getOncologyJournalsFromDb()) ?? []).filter((journal) => journal.enabled);
  const sources = (await getSourcesFromDb()) ?? sourceRegistry;
  const conference = rand(conferences, "conference/meeting");
  const journal = rand(journals, "journal RSS feed");
  const source = rand(enabledMediaSources(sources), "clinical news or newspaper source");
  const startsAtDate = attemptStart(
    Number(process.env.PLATFORM_SMOKE_START_DELAY_MINUTES ?? "12"),
    attempt
  );
  const startsAt = startsAtDate.toISOString();
  const coverageDate = coverageDateFor(startsAtDate);

  const plan = {
    coverageDate,
    conferenceIds: [conference.id],
    journalIds: [journal.id],
    sourceIds: [source.id],
    customItems: [],
    priorityTopics: ["ConferenceHype platform smoke test", conference.name, journal.name, source.name],
    exclusions: [],
    breakingNewsEnabled: true,
    notes: `Automated platform smoke test ${randomUUID()}`
  };

  const freshItems = await runIngestionJob(coverageDate, plan);
  const storedItems = (await getPreviousDayBatchItemsFromDb(coverageDate, 240)) ?? [];
  const candidates = toCardsForSelections({
    items: [...freshItems, ...storedItems],
    conferences: [conference],
    journals: [journal],
    sourceIds: [source.id],
    maxCards: Number(process.env.PLATFORM_SMOKE_MAX_CARDS ?? "12")
  });
  const enriched = (
    await Promise.all(candidates.map((item) => buildPubMedBackedJournalItem(item)))
  ).filter((item): item is IngestedItem => Boolean(item));
  // buildBatchSegment() (the happy path, used whenever real ingested items
  // exist) doesn't tag its output at all — only the smokeFallbackSegments()
  // path does. Force the tag here too so every segment this script ever
  // creates is unambiguously identifiable later, no matter which path built
  // it. Without this, identifying leftovers requires guessing at title text.
  const readySegments = (
    enriched.length
      ? enriched.map((item, index) =>
          buildBatchSegment(item, personaIdForBatchIndex(index), {
            startsAt,
            index,
            batchLabel: "Platform smoke batch"
          })
        )
      : smokeFallbackSegments({ conference, journal, source })
  ).map((segment) => ({
    ...segment,
    riskFlags: Array.from(new Set([...segment.riskFlags, "platform_smoke_test"]))
  }));
  const savedReady = (await saveGeneratedSegmentsToDb(readySegments)) ?? readySegments;
  savedReady.forEach((segment) => context.segmentIds.add(segment.id));
  const slotId = await upsertSmokeCoverageSlot({
    conferenceId: conference.id,
    startsAt
  });
  context.slotId = slotId;
  const slotRiskFlags = ["platform_smoke_scheduled_card", `coverage_slot:${slotId}`];
  let scheduledSegments = savedReady.map((segment, index) =>
    makeScheduledCopy({
      source: segment,
      approvedAt: scheduleAt(startsAt, index),
      script: segment.script,
      extraRiskFlags: slotRiskFlags
    })
  );
  const validationErrors = scheduledSegments.flatMap((segment, index) =>
    validateSegmentForApproval(segment).map((error) => `Card ${index + 1}: ${error}`)
  );
  if (validationErrors.length) {
    const fallbackReady = smokeFallbackSegments({ conference, journal, source });
    const savedFallback = (await saveGeneratedSegmentsToDb(fallbackReady)) ?? fallbackReady;
    savedFallback.forEach((segment) => context.segmentIds.add(segment.id));
    scheduledSegments = savedFallback.map((segment, index) =>
      makeScheduledCopy({
        source: segment,
        approvedAt: scheduleAt(startsAt, index),
        script: segment.script,
        extraRiskFlags: slotRiskFlags
      })
    );
    const fallbackErrors = scheduledSegments.flatMap((segment, index) =>
      validateSegmentForApproval(segment).map((error) => `Fallback card ${index + 1}: ${error}`)
    );
    if (fallbackErrors.length) {
      throw new Error(`Smoke fallback cards failed approval validation: ${fallbackErrors.join("; ")}`);
    }
  }
  const savedScheduled = (await saveGeneratedSegmentsToDb(scheduledSegments)) ?? scheduledSegments;
  savedScheduled.forEach((segment) => context.segmentIds.add(segment.id));
  if (savedScheduled.length === 0) {
    throw new Error("Smoke cards were generated but could not be scheduled.");
  }
  githubOutput("slot_id", slotId);
  githubOutput("start_at", startsAt);
  githubOutput("card_count", savedScheduled.length);
  githubOutput("conference", conference.name);
  githubOutput("journal", journal.name);
  githubOutput("source", source.name);
  console.log(
    JSON.stringify(
      {
        ok: true,
        attempt,
        slotId,
        startsAt,
        coverageDate,
        conference: conference.name,
        journal: journal.name,
        source: source.name,
        readyCards: savedReady.length,
        scheduledCards: savedScheduled.length
      },
      null,
      2
    )
  );

  return {
    slotId,
    startsAt,
    coverageDate,
    conference,
    journal,
    source,
    readySegments: savedReady,
    scheduledSegments: savedScheduled
  };
}

function githubToken() {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN or GH_TOKEN is required to dispatch the YouTube stream workflow.");
  }
  return token;
}

async function githubApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const repository = process.env.GITHUB_REPOSITORY ?? "lijosimpson/ConferenceHype";
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken()}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${path} failed: ${response.status} ${await response.text()}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

async function dispatchYoutubeWorkflow(prepared: PreparedAttempt) {
  const ref =
    process.env.PLATFORM_SMOKE_REF ??
    process.env.GITHUB_REF_NAME ??
    process.env.GITHUB_SHA ??
    "main";
  const durationMinutes = process.env.PLATFORM_SMOKE_STREAM_MINUTES ?? String(DEFAULT_STREAM_MINUTES);
  const dispatchedAfter = new Date(Date.now() - 5000).toISOString();
  await githubApi<void>("/actions/workflows/youtube-stream.yml/dispatches", {
    method: "POST",
    body: JSON.stringify({
      ref,
      inputs: {
        duration_minutes: durationMinutes,
        stream_input_path: "public/rendered/fallback-loop.mp4",
        stream_start_time: prepared.startsAt,
        coverage_slot_id: prepared.slotId
      }
    })
  });

  for (let poll = 0; poll < 24; poll += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const payload = await githubApi<{ workflow_runs: WorkflowRun[] }>(
      "/actions/workflows/youtube-stream.yml/runs?event=workflow_dispatch&per_page=20"
    );
    const run = payload.workflow_runs
      .filter((item) => new Date(item.created_at).toISOString() >= dispatchedAfter)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    if (run) {
      githubOutput("youtube_workflow_run_id", run.id);
      githubOutput("youtube_workflow_url", run.html_url);
      console.log(`Dispatched YouTube workflow run ${run.id}: ${run.html_url}`);
      return run;
    }
  }
  throw new Error("Timed out locating the dispatched YouTube stream workflow run.");
}

async function waitForWorkflow(run: WorkflowRun) {
  const timeoutMinutes = Number(process.env.PLATFORM_SMOKE_WORKFLOW_TIMEOUT_MINUTES ?? "160");
  const deadline = Date.now() + timeoutMinutes * 60_000;
  let current = run;
  while (Date.now() < deadline) {
    current = await githubApi<WorkflowRun>(`/actions/runs/${run.id}`);
    console.log(
      `YouTube workflow ${run.id}: status=${current.status} conclusion=${current.conclusion ?? "pending"}`
    );
    if (current.status === "completed") {
      if (current.conclusion === "success") {
        return current;
      }
      throw new Error(`YouTube stream workflow failed with conclusion ${current.conclusion}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 30_000));
  }
  throw new Error(`Timed out waiting for YouTube workflow ${run.id}.`);
}

async function assertCompletedSlotAndWriteout(prepared: PreparedAttempt) {
  const supabase = createAdminClient();
  const { data: slot, error: slotError } = await supabase
    .from("conference_coverage_slots")
    .select("id,youtube_status,youtube_video_id,youtube_url,delivery_error")
    .eq("id", prepared.slotId)
    .single();
  if (slotError) {
    throw slotError;
  }
  if (slot.youtube_status !== "completed" || !slot.youtube_video_id) {
    throw new Error(
      `Smoke slot did not complete: status=${slot.youtube_status}, video=${slot.youtube_video_id ?? "none"}, error=${slot.delivery_error ?? "none"}`
    );
  }
  const { data: writeout, error: writeoutError } = await supabase
    .from("broadcast_writeouts")
    .select("id,cards,youtube_video_id")
    .eq("youtube_video_id", slot.youtube_video_id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (writeoutError) {
    throw writeoutError;
  }
  const cards = Array.isArray(writeout?.cards) ? writeout.cards : [];
  const contentCards = cards.filter((card) => card?.kind === "content");
  const musicCards = cards.filter((card) => card?.kind === "music");
  if (!writeout || contentCards.length === 0 || musicCards.length === 0) {
    throw new Error(
      `Smoke writeout must contain both content and music cards; got content=${contentCards.length}, music=${musicCards.length}.`
    );
  }

  await verifyYoutubeDeliveryLoop({
    phase: "completed",
    youtubeVideoId: slot.youtube_video_id,
    youtubeUrl: slot.youtube_url,
    expectedPrivacyStatus:
      process.env.YOUTUBE_EXPECT_PRIVACY_STATUS === "unlisted" ? "unlisted" : "public",
    timeoutSeconds: Number(process.env.PLATFORM_SMOKE_FINAL_VERIFY_TIMEOUT_SECONDS ?? "240"),
    intervalSeconds: 20
  });
  githubOutput("youtube_video_id", slot.youtube_video_id);
  githubOutput("youtube_url", slot.youtube_url);
  githubOutput("writeout_id", writeout.id);
}

// Smoke cards are scaffolding for exercising the real pipeline end to end —
// once an attempt has been judged (pass or fail), its cards and coverage
// slot are deleted so they never linger as real broadcast material.
async function cleanupAttemptArtifacts(context: AttemptContext) {
  try {
    if (context.segmentIds.size) {
      await deleteSegmentsByIdsInDb(Array.from(context.segmentIds));
    }
    if (context.slotId) {
      await deleteConferenceCoverageSlotInDb(context.slotId);
    }
  } catch (error) {
    console.error("PLATFORM_SMOKE_CLEANUP_FAILED", error);
  }
}

async function runLoop() {
  const attempts = Number(process.env.PLATFORM_SMOKE_ATTEMPTS ?? String(DEFAULT_ATTEMPTS));
  const run = await startPlatformSmokeRunInDb({ attempt: 1, attemptsAllowed: attempts });
  let lastError: unknown;
  let lastPrepared: PreparedAttempt | undefined;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const context: AttemptContext = { segmentIds: new Set() };
    try {
      const prepared = await prepareAttempt(attempt, context);
      lastPrepared = prepared;
      const dispatched = await dispatchYoutubeWorkflow(prepared);
      await waitForWorkflow(dispatched);
      await assertCompletedSlotAndWriteout(prepared);
      console.log(`PLATFORM_SMOKE_VERIFIED attempt=${attempt}`);
      githubOutput("verified", true);
      if (run) {
        await finishPlatformSmokeRunInDb({
          id: run.id,
          attempt,
          outcome: "passed",
          conferenceName: prepared.conference.name,
          journalName: prepared.journal.name,
          sourceName: prepared.source.name,
          workflowRunUrl: dispatched.html_url
        });
      }
      return;
    } catch (error) {
      lastError = error;
      console.error(`PLATFORM_SMOKE_ATTEMPT_FAILED attempt=${attempt}`);
      console.error(error);
    } finally {
      await cleanupAttemptArtifacts(context);
    }
  }
  githubOutput("verified", false);
  const errorMessage = lastError instanceof Error ? lastError.message : JSON.stringify(lastError);
  if (run) {
    await finishPlatformSmokeRunInDb({
      id: run.id,
      attempt: attempts,
      outcome: "failed",
      conferenceName: lastPrepared?.conference.name,
      journalName: lastPrepared?.journal.name,
      sourceName: lastPrepared?.source.name,
      errorMessage
    });
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Platform smoke loop failed: ${JSON.stringify(lastError)}`);
}

const mode = process.argv[2] ?? "loop";
if (mode === "prepare") {
  // Manual debug entry point only — intentionally leaves its cards in place
  // so a developer can inspect them; not used by the automated smoke loop.
  prepareAttempt(1, { segmentIds: new Set() }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else if (mode === "loop") {
  runLoop().catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else {
  console.error(`Unknown mode: ${mode}`);
  process.exit(1);
}
