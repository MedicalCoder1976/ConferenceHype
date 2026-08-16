import { createAdminClient } from "@/lib/supabase/admin";
import type { BroadcastWriteoutCard, OncologyJournal } from "@/lib/types";
import type { RegionalSeriesCode } from "@/lib/regionalJournalClub/catalog";

export type RegionalJournalSeries = {
  id: string;
  code: RegionalSeriesCode;
  displayName: string;
  timezone: string;
  releaseDays: number[];
  releaseTime: string;
  minimumCards: number;
  enabled: boolean;
  journals: OncologyJournal[];
};

export type RegionalJournalProgram = {
  id: string;
  seriesId: string;
  releaseDate: string;
  startsAt: string;
  status: "planned" | "shadow_verified" | "rendering" | "verified" | "failed" | "cancelled";
  cardIds: string[];
  journalIds: string[];
  specialties: string[];
  title?: string;
  description?: string;
  tags: string[];
  youtubeVideoId?: string;
  youtubeUrl?: string;
  createdAt: string;
};

function toJournal(row: Record<string, unknown>): OncologyJournal {
  return { id: String(row.id), name: String(row.name), abbreviation: String(row.abbreviation), rssUrl: String(row.rss_url), officialUrl: String(row.official_url), enabled: Boolean(row.enabled), specialty: row.specialty ? String(row.specialty) : undefined, regionalOnly: Boolean(row.regional_only) };
}

export async function getRegionalSeries(code: RegionalSeriesCode): Promise<RegionalJournalSeries | null> {
  const supabase = createAdminClient();
  const { data: series, error } = await supabase.from("journal_series").select("*").eq("code", code).maybeSingle();
  if (error) throw error;
  if (!series) return null;
  const { data: memberships, error: membershipError } = await supabase.from("journal_series_memberships").select("journal_id,priority").eq("series_id", series.id).eq("enabled", true).order("priority");
  if (membershipError) throw membershipError;
  const orderedIds = (memberships ?? []).map((row) => row.journal_id);
  const { data: journals, error: journalError } = orderedIds.length
    ? await supabase.from("oncology_journals").select("*").in("id", orderedIds).eq("enabled", true)
    : { data: [], error: null };
  if (journalError) throw journalError;
  const byId = new Map((journals ?? []).map((row) => [row.id, toJournal(row)]));
  return { id: series.id, code: series.code, displayName: series.display_name, timezone: series.timezone, releaseDays: series.release_days, releaseTime: String(series.release_local_time).slice(0, 5), minimumCards: series.minimum_cards, enabled: series.enabled, journals: orderedIds.map((id) => byId.get(id)).filter((journal): journal is OncologyJournal => Boolean(journal)) };
}

export async function getReservedRegionalCardIds(beforeDate: string) {
  const { data, error } = await createAdminClient().from("regional_journal_programs").select("card_ids").lte("release_date", beforeDate).neq("status", "cancelled");
  if (error) throw error;
  return [...new Set((data ?? []).flatMap((row) => row.card_ids ?? []))];
}

export async function saveRegionalProgram(input: { seriesId: string; releaseDate: string; startsAt: string; status: "planned" | "shadow_verified"; cardIds: string[]; journalIds: string[]; specialties: string[] }) {
  const { data, error } = await createAdminClient().from("regional_journal_programs").upsert({ series_id: input.seriesId, release_date: input.releaseDate, starts_at: input.startsAt, status: input.status, card_ids: input.cardIds, journal_ids: input.journalIds, specialties: input.specialties, updated_at: new Date().toISOString() }, { onConflict: "series_id,release_date" }).select("*").single();
  if (error) throw error;
  return data;
}

export async function getRegionalProgram(id: string): Promise<RegionalJournalProgram | null> {
  const { data, error } = await createAdminClient().from("regional_journal_programs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, seriesId: data.series_id, releaseDate: data.release_date, startsAt: data.starts_at, status: data.status, cardIds: data.card_ids ?? [], journalIds: data.journal_ids ?? [], specialties: data.specialties ?? [], title: data.title ?? undefined, description: data.description ?? undefined, tags: data.tags ?? [], youtubeVideoId: data.youtube_video_id ?? undefined, youtubeUrl: data.youtube_url ?? undefined, createdAt: data.created_at } : null;
}

export async function updateRegionalProgramDelivery(id: string, patch: { status: "rendering" | "verified" | "failed"; youtubeVideoId?: string; youtubeUrl?: string; title?: string; description?: string; tags?: string[]; cardIds?: string[]; writeoutCards?: BroadcastWriteoutCard[]; failureReason?: string | null }) {
  const { error } = await createAdminClient().from("regional_journal_programs").update({ status: patch.status, youtube_video_id: patch.youtubeVideoId, youtube_url: patch.youtubeUrl, title: patch.title, description: patch.description, tags: patch.tags, card_ids: patch.cardIds, writeout_cards: patch.writeoutCards, failure_reason: patch.failureReason, workflow_run_id: process.env.GITHUB_RUN_ID, workflow_url: process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
