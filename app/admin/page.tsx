import { AdminShell } from "@/components/AdminShell";
import { AdminTabs } from "@/components/AdminTabs";
import { AiredHistory } from "@/components/AiredHistory";
import { AnalyticsPanel } from "@/components/AnalyticsPanel";
import { BroadcastRundown } from "@/components/BroadcastRundown";
import { EmergencyOverride } from "@/components/EmergencyOverride";
import { FocusSocialPost } from "@/components/FocusSocialPost";
import { InstagramPushPanel } from "@/components/InstagramPushPanel";
import { LanguageControls } from "@/components/LanguageControls";
import { OncologyReporterGrid } from "@/components/OncologyReporterGrid";
import { RecordingLibrary } from "@/components/RecordingLibrary";
import { ReviewQueue } from "@/components/ReviewQueue";
import { SocialVoiceCompetition } from "@/components/SocialVoiceCompetition";
import { SourceManager } from "@/components/SourceManager";
import { XVoiceCallouts } from "@/components/XVoiceCallouts";
import { getAdminSnapshot } from "@/lib/data";
import { getCachedRecordings } from "@/lib/media/recordings";

type AdminPageProps = {
  searchParams?: Promise<{ start?: string }>;
};

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

function todayAtNoonEastern(now = new Date()) {
  const { year, month, day } = getEasternDateParts(now);
  return new Date(`${year}-${month}-${day}T12:00:00-04:00`);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function noonEasternForDate(date: Date) {
  const { year, month, day } = getEasternDateParts(date);
  return `${year}-${month}-${day}T12:00:00-04:00`;
}

function resolvePreviewStart(start?: string) {
  if (!start) {
    return new Date();
  }
  if (start === "today-noon") {
    return todayAtNoonEastern();
  }
  const parsed = new Date(start);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = await searchParams;
  const baseDate = resolvePreviewStart(params?.start);
  const [snapshot, cachedRecordings] = await Promise.all([
    getAdminSnapshot(baseDate),
    getCachedRecordings()
  ]);
  const baseTime = baseDate.toISOString();
  const twoWeekStarts = Array.from({ length: 14 }, (_, index) => {
    const noon = noonEasternForDate(addDays(new Date(), index));
    return {
      href: `/admin?start=${encodeURIComponent(noon)}`,
      label: new Intl.DateTimeFormat("en-US", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(new Date(noon))
    };
  });
  const noonPreviewHref = "/admin?start=today-noon";
  const liveHref = "/admin";
  const previewLabel = new Intl.DateTimeFormat("en-US", {
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
        <a
          className="inline-flex min-h-10 items-center justify-center border border-ink bg-white px-4 text-xs font-black uppercase text-ink"
          href={noonPreviewHref}
        >
          Today noon preview
        </a>
        <a
          className="inline-flex min-h-10 items-center justify-center bg-ink px-4 text-xs font-black uppercase text-white"
          href={liveHref}
        >
          Live now view
        </a>
        <div className="basis-full">
          <div className="mb-2 text-xs font-black uppercase text-ink/50">
            14-day noon planning shortcuts
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {twoWeekStarts.map((item) => (
              <a
                key={item.href}
                className="shrink-0 border border-ink/10 bg-paper px-3 py-2 text-xs font-black uppercase text-ink/70 hover:border-broadcast"
                href={item.href}
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
      </div>
      <AdminTabs
        broadcast={
          <div className="grid gap-6 xl:grid-cols-2">
            <BroadcastRundown
              segments={snapshot.nextBroadcastSegments}
              scheduleSegments={snapshot.scheduleRundownSegments}
              baseTime={baseTime}
            />
            <div className="grid gap-6">
              <ReviewQueue segments={snapshot.pendingSegments} />
              <FocusSocialPost />
              <InstagramPushPanel />
              <EmergencyOverride streamState={snapshot.streamState} />
              <SourceManager sources={snapshot.sources} />
              <AnalyticsPanel analytics={snapshot.analytics} />
            </div>
          </div>
        }
        history={<AiredHistory segments={snapshot.airedSegments} />}
        voices={
          <div className="grid gap-6 xl:grid-cols-2">
            <RecordingLibrary recordings={cachedRecordings} />
            <OncologyReporterGrid />
            <XVoiceCallouts customVoices={snapshot.xFollowVoices} />
            <SocialVoiceCompetition
              leaders={snapshot.socialVoiceLeaderboard}
              cadence={snapshot.nextSocialVoiceCompetition}
              dueNow={snapshot.socialVoiceCompetitionDueNow}
            />
            <LanguageControls />
          </div>
        }
      />
    </AdminShell>
  );
}
