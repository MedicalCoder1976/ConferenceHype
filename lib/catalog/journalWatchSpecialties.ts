import type { OncologyJournal } from "@/lib/types";

// Specialty tabs for the "Journal RSS feeds" section of Daily coverage
// decisions (components/DailyCoveragePlanner.tsx). This is a separate,
// purpose-built taxonomy from lib/catalog/medicalSpecialties.ts (which is
// only used by the unrelated Specialty X Voices feature/table) -- different
// values (includes "Gyn Onc", splits Surgery into Cardiothoracic/Thoracic/
// Surgical Subspecialties), different consumers, no shared import.
export const journalWatchSpecialties = [
  "Internal Medicine",
  "Oncology",
  "Hematology",
  "Cardiology",
  "Neurology",
  "Psychiatry",
  "Ophthalmology",
  "Pulmonology",
  "Endocrinology",
  "Gastroenterology",
  "Rheumatology",
  "Nephrology",
  "Immunology",
  "Dermatology",
  "ObGyn",
  "Gyn Onc",
  "Radiology / Radiation Oncology",
  "Pediatric Oncology / Pediatrics",
  "Surgery",
  "Cardiothoracic Surgery",
  "Thoracic Surgery",
  "Surgical Subspecialties",
  "Others"
] as const;

export type JournalWatchSpecialty = (typeof journalWatchSpecialties)[number];

export const DEFAULT_JOURNAL_WATCH_SPECIALTY: JournalWatchSpecialty = "Others";

const specialtySet = new Set<string>(journalWatchSpecialties);

function resolveSpecialty(value: string | undefined): JournalWatchSpecialty {
  if (value && specialtySet.has(value)) {
    return value as JournalWatchSpecialty;
  }
  return DEFAULT_JOURNAL_WATCH_SPECIALTY;
}

// Pure grouping helper -- no JSX, unit-testable. Any journal whose
// `specialty` is missing or doesn't match a known tab lands in "Others"
// rather than silently disappearing.
export function groupJournalsBySpecialty(
  journals: OncologyJournal[]
): Map<JournalWatchSpecialty, OncologyJournal[]> {
  const groups = new Map<JournalWatchSpecialty, OncologyJournal[]>(
    journalWatchSpecialties.map((specialty) => [specialty, []])
  );
  for (const journal of journals) {
    const specialty = resolveSpecialty(journal.specialty);
    groups.get(specialty)!.push(journal);
  }
  return groups;
}
