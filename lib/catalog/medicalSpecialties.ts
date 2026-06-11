export const medicalSpecialties = [
  "Allergy and Immunology",
  "Anesthesiology",
  "Cardiology",
  "Critical Care",
  "Dermatology",
  "Emergency Medicine",
  "Endocrinology",
  "Family Medicine",
  "Gastroenterology",
  "Hematology",
  "Infectious Diseases",
  "Internal Medicine",
  "Nephrology",
  "Neurology",
  "Obstetrics and Gynecology",
  "Oncology",
  "Ophthalmology",
  "Orthopedics",
  "Pediatrics",
  "Psychiatry",
  "Pulmonology",
  "Radiology",
  "Rheumatology",
  "Surgery",
  "Urology"
] as const;

export type MedicalSpecialty = (typeof medicalSpecialties)[number];
