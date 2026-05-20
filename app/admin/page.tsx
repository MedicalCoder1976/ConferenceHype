import { AdminShell } from "@/components/AdminShell";
import { AnalyticsPanel } from "@/components/AnalyticsPanel";
import { EmergencyOverride } from "@/components/EmergencyOverride";
import { FocusSocialPost } from "@/components/FocusSocialPost";
import { LanguageControls } from "@/components/LanguageControls";
import { ReviewQueue } from "@/components/ReviewQueue";
import { SourceManager } from "@/components/SourceManager";
import { getAdminSnapshot } from "@/lib/data";

export default async function AdminPage() {
  const snapshot = await getAdminSnapshot();

  return (
    <AdminShell>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <ReviewQueue segments={snapshot.pendingSegments} />
        <div className="grid gap-6">
          <FocusSocialPost />
          <EmergencyOverride streamState={snapshot.streamState} />
          <LanguageControls />
          <SourceManager sources={snapshot.sources} />
          <AnalyticsPanel analytics={snapshot.analytics} />
        </div>
      </div>
    </AdminShell>
  );
}
