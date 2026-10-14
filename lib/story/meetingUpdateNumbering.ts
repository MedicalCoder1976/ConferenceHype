import type { createAdminClient } from "@/lib/supabase/admin";

// Standing operator rule (2026-10-13): once a conference has already had a
// video, every later Story on it is titled
//   "<Meeting> <Year> Update <N>: <headline>"
// where N is the number of videos already published for that conference.
// The first video on a conference carries no "Update" label.
//
// Only Story broadcasts are renamed. They live in meeting_watch_broadcasts
// and their YouTube title is the broadcast title verbatim (see
// buildMeetingWatchMetadata). Meeting Watch five-news packages and 5 Things
// to Know build their own titles and are not covered by this helper.

export const STORY_TITLE_LIMIT = 100;

type MeetingDefinition = { key: string; shortName: string; patterns: RegExp[] };

// Patterns are matched against "<meeting_label> <title>" of past broadcasts and
// against the Story topic. Acronyms are case-sensitive on purpose so a word
// such as "chest" or "ash" in a headline never matches.
const MEETINGS: MeetingDefinition[] = [
  { key: "esmo", shortName: "ESMO", patterns: [/\bESMO\b/, /European Society for Medical Oncology/i] },
  { key: "easd", shortName: "EASD", patterns: [/\bEASD\b/, /European Association for the Study of Diabetes/i] },
  { key: "astro", shortName: "ASTRO", patterns: [/\bASTRO\b/, /American Society for Radiation Oncology/i] },
  { key: "wclc", shortName: "WCLC", patterns: [/\bWCLC\b/, /World Conference on Lung Cancer/i] },
  { key: "ims", shortName: "IMS", patterns: [/\bIMS\b/, /International Myeloma Society/i] },
  { key: "esc", shortName: "ESC Congress", patterns: [/\bESC\b/, /European Society of Cardiology/i] },
  { key: "ers", shortName: "ERS Congress", patterns: [/\bERS\b/, /European Respiratory Society/i] },
  { key: "asco", shortName: "ASCO", patterns: [/\bASCO\b/, /American Society of Clinical Oncology/i] },
  { key: "aap", shortName: "AAP", patterns: [/\bAAP\b/, /American Academy of Pediatrics/i] },
  { key: "acep", shortName: "ACEP", patterns: [/\bACEP(?:26)?\b/, /American College of Emergency Physicians/i] },
  { key: "hfsa", shortName: "HFSA", patterns: [/\bHFSA\b/, /Heart Failure Society of America/i] },
  { key: "dclung", shortName: "DCLung", patterns: [/\bDCLung\b/i, /D\.?\s?C\.? Lung Cancer/i] },
  { key: "chest", shortName: "CHEST", patterns: [/\bCHEST\b/, /American College of Chest Physicians/i] },
  { key: "idweek", shortName: "IDWeek", patterns: [/\bIDWeek\b/i] },
  { key: "kidneyweek", shortName: "Kidney Week", patterns: [/Kidney\s?Week/i, /American Society of Nephrology/i] },
  { key: "acg", shortName: "ACG", patterns: [/\bACG\b/, /American College of Gastroenterology/i] },
  { key: "aha", shortName: "AHA", patterns: [/\bAHA\b/, /American Heart Association/i] },
  { key: "aao", shortName: "AAO", patterns: [/\bAAO\b/, /American Academy of Ophthalmology/i] },
  { key: "acs", shortName: "ACS Clinical Congress", patterns: [/ACS Clinical Congress/i, /American College of Surgeons/i] },
  { key: "ada", shortName: "ADA", patterns: [/\bADA\b/, /American Diabetes Association/i] },
  { key: "ash", shortName: "ASH", patterns: [/\bASH\b/, /American Society of Hematology/i] },
  { key: "sabcs", shortName: "SABCS", patterns: [/\bSABCS\b/, /San Antonio Breast Cancer Symposium/i] },
  { key: "sitc", shortName: "SITC", patterns: [/\bSITC\b/, /Society for Immunotherapy of Cancer/i] },
  { key: "aasld", shortName: "AASLD", patterns: [/\bAASLD\b/, /The Liver Meeting/i] },
  { key: "obesityweek", shortName: "ObesityWeek", patterns: [/Obesity\s?Week/i] },
  { key: "acc", shortName: "ACC", patterns: [/\bACC\b/, /American College of Cardiology/i] },
  { key: "ats", shortName: "ATS", patterns: [/\bATS\b/, /American Thoracic Society/i] },
  // Added 2026-10-14 after UEG Week was skipped by the series playlist step.
  { key: "ueg", shortName: "UEG Week", patterns: [/\bUEG\b/, /United European Gastroenterology/i] },
  { key: "aacr", shortName: "AACR", patterns: [/\bAACR\b/, /American Association for Cancer Research/i] },
  { key: "eha", shortName: "EHA", patterns: [/\bEHA\b/, /European Hematology Association/i] },
  { key: "eular", shortName: "EULAR", patterns: [/\bEULAR\b/, /European Alliance of Associations for Rheumatology/i] },
  { key: "acr", shortName: "ACR Convergence", patterns: [/\bACR Convergence\b/, /American College of Rheumatology/i] },
  { key: "aan", shortName: "AAN", patterns: [/\bAAN\b/, /American Academy of Neurology/i] },
  { key: "ecco", shortName: "ECCO", patterns: [/\bECCO\b/, /European Crohn.s and Colitis Organi[sz]ation/i] },
  { key: "ddw", shortName: "DDW", patterns: [/\bDDW\b/, /Digestive Disease Week/i] },
  { key: "endo", shortName: "ENDO", patterns: [/\bENDO 20\d{2}\b/, /Endocrine Society/i] }
];

