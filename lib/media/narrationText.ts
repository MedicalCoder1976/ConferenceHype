// Keep metadata out of speech BEFORE sentence splitting can break a URL across cards.
export function cleanNarrationText(value: string): string {
  let text = value;
  const narrative = /\bNarrative\s*:\s*/i.exec(text);
  if (narrative && /(?:Title|Topic|Primary source URL)\s*:/i.test(text.slice(0, narrative.index))) {
    text = text.slice(narrative.index + narrative[0].length);
  }
  return text
    .replace(/(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?(?:YouTube title|Thumbnail headline|Title|Topic|Primary source URL|Source URL)(?:\*\*)?\s*:\s*```[^`]*```/gi, " ")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/gi, "$1")
    .replace(/https?\s*:\s*\/\s*\/\s*(?:[a-z0-9-]+\s*\.\s*)+[a-z]{2,}(?:\/[^\s`<>]*)?/gi, " ")
    .replace(/https?:\/\/[^\s`<>]+/gi, " ")
    .replace(/\bwww\s*\.\s*(?:[a-z0-9-]+\s*\.\s*)+[a-z]{2,}(?:\/[^\s`<>]*)?/gi, " ")
    .replace(/\b[a-z0-9-]+\.(?:com|org|net|gov|edu|io)(?:\/[^\s`<>]*)?\b/gi, " ")
    .replace(/```(?:text|plaintext|markdown)?/gi, " ")
    .replace(/^\s*(?:#{1,6}\s*)?(?:Title|Topic|Narrative|Background|Primary source URL|Source URL|URL)\s*$/gim, " ")
    .replace(/\b(?:Primary source URL|Source URL|URL|Topic|Title|Narrative|Background)\s*[:：]\s*/gi, " ")
    .replace(/\s+/g, " ").trim();
}

export function assertCleanNarration(value: string): void {
  if (/https?\s*:|\bwww\s*\.|```|\b(?:primary source url|source url|url|topic|title|narrative)\s*[:：]/i.test(value)) {
    throw new Error("Narration contains a URL or structural metadata label; refusing synthesis and publication.");
  }
}
