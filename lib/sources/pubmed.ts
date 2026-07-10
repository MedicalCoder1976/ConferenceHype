import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ""
});

// fast-xml-parser does not preserve document order for mixed content by
// default, so inline formatting tags (PubMed commonly uses <sup>/<sub> for
// units like "mg kg<sup>-1</sup>") can lose their surrounding whitespace --
// e.g. "...mg kg<sup>-1</sup> were..." becomes "...mg kgwere...". Stripping
// these tags before parsing (keeping their text content inline) avoids that
// entirely without needing a full mixed-content rewrite.
function stripInlineFormattingTags(xml: string) {
  return xml.replace(/<\/?(?:sup|sub|i|b|u)>/gi, "");
}

// fast-xml-parser's entity processing only covers the 5 predefined XML
// entities, not numeric character references -- PubMed XML is full of those
// (e.g. &#x2264; for "≤", &#x2009; for a thin space), which were otherwise
// left as literal "&#x...;" text straight through to broadcast.
function decodeNumericEntities(value: string) {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, dec: string) => String.fromCodePoint(parseInt(dec, 10)));
}

function clean(value: string) {
  return decodeNumericEntities(value)
    .replace(/\s+/g, " ")
    // PubMed abstracts use a middle dot in place of a decimal point between
    // digits (e.g. "1·8 years"); left alone, a later broadcast-cleaning pass
    // treats "·" as a bullet and splits it into a false sentence break.
    .replace(/(\d)\s*·\s*(\d)/g, "$1.$2")
    .trim();
}

// NCBI E-utils caps unauthenticated callers at ~3 requests/second. A single
// weekly batch run can fire dozens of these back to back (each journal item
// needs 1-3 calls), and a 429 was previously indistinguishable from "no
// PubMed record" -- silently dropping real, available abstracts. Serialize
// every call through this minimum gap and retry once after a 429.
//
// The gap alone is not enough when callers overlap: intake-cards/hour
// enriches every matched item via `Promise.all`, so a whole batch of items
// call ncbiFetch at once. A naive "read last-call timestamp, compute wait,
// then set timestamp" check is not atomic across concurrent async calls --
// every concurrent invocation reads the same stale `ncbiLastCallAt` before
// any of them updates it, so they all compute the same wait and still fire
// in a burst. That burst gets 429'd by NCBI almost in full (confirmed
// empirically: 16/30 items enriched when run one at a time vs. 0/30 when run
// through `Promise.all` like the real route does), which is exactly the
// "429 mistaken for no PubMed record" failure this throttle exists to
// prevent -- it just didn't hold up under concurrent load. Chaining every
// call onto a single queue promise forces genuine one-at-a-time execution
// regardless of how many callers start at once.
let ncbiLastCallAt = 0;
const NCBI_MIN_INTERVAL_MS = 350;
let ncbiQueue: Promise<void> = Promise.resolve();

function ncbiFetch(url: URL): Promise<Response> {
  const task = ncbiQueue.then(() => ncbiFetchSerialized(url));
  // Keep the queue alive even if this call ends up rejecting/erroring --
  // otherwise one failed request would wedge every call queued behind it.
  ncbiQueue = task.then(
    () => undefined,
    () => undefined
  );
  return task;
}

async function ncbiFetchSerialized(url: URL): Promise<Response> {
  const wait = ncbiLastCallAt + NCBI_MIN_INTERVAL_MS - Date.now();
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  ncbiLastCallAt = Date.now();
  const headers = { "User-Agent": "ConferenceHypeBot/0.1 PubMed abstract summaries" };
  const response = await fetch(url, { headers });
  if (response.status !== 429) {
    return response;
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
  ncbiLastCallAt = Date.now();
  return fetch(url, { headers });
}

function scalar(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(scalar).filter(Boolean).join(" ");
  }
  if (typeof value === "object" && "#text" in value) {
    return scalar((value as { "#text": unknown })["#text"]);
  }
  return Object.values(value as Record<string, unknown>).map(scalar).filter(Boolean).join(" ");
}

function normalizeTitle(value: string) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleQuery(title: string) {
  return clean(title)
    .replace(/^One-hour batch\s+.*?UTC:\s*/i, "")
    // RSS category tags (e.g. "[Articles]", "[Review]", "[Comment]") are
    // feed-only labels, never part of the PubMed-indexed title -- leaving
    // one in both breaks the search query and, worse, breaks the exact-title
    // match check below against a query that otherwise matches.
    .replace(/^\[[^\]]{1,40}\]\s*/, "")
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ");
}

async function pubmedSearch(title: string, strictTitle = true) {
  const query = strictTitle ? `${titleQuery(title)}[Title]` : titleQuery(title);
  const url = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi");
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("retmode", "json");
  url.searchParams.set("retmax", "5");
  url.searchParams.set("sort", "relevance");
  url.searchParams.set("term", query);
  const response = await ncbiFetch(url);
  if (!response.ok) {
    return [];
  }
  const payload = (await response.json()) as {
    esearchresult?: {
      idlist?: string[];
    };
  };
  return payload.esearchresult?.idlist ?? [];
}

async function pubmedSearchByDoi(doi: string) {
  const url = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi");
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("retmode", "json");
  url.searchParams.set("retmax", "5");
  url.searchParams.set("term", `${doi}[AID]`);
  const response = await ncbiFetch(url);
  if (!response.ok) {
    return [];
  }
  const payload = (await response.json()) as {
    esearchresult?: {
      idlist?: string[];
    };
  };
  return payload.esearchresult?.idlist ?? [];
}

