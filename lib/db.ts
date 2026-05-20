import { createHash } from "node:crypto";
import { hasSupabase } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { sourceRegistry } from "@/lib/sources/registry";
import type {
  AnalyticsSnapshot,
  Citation,
  IngestedItem,
  Segment,
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
};

type SourceRow = {
  id: string;
  name: string;
  url: string;
  type: SourceConfig["type"];
  rank: number;
  enabled: boolean;
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
    createdAt: row.created_at
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

export async function getPendingSegmentsFromDb() {
  if (!hasSupabase()) {
    return null;
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("segments")
    .select("*")
    .eq("status", "pending_review")
    .order("created_at", { ascending: false })
    .limit(50);

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

export async function saveIngestedItemsToDb(items: IngestedItem[]) {
  if (!hasSupabase() || items.length === 0) {
    return null;
  }
  const supabase = createAdminClient();
  const { error } = await supabase.from("ingested_items").upsert(
    items.map((item) => ({
      title: item.title,
      url: item.url,
      excerpt: item.excerpt,
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
        confidence_score: segment.confidenceScore
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
