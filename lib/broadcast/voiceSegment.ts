type SegmentCloseContext = {
  narrative?: string;
  journalName?: string;
  issueDate?: string;
  publishedAt?: string;
};

function formattedIssueDate(publishedAt?: string) {
  if (!publishedAt) return undefined;
  const parsed = new Date(publishedAt);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric"
  }).format(parsed);
}

function journalContextFromNarrative(narrative?: string) {
  const match = narrative?.match(
    /^From the (.+?) edition of (.+?)(?=,\s+this\b|\.\s+(?:Background|Methods|Results|Discussion)\b|$)/i
  );
  return match ? { issueDate: match[1].trim(), journalName: match[2].trim() } : {};
}

export function buildSegmentClose(context: SegmentCloseContext = {}) {
  const narrativeContext = journalContextFromNarrative(context.narrative);
  const journalName = context.journalName ?? narrativeContext.journalName;
  const issueDate =
    context.issueDate ?? formattedIssueDate(context.publishedAt) ?? narrativeContext.issueDate;
  const coverage = journalName && issueDate
    ? `ConferenceHype's coverage of the ${issueDate} issue of ${journalName}`
    : "this ConferenceHype coverage segment";
  return `This concludes ${coverage}. Which paper could change practice, what should we cover next, and where do you disagree with our interpretation? If we missed an article, tag @conferencehype on X and join the discussion. Share this broadcast with a colleague or your clinical team, add your perspective in the comments, like the video, and subscribe with notifications turned on so you do not miss the next journal review.`;
}

const SEGMENT_CLOSE = buildSegmentClose();

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
  // Colon made mandatory 2026-07-18 (both here and in the lookahead): a bare
  // occurrence of "Background"/"Methods"/"Results"/"Discussion" inside a
  // sentence -- not as an actual "Label:" header -- used to be misread as a
  // section boundary, truncating the preceding section and fabricating a
  // garbled one-fragment section from whatever text followed the stray
  // word. Confirmed on a real card (PMID 40729623) whose Results text
  // naturally contained "...prognostic discussion tools (P < .05)"; the
  // bare word "discussion" there cut Results down to one sentence and
  // produced a nonsense "Discussion: tools (P <.05)." fragment instead of
  // the article's real Conclusion text. See the matching fix and longer
  // explanation in lib/segments/sectionSummary.ts's matchSection -- every
  // caller of this function already receives "Label: text"-normalized
  // input, so a genuine section header is always colon-terminated.
  const match = value.match(
    new RegExp(
      `\\b${label}\\b\\s*:\\s*([\\s\\S]*?)(?=\\b(?:Background|Methods|Results|Discussion)\\b\\s*:|$)`,
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

// Only compacts when the full narrative genuinely exceeds the word budget --
// this used to compact unconditionally to a fixed 13 words/section (from
// before the 2026-06-26 substantive-narration spec), which reduced every
// structured Background/Methods/Results/Discussion card -- i.e. nearly every
// real journal card -- down to a ~50-word summary regardless of the 800-word
// budget, leaving most of the card's slot silent/music instead of the
// genuine narrated coverage the spec calls for. The guarantee this exists to
// preserve (word-trimming must never silently drop a section label) still
// holds: when trimming is actually needed, each section gets a fair share of
// the real budget instead of naive truncation that could cut off before
// "Discussion" is ever reached.
function compactFourSectionNarrative(value: string, maxWords: number) {
  if (wordCount(value) <= maxWords) {
    return value.trim();
  }
  const perSectionBudget = Math.max(20, Math.floor(maxWords / 4));
  return [
    ["Background", sectionText(value, "Background")],
    ["Methods", sectionText(value, "Methods")],
    ["Results", sectionText(value, "Results")],
    ["Discussion", sectionText(value, "Discussion")]
  ]
    .map(([label, text]) => `${label}: ${compactWords(text || "not specified in the available abstract", perSectionBudget)}`)
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
    .replace(
      /\s*This concludes (?:ConferenceHype's coverage of the .*? issue of .*?|this ConferenceHype coverage segment)\.[\s\S]*$/i,
      ""
    )
    .trim();
}

// ~800 words at a natural spoken pace (~130-140 wpm) is the target six-minute
// segment length -- see buildReporterPrompt's matching length instruction.
// This is a ceiling, not a target: short, honest segments stay short.
export function formatVoiceSegment({
  voiceName,
  topic,
  narrative,
  at,
  maxWords = 800,
  cardIndex,
  includeIntro = true,
  journalName,
  publishedAt
}: {
  voiceName: string;
  topic: string;
  narrative: string;
  at: Date;
  maxWords?: number;
  cardIndex?: number;
  includeIntro?: boolean;
  journalName?: string;
  publishedAt?: string;
}) {
  const greeting = broadcastHour(at) < 12 ? "Good morning" : "Good evening";
  const cleanNarrative = stripExistingVoiceFrame(narrative);
  const journalReview = /^From the (?:current|[A-Za-z]+ \d{4}) edition of\b/i.test(cleanNarrative);
  const structuredReview = hasFourSectionNarrative(cleanNarrative);
  const includeClose = typeof cardIndex === "number" && (cardIndex + 1) % 4 === 0;
  const closing = includeClose
    ? buildSegmentClose({ narrative: cleanNarrative, journalName, publishedAt })
    : "";
  const opening = !includeIntro
    ? ""
    : journalReview
      ? `${greeting}, wherever you are. This is ${voiceName} from ConferenceHype.`
      : `${greeting}, wherever you are. This is ${voiceName} from ConferenceHype. ` +
        `Our segment will focus on ${cleanTopic(topic)}.`;
  const narrativeBudget = Math.max(1, maxWords - wordCount(opening) - wordCount(closing));
  const trimmedBody = structuredReview
    ? compactFourSectionNarrative(cleanNarrative, narrativeBudget)
    : trimToWords(cleanNarrative, narrativeBudget);

  return `${opening} ${trimmedBody} ${closing}`.replace(/\s+/g, " ").trim();
}

export { SEGMENT_CLOSE };
