const intake = String.raw`stored\s+intake`;

const BANNED_PHRASES = [
  new RegExp(String.raw`\bConference\s*Hype\s+ASCO\s+energy\s+all\s+day\s+seems\s+to\s+creep\s+in\b[.!?]?\s*`, "gi"),
  new RegExp(String.raw`\bConference\s+energy\s+keep\s+it\s+moving\b[.!?]?\s*`, "gi"),
  new RegExp(String.raw`\bThe\s+${intake}\s+does\s+not\s+show\s+results\b[.!?]?\s*`, "gi"),
  new RegExp(String.raw`\b${intake}\s+tex?t\s+does\s+not\s+expose\b[^.!?\n]*(?:[.!?]|\n|$)`, "gi"),
  new RegExp(String.raw`\b${intake}\s+does\s+not\s+expose\b[^.!?\n]*(?:[.!?]|\n|$)`, "gi"),
  new RegExp(String.raw`\bdiscussion\s+context\s+available\s+in\s+the\s+${intake}\s+is\s+limited\b[^.!?\n]*(?:[.!?]|\n|$)`, "gi")
];

const CARD_REPLACEMENT_PATTERNS = [
  new RegExp(String.raw`\b${intake}\s+tex?t\s+does\s+not\s+expose\b`, "i"),
  new RegExp(String.raw`\b${intake}\s+does\s+not\s+show\s+results\b`, "i"),
  /\bdiscussion\s+should\s+remain\s+limited\b/i,
  new RegExp(String.raw`\bdiscussion\s+context\s+available\s+in\s+the\s+${intake}\b`, "i"),
  /\bcomplete (?:methods|results|numeric results|discussion) detail needs PubMed or full-record confirmation before broadcast\b/i
];

export function hasMissingIntakeFailureLanguage(value: string) {
  return CARD_REPLACEMENT_PATTERNS.some((pattern) => pattern.test(value));
}

export function sanitizeBroadcastCopy(value: string) {
  return BANNED_PHRASES.reduce(
    (current, pattern) => current.replace(pattern, " "),
    value
  )
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
