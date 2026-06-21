import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { AdminTabs } from "@/components/AdminTabs";
import { AiredHistory } from "@/components/AiredHistory";
import { AnalyticsPanel } from "@/components/AnalyticsPanel";
import { BroadcastRundown } from "@/components/BroadcastRundown";
import { BroadcastWriteoutArchive } from "@/components/BroadcastWriteoutArchive";
import { ConferencePlanner } from "@/components/ConferencePlanner";
import { DailyCoveragePlanner } from "@/components/DailyCoveragePlanner";
import { EmergencyOverride } from "@/components/EmergencyOverride";
import { EditorialMemory } from "@/components/EditorialMemory";
import { FocusSocialPost } from "@/components/FocusSocialPost";
import { InstagramPushPanel } from "@/components/InstagramPushPanel";
import { JournalWatchDesk } from "@/components/JournalWatchDesk";
import { LanguageControls } from "@/components/LanguageControls";
import { OncologyReporterGrid } from "@/components/OncologyReporterGrid";
import { MeetingWatchDesk } from "@/components/MeetingWatchDesk";
import { RecordingLibrary } from "@/components/RecordingLibrary";
import { SocialVoiceCompetition } from "@/components/SocialVoiceCompetition";
import { SourceManager } from "@/components/SourceManager";
import { StartStreamButton } from "@/components/StartStreamButton";
import { SpecialtyVoiceDirectory } from "@/components/SpecialtyVoiceDirectory";
import { XVoiceCallouts } from "@/components/XVoiceCallouts";
import { getAdminSnapshot } from "@/lib/data";
import { getCachedRecordings } from "@/lib/media/recordings";
import { buildHourlySocialVoiceRundownSegments } from "@/lib/social/hourlyVoiceRundown";
import {
  segmentSourceMatchesSelection,
  type SourceSelectionSet
} from "@/lib/weeklySourceCards";
import type {
  DailyCoveragePlan,
  MedicalConference,
  OncologyJournal,
  Segment
} from "@/lib/types";

// Prevent Vercel from caching this page so currentBlockStart() always reflects
// the real server time rather than the build-time snapshot.
export const dynamic = "force-dynamic";

type AdminPageProps = {
  searchParams?: Promise<{ section?: string; start?: string }>;
};

const PLANNING_WINDOW_HOURS = 1;
const PLANNING_HISTORY_HOURS = 24;
const PLANNING_FUTURE_HOURS = 7 * 24;

function getEasternDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: value("year"),
    month: value("month"),
    day: value("day")
  };
}

function todayAtPlanningEastern(now = new Date()) {
  const { year, month, day } = getEasternDateParts(now);
  return new Date(`${year}-${month}-${day}T21:00:00-04:00`);
}

function currentBlockStart(now = new Date()) {
  const { year, month, day } = getEasternDateParts(now);
  const etMidnight = new Date(`${year}-${month}-${day}T00:00:00-04:00`);
  const msPerBlock = PLANNING_WINDOW_HOURS * 60 * 60 * 1000;
  const msSinceMidnight = now.getTime() - etMidnight.getTime();
  const blockIndex = Math.floor(msSinceMidnight / msPerBlock);
  return new Date(etMidnight.getTime() + blockIndex * msPerBlock);
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function planningSlotLabel(start: Date) {
  const end = addHours(start, PLANNING_WINDOW_HOURS);
  const startTime = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    hour12: false
  }).format(start);
  const endTime = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    hour12: false
  }).format(end);
  return `${startTime}-${endTime}`;
}

function planningDayKey(start: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(start);
}

function planningDayLabel(start: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "2-digit",
    day: "2-digit"
  }).format(start);
}

