import type { Citation, IngestedItem, Segment } from "@/lib/types";

const doctorNamePattern = /\bDr\.?\s+(\p{Lu}[\p{L}'-]+(?:\s+\p{Lu}[\p{L}'-]+){0,3})/gu;

const fakeNewsPatterns = [
  /\bDr\.?\s+(Patel|Rivera)\b/i,
  /\binvented\b/i,
  /\bfictional\b/i,
  /\bunnamed\s+(doctor|physician|oncologist|expert)\b/i,
  /\ba\s+(doctor|physician|oncologist|researcher|expert)\s+(said|told|claimed)\b/i,
  /\bsources?\s+(say|said|tell|told)\b/i,
  /\brumou?r\s+has\s+it\b/i,
  /\bword\s+on\s+the\s+floor\b/i,
  /\baccording\s+to\s+people\s+familiar\b/i,
  /\bnot\s+yet\s+confirmed\b/i
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function uniqueDoctorNames(text: string) {
  const names = new Set<string>();
  for (const match of text.matchAll(doctorNamePattern)) {
    names.add(match[1].trim());
  }
  return Array.from(names);
}

function citationCorpus(citations: Citation[]) {
  return citations.map((citation) => `${citation.label}\n${citation.url}`).join("\n");
}

function sourceCorpus(sources: IngestedItem[]) {
  return sources
    .map(
      (source) =>
        `${source.title}\n${source.url}\n${source.excerpt}\n${source.sourceName}\n${source.author ?? ""}`
    )
    .join("\n");
}

function words(value: string) {
  return normalize(value).split(" ").filter(Boolean);
}

function copiedPassages(output: string, sources: IngestedItem[]) {
  const normalizedOutput = ` ${normalize(output)} `;
  const matches = new Set<string>();
  for (const source of sources) {
    for (const [sourceText, passageLength] of [
      [source.title, 24],
      [source.excerpt, 16]
    ] as const) {
      const sourceWords = words(sourceText);
      for (let index = 0; index <= sourceWords.length - passageLength; index += 1) {
        const passage = sourceWords.slice(index, index + passageLength).join(" ");
        if (normalizedOutput.includes(` ${passage} `)) {
          matches.add(passage);
        }
      }
    }
  }
  return Array.from(matches);
}

export function getUnsafeGeneratedSourceErrors({
  segment,
  sources
}: {
  segment: Pick<Segment, "title" | "summary" | "script">;
  sources: IngestedItem[];
}) {
  const errors: string[] = [];
  const output = `${segment.title}\n${segment.summary}\n${segment.script}`;
  const normalizedSourceText = normalize(sourceCorpus(sources));

  for (const pattern of fakeNewsPatterns) {
    if (pattern.test(output)) {
      errors.push(`Generated segment contains disallowed unsourced/fake-news language: ${pattern}`);
    }
  }

  for (const name of uniqueDoctorNames(output)) {
    if (!normalizedSourceText.includes(normalize(name))) {
      errors.push(`Generated segment names Dr. ${name}, but that name is not present in the supplied sources.`);
    }
  }

  const copied = copiedPassages(`${segment.summary}\n${segment.script}`, sources);
  if (copied.length > 0) {
    errors.push(
      `Generated segment copies source wording instead of genuinely rewriting it: "${copied[0]}".`
    );
  }

  return errors;
}

export function getUnsafeReviewSourceErrors(
  segment: Pick<Segment, "title" | "summary" | "script" | "citations">
) {
  const errors: string[] = [];
  const output = `${segment.title}\n${segment.summary}\n${segment.script}`;
  const normalizedCitationText = normalize(citationCorpus(segment.citations));

  for (const pattern of fakeNewsPatterns) {
    if (pattern.test(output)) {
      errors.push(`Segment contains disallowed unsourced/fake-news language: ${pattern}`);
    }
  }

  for (const name of uniqueDoctorNames(output)) {
    if (!normalizedCitationText.includes(normalize(name))) {
      errors.push(`Segment names Dr. ${name}, but that name is not present in the citations.`);
    }
  }

  return errors;
}