export function doiFromUrl(value: string) {
  return (
    value.match(/\b10\.\d{4,9}\/[^\s?#]+/i)?.[0]?.replace(/[).,;]+$/g, "") ?? ""
  );
}

function pmidFromUrl(value: string) {
  return value.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i)?.[1] ?? "";
}

function abstractParts(article: Record<string, unknown>) {
  const abstractText = (article.Abstract as Record<string, unknown> | undefined)?.AbstractText;
  const parts = Array.isArray(abstractText)
    ? abstractText
    : abstractText
      ? [abstractText]
      : [];

  return parts
    .map((part) => {
      if (typeof part === "object" && part) {
        const label = clean(String((part as Record<string, unknown>).Label ?? ""));
        const text = clean(scalar(part));
        return label ? `${label}: ${text}` : text;
      }
      return clean(scalar(part));
    })
    .filter(Boolean);
}

function articleTitle(article: Record<string, unknown>) {
  return clean(scalar(article.ArticleTitle));
}

function articlePubDate(article: Record<string, unknown>) {
  const pubDate = (
    (article.Journal as Record<string, unknown> | undefined)?.JournalIssue as
      | Record<string, unknown>
      | undefined
  )?.PubDate as Record<string, unknown> | undefined;
  if (!pubDate) return undefined;
  const medlineDate = clean(scalar(pubDate.MedlineDate ?? ""));
  if (medlineDate) return medlineDate;
  const year = clean(scalar(pubDate.Year ?? ""));
  if (!year) return undefined;
  const month = clean(scalar(pubDate.Month ?? ""));
  const day = clean(scalar(pubDate.Day ?? ""));
  return [year, month, day].filter(Boolean).join(" ");
}

async function pubmedFetch(ids: string[]) {
  if (!ids.length) {
    return [];
  }
  const url = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi");
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("retmode", "xml");
  url.searchParams.set("id", ids.join(","));
  const response = await ncbiFetch(url);
  if (!response.ok) {
    return [];
  }
  const xml = stripInlineFormattingTags(await response.text());
  const parsed = parser.parse(xml);
  const rawArticles = parsed.PubmedArticleSet?.PubmedArticle ?? [];
  const articles = Array.isArray(rawArticles) ? rawArticles : [rawArticles];
  return articles
    .map((entry) => {
      const citation = entry?.MedlineCitation ?? {};
      const article = citation.Article ?? {};
      const title = articleTitle(article);
      const pmid = clean(scalar(citation.PMID));
      const parts = abstractParts(article);
      return {
        pmid,
        title,
        abstract: parts.join(" "),
        url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : "",
        publishedAt: articlePubDate(article)
      };
    })
    .filter((entry) => entry.pmid && entry.abstract);
}

// Direct journal lookup, used as a fallback when a journal's own RSS feed
// can't be reached (e.g. a publisher blocking the GitHub Actions IP range)
// -- not a title/DOI match against a known article, but a genuine search for
// that journal's own recent output via NCBI's [Journal] field, restricted to
// the last ~90 days so it behaves like "the latest issue" rather than
// returning the journal's entire back catalog.
async function pubmedSearchByJournal(journalName: string, retmax: number) {
  const url = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi");
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("retmode", "json");
  url.searchParams.set("retmax", String(retmax));
  url.searchParams.set("sort", "pub+date");
  url.searchParams.set("datetype", "pdat");
  url.searchParams.set("reldate", "90");
  url.searchParams.set("term", `"${clean(journalName)}"[Journal]`);
  const response = await ncbiFetch(url);
  if (!response.ok) {
    return [];
  }
  const payload = (await response.json()) as {
    esearchresult?: {
      idlist?: string[];
    };
  };
  return payload.esearchresult?.idlist ?? [];
}

export async function fetchPubMedArticlesForJournal(journalName: string, retmax = 15) {
  try {
    const ids = await pubmedSearchByJournal(journalName, retmax);
    return await pubmedFetch(ids);
  } catch {
    return [];
  }
}

export async function fetchPubMedAbstractByTitle(title: string) {
  try {
    let ids = await pubmedSearch(title);
    if (ids.length === 0) {
      ids = await pubmedSearch(title, false);
    }
    const articles = await pubmedFetch(ids);
    const normalizedTarget = normalizeTitle(titleQuery(title));
    // The non-strict fallback search drops the [Title] field restriction and
    // ranks by relevance across all fields -- for short or generic titles
    // (editorials, comments, perspectives) that reliably surfaces an
    // unrelated top hit. Only accept an exact normalized-title match; a
    // "best guess" would misattribute a wrong article's abstract to this
    // source, which is worse than finding no match at all.
    return articles.find((article) => normalizeTitle(article.title) === normalizedTarget) ?? null;
  } catch {
    return null;
  }
}

export async function fetchPubMedAbstract({
  title,
  url
}: {
  title: string;
  url?: string;
}) {
  try {
    const pmid = url ? pmidFromUrl(url) : "";
    if (pmid) {
      const byPmid = await pubmedFetch([pmid]);
      if (byPmid[0]) {
        return byPmid[0];
      }
    }
    const doi = url ? doiFromUrl(url) : "";
    if (doi) {
      const byDoi = await pubmedFetch(await pubmedSearchByDoi(doi));
      if (byDoi[0]) {
        return byDoi[0];
      }
    }
    return fetchPubMedAbstractByTitle(title);
  } catch {
    return null;
  }
}
