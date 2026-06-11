import type { SpecialtyXVoice } from "@/lib/types";

type VoiceSeed = Pick<SpecialtyXVoice, "specialty" | "label" | "handle" | "note" | "rank">;

// Official societies and journals provide a stable baseline. Live X engagement
// determines the top-20 order within each specialty.
export const specialtyVoiceSeeds: VoiceSeed[] = [
  { specialty: "Cardiology", label: "American College of Cardiology", handle: "@ACCinTouch", note: "official cardiology society", rank: 1 },
  { specialty: "Cardiology", label: "American Heart Association", handle: "@American_Heart", note: "official cardiovascular society", rank: 2 },
  { specialty: "Neurology", label: "American Academy of Neurology", handle: "@AANmember", note: "official neurology society", rank: 1 },
  { specialty: "Oncology", label: "ASCO", handle: "@ASCO", note: "official oncology society", rank: 1 },
  { specialty: "Oncology", label: "The ASCO Post", handle: "@ASCOPost", note: "oncology conference media", rank: 2 },
  { specialty: "Hematology", label: "American Society of Hematology", handle: "@ASH_hematology", note: "official hematology society", rank: 1 },
  { specialty: "Gastroenterology", label: "Digestive Disease Week", handle: "@DDWMeeting", note: "digestive disease conference", rank: 1 },
  { specialty: "Pulmonology", label: "American Thoracic Society", handle: "@atscommunity", note: "official pulmonary society", rank: 1 },
  { specialty: "Endocrinology", label: "American Diabetes Association", handle: "@AmDiabetesAssn", note: "diabetes and endocrinology signal", rank: 1 },
  { specialty: "Infectious Diseases", label: "IDSA", handle: "@IDSAInfo", note: "official infectious diseases society", rank: 1 },
  { specialty: "Nephrology", label: "American Society of Nephrology", handle: "@ASNKidney", note: "official nephrology society", rank: 1 },
  { specialty: "Rheumatology", label: "American College of Rheumatology", handle: "@ACRheum", note: "official rheumatology society", rank: 1 },
  { specialty: "Radiology", label: "RSNA", handle: "@RSNA", note: "official radiology society", rank: 1 },
  { specialty: "Emergency Medicine", label: "ACEP", handle: "@ACEPNow", note: "emergency medicine society and news", rank: 1 },
  { specialty: "Dermatology", label: "American Academy of Dermatology", handle: "@AADskin", note: "official dermatology society", rank: 1 },
  { specialty: "Pediatrics", label: "American Academy of Pediatrics", handle: "@AmerAcadPeds", note: "official pediatrics society", rank: 1 },
  { specialty: "Psychiatry", label: "American Psychiatric Association", handle: "@APApsychiatric", note: "official psychiatry society", rank: 1 },
  { specialty: "Obstetrics and Gynecology", label: "ACOG", handle: "@acog", note: "official obstetrics and gynecology society", rank: 1 },
  { specialty: "Ophthalmology", label: "American Academy of Ophthalmology", handle: "@aao_ophth", note: "official ophthalmology society", rank: 1 },
  { specialty: "Urology", label: "American Urological Association", handle: "@AmerUrological", note: "official urology society", rank: 1 },
  { specialty: "Surgery", label: "American College of Surgeons", handle: "@AmCollSurgeons", note: "official surgical society", rank: 1 },
  { specialty: "Internal Medicine", label: "American College of Physicians", handle: "@ACPIMPhysicians", note: "official internal medicine society", rank: 1 },
  { specialty: "Family Medicine", label: "AAFP", handle: "@aafp", note: "official family medicine society", rank: 1 },
  { specialty: "Allergy and Immunology", label: "AAAAI", handle: "@AAAAI_org", note: "official allergy and immunology society", rank: 1 },
  { specialty: "Anesthesiology", label: "American Society of Anesthesiologists", handle: "@ASALifeline", note: "official anesthesiology society", rank: 1 },
  { specialty: "Orthopedics", label: "AAOS", handle: "@AAOS1", note: "official orthopedic society", rank: 1 }
];
