const PROHIBITED_MEETING_WATCH_COPY = /\b(?:clinical evidence brief|new evidence|the story behind the result|why this result matters)\b/gi;

const SPECIALIST_ALERTS: Record<string, string> = {
  Cardiology: "CARDIOLOGIST ALERT",
  Oncology: "ONCOLOGIST ALERT",
  Hematology: "HEMATOLOGIST ALERT",
  Neurology: "NEUROLOGIST ALERT",
  Gastroenterology: "GASTROENTEROLOGIST ALERT",
  Pulmonology: "PULMONOLOGIST ALERT",
  Nephrology: "NEPHROLOGIST ALERT",
  Endocrinology: "ENDOCRINOLOGIST ALERT",
  Rheumatology: "RHEUMATOLOGIST ALERT",
  Dermatology: "DERMATOLOGIST ALERT",
  Pediatrics: "PEDIATRICIAN ALERT",
  Psychiatry: "PSYCHIATRIST ALERT",
  Urology: "UROLOGIST ALERT",
  Ophthalmology: "OPHTHALMOLOGIST ALERT",
  Radiology: "RADIOLOGIST ALERT",
  Surgery: "SURGEON ALERT",
  "Infectious Diseases": "INFECTIOUS DISEASE SPECIALIST ALERT",
  "Obstetrics and Gynecology": "OB-GYN SPECIALIST ALERT",
  "Gynecologic Oncology": "GYNECOLOGIC ONCOLOGIST ALERT"
};

export function cleanMeetingWatchCopy(value: string) {
  return value.replace(PROHIBITED_MEETING_WATCH_COPY, "").replace(/\s{2,}/g, " ").replace(/\s+([:|—-])/g, "$1").replace(/^\s*[:|—-]+\s*|\s*[:|—-]+\s*$/g, "").trim();
}

export function meetingWatchSpecialistAlert(specialty?: string) {
  const normalized = specialty?.trim() ?? "";
  return SPECIALIST_ALERTS[normalized] ?? (normalized ? `${normalized.toUpperCase()} SPECIALIST ALERT` : "SPECIALIST ALERT");
}

export function meetingWatchCaption(meetingLabel: string, specialty: string | undefined, topic: string) {
  const meeting = cleanMeetingWatchCopy(meetingLabel);
  const alert = meetingWatchSpecialistAlert(specialty);
  let subject = cleanMeetingWatchCopy(topic)
    .replace(new RegExp(`^${meeting.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")}\\s*(?:[|:—-]+\\s*)?`, "i"), "")
    .replace(new RegExp(`^${alert.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")}\\s*(?:[|:—-]+\\s*)?`, "i"), "")
    .trim();
  if (!subject) subject = "Five Meeting News Updates";
  return `${meeting} | ${alert}: ${subject}`;
}

export function assertMeetingNameAndYear(meetingLabel: string) {
  if (!/\b(?:20\d{2})\b/.test(meetingLabel)) throw new Error("Meeting Watch requires the meeting name and four-digit year, for example ESC Congress 2026.");
  return cleanMeetingWatchCopy(meetingLabel);
}

export { PROHIBITED_MEETING_WATCH_COPY };
