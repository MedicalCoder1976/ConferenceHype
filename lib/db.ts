import { createHash } from "node:crypto";
import { hasSupabase } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { sourceRegistry, sourceToXVoice, type XVoice } from "@/lib/sources/registry";
import { conferenceSeeds } from "@/lib/catalog/conferenceSeeds";
import { specialtyVoiceSeeds } from "@/lib/catalog/specialtyVoiceSeeds";
import { oncologyJournalSeeds } from "@/lib/catalog/oncologyJournalSeeds";
import type {
  AnalyticsSnapshot,
  BroadcastWriteout,
  BroadcastWriteoutCard,
  Citation,
  EditorialPackage,
  IngestedItem,
  MedicalConference,
  OncologyJournal,
  Segment,
  SocialVoiceLeader,
  SpecialtyXVoice,
  SourceConfig,
  StreamState,
  ConferenceCoverageSlot
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
  source_id?: string | null;
  title: string;
  url: string;
  excerpt: string;
  author?: string | null;
  source_type: SourceConfig["type"];
  source_rank: number;
  published_at?: string | null;
  created_at: string;
  sources?: {
    name?: string | null;
  } | null;
};

type SpecialtyXVoiceRow = {
  id: string;
  specialty: string;
  label: string;
  handle: string;
  note: string;
  enabled: boolean;
  rank: number;
  score: number;
  last_verified_at?: string | null;
};

type MedicalConferenceRow = {
  id: string;
  name: string;
  acronym?: string | null;
  specialties: string[];
  start_date?: string | null;
  end_date?: string | null;
  month: number;
  year: number;
  city?: string | null;
  country?: string | null;
  timezone: string;
  official_url: string;
  enabled: boolean;
  operator_added: boolean;
};

type ConferenceCoverageSlotRow = {
  id: string;
  conference_id: string;
  starts_at: string;
  duration_hours: number;
  enabled: boolean;
  approval_status: ConferenceCoverageSlot["approvalStatus"];
  approved_at?: string | null;
  approval_scope?: ConferenceCoverageSlot["approvalScope"] | null;
  youtube_status: ConferenceCoverageSlot["youtubeStatus"];
  youtube_video_id?: string | null;
  youtube_url?: string | null;
  workflow_run_id?: string | null;
  workflow_url?: string | null;
  stream_started_at?: string | null;
  stream_ended_at?: string | null;
  delivery_error?: string | null;
  updated_at?: string | null;
};

type BroadcastWriteoutRow = {
  id: string;
  coverage_slot_id?: string | null;
  starts_at: string;
  duration_minutes: number;
  title: string;
  status: BroadcastWriteout["status"];
  youtube_video_id?: string | null;
  youtube_url?: string | null;
  workflow_run_id?: string | null;
  workflow_url?: string | null;
  delivery_error?: string | null;
  cards: BroadcastWriteoutCard[];
  writeout_markdown: string;
  created_at: string;
  updated_at: string;
};

type OncologyJournalRow = {
  id: string;
  name: string;
  abbreviation: string;
  rss_url: string;
  official_url: string;
  enabled: boolean;
  last_issue_key?: string | null;
};

type EditorialPackageRow = {
  id: string;
  category: EditorialPackage["category"];
  title: string;
  subject_name: string;
  edition_key: string;
  source_url: string;
  event_date?: string | null;
  intro_script: string;
  sections: EditorialPackage["sections"];
  status: EditorialPackage["status"];
  scheduled_at?: string | null;
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
    sourceId: row.source_id ?? undefined,
    title: row.title,
    url: row.url,
    excerpt: row.excerpt,
    author: row.author ?? undefined,
    sourceName:
      row.sources?.name ??
      (row.author ? `${row.author} social item` : "Conference source"),
    sourceType: row.source_type,
    rank: row.source_rank,
    publishedAt: row.published_at ?? row.created_at
  };
}

function toSpecialtyXVoice(row: SpecialtyXVoiceRow): SpecialtyXVoice {
  return {
    id: row.id,
    specialty: row.specialty,
    label: row.label,
    handle: row.handle,
    note: row.note,
    enabled: row.enabled,
    rank: row.rank,
    score: row.score,
    lastVerifiedAt: row.last_verified_at ?? undefined
  };
}

function toMedicalConference(row: MedicalConferenceRow): MedicalConference {
  return {
    id: row.id,
    name: row.name,
    acronym: row.acronym ?? undefined,
    specialties: row.specialties ?? [],
    startDate: row.start_date ?? undefined,
    endDate: row.end_date ?? undefined,
    month: row.month,
    year: row.year,
    city: row.city ?? undefined,
    country: row.country ?? undefined,
    timezone: row.timezone,
    officialUrl: row.official_url,
    enabled: row.enabled,
    operatorAdded: row.operator_added
  };
}

