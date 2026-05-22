import { AdminShell } from "@/components/AdminShell";
import { AnalyticsPanel } from "@/components/AnalyticsPanel";
import { EmergencyOverride } from "@/components/EmergencyOverride";
import { FocusSocialPost } from "@/components/FocusSocialPost";
import { InstagramPushPanel } from "@/components/InstagramPushPanel";
import { LanguageControls } from "@/components/LanguageControls";
import { RecordingLibrary } from "@/components/RecordingLibrary";
import { ReviewQueue } from "@/components/ReviewQueue";
import { SocialVoiceCompetition } from "@/components/SocialVoiceCompetition";
import { SourceManager } from "@/components/SourceManager";
import { XVoiceCallouts } from "@/components/XVoiceCallouts";
import { getAdminSnapshot } from "@/lib/data";
import { getCachedRecordings } from "@/lib/media/recordings";

export default async function AdminPage() {
  const [snapshot, cachedRecordings] = await Promise.all([
    getAdminSnapshot(),
    getCachedRecordings()
  ]);

  return (
    <AdminShell>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <ReviewQueue segments={snapshot.pendingSegments} />
        <div className="grid gap-6">
          <RecordingLibrary recordings={cachedRecordings} />
          <FocusSocialPost />
          <InstagramPushPanel />
          <XVoiceCallouts customVoices={snapshot.xFollowVoices} />
          <SocialVoiceCompetition
            leaders={snapshot.socialVoiceLeaderboard}
            cadence={snapshot.nextSocialVoiceCompetition}
            dueNow={snapshot.socialVoiceCompetitionDueNow}
          />
          <EmergencyOverride streamState={snapshot.streamState} />
          <LanguageControls />
          <SourceManager sources={snapshot.sources} />
          <AnalyticsPanel analytics={snapshot.analytics} />
        </div>
      </div>
    </AdminShell>
  );
}
