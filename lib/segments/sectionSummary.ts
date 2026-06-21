import { sanitizeBroadcastCopy } from "@/lib/broadcast/sanitizeCopy";

function clean(value: string) {
  return sanitizeBroadcastCopy(value).replace(/\s+/g, " ").trim();
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
      ? `The source record signals a study or trial design; complete methods detail needs PubMed or full-record confirmation before broadcast.`
      : `Complete methods detail needs PubMed or full-record confirmation before broadcast.`);
  const results =
    matchSection(sourceText, ["Results", "Findings"]) ||
    sentenceAt(sourceText, 2) ||
    (/\bresults?|survival|response|expansion|cohort|risk|diagnos|treatment\b/i.test(topic)
      ? `The source record signals reported findings; complete numeric results need PubMed or full-record confirmation before broadcast.`
      : `Complete results detail needs PubMed or full-record confirmation before broadcast.`);
  const discussion =
    matchSection(sourceText, ["Discussion", "Conclusion", "Conclusions"]) ||
    sentenceAt(sourceText, 3) ||
    (issueDetails
      ? `Discussion remains limited to the cited source record: ${issueDetails}.`
      : `Discussion remains limited to the source-described topic until PubMed or full-record detail is available.`);

  return clean(
    `Background: ${background} Methods: ${methods} Results: ${results} Discussion: ${discussion}`
  );
}

export function hasGenericSectionFallback(value: string) {
  return (
    new RegExp(String.raw`\bstored\s+intake\s+text\s+does\s+not\s+expose\b`, "i").test(value) ||
    new RegExp(String.raw`\bstored\s+intake\s+does\s+not\s+show\s+results\b`, "i").test(value) ||
    /\btitle\s+indicates\b/i.test(value) ||
    /\btitle\s+signals\b/i.test(value) ||
    new RegExp(String.raw`\bdiscussion\s+context\s+available\s+in\s+the\s+stored\s+intake\s+is\s+limited\b`, "i").test(value) ||
    /\bfull\s+article\s+text\s+is\s+available\b/i.test(value) ||
    hasSourceLimitedScienceLanguage(value)
  );
}

export function hasSourceLimitedScienceLanguage(value: string) {
  return (
    /\bonly\s+the\s+public\s+listing\s+metadata\s+is\s+available\b/i.test(value) ||
    /\bdo\s+not\s+infer\s+(?:methods|results|clinical\s+significance)\b/i.test(value) ||
    /\bcomplete\s+(?:methods|results|numeric\s+results|discussion)\s+detail\s+needs\s+(?:PubMed|full-record)\s+confirmation\b/i.test(value) ||
    /\bPubMed\s+abstract\s+(?:unavailable|incomplete)\b/i.test(value) ||
    /\brejected\s+until\s+PubMed\s+supplies\b/i.test(value)
  );
}

function sectionValue(value: string, label: "Background" | "Methods" | "Results" | "Discussion") {
  return value.match(
    new RegExp(
      `\\b${label}\\b\\s*[:.-]?\\s+([\\s\\S]{20,1000}?)(?=\\b(?:Background|Methods|Results|Discussion)\\b\\s*[:.-]?|$)`,
      "i"
    )
  )?.[1]?.trim() ?? "";
}

function usefulSentenceCount(value: string) {
  return clean(value)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 35)
    .length;
}

export function hasUsableClinicalSectionSource(value: string) {
  const cleaned = clean(value);
  if (!cleaned || hasSourceLimitedScienceLanguage(cleaned)) {
    return false;
  }
  const explicitSections = (["Background", "Methods", "Results", "Discussion"] as const).every(
    (label) => sectionValue(cleaned, label).length >= 20
  );
  return explicitSections || usefulSentenceCount(cleaned) >= 4;
}