function toConferenceCoverageSlot(row: ConferenceCoverageSlotRow): ConferenceCoverageSlot {
  return {
    id: row.id,
    conferenceId: row.conference_id,
    startsAt: row.starts_at,
    durationHours: row.duration_hours,
    enabled: row.enabled,
    approvalStatus: row.approval_status ?? "draft",
    approvedAt: row.approved_at ?? undefined,
    approvalScope: row.approval_scope ?? undefined,
    youtubeStatus: row.youtube_status ?? "not_scheduled",
    youtubeVideoId: row.youtube_video_id ?? undefined,
    youtubeUrl: row.youtube_url ?? undefined,
    workflowRunId: row.workflow_run_id ?? undefined,
    workflowUrl: row.workflow_url ?? undefined,
    streamStartedAt: row.stream_started_at ?? undefined,
    streamEndedAt: row.stream_ended_at ?? undefined,
    deliveryError: row.delivery_error ?? undefined,
    updatedAt: row.updated_at ?? undefined
  };
}

function toBroadcastWriteout(row: BroadcastWriteoutRow): BroadcastWriteout {
  return {
    id: row.id,
    coverageSlotId: row.coverage_slot_id ?? undefined,
    startsAt: row.starts_at,
    durationMinutes: row.duration_minutes,
    title: row.title,
    status: row.status,
    youtubeVideoId: row.youtube_video_id ?? undefined,
    youtubeUrl: row.youtube_url ?? undefined,
    workflowRunId: row.workflow_run_id ?? undefined,
    workflowUrl: row.workflow_url ?? undefined,
    deliveryError: row.delivery_error ?? undefined,
    cards: row.cards ?? [],
    writeoutMarkdown: row.writeout_markdown,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toOncologyJournal(row: OncologyJournalRow): OncologyJournal {
  return {
    id: row.id,
    name: row.name,
    abbreviation: row.abbreviation,
    rssUrl: row.rss_url,
    officialUrl: row.official_url,
    enabled: row.enabled,
    lastIssueKey: row.last_issue_key ?? undefined
  };
}

function toEditorialPackage(row: EditorialPackageRow): EditorialPackage {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    subjectName: row.subject_name,
    editionKey: row.edition_key,
    sourceUrl: row.source_url,
    eventDate: row.event_date ?? undefined,
    introScript: row.intro_script,
    sections: row.sections ?? [],
    status: row.status,
    scheduledAt: row.scheduled_at ?? undefined,
    createdAt: row.created_at
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

export async function getSpecialtyXVoicesFromDb(): Promise<SpecialtyXVoice[] | null> {
  if (!hasSupabase()) {
    return null;
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("specialty_x_voices")
    .select("*")
    .order("specialty", { ascending: true })
    .order("rank", { ascending: true });

  if (error) {
    throw error;
  }
  return (data as SpecialtyXVoiceRow[]).map(toSpecialtyXVoice);
}

export async function upsertSpecialtyXVoiceInDb({
  specialty,
  label,
  handle,
  note,
  rank = 20
}: {
  specialty: string;
  label: string;
  handle: string;
  note?: string;
  rank?: number;
}) {
  if (!hasSupabase()) {
    return null;
  }
  const normalizedHandle = `@${handle.replace(/^@/, "")}`;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("specialty_x_voices")
    .upsert(
      {
        specialty,
        label,
        handle: normalizedHandle,
        note: note ?? "",
        rank: Math.min(20, Math.max(1, rank)),
        enabled: true,
        updated_at: new Date().toISOString()
      },
      { onConflict: "specialty,handle" }
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }
  return toSpecialtyXVoice(data as SpecialtyXVoiceRow);
}

export async function disableSpecialtyXVoiceInDb(id: string) {
  if (!hasSupabase()) {
    return null;
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("specialty_x_voices")
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }
  return toSpecialtyXVoice(data as SpecialtyXVoiceRow);
}

export async function getMedicalConferencesFromDb(): Promise<MedicalConference[] | null> {
  if (!hasSupabase()) {
    return null;
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("medical_conferences")
    .select("*")
    .eq("enabled", true)
    .order("year", { ascending: true })
    .order("month", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }
  return (data as MedicalConferenceRow[]).map(toMedicalConference);
}

export async function upsertMedicalConferenceInDb(
  conference: Omit<MedicalConference, "id">
) {
  if (!hasSupabase()) {
    return null;
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("medical_conferences")
    .upsert(
      {
        name: conference.name,
        acronym: conference.acronym,
        specialties: conference.specialties,
        start_date: conference.startDate,
        end_date: conference.endDate,
        month: conference.month,
        year: conference.year,
        city: conference.city,
        country: conference.country,
        timezone: conference.timezone,
        official_url: conference.officialUrl,
        enabled: conference.enabled,
        operator_added: conference.operatorAdded,
        updated_at: new Date().toISOString()
      },
      { onConflict: "name,year" }
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }
  return toMedicalConference(data as MedicalConferenceRow);
}

export async function getConferenceCoverageSlotsFromDb(): Promise<ConferenceCoverageSlot[] | null> {
  if (!hasSupabase()) {
    return null;
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("conference_coverage_slots")
    .select("*")
    .order("starts_at", { ascending: true });

  if (error) {
    throw error;
  }
  return (data as ConferenceCoverageSlotRow[]).map(toConferenceCoverageSlot);
}

export async function getBroadcastWriteoutsFromDb(
  limit = 200
): Promise<BroadcastWriteout[] | null> {
  if (!hasSupabase()) {
    return null;
  }
  const { data, error } = await createAdminClient()
    .from("broadcast_writeouts")
    .select("*")
    .order("starts_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw error;
  }
  return (data as BroadcastWriteoutRow[]).map(toBroadcastWriteout);
}

export async function upsertBroadcastWriteoutInDb(
  writeout: Omit<BroadcastWriteout, "id" | "createdAt" | "updatedAt">
) {
  if (!hasSupabase()) {
    return null;
  }
  const { data, error } = await createAdminClient()
    .from("broadcast_writeouts")
    .upsert(
      {
        coverage_slot_id: writeout.coverageSlotId,
        starts_at: writeout.startsAt,
        duration_minutes: writeout.durationMinutes,
        title: writeout.title,
        status: writeout.status,
        youtube_video_id: writeout.youtubeVideoId,
        youtube_url: writeout.youtubeUrl,
        workflow_run_id: writeout.workflowRunId,
        workflow_url: writeout.workflowUrl,
        delivery_error: writeout.deliveryError,
        cards: writeout.cards,
        writeout_markdown: writeout.writeoutMarkdown,
        updated_at: new Date().toISOString()
      },
      { onConflict: writeout.coverageSlotId ? "coverage_slot_id" : "starts_at" }
    )
    .select("*")
    .single();
  if (error) {
    throw error;
  }
  return toBroadcastWriteout(data as BroadcastWriteoutRow);
}

export async function getOncologyJournalsFromDb(): Promise<OncologyJournal[] | null> {
  if (!hasSupabase()) return null;
  const { data, error } = await createAdminClient()
    .from("oncology_journals")
    .select("*")
    .order("name");
  if (error) throw new Error(error.message);
  return (data as OncologyJournalRow[]).map(toOncologyJournal);
}

export async function getOncologyJournalByIdFromDb(id: string) {
  if (!hasSupabase()) return null;
  const { data, error } = await createAdminClient()
    .from("oncology_journals")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return toOncologyJournal(data as OncologyJournalRow);
}

export async function getMedicalConferenceByIdFromDb(id: string) {
  if (!hasSupabase()) return null;
  const { data, error } = await createAdminClient()
    .from("medical_conferences")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return toMedicalConference(data as MedicalConferenceRow);
}

export async function upsertOncologyJournalInDb(
  journal: Omit<OncologyJournal, "id" | "lastIssueKey">
) {
  if (!hasSupabase()) return null;
  const { data, error } = await createAdminClient()
    .from("oncology_journals")
    .upsert({
      name: journal.name,
      abbreviation: journal.abbreviation,
      rss_url: journal.rssUrl,
      official_url: journal.officialUrl,
      enabled: journal.enabled,
      updated_at: new Date().toISOString()
    }, { onConflict: "rss_url" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toOncologyJournal(data as OncologyJournalRow);
}

export async function updateOncologyJournalIssueKeyInDb(id: string, issueKey: string) {
  if (!hasSupabase()) return null;
  const { error } = await createAdminClient()
    .from("oncology_journals")
    .update({ last_issue_key: issueKey, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getEditorialPackagesFromDb(): Promise<EditorialPackage[] | null> {
  if (!hasSupabase()) return null;
  const { data, error } = await createAdminClient()
    .from("editorial_packages")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as EditorialPackageRow[]).map(toEditorialPackage);
}

export async function getEditorialPackageByIdFromDb(id: string) {
  if (!hasSupabase()) return null;
  const { data, error } = await createAdminClient()
    .from("editorial_packages")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return toEditorialPackage(data as EditorialPackageRow);
}

export async function saveEditorialPackageToDb(
  editorialPackage: Omit<EditorialPackage, "id" | "createdAt">
) {
  if (!hasSupabase()) return null;
  const { data, error } = await createAdminClient()
    .from("editorial_packages")
    .upsert({
      category: editorialPackage.category,
      title: editorialPackage.title,
      subject_name: editorialPackage.subjectName,
      edition_key: editorialPackage.editionKey,
      source_url: editorialPackage.sourceUrl,
      event_date: editorialPackage.eventDate,
      intro_script: editorialPackage.introScript,
      sections: editorialPackage.sections,
      status: editorialPackage.status,
      scheduled_at: editorialPackage.scheduledAt,
      updated_at: new Date().toISOString()
    }, { onConflict: "category,edition_key" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toEditorialPackage(data as EditorialPackageRow);
}

export async function markEditorialPackageScheduledInDb(id: string, scheduledAt: string) {
  if (!hasSupabase()) return null;
  const { data, error } = await createAdminClient()
    .from("editorial_packages")
    .update({ status: "scheduled", scheduled_at: scheduledAt, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return toEditorialPackage(data as EditorialPackageRow);
}

export async function replaceConferenceCoverageSlotsInDb({
  conferenceId,
  startsAt
}: {
  conferenceId: string;
  startsAt: string[];
}) {
  if (!hasSupabase()) {
    return null;
  }
  const supabase = createAdminClient();
  const { data: existingRows, error: existingError } = await supabase
    .from("conference_coverage_slots")
    .select("*")
    .eq("conference_id", conferenceId);
  if (existingError) {
    throw existingError;
  }

  const desiredStarts = new Set(startsAt.map((value) => new Date(value).toISOString()));
  const existing = (existingRows as ConferenceCoverageSlotRow[]) ?? [];
  const removableIds = existing
    .filter(
      (slot) =>
        !desiredStarts.has(new Date(slot.starts_at).toISOString()) &&
        !["live", "completed"].includes(slot.youtube_status ?? "not_scheduled")
    )
    .map((slot) => slot.id);
  if (removableIds.length) {
    const { error: disableError } = await supabase
      .from("conference_coverage_slots")
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .in("id", removableIds);
    if (disableError) {
      throw disableError;
    }
  }

  if (startsAt.length === 0) {
    return [];
  }
  const { data, error } = await supabase
    .from("conference_coverage_slots")
    .upsert(
      startsAt.map((startsAtValue) => ({
        conference_id: conferenceId,
        starts_at: startsAtValue,
        duration_hours: 1,
        enabled: true,
        updated_at: new Date().toISOString()
      })),
      { onConflict: "conference_id,starts_at" }
    )
    .select("*");
  if (error) {
    throw error;
  }
  return (data as ConferenceCoverageSlotRow[]).map(toConferenceCoverageSlot);
}

export async function updateConferenceCoverageApprovalInDb({
  slotIds,
  action,
  approvalScope
}: {
  slotIds: string[];
  action: "approve" | "draft" | "reject";
  approvalScope: "slot" | "day" | "week";
}) {
  if (!hasSupabase()) {
    return null;
  }
  const now = new Date().toISOString();
  const approvalStatus =
    action === "approve" ? "approved" : action === "reject" ? "rejected" : "draft";
  const { data, error } = await createAdminClient()
    .from("conference_coverage_slots")
    .update({
      approval_status: approvalStatus,
      approved_at: action === "approve" ? now : null,
      approval_scope: action === "approve" ? approvalScope : null,
      delivery_error: null,
      updated_at: now
    })
    .in("id", slotIds)
    .select("*");
  if (error) {
    throw error;
  }
  return (data as ConferenceCoverageSlotRow[]).map(toConferenceCoverageSlot);
}

export async function updateConferenceCoverageDeliveryInDb(
  slotId: string,
  patch: {
    youtubeStatus: ConferenceCoverageSlot["youtubeStatus"];
    youtubeVideoId?: string;
    youtubeUrl?: string;
    workflowRunId?: string;
    workflowUrl?: string;
    streamStartedAt?: string;
    streamEndedAt?: string;
    deliveryError?: string | null;
  }
) {
  if (!hasSupabase()) {
    return null;
  }
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("conference_coverage_slots")
    .update({
      youtube_status: patch.youtubeStatus,
      youtube_video_id: patch.youtubeVideoId,
      youtube_url: patch.youtubeUrl,
      workflow_run_id: patch.workflowRunId,
      workflow_url: patch.workflowUrl,
      stream_started_at: patch.streamStartedAt,
      stream_ended_at: patch.streamEndedAt,
      delivery_error: patch.deliveryError,
      updated_at: now
    })
    .eq("id", slotId)
    .select("*")
    .single();
  if (error) {
    throw error;
  }
  const { error: writeoutError } = await supabase
    .from("broadcast_writeouts")
    .update({
      status: patch.youtubeStatus,
      youtube_video_id: patch.youtubeVideoId,
      youtube_url: patch.youtubeUrl,
      workflow_run_id: patch.workflowRunId,
      workflow_url: patch.workflowUrl,
      delivery_error: patch.deliveryError,
      updated_at: now
    })
    .eq("coverage_slot_id", slotId);
  if (writeoutError) {
    throw writeoutError;
  }
  return toConferenceCoverageSlot(data as ConferenceCoverageSlotRow);
}

export async function getRecentMediaItemsFromDb(hours = 1): Promise<IngestedItem[] | null> {
  if (!hasSupabase()) {
    return null;
  }
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ingested_items")
    .select("*")
    .eq("source_type", "media")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    throw error;
  }
  return (data as IngestedItemRow[]).map(toIngestedItem);
}

export async function getRecentIngestedItemsFromDb(
  hours = 1,
  limit = 120
): Promise<IngestedItem[] | null> {
  if (!hasSupabase()) {
    return null;
  }
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data, error } = await createAdminClient()
    .from("ingested_items")
    .select("*, sources(name)")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw error;
  }
  return (data as IngestedItemRow[]).map(toIngestedItem);
}

export async function getRecentSocialItemsFromDb(hours = 1): Promise<IngestedItem[] | null> {
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
  const activeAudienceSource = sourceRegistry.find((source) =>
    source.name.toLowerCase().includes("audience tags")
  );
  if (activeAudienceSource) {
    const { error: cleanupError } = await supabase
      .from("sources")
      .update({ enabled: false })
      .ilike("name", "Audience tags%")
      .neq("url", activeAudienceSource.url);
    if (cleanupError) {
      throw cleanupError;
    }
    const { error: malformedCleanupError } = await supabase
      .from("sources")
      .update({ enabled: false })
      .like("url", "#ASCOHype%");
    if (malformedCleanupError) {
      throw malformedCleanupError;
    }
  }
}

export async function upsertAdminCatalogSeedsToDb() {
  if (!hasSupabase()) {
    return null;
  }
  const supabase = createAdminClient();
  const [voiceResult, conferenceResult, journalResult] = await Promise.all([
    supabase.from("specialty_x_voices").upsert(
      specialtyVoiceSeeds.map((voice) => ({
        specialty: voice.specialty,
        label: voice.label,
        handle: voice.handle,
        note: voice.note,
        rank: voice.rank,
        enabled: true
      })),
      { onConflict: "specialty,handle", ignoreDuplicates: true }
    ),
    supabase.from("medical_conferences").upsert(
      conferenceSeeds.map((conference) => ({
        name: conference.name,
        acronym: conference.acronym,
        specialties: conference.specialties,
        start_date: conference.startDate,
        end_date: conference.endDate,
        month: conference.month,
        year: conference.year,
        city: conference.city,
        country: conference.country,
        timezone: conference.timezone,
        official_url: conference.officialUrl,
        enabled: true,
        operator_added: false
      })),
      { onConflict: "name,year", ignoreDuplicates: true }
    ),
    supabase.from("oncology_journals").upsert(
      oncologyJournalSeeds.map((journal) => ({
        name: journal.name,
        abbreviation: journal.abbreviation,
        rss_url: journal.rssUrl,
        official_url: journal.officialUrl,
        enabled: true
      })),
      { onConflict: "rss_url", ignoreDuplicates: true }
    )
  ]);
  if (voiceResult.error) {
    throw voiceResult.error;
  }
  if (conferenceResult.error) {
    throw conferenceResult.error;
  }
  if (journalResult.error) {
    throw journalResult.error;
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
      source_id: item.sourceId,
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

export async function replaceBroadcastSegmentInDb({
  targetSegmentId,
  replacementSegmentId,
  approvedAt,
  script
}: {
  targetSegmentId?: string;
  replacementSegmentId: string;
  approvedAt: string;
  script: string;
}) {
  if (!hasSupabase()) {
    return null;
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("replace_broadcast_segment", {
    p_target_segment_id: targetSegmentId ?? null,
    p_replacement_segment_id: replacementSegmentId,
    p_slot_at: approvedAt,
    p_script: script
  });
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
