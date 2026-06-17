import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  processEntities: false
});

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
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
  const response = await fetch(url, {
    headers: {
      "User-Agent": "ConferenceHypeBot/0.1 PubMed abstract summaries"
    }
  });
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
  const response = await fetch(url, {
    headers: {
      "User-Agent": "ConferenceHypeBot/0.1 PubMed abstract summaries"
    }
  });
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

async function pubmedFetch(ids: string[]) {
  if (!ids.length) {
    return [];
  }
  const url = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi");
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("retmode", "xml");
  url.searchParams.set("id", ids.join(","));
  const response = await fetch(url, {
    headers: {
      "User-Agent": "ConferenceHypeBot/0.1 PubMed abstract summaries"
    }
  });
  if (!response.ok) {
    return [];
  }
  const xml = await response.text();
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
        url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : ""
      };
    })
    .filter((entry) => entry.pmid && entry.abstract);
}

export async function fetchPubMedAbstractByTitle(title: string) {
  try {
    let ids = await pubmedSearch(title);
    if (ids.length === 0) {
      ids = await pubmedSearch(title, false);
    }
    const articles = await pubmedFetch(ids);
    const normalizedTarget = normalizeTitle(titleQuery(title));
    return (
      articles.find((article) => normalizeTitle(article.title) === normalizedTarget) ??
      articles[0] ??
      null
    );
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
