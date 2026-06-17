import type { Segment } from "@/lib/types";

const journalPattern =
  /\b(Journal of Clinical Oncology|JCO Oncology Practice|JCO Precision Oncology|Annals of Oncology|Blood Cancer Journal|British Journal of Cancer|JAMA|Leukemia|Nature Cancer|Nature Medicine|The BMJ|The Lancet(?: Oncology| Haematology)?|The New England Journal of Medicine|New England Journal of Medicine)\b/i;

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function removeBatchPrefix(value: string) {
  return clean(
    value
      .replace(/^One-hour batch\s+.*?UTC:\s*/i, "")
      .replace(/^Batch pick:\s*/i, "")
  );
}

function isLegacyBatchJournal(segment: Segment) {
  const text = `${segment.title} ${segment.summary} ${segment.script} ${segment.citations
    .map((citation) => citation.label)
    .join(" ")}`;
  return (
    /\bsource[- ](?:attributed|backed)\s+intake\b/i.test(text) &&
    journalPattern.test(text)
  );
}

function journalName(segment: Segment) {
  const text = `${segment.summary} ${segment.citations.map((citation) => citation.label).join(" ")}`;
  return (
    text.match(journalPattern)?.[0] ??
    segment.citations[0]?.label.split(":")[0]?.trim() ??
    "the selected journal"
  );
}

function edition(segment: Segment) {
  const text = `${segment.summary} ${segment.script} ${segment.title}`;
  return (
    text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i)?.[0] ??
    "current"
  );
}

function issueDetails(segment: Segment) {
  const text = clean(segment.summary)
    .replace(/^.+?\s+source[- ](?:attributed|backed)\s+intake\.\s*/i, "")
    .replace(/\bsource[- ](?:attributed|backed)\s+intake\b/gi, "")
    .replace(/\bsource[- ]backed\s+item\b/gi, "journal article")
    .replace(/\bsource[- ]backed\b/gi, "source-attributed")
    .replace(/[.]\s*$/g, "");
  return text && text !== segment.summary ? text : "";
}

function normalizeScriptText(value: string) {
  return clean(
    value
      .replace(/\b[A-Z][A-Za-z\s.'-]{1,40}\s+is covering a source[- ]backed item from\s+/gi, "")
      .replace(/\b[A-Z][A-Za-z\s.'-]{1,40}\s+is covering a covered item from\s+/gi, "")
      .replace(/\bsource[- ]backed\s+item\b/gi, "journal article")
      .replace(/\bsource[- ]backed\b/gi, "source-attributed")
      .replace(/\bsource[- ]attributed\s+intake\b/gi, "journal review")
  );
}

export function normalizeLegacySegment(segment: Segment): Segment {
  const normalized = {
    ...segment,
    summary: normalizeScriptText(segment.summary),
    script: normalizeScriptText(segment.script)
  };

  if (!isLegacyBatchJournal(segment)) {
    return normalized;
  }

  const journal = journalName(segment);
  const monthEdition = edition(segment);
  const topic = removeBatchPrefix(segment.title);
  const details = issueDetails(segment);
  const detailSentence = details
    ? `The issue listing identifies ${details}.`
    : "The linked journal record should be reviewed for the abstract, methods, results, and discussion before placement.";

  return {
    ...normalized,
    summary: `From the ${monthEdition} edition of ${journal}. Condensed journal review queued for abstract, methods, results, and discussion.`,
    script: clean(
      `From the ${monthEdition} edition of ${journal}, this journal review looks at ${topic}. ${detailSentence} Use the linked journal record to keep the abstract, methods, results, and discussion condensed in broadcast form. Coverage stays with the cited journal record and does not give medical advice.`
    ),
    contentType: "abstract_buzz",
    riskFlags: Array.from(
      new Set([...normalized.riskFlags, "legacy_journal_card_normalized"])
    )
  };
}
