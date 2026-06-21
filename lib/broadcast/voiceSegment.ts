const SEGMENT_CLOSE =
  "That is it for this segment, if there are any Medical Conferences or events you want covered tag our team @conferencehype on X.";

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function trimToWords(value: string, maxWords: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return value.trim();
  }

  const limited = words.slice(0, maxWords).join(" ");
  const sentenceEnd = Math.max(
    limited.lastIndexOf("."),
    limited.lastIndexOf("!"),
    limited.lastIndexOf("?")
  );
  if (sentenceEnd > limited.length * 0.45) {
    return limited.slice(0, sentenceEnd + 1);
  }
  return `${limited.replace(/[.,;:!?]+$/, "")}.`;
}

function compactWords(value: string, maxWords: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return value.trim();
  }
  return `${words.slice(0, maxWords).join(" ").replace(/[.,;:!?]+$/, "")}.`;
}

function sectionText(value: string, label: "Background" | "Methods" | "Results" | "Discussion") {
  const match = value.match(
    new RegExp(
      `\\b${label}\\b\\s*[:,-]?\\s*([\\s\\S]*?)(?=\\b(?:Background|Methods|Results|Discussion)\\b\\s*[:,-]?|$)`,
      "i"
    )
  )?.[1];
  return (match ?? "").replace(/\s+/g, " ").trim();
}

function hasFourSectionNarrative(value: string) {
  return (
    /\bBackground\b/i.test(value) &&
    /\bMethods\b/i.test(value) &&
    /\bResults\b/i.test(value) &&
    /\bDiscussion\b/i.test(value)
  );
}

function compactFourSectionNarrative(value: string) {
  return [
    ["Background", sectionText(value, "Background")],
    ["Methods", sectionText(value, "Methods")],
    ["Results", sectionText(value, "Results")],
    ["Discussion", sectionText(value, "Discussion")]
  ]
    .map(([label, text]) => `${label}: ${compactWords(text || "not specified in the available abstract", 13)}`)
    .join(" ");
}

function broadcastHour(at: Date) {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: false
  }).format(at);
  return Number.parseInt(hour, 10);
}

function cleanTopic(value: string) {
  return (
    value
      .replace(/\s+/g, " ")
      .replace(/[.!?]+$/, "")
      .trim() || "the latest conference update"
  );
}

export function stripBroadcastDisclaimer(value: string) {
  return value
    .replace(
      /\b(?:ConferenceHype|[A-Z]{4} Hype)\s+is interactive AI commentary only\.\s*It is not reporting, journalism, medical education, clinical guidance, scientific validation, legal advice, or financial advice\.\s*/g,
      ""
    )
    .replace(
      /\b(?:ConferenceHype|[A-Z]{4} Hype)\s+is not associated with [^.]+\.\s*/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

function stripExistingVoiceFrame(value: string) {
  return stripBroadcastDisclaimer(value)
    .replace(
      /^\s*Good (?:morning|evening),?\s+wherever you are\.?\s+This is .{1,80}? from ConferenceHype\.?\s+Our segment will focus on .{1,160}?\.\s*/i,
      ""
    )
    .replace(
      /^\s*(?:this is\s+)?[A-Za-z][A-Za-z\s.'-]{1,40}\s+(?:here|from)\s+(?:from\s+)?(?:ConferenceHype|the [A-Za-z\s-]+ desk)\b[:,.\s-]*/i,
      ""
    )
    .replace(
      /\s*That is it for this segment,?\s+if there are any Medical Conferences or events you want covered,?\s+tag our team @conferencehype on X\.?\s*$/i,
      ""
    )
    .trim();
}

export function formatVoiceSegment({
  voiceName,
  topic,
  narrative,
  at,
  maxWords = 90,
  cardIndex
}: {
  voiceName: string;
  topic: string;
  narrative: string;
  at: Date;
  maxWords?: number;
  cardIndex?: number;
}) {
  const greeting = broadcastHour(at) < 12 ? "Good morning" : "Good evening";
  const cleanNarrative = stripExistingVoiceFrame(narrative);
  const journalReview = /^From the (?:current|[A-Za-z]+ \d{4}) edition of\b/i.test(cleanNarrative);
  const structuredReview = hasFourSectionNarrative(cleanNarrative);
  const includeClose = typeof cardIndex === "number" && (cardIndex + 1) % 4 === 0;
  const closing = includeClose ? SEGMENT_CLOSE : "";
  const opening = journalReview
    ? `${greeting}, wherever you are. This is ${voiceName} from ConferenceHype.`
    : `${greeting}, wherever you are. This is ${voiceName} from ConferenceHype. ` +
      `Our segment will focus on ${cleanTopic(topic)}.`;
  const narrativeBudget = Math.max(1, maxWords - wordCount(opening) - wordCount(closing));
  const trimmedBody = structuredReview
    ? compactFourSectionNarrative(cleanNarrative)
    : trimToWords(cleanNarrative, narrativeBudget);

  return `${opening} ${trimmedBody} ${closing}`.replace(/\s+/g, " ").trim();
}

export { SEGMENT_CLOSE };