export type MeetingIdentity = { key: string; shortName: string; year: string; displayName: string; patterns: RegExp[] };

function escapeRegExp(value: string) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function yearIn(text: string) {
  return text.match(/\b(20\d{2})\b/)?.[1];
}

// Identify the conference a Story is about from its topic (the meeting name),
// falling back to the title. Returns null for a meeting this list does not
// know, in which case no label is added.
export function identifyMeeting(topic: string, title = "", fallbackYear?: string): MeetingIdentity | null {
  for (const text of [topic, title]) {
    const definition = MEETINGS.find((candidate) => candidate.patterns.some((pattern) => pattern.test(text)));
    if (!definition) continue;
    const year = yearIn(topic) ?? yearIn(title) ?? fallbackYear ?? String(new Date().getFullYear());
    return { key: definition.key, shortName: definition.shortName, year, displayName: `${definition.shortName} ${year}`, patterns: definition.patterns };
  }
  return null;
}

// True when a past broadcast's label/title is about this meeting in this year.
// A row that names a different year is never counted.
export function rowMatchesMeeting(text: string, identity: MeetingIdentity) {
  if (!identity.patterns.some((pattern) => pattern.test(text))) return false;
  const years = Array.from(text.matchAll(/\b(20\d{2})\b/g), (match) => match[1]);
  return years.length === 0 || years.includes(identity.year);
}

export function updateLabel(identity: MeetingIdentity, previousVideos: number) {
  return `${identity.displayName} Update ${previousVideos}`;
}

// Drop a leading "ESMO 2026:" / "ESMO 2026 Madrid:" from the headline so the
// label is not repeated ("ESMO 2026 Update 3: ESMO 2026: ...").
export function stripLeadingMeetingName(headline: string, identity: MeetingIdentity) {
  const leading = new RegExp(`^${escapeRegExp(identity.shortName)}\\s+${identity.year}\\b[^:]{0,24}:\\s*`, "i");
  return headline.replace(leading, "").trim();
}

export function applyUpdateLabel(headline: string, identity: MeetingIdentity, previousVideos: number) {
  if (previousVideos < 1) return headline;
  const label = updateLabel(identity, previousVideos);
  if (new RegExp(`^${escapeRegExp(label)}\\b`, "i").test(headline)) return headline;
  const full = `${label}: ${stripLeadingMeetingName(headline, identity)}`;
  if (full.length > STORY_TITLE_LIMIT) {
    const room = STORY_TITLE_LIMIT - label.length - 2;
    throw new Error(
      `With the "${label}" label this title would be ${full.length} characters and YouTube allows ${STORY_TITLE_LIMIT}. Shorten the headline to ${room} characters or fewer.`
    );
  }
  return full;
}

