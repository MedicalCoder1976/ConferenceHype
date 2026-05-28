import { createHash } from "node:crypto";
import { hasSupabase } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { sourceRegistry, sourceToXVoice, type XVoice } from "@/lib/sources/registry";
import type {
  AnalyticsSnapshot,
  Citation,
  IngestedItem,
  Segment,
  SocialVoiceLeader,
  SourceConfig,
  StreamState
} from "@/lib/types";

type SegmentRow = {
  id: string;
  title: string;
  summary: string;
  script: string;
  content_type: Segment["contentType"];
  persona_id: string;
  persona_name: string;
  hype_level: Segment["hypeLevel"];
  language: string;
  status: Segment["status"];
  citations: Citation[];
  social_buzz_items: Citation[];
  risk_flags: string[];
  confidence_score: number;
  created_at: string;
  approved_at?: string | null;
  updated_at?: string | null;
};

type SourceRow = {
  id: string;
  name: string;
  url: string;
  type: SourceConfig["type"];
  rank: number;
  enabled: boolean;
};

type IngestedItemRow = {
  id: string;
  title: string;
  url: string;
  excerpt: string;
  author?: string | null;
  source_type: SourceConfig["type"];
  source_rank: number;
  published_at?: string | null;
  created_at: string;
};

function toSegment(row: SegmentRow): Segment {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    script: row.script,
    contentType: row.content_type,
    personaId: row.persona_id,
    personaName: row.persona_name,
    hypeLevel: row.hype_level,
    language: row.language,
    status: row.status,
    citations: row.citations ?? [],
    socialBuzzItems: row.social_buzz_items ?? [],
    riskFlags: row.risk_flags ?? [],
    confidenceScore: row.confidence_score,
    createdAt: row.created_at,
    approvedAt: row.approved_at ?? undefined,
    updatedAt: row.updated_at ?? undefined
  };
}

function toSource(row: SourceRow): SourceConfig {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    type: row.type,
    rank: row.rank,
    enabled: row.enabled
  };
}

function toIngestedItem(row: IngestedItemRow): IngestedItem {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    excerpt: row.excerpt,
    author: row.author ?? undefined,
    sourceName: row.author ? `${row.author} social item` : "Social item",
    sourceType: row.source_type,
    rank: row.source_rank,
    publishedAt: row.published_at ?? row.created_at
  };
}

function dedupeHash(item: IngestedItem) {
  return createHash("sha256").update(`${item.url}|${item.title}`).digest("hex");
}

export function isDatabaseConfigured() {
  return hasSupabase();
}

export async function getApprovedSegmentsFromDb() {
  if (!hasSupabase()) {
    return null;
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("segments")
    .select("*")
    .in("status", ["approved", "rendered"])
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    throw error;
  }
  return (data as SegmentRow[]).map(toSegment);
}

