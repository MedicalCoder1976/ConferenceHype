export type ClinicalEvidencePackagingInput = {
  title?: string;
  specialty?: string;
  sourceText: string;
  studyNames?: string[];
  explicitTopic?: string;
  multiTopic?: boolean;
};

export type ClinicalEvidencePackaging = {
  clinicalTopic: string;
  specialtyLabel: string;
  primaryEntity?: string;
  outcomeHook: string;
  youtubeTitle: string;
  thumbnailHook: string;
  thumbnailEntity?: string;
};

const TOPIC_PATTERNS: Array<[string, RegExp]> = [
  ["Chronic Lymphocytic Leukemia", /\b(?:chronic lymphocytic leukemia|CLL)\b/i],
  ["Acute Myeloid Leukemia", /\b(?:acute myeloid leukemia|AML)\b/i],
  ["Acute Lymphoblastic Leukemia", /\b(?:acute lymphoblastic leukemia|ALL)\b/i],
  ["Mantle Cell Lymphoma", /\bmantle cell lymphoma\b/i],
  ["Diffuse Large B-Cell Lymphoma", /\b(?:diffuse large B-cell lymphoma|DLBCL)\b/i],
  ["Follicular Lymphoma", /\bfollicular lymphoma\b/i],
  ["Multiple Myeloma", /\bmultiple myeloma\b/i],
  ["Myelodysplastic Syndrome", /\b(?:myelodysplastic syndrome|MDS)\b/i],
  ["Myelofibrosis", /\bmyelofibrosis\b/i],
  ["Breast Cancer", /\b(?:breast cancer|breast carcinoma|HER2-positive breast|triple-negative breast)\b/i],
  ["Lung Cancer", /\b(?:lung cancer|non-small cell lung|small cell lung|NSCLC|SCLC)\b/i],
  ["Prostate Cancer", /\bprostate (?:cancer|carcinoma|tumou?r)\b/i],
  ["Colorectal Cancer", /\b(?:colorectal|colon|rectal) (?:cancer|carcinoma|tumou?r)\b/i],
  ["Pancreatic Cancer", /\bpancrea(?:tic|s) (?:cancer|carcinoma|adenocarcinoma|tumou?r)\b/i],
  ["Liver Cancer", /\b(?:liver cancer|hepatocellular carcinoma|HCC)\b/i],
  ["Kidney Cancer", /\b(?:kidney|renal cell) (?:cancer|carcinoma)\b/i],
  ["Bladder Cancer", /\b(?:bladder cancer|urothelial carcinoma)\b/i],
  ["Ovarian Cancer", /\bovarian (?:cancer|carcinoma)\b/i],
  ["Endometrial Cancer", /\bendometrial (?:cancer|carcinoma)\b/i],
  ["Cervical Cancer", /\bcervical (?:cancer|carcinoma)\b/i],
  ["Melanoma", /\bmelanoma\b/i],
  ["Brain Cancer", /\b(?:glioblastoma|glioma|brain cancer)\b/i],
  ["Head and Neck Cancer", /\bhead and neck (?:cancer|carcinoma)\b/i],
  ["Sarcoma", /\bsarcoma\b/i],
  ["Heart Failure", /\bheart failure\b/i],
  ["Coronary Artery Disease", /\b(?:coronary artery disease|coronary heart disease|myocardial infarction|heart attacks?)\b/i],
  ["Atrial Fibrillation", /\batrial fibrillation\b/i],
  ["Cardiovascular Disease", /\b(?:cardiovascular disease|cardiovascular events?|atherosclerosis)\b/i],
  ["Stroke", /\bstroke\b/i],
  ["Alzheimer Disease", /\bAlzheimer(?:'s)? disease\b/i],
  ["Parkinson Disease", /\bParkinson(?:'s)? disease\b/i],
  ["Multiple Sclerosis", /\bmultiple sclerosis\b/i],
  ["Epilepsy", /\bepilepsy\b/i],
  ["Chronic Kidney Disease", /\b(?:chronic kidney disease|CKD)\b/i],
  ["Type 2 Diabetes", /\b(?:type 2 diabetes|T2D)\b/i],
  ["Obesity", /\bobesity\b/i],
  ["Rheumatoid Arthritis", /\brheumatoid arthritis\b/i],
  ["Inflammatory Bowel Disease", /\b(?:inflammatory bowel disease|Crohn(?:'s)? disease|ulcerative colitis)\b/i],
  ["Major Depression", /\b(?:major depression|major depressive disorder)\b/i],
  ["Schizophrenia", /\bschizophrenia\b/i],
  ["COVID-19", /\b(?:COVID-19|SARS-CoV-2)\b/i],
  ["HIV", /\bHIV\b/i],
  ["Influenza", /\binfluenza\b/i]
];

const GENERIC_TITLE_PREFIXES = [
  /^ConferenceHype\s*:\s*/i,
  /^Physician Education\s*:\s*/i,
  /^Clinical Evidence Brief\s*[:|-]\s*/i,
  /^(?:Journal|Meeting) Watch\s*:\s*/i
];

function clean(value: string) {
  let output = value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  for (const prefix of GENERIC_TITLE_PREFIXES) output = output.replace(prefix, "").trim();
  return output.replace(/[|-]+$/g, "").trim();
}

function truncateAtWord(value: string, maxLength: number) {
  const normalized = clean(value);
  if (normalized.length <= maxLength) return normalized;
  const sliced = normalized.slice(0, maxLength - 1);
  const boundary = sliced.lastIndexOf(" ");
  return sliced.slice(0, boundary >= Math.floor(maxLength * 0.6) ? boundary : sliced.length).trimEnd() + "...";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
}

function resolveSpecialtyLabel(value?: string) {
  const normalized = clean(value ?? "");
  if (!normalized || /^(?:story|medical journal|medicine|multispecialty)$/i.test(normalized)) return "CLINICAL RESEARCH";
  return normalized.toUpperCase();
}

function fallbackTopic(input: ClinicalEvidencePackagingInput) {
  const explicit = clean(input.explicitTopic ?? "");
  if (explicit && !/^(?:story|medicine|medical research|clinical medicine)$/i.test(explicit)) return truncateAtWord(explicit, 48);
  const specialty = clean(input.specialty ?? "");
  if (/oncology|hematology|cancer/i.test(specialty)) return input.multiTopic ? "Multiple Cancers" : "Cancer";
  if (specialty && !/^(?:story|medicine|medical journal|multispecialty)$/i.test(specialty)) return truncateAtWord(specialty + " Research", 48);
  const candidate = clean(input.title ?? "").split(/[|]/)[0]?.trim();
  return truncateAtWord(candidate || "Clinical Research", 48);
}

export function extractClinicalTopic(value: string, fallback = "Clinical Research") {
  const matches = TOPIC_PATTERNS.filter(([, pattern]) => pattern.test(value)).map(([label]) => label);
  const unique = [...new Set(matches)];
  if (unique.length === 1) return unique[0];
  if (unique.length > 1) {
    const allCancer = unique.every((label) => /Cancer|Leukemia|Lymphoma|Myeloma|Myelodysplastic|Myelofibrosis|Melanoma|Sarcoma/i.test(label));
    return allCancer ? "Multiple Cancers" : unique[0];
  }
  return fallback;
}

function resolveOutcomeHook(input: ClinicalEvidencePackagingInput, entity: string | undefined, topic: string) {
  const candidates = [input.title, ...input.sourceText.split(/\n+/).slice(0, 8)]
    .map((value) => clean(value ?? ""))
    .filter(Boolean);
  for (let candidate of candidates) {
    if (entity) candidate = candidate.replace(new RegExp("^" + escapeRegExp(entity) + "\\s*[:|-]\\s*", "i"), "");
    candidate = candidate.replace(new RegExp("^" + escapeRegExp(topic) + "\\s*[:|-]\\s*", "i"), "");
    candidate = candidate.replace(/^(?:Background|Methods|Results|Discussion|Conclusion)\s*:\s*/i, "");
    if (candidate.length >= 12 && !/^(?:important conferencehype notice|music transition|coverage continues)/i.test(candidate)) {
      return truncateAtWord(candidate, 68);
    }
  }
  return entity ? entity + ": New Evidence Explained" : "New Evidence Explained";
}

export function buildClinicalEvidencePackaging(input: ClinicalEvidencePackagingInput): ClinicalEvidencePackaging {
  const combined = clean([input.explicitTopic, input.title, input.sourceText].filter(Boolean).join(" "));
  const clinicalTopic = extractClinicalTopic(combined, fallbackTopic(input));
  const primaryEntity = input.studyNames?.map(clean).find(Boolean);
  const hook = resolveOutcomeHook(input, primaryEntity, clinicalTopic);
  const entityPrefix = primaryEntity && !hook.toLowerCase().includes(primaryEntity.toLowerCase())
    ? primaryEntity + " - "
    : "";
  const youtubeTitle = truncateAtWord(clinicalTopic + ": " + entityPrefix + hook, 100);
  return {
    clinicalTopic,
    specialtyLabel: resolveSpecialtyLabel(input.specialty),
    primaryEntity,
    outcomeHook: hook,
    youtubeTitle,
    thumbnailHook: truncateAtWord(hook, 58),
    thumbnailEntity: primaryEntity ? truncateAtWord(primaryEntity, 34) : undefined
  };
}

