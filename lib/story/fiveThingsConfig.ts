export const FIVE_THINGS_SPECIALTIES = [
  "Allergy and Immunology", "Anesthesiology", "Cardiology", "Dermatology", "Emergency Medicine",
  "Endocrinology", "Family Medicine", "Gastroenterology", "Hematology", "Infectious Diseases",
  "Internal Medicine", "Nephrology", "Neurology", "Obstetrics and Gynecology", "Gynecologic Oncology", "Oncology",
  "Ophthalmology", "Orthopedics", "Pediatrics", "Psychiatry", "Pulmonology", "Radiology",
  "Rheumatology", "Surgery", "Urology"
] as const;

function truncateAtWord(value: string, max: number) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  const prefix = cleaned.slice(0, max + 1);
  const boundary = prefix.lastIndexOf(" ");
  return `${prefix.slice(0, boundary > max * 0.6 ? boundary : max).replace(/[,:;\-–—\s]+$/, "")}…`;
}

export function buildFiveThingsSearchTitle(specialty: string, itemTitles: string[]) {
  const prefix = `${specialty}: 5 Things to Know Today`;
  const available = 100 - prefix.length - 3;
  const topics: string[] = [];
  for (const itemTitle of itemTitles.slice(0, 3)) {
    const candidate = truncateAtWord(itemTitle, 30).replace(/…$/, "");
    const next = [...topics, candidate].join(", ");
    if (next.length > available) break;
    topics.push(candidate);
  }
  return topics.length ? `${prefix} — ${topics.join(", ")}` : prefix;
}

export function fiveThingsItemTitles(writeup: string) {
  return writeup.split(/\r?\n/)
    .map((line) => line.trim().match(/^(?:#{1,6}\s*)?(?:item\s*)?([1-5])\s*[).:\-]\s*(.+)$/i))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .sort((left, right) => Number(left[1]) - Number(right[1]))
    .map((match) => match[2].replace(/\*+/g, "").trim());
}
