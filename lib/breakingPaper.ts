const DISEASE_LABELS: Array<[string, RegExp]> = [
  ["Breast Cancer", /\bbreast (?:cancer|carcinoma|tumou?r)\b/i],
  ["Lung Cancer", /\b(?:lung cancer|non-small cell lung|small cell lung|NSCLC|SCLC)\b/i],
  ["Prostate Cancer", /\bprostate (?:cancer|carcinoma|tumou?r)\b/i],
  ["Colorectal Cancer", /\b(?:colorectal|colon|rectal) (?:cancer|carcinoma|tumou?r)\b/i],
  ["Blood Cancer", /\b(?:leukemia|lymphoma|myeloma|myelodysplastic)\b/i],
  ["Cardiovascular Disease", /\b(?:cardiovascular|heart failure|myocardial|coronary|atrial fibrillation)\b/i],
  ["Neurologic Disease", /\b(?:alzheimer|parkinson|multiple sclerosis|epilepsy|stroke|neurologic)\b/i],
  ["Infectious Disease", /\b(?:infection|infectious|COVID-19|SARS-CoV-2|influenza|HIV)\b/i],
  ["Diabetes", /\bdiabet(?:es|ic)\b/i],
  ["Kidney Disease", /\b(?:kidney|renal) (?:disease|failure|injury)\b/i],
  ["Liver Disease", /\b(?:liver|hepatic) (?:disease|failure|injury|cancer)\b/i],
  ["Psychiatry", /\b(?:depression|schizophrenia|bipolar|psychiatr|mental health)\b/i]
];

function decodeHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;|&#38;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;|&#60;/gi, "<")
    .replace(/&gt;|&#62;/gi, ">").replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ").trim();
}

function meta(html: string, names: string[]) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const pattern of [
      new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`, "i")
    ]) {
      const match = html.match(pattern);
      if (match?.[1]) return decodeHtml(match[1]);
    }
  }
  return "";
}

function section(abstract: string, label: string, nextLabels: string[]) {
  const stop = nextLabels.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = abstract.match(new RegExp(`${label}\\s*:?\\s*([\\s\\S]*?)(?=${stop ? `\\b(?:${stop})\\b\\s*:?` : "$"})`, "i"));
  return match?.[1]?.trim() ?? "";
}

function concise(value: string, max = 1600) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function assertSafePaperUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Use a public HTTPS paper link.");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || hostname === "0.0.0.0" || hostname === "::1" ||
    /^127\./.test(hostname) || /^10\./.test(hostname) || /^192\.168\./.test(hostname) || /^169\.254\./.test(hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) {
    throw new Error("Private or local network links are not allowed.");
  }
  return url;
}

export function parsePaperHtml(html: string, sourceUrl: string) {
  const title = meta(html, ["citation_title", "dc.title", "og:title", "twitter:title"]) || decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const abstract = meta(html, ["citation_abstract", "dc.description", "description", "og:description"]);
  const journal = meta(html, ["citation_journal_title", "prism.publicationName", "citation_conference_title"]) || new URL(sourceUrl).hostname.replace(/^www\./, "");
  if (title.length < 8) throw new Error("The paper title could not be extracted from that link.");
  if (abstract.length < 80) throw new Error("A substantive abstract could not be extracted. Use a PubMed or publisher article page with an abstract.");
  const diseaseType = DISEASE_LABELS.find(([, pattern]) => pattern.test(`${title} ${abstract}`))?.[0] ?? "Clinical Medicine";
  const background = section(abstract, "Background", ["Objective", "Methods", "Results", "Conclusions?", "Discussion"]);
  const methods = section(abstract, "Methods", ["Results", "Conclusions?", "Discussion"]);
  const results = section(abstract, "Results", ["Conclusions?", "Discussion"]);
  const discussion = section(abstract, "Discussion", ["Conclusions?"]) || section(abstract, "Conclusions?", []);
  const summary = concise(abstract, 1200);
  const script = [
    "Good morning, wherever you are. This is Echo Sage from ConferenceHype.", "Physician Education: Breaking Paper.",
    `Our segment will focus on ${title}, concerning ${diseaseType}.`, `The source is ${journal}.`,
    `Background: ${background || summary}`,
    `Methods: ${methods || "The paper's reported study design and analysis are described in the linked source."}`,
    `Results: ${results || summary}`,
    `Discussion: ${discussion || "Interpret the reported findings in the context, limitations, and conclusions provided by the authors."}`,
    "This broadcast is educational and source-grounded. Review the linked paper before changing clinical practice.",
    "Tag us on X @conferencehype."
  ].join("\n\n");
  return { title: concise(title, 180), abstract: summary, journal: concise(journal, 180), diseaseType, script: concise(script, 7900) };
}

export function parsePubMedXml(xml: string, sourceUrl: string) {
  const title = decodeHtml(xml.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/i)?.[1] ?? "");
  const journal = decodeHtml(xml.match(/<Journal>[\s\S]*?<Title>([\s\S]*?)<\/Title>/i)?.[1] ?? "PubMed");
  const abstractParts = [...xml.matchAll(/<AbstractText(?:\s+Label="([^"]+)")?[^>]*>([\s\S]*?)<\/AbstractText>/gi)]
    .map((match) => `${match[1] ? `${decodeHtml(match[1])}: ` : ""}${decodeHtml(match[2])}`);
  const syntheticHtml = `<meta name="citation_title" content="${title.replaceAll('"', '&quot;')}"><meta name="citation_journal_title" content="${journal.replaceAll('"', '&quot;')}"><meta name="citation_abstract" content="${abstractParts.join(" ").replaceAll('"', '&quot;')}">`;
  return parsePaperHtml(syntheticHtml, sourceUrl);
}
export async function fetchBreakingPaper(sourceUrl: string) {
  const url = assertSafePaperUrl(sourceUrl);
  const pubmedId = url.hostname.toLowerCase() === "pubmed.ncbi.nlm.nih.gov" ? url.pathname.match(/^\/(\d+)\/?/)?.[1] : undefined;
  if (pubmedId) {
    const xmlResponse = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pubmedId}&retmode=xml`, {
      signal: AbortSignal.timeout(15_000),
      headers: { "user-agent": "ConferenceHype/1.0 (+https://conferencehype.com)" }
    });
    if (!xmlResponse.ok) throw new Error(`PubMed returned HTTP ${xmlResponse.status}.`);
    return parsePubMedXml(await xmlResponse.text(), sourceUrl);
  }
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000), headers: { "user-agent": "ConferenceHype/1.0 (+https://conferencehype.com)" } });
  if (!response.ok) throw new Error(`The paper page returned HTTP ${response.status}.`);
  assertSafePaperUrl(response.url);
  if (!(response.headers.get("content-type") ?? "").includes("text/html")) throw new Error("The link must open an HTML paper or PubMed page.");
  const html = await response.text();
  if (html.length > 5_000_000) throw new Error("The paper page is too large to process safely.");
  return parsePaperHtml(html, response.url);
}