function resolvePreviewStart(start?: string) {
  if (!start) {
    return currentBlockStart();
  }
  if (start === "today-noon" || start === "today-21") {
    return todayAtPlanningEastern();
  }
  const parsed = new Date(start);
  return Number.isNaN(parsed.getTime()) ? currentBlockStart() : parsed;
}
function realSelectedSourceIds(sourceIds: string[]) {
  return sourceIds.filter(
    (sourceId) =>
      !sourceId.startsWith("daily-journal-") &&
      !sourceId.startsWith("daily-conference-") &&
      !sourceId.startsWith("daily-custom-")
  );
}

function selectedSourceSet({
  plan,
  conferences,
  journals
}: {
  plan: DailyCoveragePlan;
  conferences: MedicalConference[];
  journals: OncologyJournal[];
}): SourceSelectionSet {
  const selectedConferenceIds = new Set(plan.conferenceIds);
  const selectedJournalIds = new Set(plan.journalIds);
  return {
    conferences: conferences.filter((conference) =>
      selectedConferenceIds.has(conference.id)
    ),
    journals: journals.filter((journal) => selectedJournalIds.has(journal.id)),
    sourceIds: realSelectedSourceIds(plan.sourceIds)
  };
}

function hasSelectedSources(selection: SourceSelectionSet) {
  return (
    selection.conferences.length > 0 ||
    selection.journals.length > 0 ||
    selection.sourceIds.length > 0
  );
}

