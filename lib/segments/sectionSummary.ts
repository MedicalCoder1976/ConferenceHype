function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function firstSentence(value: string) {
  const cleaned = clean(value);
  return cleaned.match(/^(.+?[.!?])\s/)?.[1] ?? cleaned;
}

function sentenceAt(value: string, index: number) {
  return (
    clean(value)
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 20)[index] ?? ""
  );
}

function matchSection(text: string, labels: string[]) {
  for (const label of labels) {
    const match = text.match(
      new RegExp(
        `\\b${label}\\b\\s*[:.-]?\\s+([\\s\\S]{20,700}?)(?=\\b(?:Background|Purpose|Objective|Importance|Methods|Design|Results|Findings|Discussion|Conclusion|Conclusions)\\b\\s*[:.-]?|$)`,
        "i"
      )
    )?.[1];
    if (match) {
      return firstSentence(match);
    }
  }
  return "";
}

function titleWithoutBatch(value: string) {
  return clean(
    value
      .replace(/^One-hour batch\s+.*?UTC:\s*/i, "")
      .replace(/^Batch pick:\s*/i, "")
  );
}

export function buildRequiredSectionSummary({
  title,
  sourceName,
  text,
  issueDetails
}: {
  title: string;
  sourceName: string;
  text: string;
  issueDetails?: string;
}) {
  const sourceText = clean(text);
  const topic = titleWithoutBatch(title);
  const background =
    matchSection(sourceText, ["Background", "Purpose", "Objective", "Importance"]) ||
    sentenceAt(sourceText, 0) ||
    `The available ${sourceName} record identifies ${topic} as the article topic.`;
  const methods =
    matchSection(sourceText, ["Methods", "Design"]) ||
    sentenceAt(sourceText, 1) ||
    (/\bphase\s?(?:i|ii|iii|iv|1|2|3|4)|trial|cohort|randomized|study\b/i.test(topic)
      ? `The title indicates a study or trial design, but the stored intake text does not expose the full methods.`
      : `The stored intake text does not expose the full methods section for this item.`);
  const results =
    matchSection(sourceText, ["Results", "Findings"]) ||
    sentenceAt(sourceText, 2) ||
    (/\bresults?|survival|response|expansion|cohort|risk|diagnos|treatment\b/i.test(topic)
      ? `The title signals reported results or clinical findings, but the stored intake text does not expose the numeric result details.`
      : `The stored intake text does not expose the results section for this item.`);
  const discussion =
    matchSection(sourceText, ["Discussion", "Conclusion", "Conclusions"]) ||
    sentenceAt(sourceText, 3) ||
    (issueDetails
      ? `The discussion context available in the stored intake is limited to ${issueDetails}.`
      : `The discussion should remain limited to the source-described topic until the full article text is available.`);

  return clean(
    `Background: ${background} Methods: ${methods} Results: ${results} Discussion: ${discussion}`
  );
}

export function hasGenericSectionFallback(value: string) {
  return (
    /\bstored intake text does not expose\b/i.test(value) ||
    /\btitle indicates\b/i.test(value) ||
    /\btitle signals\b/i.test(value) ||
    /\bdiscussion context available in the stored intake is limited\b/i.test(value) ||
    /\bfull article text is available\b/i.test(value)
  );
}
