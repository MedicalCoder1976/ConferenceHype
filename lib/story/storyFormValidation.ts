export function cleanStoryNarrative(value: string) {
  return value.replace(/^#{1,6}\s+/gm, "").replace(/^[-*]\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1")
    .replace(/\s+/g, " ").trim();
}

export function storyWordCount(value: string) {
  return cleanStoryNarrative(value).split(/\s+/).filter(Boolean).length;
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
