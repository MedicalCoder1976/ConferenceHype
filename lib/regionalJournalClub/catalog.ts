import type { OncologyJournal } from "@/lib/types";

export type RegionalSeriesCode = "india" | "united_kingdom";

export type RegionalJournalSeed = Omit<OncologyJournal, "id" | "enabled" | "lastIssueKey"> & {
  series: RegionalSeriesCode;
  priority: number;
};

const pubmed = (abbreviation: string) =>
  `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(`"${abbreviation}"[Journal]`)}`;

export const REGIONAL_SERIES = {
  india: { displayName: "INDIA JOURNAL ARTICLES", timezone: "Asia/Kolkata", releaseDays: [2, 5], releaseTime: "19:30" },
  united_kingdom: { displayName: "UNITED KINGDOM JOURNAL ARTICLES", timezone: "Europe/London", releaseDays: [3, 7], releaseTime: "18:30" }
} as const;

export const regionalJournalSeeds: RegionalJournalSeed[] = [
  { series: "india", priority: 1, name: "Indian Journal of Medical Research", abbreviation: "Indian J Med Res", rssUrl: pubmed("Indian J Med Res"), officialUrl: "https://ijmr.org.in/", specialty: "Internal Medicine" },
  { series: "india", priority: 2, name: "The National Medical Journal of India", abbreviation: "Natl Med J India", rssUrl: pubmed("Natl Med J India"), officialUrl: "https://nmji.in/", specialty: "Internal Medicine" },
  { series: "india", priority: 3, name: "Journal of the Association of Physicians of India", abbreviation: "J Assoc Physicians India", rssUrl: pubmed("J Assoc Physicians India"), officialUrl: "https://japi.org/", specialty: "Internal Medicine" },
  { series: "india", priority: 4, name: "Indian Heart Journal", abbreviation: "Indian Heart J", rssUrl: pubmed("Indian Heart J"), officialUrl: "https://www.sciencedirect.com/journal/indian-heart-journal", specialty: "Cardiology" },
  { series: "india", priority: 5, name: "Indian Journal of Gastroenterology", abbreviation: "Indian J Gastroenterol", rssUrl: pubmed("Indian J Gastroenterol"), officialUrl: "https://link.springer.com/journal/12664", specialty: "Gastroenterology" },
  { series: "india", priority: 6, name: "Indian Journal of Psychiatry", abbreviation: "Indian J Psychiatry", rssUrl: pubmed("Indian J Psychiatry"), officialUrl: "https://journals.lww.com/indianjpsychiatry/", specialty: "Psychiatry" },
  { series: "india", priority: 7, name: "Indian Journal of Anaesthesia", abbreviation: "Indian J Anaesth", rssUrl: pubmed("Indian J Anaesth"), officialUrl: "https://journals.lww.com/ijaweb/", specialty: "Anesthesiology" },
  { series: "india", priority: 8, name: "Indian Journal of Pediatrics", abbreviation: "Indian J Pediatr", rssUrl: pubmed("Indian J Pediatr"), officialUrl: "https://link.springer.com/journal/12098", specialty: "Pediatrics" },
  { series: "india", priority: 9, name: "Indian Journal of Ophthalmology", abbreviation: "Indian J Ophthalmol", rssUrl: pubmed("Indian J Ophthalmol"), officialUrl: "https://journals.lww.com/ijo/", specialty: "Ophthalmology" },
  { series: "india", priority: 10, name: "Indian Journal of Orthopaedics", abbreviation: "Indian J Orthop", rssUrl: pubmed("Indian J Orthop"), officialUrl: "https://link.springer.com/journal/43465", specialty: "Orthopedics" },
  { series: "india", priority: 11, name: "Indian Journal of Surgery", abbreviation: "Indian J Surg", rssUrl: pubmed("Indian J Surg"), officialUrl: "https://link.springer.com/journal/12262", specialty: "Surgery" },
  { series: "india", priority: 12, name: "Indian Journal of Nephrology", abbreviation: "Indian J Nephrol", rssUrl: pubmed("Indian J Nephrol"), officialUrl: "https://indianjnephrol.org/", specialty: "Nephrology" },
  { series: "india", priority: 13, name: "Indian Journal of Urology", abbreviation: "Indian J Urol", rssUrl: pubmed("Indian J Urol"), officialUrl: "https://journals.lww.com/indianjurol/", specialty: "Urology" },
  { series: "india", priority: 14, name: "Indian Journal of Dermatology, Venereology and Leprology", abbreviation: "Indian J Dermatol Venereol Leprol", rssUrl: pubmed("Indian J Dermatol Venereol Leprol"), officialUrl: "https://ijdvl.com/", specialty: "Dermatology" },
  { series: "india", priority: 15, name: "Indian Journal of Endocrinology and Metabolism", abbreviation: "Indian J Endocrinol Metab", rssUrl: pubmed("Indian J Endocrinol Metab"), officialUrl: "https://journals.lww.com/indjem/", specialty: "Endocrinology" },
  { series: "india", priority: 16, name: "Indian Journal of Hematology and Blood Transfusion", abbreviation: "Indian J Hematol Blood Transfus", rssUrl: pubmed("Indian J Hematol Blood Transfus"), officialUrl: "https://link.springer.com/journal/12288", specialty: "Hematology" },
  { series: "india", priority: 17, name: "Indian Journal of Medical Microbiology", abbreviation: "Indian J Med Microbiol", rssUrl: pubmed("Indian J Med Microbiol"), officialUrl: "https://www.sciencedirect.com/journal/indian-journal-of-medical-microbiology", specialty: "Infectious Disease" },
  { series: "india", priority: 18, name: "Indian Journal of Public Health", abbreviation: "Indian J Public Health", rssUrl: pubmed("Indian J Public Health"), officialUrl: "https://journals.lww.com/ijph/", specialty: "Public Health" },
  { series: "india", priority: 19, name: "Lung India", abbreviation: "Lung India", rssUrl: pubmed("Lung India"), officialUrl: "https://journals.lww.com/lungindia/", specialty: "Pulmonology" },
  { series: "india", priority: 20, name: "Journal of Family Medicine and Primary Care", abbreviation: "J Family Med Prim Care", rssUrl: pubmed("J Family Med Prim Care"), officialUrl: "https://journals.lww.com/jfmpc/", specialty: "Family Medicine" },

  { series: "united_kingdom", priority: 1, name: "BMJ", abbreviation: "BMJ", rssUrl: pubmed("BMJ"), officialUrl: "https://www.bmj.com/", specialty: "Internal Medicine" },
  { series: "united_kingdom", priority: 2, name: "The Lancet", abbreviation: "Lancet", rssUrl: "https://www.thelancet.com/rssfeed/lancet_current.xml", officialUrl: "https://www.thelancet.com/", specialty: "Internal Medicine" },
  { series: "united_kingdom", priority: 3, name: "Heart", abbreviation: "Heart", rssUrl: "https://heart.bmj.com/rss/current.xml", officialUrl: "https://heart.bmj.com/", specialty: "Cardiology" },
  { series: "united_kingdom", priority: 4, name: "Gut", abbreviation: "Gut", rssUrl: "https://gut.bmj.com/rss/current.xml", officialUrl: "https://gut.bmj.com/", specialty: "Gastroenterology" },
  { series: "united_kingdom", priority: 5, name: "Thorax", abbreviation: "Thorax", rssUrl: "https://thorax.bmj.com/rss/current.xml", officialUrl: "https://thorax.bmj.com/", specialty: "Pulmonology" },
  { series: "united_kingdom", priority: 6, name: "Journal of Neurology, Neurosurgery & Psychiatry", abbreviation: "J Neurol Neurosurg Psychiatry", rssUrl: "https://jnnp.bmj.com/rss/current.xml", officialUrl: "https://jnnp.bmj.com/", specialty: "Neurology" },
  { series: "united_kingdom", priority: 7, name: "British Journal of General Practice", abbreviation: "Br J Gen Pract", rssUrl: pubmed("Br J Gen Pract"), officialUrl: "https://bjgp.org/", specialty: "Family Medicine" },
  { series: "united_kingdom", priority: 8, name: "The British Journal of Psychiatry", abbreviation: "Br J Psychiatry", rssUrl: pubmed("Br J Psychiatry"), officialUrl: "https://www.cambridge.org/core/journals/the-british-journal-of-psychiatry", specialty: "Psychiatry" },
  { series: "united_kingdom", priority: 9, name: "British Journal of Cancer", abbreviation: "Br J Cancer", rssUrl: "https://www.nature.com/bjc.rss", officialUrl: "https://www.nature.com/bjc/", specialty: "Oncology" },
  { series: "united_kingdom", priority: 10, name: "British Journal of Haematology", abbreviation: "Br J Haematol", rssUrl: pubmed("Br J Haematol"), officialUrl: "https://onlinelibrary.wiley.com/journal/13652141", specialty: "Hematology" },
  { series: "united_kingdom", priority: 11, name: "British Journal of Anaesthesia", abbreviation: "Br J Anaesth", rssUrl: pubmed("Br J Anaesth"), officialUrl: "https://www.bjanaesthesia.org/", specialty: "Anesthesiology" },
  { series: "united_kingdom", priority: 12, name: "BJS", abbreviation: "Br J Surg", rssUrl: pubmed("Br J Surg"), officialUrl: "https://academic.oup.com/bjs", specialty: "Surgery" },
  { series: "united_kingdom", priority: 13, name: "British Journal of Dermatology", abbreviation: "Br J Dermatol", rssUrl: pubmed("Br J Dermatol"), officialUrl: "https://academic.oup.com/bjd", specialty: "Dermatology" },
  { series: "united_kingdom", priority: 14, name: "British Journal of Ophthalmology", abbreviation: "Br J Ophthalmol", rssUrl: "https://bjo.bmj.com/rss/current.xml", officialUrl: "https://bjo.bmj.com/", specialty: "Ophthalmology" },
  { series: "united_kingdom", priority: 15, name: "Archives of Disease in Childhood", abbreviation: "Arch Dis Child", rssUrl: "https://adc.bmj.com/rss/current.xml", officialUrl: "https://adc.bmj.com/", specialty: "Pediatrics" },
  { series: "united_kingdom", priority: 16, name: "Emergency Medicine Journal", abbreviation: "Emerg Med J", rssUrl: pubmed("Emerg Med J"), officialUrl: "https://emj.bmj.com/", specialty: "Emergency Medicine" },
  { series: "united_kingdom", priority: 17, name: "Clinical Medicine", abbreviation: "Clin Med (Lond)", rssUrl: pubmed("Clin Med (Lond)"), officialUrl: "https://www.sciencedirect.com/journal/clinical-medicine", specialty: "Internal Medicine" },
  { series: "united_kingdom", priority: 18, name: "Age and Ageing", abbreviation: "Age Ageing", rssUrl: pubmed("Age Ageing"), officialUrl: "https://academic.oup.com/ageing", specialty: "Geriatrics" },
  { series: "united_kingdom", priority: 19, name: "Rheumatology", abbreviation: "Rheumatology (Oxford)", rssUrl: pubmed("Rheumatology (Oxford)"), officialUrl: "https://academic.oup.com/rheumatology", specialty: "Rheumatology" },
  { series: "united_kingdom", priority: 20, name: "Nephrology Dialysis Transplantation", abbreviation: "Nephrol Dial Transplant", rssUrl: pubmed("Nephrol Dial Transplant"), officialUrl: "https://academic.oup.com/ndt", specialty: "Nephrology" },
  { series: "united_kingdom", priority: 21, name: "British Journal of Sports Medicine", abbreviation: "Br J Sports Med", rssUrl: pubmed("Br J Sports Med"), officialUrl: "https://bjsm.bmj.com/", specialty: "Sports Medicine" },
  { series: "united_kingdom", priority: 22, name: "BMJ Sexual & Reproductive Health", abbreviation: "BMJ Sex Reprod Health", rssUrl: pubmed("BMJ Sex Reprod Health"), officialUrl: "https://srh.bmj.com/", specialty: "Obstetrics and Gynecology" }
];
