// Public conference hub (2026-10-27): what the site shows about each meeting
// in the Story registry (lib/story/meetingUpdateNumbering.ts). Keys must match
// that registry. Field drives the top tabs; only Medicine has meetings today.
//
// City and dates are filled in only where our own published coverage states
// them. Leave them out rather than guess; a meeting without an end date shows
// no "concluded / in progress" badge.

export const CONFERENCE_FIELDS = [
  { key: "medicine", label: "Medicine" },
  { key: "engineering", label: "Engineering" },
  { key: "law", label: "Law" },
  { key: "business", label: "Business" },
  { key: "education", label: "Education" }
] as const;

export type ConferenceField = (typeof CONFERENCE_FIELDS)[number]["key"];

export type ConferenceEdition = { city?: string; startDate?: string; endDate?: string };

export type ConferenceCatalogEntry = {
  fullName: string;
  field: ConferenceField;
  specialty: string;
  editions?: Record<string, ConferenceEdition>;
};

export const CONFERENCE_CATALOG: Record<string, ConferenceCatalogEntry> = {
  esmo: { fullName: "ESMO Congress", field: "medicine", specialty: "Oncology", editions: { "2026": { city: "Madrid" } } },
  easd: {
    fullName: "EASD Annual Meeting",
    field: "medicine",
    specialty: "Endocrinology",
    editions: { "2026": { city: "Milan", startDate: "2026-09-28", endDate: "2026-10-02" } }
  },
  astro: { fullName: "ASTRO Annual Meeting", field: "medicine", specialty: "Oncology", editions: { "2026": { city: "Boston" } } },
  wclc: { fullName: "IASLC World Conference on Lung Cancer", field: "medicine", specialty: "Oncology" },
  ims: { fullName: "International Myeloma Society Annual Meeting", field: "medicine", specialty: "Hematology", editions: { "2026": { city: "Glasgow" } } },
  esc: { fullName: "ESC Congress", field: "medicine", specialty: "Cardiology", editions: { "2026": { city: "Munich" } } },
  ers: { fullName: "ERS Congress", field: "medicine", specialty: "Pulmonology" },
  ascoqcs: { fullName: "ASCO Quality Care Symposium", field: "medicine", specialty: "Oncology" },
  asco: { fullName: "ASCO Annual Meeting", field: "medicine", specialty: "Oncology" },
  accc: { fullName: "ACCC National Oncology Conference", field: "medicine", specialty: "Oncology" },
  aap: { fullName: "AAP National Conference and Exhibition", field: "medicine", specialty: "Pediatrics", editions: { "2026": { city: "San Diego" } } },
  acep: {
    fullName: "ACEP Scientific Assembly",
    field: "medicine",
    specialty: "Emergency Medicine",
    editions: { "2026": { city: "Chicago", startDate: "2026-10-05", endDate: "2026-10-08" } }
  },
  hfsa: { fullName: "HFSA Annual Scientific Meeting", field: "medicine", specialty: "Cardiology", editions: { "2026": { city: "Phoenix" } } },
  dclung: {
    fullName: "D.C. Lung Cancer Conference",
    field: "medicine",
    specialty: "Oncology",
    editions: { "2026": { city: "Washington", startDate: "2026-10-10", endDate: "2026-10-10" } }
  },
  chest: {
    fullName: "CHEST Annual Meeting",
    field: "medicine",
    specialty: "Pulmonology",
    editions: { "2026": { city: "Phoenix", startDate: "2026-10-18", endDate: "2026-10-21" } }
  },
  idweek: {
    fullName: "IDWeek",
    field: "medicine",
    specialty: "Infectious Diseases",
    editions: { "2026": { city: "Washington", startDate: "2026-10-21", endDate: "2026-10-24" } }
  },
  kidneyweek: {
    fullName: "ASN Kidney Week",
    field: "medicine",
    specialty: "Nephrology",
    editions: { "2026": { city: "Denver", startDate: "2026-10-21", endDate: "2026-10-25" } }
  },
  acg: { fullName: "ACG Annual Scientific Meeting", field: "medicine", specialty: "Gastroenterology" },
  aha: { fullName: "AHA Scientific Sessions", field: "medicine", specialty: "Cardiology" },
  aao: { fullName: "AAO Annual Meeting", field: "medicine", specialty: "Ophthalmology" },
  acs: { fullName: "ACS Clinical Congress", field: "medicine", specialty: "Surgery" },
  ada: { fullName: "ADA Scientific Sessions", field: "medicine", specialty: "Endocrinology" },
  ash: { fullName: "ASH Annual Meeting", field: "medicine", specialty: "Hematology" },
  sabcs: { fullName: "San Antonio Breast Cancer Symposium", field: "medicine", specialty: "Oncology" },
  sitc: { fullName: "SITC Annual Meeting", field: "medicine", specialty: "Oncology" },
  aasld: { fullName: "The Liver Meeting (AASLD)", field: "medicine", specialty: "Gastroenterology" },
  obesityweek: { fullName: "ObesityWeek", field: "medicine", specialty: "Endocrinology" },
  ctad: { fullName: "Clinical Trials on Alzheimer's Disease", field: "medicine", specialty: "Neurology" },
  acc: { fullName: "ACC Scientific Session", field: "medicine", specialty: "Cardiology" },
  ats: { fullName: "ATS International Conference", field: "medicine", specialty: "Pulmonology" },
  ueg: { fullName: "UEG Week", field: "medicine", specialty: "Gastroenterology" },
  aacr: { fullName: "AACR Annual Meeting", field: "medicine", specialty: "Oncology" },
  eha: { fullName: "EHA Congress", field: "medicine", specialty: "Hematology" },
  eular: { fullName: "EULAR Congress", field: "medicine", specialty: "Rheumatology" },
  acr: {
    fullName: "ACR Convergence",
    field: "medicine",
    specialty: "Rheumatology",
    editions: { "2026": { city: "Orlando", startDate: "2026-11-06", endDate: "2026-11-11" } }
  },
  aan: { fullName: "AAN Annual Meeting", field: "medicine", specialty: "Neurology" },
  ecco: { fullName: "ECCO Congress", field: "medicine", specialty: "Gastroenterology" },
  ddw: { fullName: "Digestive Disease Week", field: "medicine", specialty: "Gastroenterology" },
  endo: { fullName: "ENDO Annual Meeting", field: "medicine", specialty: "Endocrinology" }
};
