import { monitoredXVoices, type XVoice } from "@/lib/sources/registry";
import type { MedicalConference, SourceConfig } from "@/lib/types";

// Explicit, maintained mapping from a catalog entity's stable key (conference
// acronym, journal abbreviation, or source id — all lowercased/normalized)
// to the monitored X handle that covers it. Add an entry here whenever a new
// conference, journal, or source should auto-link to a monitored voice.
const ENTITY_X_VOICE_LINKS: Record<string, string> = {
  eha: "@EHA_Hematology",
  onclive: "@OncLive",
  statnews: "@statnews",
  nejm: "@NEJM",
  lancetoncology: "@TheLancetOncol"
};

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

type LinkableEntity = { acronym?: string; abbreviation?: string; id?: string };

export function entityLinkKey(entity: LinkableEntity): string | undefined {
  const key = entity.acronym ?? entity.abbreviation ?? entity.id;
  return key ? normalizeKey(key) : undefined;
}

export function monitoredXVoiceForEntity(entity: LinkableEntity): XVoice | null {
  const key = entityLinkKey(entity);
  if (!key) {
    return null;
  }
  const handle = ENTITY_X_VOICE_LINKS[key];
  if (!handle) {
    return null;
  }
  return monitoredXVoices.find((voice) => voice.handle.toLowerCase() === handle.toLowerCase()) ?? null;
}

// A conference's linked official sub-pages (program, abstract library,
// on-site essentials, etc.) follow the naming convention
// `<acronym>-<year>-<page>` in the source registry (e.g. "eha-2026-program").
// That id convention only survives in the in-code registry, though:
// upsertSourcesToDb() upserts registry sources by `url` and never sets `id`,
// so once Supabase is configured every registry source gets a fresh random
// uuid in the real `sources` table and the id prefix never matches again.
// What *does* survive intact is `name` (e.g. "EHA2026 official program"), so
// fall back to a normalized name-prefix match for real, DB-backed sources.
export function conferenceLinkedSourceIds<T extends Pick<SourceConfig, "id" | "name">>(
  conference: Pick<MedicalConference, "acronym" | "year">,
  configuredSources: T[]
): T[] {
  if (!conference.acronym) {
    return [];
  }
  const idPrefix = `${conference.acronym.toLowerCase()}-`;
  const namePrefix = normalizeKey(`${conference.acronym}${conference.year ?? ""}`);
  return configuredSources.filter((source) => {
    if (source.id.toLowerCase().startsWith(idPrefix)) {
      return true;
    }
    return namePrefix.length > 0 && normalizeKey(source.name).startsWith(namePrefix);
  });
}

export function isAbstractSourceId(sourceId: string | undefined): boolean {
  return Boolean(sourceId && /abstract/i.test(sourceId));
}

export function xVoiceHandleLower(voice: XVoice): string {
  return voice.handle.toLowerCase();
}