export type PreviousUpdate = { title: string; url: string; publishedAt: string };

// Delivered videos only: a failed, planned, or still-rendering broadcast has
// not produced a video yet.
async function fetchDeliveredRows(supabase: ReturnType<typeof createAdminClient>, identity: MeetingIdentity) {
  const { data, error } = await supabase
    .from("meeting_watch_broadcasts")
    .select("meeting_label,title,status,youtube_url,youtube_video_id,created_at")
    .in("status", ["verified", "uploaded"])
    .limit(5000);
  if (error) throw new Error(`Could not count earlier videos for ${identity.displayName}: ${error.message}`);
  type Row = { meeting_label: string | null; title: string | null; youtube_url: string | null; youtube_video_id: string | null; created_at: string | null };
  return ((data ?? []) as Row[]).filter((row) => rowMatchesMeeting(`${row.meeting_label ?? ""} ${row.title ?? ""}`, identity));
}

export async function countPreviousMeetingVideos(
  supabase: ReturnType<typeof createAdminClient>,
  identity: MeetingIdentity
) {
  return (await fetchDeliveredRows(supabase, identity)).length;
}

// Oldest first, for building the series playlist in publication order.
export async function listDeliveredVideoIdsOldestFirst(
  supabase: ReturnType<typeof createAdminClient>,
  identity: MeetingIdentity
) {
  const rows = await fetchDeliveredRows(supabase, identity);
  return rows
    .filter((row) => row.youtube_video_id)
    .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")))
    .map((row) => row.youtube_video_id as string);
}

// Most recent first. Only videos with a public URL can be linked.
export async function listPreviousMeetingVideos(
  supabase: ReturnType<typeof createAdminClient>,
  identity: MeetingIdentity,
  limit = 5
): Promise<PreviousUpdate[]> {
  const rows = await fetchDeliveredRows(supabase, identity);
  return rows
    .filter((row) => row.youtube_url && row.title)
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
    .slice(0, limit)
    .map((row) => ({ title: row.title as string, url: row.youtube_url as string, publishedAt: String(row.created_at ?? "") }));
}

// The block stored at the end of the broadcast description, read back at render
// time so the YouTube description can link the earlier updates.
const PREVIOUS_UPDATES_HEADER = "Previous updates:";
export function formatPreviousUpdatesBlock(updates: PreviousUpdate[]) {
  if (updates.length === 0) return [] as string[];
  return [PREVIOUS_UPDATES_HEADER, ...updates.map((update) => `- ${update.title}: ${update.url}`)];
}

export function extractPreviousUpdates(description: string): { title: string; url: string }[] {
  const lines = description.replace(/\r\n/g, "\n").split("\n");
  const headerIndex = lines.findIndex((line) => line.trim() === PREVIOUS_UPDATES_HEADER);
  if (headerIndex < 0) return [];
  const updates: { title: string; url: string }[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    const match = line.match(/^-\s+(.+):\s+(https?:\/\/\S+)\s*$/);
    if (!match) break;
    updates.push({ title: match[1].trim(), url: match[2] });
  }
  return updates;
}

export async function resolveStoryTitle(
  supabase: ReturnType<typeof createAdminClient>,
  story: { title: string; topic: string; startsAt?: string }
) {
  const fallbackYear = story.startsAt ? String(new Date(story.startsAt).getFullYear()) : undefined;
  const identity = identifyMeeting(story.topic, story.title, fallbackYear);
  if (!identity) {
    return { title: story.title, baseTitle: story.title, updateNumber: 0, meeting: null as string | null, previousUpdates: [] as PreviousUpdate[] };
  }
  const rows = await fetchDeliveredRows(supabase, identity);
  const previousVideos = rows.length;
  const previousUpdates = rows
    .filter((row) => row.youtube_url && row.title)
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
    .slice(0, 5)
    .map((row) => ({ title: row.title as string, url: row.youtube_url as string, publishedAt: String(row.created_at ?? "") }));
  return {
    title: applyUpdateLabel(story.title, identity, previousVideos),
    baseTitle: story.title,
    updateNumber: previousVideos,
    meeting: identity.displayName as string | null,
    previousUpdates
  };
}