function filterSegmentsForSelectedSources(
  segments: Segment[],
  selection: SourceSelectionSet
) {
  if (!hasSelectedSources(selection)) {
    return segments;
  }
  return segments.filter((segment) =>
    segmentSourceMatchesSelection(segment, selection)
  );
}
export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = await searchParams;
  const baseDate = resolvePreviewStart(params?.start);
  const [snapshot, cachedRecordings] = await Promise.all([
    getAdminSnapshot(baseDate, PLANNING_WINDOW_HOURS),
    getCachedRecordings()
  ]);
  const baseTime = baseDate.toISOString();
  const hourlySocialVoiceSegments = buildHourlySocialVoiceRundownSegments({
    leaders: snapshot.socialVoiceLeaderboard,
    specialtyVoices: snapshot.specialtyXVoices,
    baseTime: baseDate,
    hours: PLANNING_WINDOW_HOURS
  });
  const isPastPreview =
    baseDate.getTime() < Date.now() - PLANNING_WINDOW_HOURS * 60 * 60 * 1000;
  const selectedSources = selectedSourceSet({
    plan: snapshot.dailyCoveragePlan,
    conferences: snapshot.medicalConferences,
    journals: snapshot.oncologyJournals
  });
  const presentationSegments = filterSegmentsForSelectedSources(
    isPastPreview ? snapshot.airedSegments : snapshot.nextBroadcastSegments,
    selectedSources
  );
  const reviewSegments = filterSegmentsForSelectedSources(
    snapshot.pendingSegments,
    selectedSources
  );
  const scheduleSegments = filterSegmentsForSelectedSources(
    snapshot.scheduleRundownSegments,
    selectedSources
  );
  const socialVoiceSegments = hasSelectedSources(selectedSources)
    ? []
    : hourlySocialVoiceSegments;
  const liveBlock = currentBlockStart();
  const planningSlots = Array.from(
    { length: PLANNING_HISTORY_HOURS + PLANNING_FUTURE_HOURS },
    (_, index) => {
      const planningStart = addHours(liveBlock, index - PLANNING_HISTORY_HOURS);
      return {
        href: `/admin?start=${encodeURIComponent(planningStart.toISOString())}`,
        startsAt: planningStart,
        label: planningSlotLabel(planningStart)
      };
    }
  );
  const planningDays = planningSlots.reduce<Array<{
    key: string;
    label: string;
    slots: Array<{
      href: string;
      label: string;
      selected: boolean;
    }>;
  }>>((days, slot) => {
    const key = planningDayKey(slot.startsAt);
    const current = days.find((day) => day.key === key);
    const item = {
      href: slot.href,
      label: slot.label,
      selected: slot.startsAt.getTime() === baseDate.getTime()
    };
    if (current) {
      current.slots.push(item);
      return days;
    }
    days.push({ key, label: planningDayLabel(slot.startsAt), slots: [item] });
    return days;
  }, []);
  const activePlanningKey = planningDayKey(baseDate);
  const planningPreviewHref = "/admin?start=today-21";
  const liveHref = "/admin";
  const previewLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short"
  }).format(baseDate);

  return (
    <AdminShell>
      <div className="mb-5 flex flex-wrap items-center gap-3 border border-ink/10 bg-white p-4 shadow-panel">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-black uppercase text-broadcast">
            Rundown preview start
          </div>
          <div className="text-lg font-black text-ink">{previewLabel}</div>
        </div>
        <Link
          className="inline-flex min-h-10 items-center justify-center border border-ink bg-white px-4 text-xs font-black uppercase text-ink"
          href={planningPreviewHref}
        >
          Today 21:00 plan
        </Link>
        <Link
          className="inline-flex min-h-10 items-center justify-center bg-ink px-4 text-xs font-black uppercase text-white"
          href={liveHref}
        >
          Live now view
        </Link>
        <StartStreamButton
          initialEnabled={snapshot.streamState.continuousEnabled ?? false}
          startAt={baseTime}
          label={previewLabel}
        />
      </div>
      <AdminTabs
        initialActive={params?.section}
        broadcast={
          <div className="grid gap-6">
            <DailyCoveragePlanner
              initialPlan={snapshot.dailyCoveragePlan}
              conferences={snapshot.medicalConferences}
              journals={snapshot.oncologyJournals}
              sources={snapshot.sources}
              planningDays={planningDays}
              activePlanningKey={activePlanningKey}
              selectedStartsAt={baseTime}
              initialBatchItems={snapshot.batchIntakeItems}
              initialReadySegments={reviewSegments}
            />
            <BroadcastRundown
              key={baseTime}
              segments={presentationSegments}
              reviewSegments={reviewSegments}
              scheduleSegments={scheduleSegments}
              socialVoiceSegments={socialVoiceSegments}
              baseTime={baseTime}
              hours={PLANNING_WINDOW_HOURS}
            />
            <div className="grid min-w-0 gap-6 xl:grid-cols-2">
              <FocusSocialPost />
              <InstagramPushPanel />
              <EmergencyOverride streamState={snapshot.streamState} />
              <SourceManager sources={snapshot.sources} />
              <SocialVoiceCompetition
                leaders={snapshot.socialVoiceLeaderboard}
                cadence={snapshot.nextSocialVoiceCompetition}
                dueNow={snapshot.socialVoiceCompetitionDueNow}
                specialtyVoices={snapshot.specialtyXVoices}
              />
              <AnalyticsPanel analytics={snapshot.analytics} />
            </div>
          </div>
        }
        journalWatch={
          <JournalWatchDesk initialJournals={snapshot.oncologyJournals} />
        }
        meetingWatch={
          <div className="grid gap-6">
            <MeetingWatchDesk conferences={snapshot.medicalConferences} />
            <ConferencePlanner
              initialConferences={snapshot.medicalConferences}
              initialCoverageSlots={snapshot.conferenceCoverageSlots}
            />
          </div>
        }
        writeouts={<BroadcastWriteoutArchive writeouts={snapshot.broadcastWriteouts} />}
        memory={<EditorialMemory initialPackages={snapshot.editorialPackages} />}
        history={<AiredHistory segments={snapshot.airedSegments} />}
        voices={
          <div className="grid gap-6">
            <SpecialtyVoiceDirectory initialVoices={snapshot.specialtyXVoices} />
            <div className="grid gap-6 xl:grid-cols-2">
            <RecordingLibrary recordings={cachedRecordings} />
            <OncologyReporterGrid />
            <XVoiceCallouts customVoices={snapshot.xFollowVoices} />
            <LanguageControls />
            </div>
          </div>
        }
      />
    </AdminShell>
  );
}