export async function getNextBroadcastSegmentsFromDb(limit = 42) {
  if (!hasSupabase()) {
    return null;
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("segments")
    .select("*")
    .eq("status", "approved")
    .order("approved_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }
  return (data as SegmentRow[]).map(toSegment);
}

export async function getAiredSegmentsFromDb(limit = 40) {
  if (!hasSupabase()) {
    return null;
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("segments")
    .select("*")
    .eq("status", "rendered")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }
  return (data as SegmentRow[]).map(toSegment);
}

export async function getPendingSegmentsFromDb(limit = 120) {
  if (!hasSupabase()) {
    return null;
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("segments")
    .select("*")
    .eq("status", "pending_review")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }
  return (data as SegmentRow[]).map(toSegment);
}

export async function getSegmentByIdFromDb(segmentId: string) {
  if (!hasSupabase()) {
    return null;
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("segments")
    .select("*")
    .eq("id", segmentId)
    .single();

  if (error) {
    throw error;
  }
  return toSegment(data as SegmentRow);
}

export async function getStreamStateFromDb() {
  if (!hasSupabase()) {
    return null;
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("stream_state")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) {
    throw error;
  }

  return {
    mode: data.mode as StreamState["mode"],
    emergencyActive: data.emergency_active as boolean,
    emergencyMessage: data.emergency_message as string,
    currentSegmentId: data.current_segment_id ?? undefined
  } satisfies StreamState;
}

export async function getSourcesFromDb() {
  if (!hasSupabase()) {
    return null;
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("sources")
    .select("*")
    .order("rank", { ascending: true });

  if (error) {
    throw error;
  }
  return (data as SourceRow[]).map(toSource);
}

export async function getXFollowVoicesFromDb(): Promise<XVoice[] | null> {
  const sources = await getSourcesFromDb();
  if (!sources) {
    return null;
  }
  return sources
    .filter((source) => source.enabled)
    .map(sourceToXVoice)
    .filter((voice): voice is XVoice => Boolean(voice));
}

export async function getBlacklistedXHandlesFromDb(): Promise<string[] | null> {
  const sources = await getSourcesFromDb();
  if (!sources) {
    return null;
  }
  return sources
    .filter((source) => !source.enabled)
    .map(sourceToXVoice)
    .filter((voice): voice is XVoice => Boolean(voice))
    .map((voice) => voice.handle.toLowerCase());
}

export async function getRecentSocialItemsFromDb(hours = 3): Promise<IngestedItem[] | null> {
  if (!hasSupabase()) {
    return null;
  }
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const supabase = createAdminClient();
  // Include general_social (X API tweets) AND media/official items
  // that have an author field set (e.g. RSS articles attributed to a
  // monitored X voice like @OncLive, @statnews, @ASCOPost).
  // This keeps the leaderboard alive when the X API is unavailable.
  const { data, error } = await supabase
    .from("ingested_items")
    .select("*")
    .in("source_type", ["general_social", "media", "official"])
    .not("author", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    throw error;
  }
  return (data as IngestedItemRow[]).map(toIngestedItem);
}

export async function getSocialVoiceLeaderboardFromDb(): Promise<SocialVoiceLeader[] | null> {
  const [items, customVoices, blacklistedHandles] = await Promise.all([
    getRecentSocialItemsFromDb(24),
    getXFollowVoicesFromDb(),
    getBlacklistedXHandlesFromDb()
  ]);
  if (!items) {
    return null;
  }
  const { buildSocialVoiceLeaderboard } = await import("@/lib/social/leaderboard");
  return buildSocialVoiceLeaderboard(items, customVoices ?? [], blacklistedHandles ?? []);
}

export async function getAnalyticsFromDb() {
  if (!hasSupabase()) {
    return null;
  }
  const supabase = createAdminClient();
  const [{ count: views }, { count: clipsCreated }, { count: pendingReview }] =
    await Promise.all([
      supabase.from("analytics_events").select("*", { count: "exact", head: true }),
      supabase
        .from("media_assets")
        .select("*", { count: "exact", head: true })
        .eq("kind", "clip"),
      supabase
        .from("segments")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending_review")
    ]);

  return {
    views: views ?? 0,
    clipsCreated: clipsCreated ?? 0,
    pendingReview: pendingReview ?? 0
  } satisfies AnalyticsSnapshot;
}

export async function upsertSourcesToDb() {
  if (!hasSupabase()) {
    return null;
  }
  const supabase = createAdminClient();
  const { error } = await supabase.from("sources").upsert(
    sourceRegistry.map((source) => ({
      name: source.name,
      url: source.url,
      type: source.type,
      rank: source.rank,
      enabled: source.enabled
    })),
    { onConflict: "url" }
  );
  if (error) {
    throw error;
  }
}

export async function addXFollowSourceToDb({
  handle,
  label,
  note
}: {
  handle: string;
  label: string;
  note?: string;
}) {
  if (!hasSupabase()) {
    return null;
  }
  const username = handle.replace(/^@/, "");
  const normalizedHandle = `@${username}`;
  const supabase = createAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("sources")
    .select("*")
    .eq("url", `https://x.com/${username}`)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing && !(existing as SourceRow).enabled) {
    const source = toSource(existing as SourceRow);
    return {
      source,
      voice: {
        label: label || normalizedHandle,
        handle: normalizedHandle,
        note: "blacklisted X follow"
      } satisfies XVoice
    };
  }

  const { data, error } = await supabase
    .from("sources")
    .upsert(
      {
        name: `X follow: ${label || normalizedHandle}`,
        url: `https://x.com/${username}`,
        type: "general_social",
        rank: 5,
        enabled: true
      },
      { onConflict: "url" }
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  const source = toSource(data as SourceRow);
  return {
    source,
    voice: {
      label: label || normalizedHandle,
      handle: normalizedHandle,
      note: note || "operator-added X follow"
    } satisfies XVoice
  };
}

export async function blacklistXFollowSourceInDb({
  handle,
  label
}: {
  handle: string;
  label?: string;
}) {
  if (!hasSupabase()) {
    return null;
  }
  const username = handle.replace(/^@/, "");
  const normalizedHandle = `@${username}`;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("sources")
    .upsert(
      {
        name: `X blacklist: ${label || normalizedHandle}`,
        url: `https://x.com/${username}`,
        type: "general_social",
        rank: 99,
        enabled: false
      },
      { onConflict: "url" }
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }
  return toSource(data as SourceRow);
}

export async function addSourceToDb({
  name,
  url,
  type,
  rank = 3
}: {
  name: string;
  url: string;
  type: SourceConfig["type"];
  rank?: number;
}) {
  if (!hasSupabase()) {
    return null;
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("sources")
    .upsert(
      {
        name,
        url,
        type,
        rank,
        enabled: true
      },
      { onConflict: "url" }
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }
  return toSource(data as SourceRow);
}

export async function saveIngestedItemsToDb(items: IngestedItem[]) {
  if (!hasSupabase() || items.length === 0) {
    return null;
  }
  const uniqueItems = Array.from(
    new Map(items.map((item) => [dedupeHash(item), item])).values()
  );
  const supabase = createAdminClient();
  const { error } = await supabase.from("ingested_items").upsert(
    uniqueItems.map((item) => ({
      title: item.title,
      url: item.url,
      excerpt: item.engagementScore
        ? `${item.excerpt}\n\nEngagement score: ${item.engagementScore}`
        : item.excerpt,
      author: item.author,
      source_type: item.sourceType,
      source_rank: item.rank,
      published_at: item.publishedAt,
      dedupe_hash: dedupeHash(item)
    })),
    { onConflict: "dedupe_hash" }
  );
  if (error) {
    throw error;
  }
}

export async function saveGeneratedSegmentsToDb(segments: Segment[]) {
  if (!hasSupabase() || segments.length === 0) {
    return null;
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("segments")
    .insert(
      segments.map((segment) => ({
        title: segment.title,
        summary: segment.summary,
        script: segment.script,
        content_type: segment.contentType,
        persona_id: segment.personaId,
        persona_name: segment.personaName,
        hype_level: segment.hypeLevel,
        language: segment.language,
        status: segment.status,
        citations: segment.citations,
        social_buzz_items: segment.socialBuzzItems,
        risk_flags: segment.riskFlags,
        confidence_score: segment.confidenceScore,
        approved_at: segment.approvedAt,
        updated_at: segment.updatedAt ?? segment.approvedAt ?? segment.createdAt
      }))
    )
    .select("*");
  if (error) {
    throw error;
  }
  return (data as SegmentRow[]).map(toSegment);
}

export async function updateSegmentDecisionInDb({
  segmentId,
  action,
  script
}: {
  segmentId: string;
  action: "approve" | "reject";
  script: string;
}) {
  if (!hasSupabase()) {
    return null;
  }
  const supabase = createAdminClient();
  const { data: existing, error: readError } = await supabase
    .from("segments")
    .select("*")
    .eq("id", segmentId)
    .single();

  if (readError) {
    throw readError;
  }

  const status = action === "approve" ? "approved" : "rejected";
  const { data, error } = await supabase
    .from("segments")
    .update({
      script,
      status,
      approved_at: action === "approve" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
    .eq("id", segmentId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }
  return {
    before: toSegment(existing as SegmentRow),
    after: toSegment(data as SegmentRow)
  };
}

export async function updateSegmentScheduleInDb({
  segmentId,
  approvedAt,
  script
}: {
  segmentId: string;
  approvedAt: string;
  script?: string;
}) {
  if (!hasSupabase()) {
    return null;
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("segments")
    .update({
      ...(script ? { script } : {}),
      status: "approved",
      approved_at: approvedAt,
      updated_at: new Date().toISOString()
    })
    .eq("id", segmentId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }
  return toSegment(data as SegmentRow);
}

export async function updateEmergencyStateInDb({
  active,
  message
}: {
  active: boolean;
  message: string;
}) {
  if (!hasSupabase()) {
    return null;
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("stream_state")
    .upsert({
      id: 1,
      emergency_active: active,
      emergency_message: message,
      mode: active ? "hls_fallback" : "preview",
      updated_at: new Date().toISOString()
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }
  return {
    mode: data.mode,
    emergencyActive: data.emergency_active,
    emergencyMessage: data.emergency_message,
    currentSegmentId: data.current_segment_id ?? undefined
  } satisfies StreamState;
}

export async function createClipJobInDb(segmentId: string, excerpt: string) {
  if (!hasSupabase()) {
    return null;
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("media_assets")
    .insert({
      segment_id: segmentId,
      kind: "clip",
      status: "queued",
      duration_seconds: 45,
      storage_path: null
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }
  return {
    id: data.id as string,
    segmentId,
    durationSeconds: 45,
    format: "vertical_1080x1920",
    status: data.status as string,
    excerpt
  };
}
