import type { MedicalConference } from "@/lib/types";

type ConferenceSeed = Omit<MedicalConference, "id" | "enabled" | "operatorAdded">;

export const conferenceSeeds: ConferenceSeed[] = [
  { name: "American College of Cardiology Scientific Session", acronym: "ACC", specialties: ["Cardiology"], month: 3, year: 2026, timezone: "America/New_York", officialUrl: "https://www.acc.org/education-and-meetings/annual-scientific-session" },
  { name: "American Academy of Neurology Annual Meeting", acronym: "AAN", specialties: ["Neurology"], month: 4, year: 2026, timezone: "America/New_York", officialUrl: "https://www.aan.com/events/annual-meeting" },
  { name: "American Association for Cancer Research Annual Meeting", acronym: "AACR", specialties: ["Oncology"], month: 4, year: 2026, timezone: "America/New_York", officialUrl: "https://www.aacr.org/meeting/aacr-annual-meeting-2026/" },
  { name: "EBMT Annual Meeting", acronym: "EBMT", specialties: ["Hematology", "Oncology"], month: 4, year: 2026, timezone: "Europe/Paris", officialUrl: "https://www.ebmt.org/annual-meeting" },
  { name: "Digestive Disease Week", acronym: "DDW", specialties: ["Gastroenterology", "Surgery"], month: 5, year: 2026, timezone: "America/New_York", officialUrl: "https://ddw.org/" },
  { name: "American Thoracic Society International Conference", acronym: "ATS", specialties: ["Pulmonology", "Critical Care"], month: 5, year: 2026, timezone: "America/New_York", officialUrl: "https://conference.thoracic.org/" },
  { name: "American Society of Clinical Oncology Annual Meeting", acronym: "ASCO", specialties: ["Oncology", "Hematology"], startDate: "2026-05-29", endDate: "2026-06-02", month: 5, year: 2026, city: "Chicago", country: "United States", timezone: "America/Chicago", officialUrl: "https://www.asco.org/annual-meeting" },
  { name: "American Diabetes Association Scientific Sessions", acronym: "ADA", specialties: ["Endocrinology", "Internal Medicine"], month: 6, year: 2026, timezone: "America/New_York", officialUrl: "https://scientificsessions.diabetes.org/" },
  { name: "European Hematology Association Congress", acronym: "EHA", specialties: ["Hematology", "Oncology"], startDate: "2026-06-11", endDate: "2026-06-14", month: 6, year: 2026, city: "Stockholm", country: "Sweden", timezone: "Europe/Stockholm", officialUrl: "https://ehaweb.org/connect-network/eha2026-congress" },
  { name: "European Society of Cardiology Congress", acronym: "ESC", specialties: ["Cardiology"], month: 8, year: 2026, timezone: "Europe/Paris", officialUrl: "https://www.escardio.org/Congresses-Events/ESC-Congress" },
  { name: "European Respiratory Society Congress", acronym: "ERS", specialties: ["Pulmonology", "Critical Care"], month: 9, year: 2026, timezone: "Europe/Paris", officialUrl: "https://www.ersnet.org/congress-and-events/congress/" },
  { name: "ASTRO Annual Meeting", acronym: "ASTRO", specialties: ["Oncology", "Radiology"], month: 9, year: 2026, timezone: "America/New_York", officialUrl: "https://www.astro.org/meetings-and-education/annual-meeting" },
  { name: "European Society for Medical Oncology Congress", acronym: "ESMO", specialties: ["Oncology"], month: 10, year: 2026, timezone: "Europe/Paris", officialUrl: "https://www.esmo.org/meeting-calendar/esmo-congress-2026" },
  { name: "IDWeek", acronym: "IDWeek", specialties: ["Infectious Diseases"], month: 10, year: 2026, timezone: "America/New_York", officialUrl: "https://idweek.org/" },
  { name: "American College of Emergency Physicians Scientific Assembly", acronym: "ACEP", specialties: ["Emergency Medicine"], month: 10, year: 2026, timezone: "America/New_York", officialUrl: "https://www.acep.org/sa" },
  { name: "International Society of Geriatric Oncology Annual Conference", acronym: "SIOG", specialties: ["Oncology", "Geriatrics"], month: 11, year: 2026, timezone: "Europe/Paris", officialUrl: "https://siog.org/events/annual-conference/" },
  { name: "Society for Immunotherapy of Cancer Annual Meeting", acronym: "SITC", specialties: ["Oncology", "Immunology"], month: 11, year: 2026, timezone: "America/New_York", officialUrl: "https://www.sitcancer.org/education/annual-meeting" },
  { name: "American College of Rheumatology Convergence", acronym: "ACR", specialties: ["Rheumatology"], month: 11, year: 2026, timezone: "America/New_York", officialUrl: "https://rheumatology.org/annual-meeting" },
  { name: "American Heart Association Scientific Sessions", acronym: "AHA", specialties: ["Cardiology"], month: 11, year: 2026, timezone: "America/New_York", officialUrl: "https://professional.heart.org/en/meetings/scientific-sessions" },
  { name: "American Society of Nephrology Kidney Week", acronym: "ASN Kidney Week", specialties: ["Nephrology"], month: 11, year: 2026, timezone: "America/New_York", officialUrl: "https://www.asn-online.org/education/kidneyweek/" },
  { name: "Radiological Society of North America Annual Meeting", acronym: "RSNA", specialties: ["Radiology"], month: 11, year: 2026, timezone: "America/Chicago", officialUrl: "https://www.rsna.org/annual-meeting" },
  { name: "American Society of Hematology Annual Meeting", acronym: "ASH", specialties: ["Hematology", "Oncology"], month: 12, year: 2026, timezone: "America/New_York", officialUrl: "https://www.hematology.org/meetings/annual-meeting" },
  { name: "San Antonio Breast Cancer Symposium", acronym: "SABCS", specialties: ["Oncology"], month: 12, year: 2026, timezone: "America/Chicago", officialUrl: "https://www.sabcs.org/" },
  { name: "American Academy of Dermatology Annual Meeting", acronym: "AAD", specialties: ["Dermatology"], month: 3, year: 2027, timezone: "America/New_York", officialUrl: "https://www.aad.org/member/meetings-education/am" },
  { name: "American Psychiatric Association Annual Meeting", acronym: "APA", specialties: ["Psychiatry"], month: 5, year: 2027, timezone: "America/New_York", officialUrl: "https://www.psychiatry.org/psychiatrists/meetings/annual-meeting" },
  { name: "American Academy of Pediatrics National Conference", acronym: "AAP", specialties: ["Pediatrics"], month: 10, year: 2026, timezone: "America/New_York", officialUrl: "https://aapexperience.org/" }
];
