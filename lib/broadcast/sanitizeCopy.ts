const intake = String.raw`stored\s+intake`;

const BANNED_PHRASES = [
  new RegExp(String.raw`\bConference\s*Hype\s+ASCO\s+energy\s*,?\s+all\s+day\b[^.!?\n]*(?:[.!?]|\n|$)`, "gi"),
  new RegExp(String.raw`\bConference\s+energy\s+keep\s+it\s+moving\b[.!?]?\s*`, "gi"),
  /\bsource[- ]only\s+schedule\b[^.!?\n]*(?:[.!?]|\n|$)/gi,
  /\bcheck(?:ing)?\s+using\s+official\s+meeting\s+sources\b[^.!?\n]*(?:[.!?]|\n|$)/gi,
  /\bofficial\s+source\s+desk\s+is\s+monitoring\b[^.!?\n]*(?:[.!?]|\n|$)/gi,
  /\bsource\s+desk\s+is\s+monitoring\b[^.!?\n]*(?:[.!?]|\n|$)/gi,
  /\bcheck\s+the\s+official\s+conference\s+program\b[^.!?\n]*(?:[.!?]|\n|$)/gi,
  new RegExp(String.raw`\bThe\s+${intake}\s+does\s+not\s+show\s+results\b[.!?]?\s*`, "gi"),
  new RegExp(String.raw`\b${intake}\s+tex?t\s+does\s+not\s+expose\b[^.!?\n]*(?:[.!?]|\n|$)`, "gi"),
  new RegExp(String.raw`\b${intake}\s+does\s+not\s+expose\b[^.!?\n]*(?:[.!?]|\n|$)`, "gi"),
  new RegExp(String.raw`\bdiscussion\s+context\s+available\s+in\s+the\s+${intake}\s+is\s+limited\b[^.!?\n]*(?:[.!?]|\n|$)`, "gi")
];

const CARD_REPLACEMENT_PATTERNS = [
  /\bno\s+(?:new\s+)?(?:attributed|source-attributed|monitored|ready|usable)\s+(?:update|content|material|social posts?|voices?)\b/i,
  /\bno\s+recent\s+social\s+posts?\s+are\s+available\b/i,
  /\bno\s+source-attributed\s+content\s+update\s+is\s+ready\b/i,
  /\bcoverage\s+continues\s+from\s+the\s+conference\s+social\s+desk\b/i,
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
    .replace(/\bIb\b/g, "one B")
    .replace(/\b1b\b/gi, "one B")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}