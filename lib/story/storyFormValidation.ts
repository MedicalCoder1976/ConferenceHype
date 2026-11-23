import { cleanNarrationText } from "@/lib/media/narrationText";

export function cleanStoryNarrative(value: string) {
  return cleanNarrationText(value.replace(/^#{1,6}\s+/gm, "").replace(/^[-*]\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1")
  );
}

export function storyWordCount(value: string) {
  return cleanStoryNarrative(value).split(/\s+/).filter(Boolean).length;
}

// Operator rule (2026-11-22): a series callback names what the earlier update
// covered and moves on. A spoken note about what this video leaves out ("so
// those are not repeated here", "noted here only in brief") sounds out of
// place to a listener, so it blocks the Story.
const SKIP_NOTE_PATTERN =
  /\b(?:not|never)\s+(?:be\s+)?(?:repeated|covered|expanded|revisited|discussed)\s+(?:here|again)\b|\bnone\s+of\s+(?:those|these|them|which)\s+(?:are|is|were|was)\s+(?:repeated|covered|revisited)\b|\b(?:noted|mentioned)\s+here\s+only\s+in\s+brief\b|\bnot\s+expanded\s+as\s+a\s+separate\b/i;

/** Returns the offending sentence when the narration says what it is not covering. */
export function storySkipNote(narrative: string) {
  for (const sentence of narrative.split(/(?<=[.!?])\s+/)) {
    if (SKIP_NOTE_PATTERN.test(sentence)) return sentence.trim();
  }
  return null;
}

export function storyFormIssues(input: {
  sourceUrl: string; narrative: string; title: string; topic: string;
  thumbnailHeadline: string; sourceName: string; authors: string; specialty: string;
}) {
  const issues: string[] = [];
  try {
    const url = new URL(input.sourceUrl.trim());
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error();
  } catch { issues.push("Enter a complete primary source URL starting with https:// or http://."); }
  const count = storyWordCount(input.narrative);
  if (count < 420) issues.push(`Narrative has ${count} spoken words. Add at least ${420 - count} more source-supported words (420 required).`);
  if (input.narrative.trim().length < 1_200) issues.push(`Narrative needs at least 1,200 characters (${input.narrative.trim().length} entered).`);
  const skipNote = storySkipNote(input.narrative);
  if (skipNote) issues.push(`Remove the note about what this video does not cover: "${skipNote}" Name what the earlier update covered and move on.`);
  if (input.narrative.trim().length > 120_000) issues.push("Shorten the narrative to 120,000 characters or fewer.");
  for (const [label, value, min, max] of [
    ["YouTube title", input.title, 8, 100], ["Topic", input.topic, 3, 160],
    ["Generated thumbnail headline (edit the YouTube title)", input.thumbnailHeadline, 8, 58],
    ["Publication or organization", input.sourceName, 0, 120],
    ["Authors", input.authors, 0, 500], ["Specialty", input.specialty, 0, 80]
  ] as const) {
    if (value.trim().length < min || value.trim().length > max) issues.push(`${label} must contain ${min}–${max} characters.`);
  }
  return issues;
}
