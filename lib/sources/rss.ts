import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { XMLParser } from "fast-xml-parser";
import { monitoredXVoices } from "@/lib/sources/registry";
import { fetchPubMedAbstract } from "@/lib/sources/pubmed";
import type { IngestedItem, SourceConfig } from "@/lib/types";

const execFileAsync = promisify(execFile);
const RSS_USER_AGENT = "Mozilla/5.0 ConferenceHype RSS verifier";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  processEntities: false
});

export function isRssSource(source: SourceConfig) {
  return (
    source.id.startsWith("daily-journal-") ||
    /(?:rss|feed|atom|showFeed|\.xml(?:$|\?))/i.test(source.url)
  );
}

function scalar(value: unknown) {
  if (value && typeof value === "object" && "#text" in value) {
    return String((value as { "#text": unknown })["#text"]);
  }
  if (value && typeof value === "object") {
    const nested = Object.values(value as Record<string, unknown>)[0];
    return scalar(nested);
  }
  return value == null ? "" : String(value);
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&ndash;|&#8211;/gi, "-")
    .replace(/&mdash;|&#8212;/gi, "-")
    .replace(/&quot;|&#8220;|&#8221;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToText(value: string) {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function isJournalSource(source: SourceConfig) {
  return (
    source.id.startsWith("daily-journal-") ||
    /\b(journal|jama|lancet|nejm|nature|annals|leukemia|bmj|blood cancer)\b/i.test(
      source.name
    )
  );
}

function extractSection(text: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(
      `\\b${label}\\b\\s*[:.]?\\s+([\\s\\S]{80,900}?)(?=\\b(?:Abstract|Importance|Objective|Purpose|Background|Methods|Design|Patients|Results|Findings|Conclusions?|Discussion|Introduction|Funding|Trial Registration)\\b\\s*[:.]?|$)`,
      "i"
    );
    const match = text.match(pattern)?.[1]?.trim();
    if (match) {
      return match.replace(/\s+/g, " ");
    }
  }
  return "";
}

export async function fetchJournalArticleAbstract(url: string) {
  if (!/^https?:\/\//i.test(url)) {
    return "";
  }
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": RSS_USER_AGENT
      },
      next: { revalidate: 3600 }
    });
    if (!response.ok) {
      return "";
    }
    const html = await response.text();
    const metaAbstract =
      html.match(/<meta[^>]+name=["'](?:description|dc\.Description|citation_abstract)["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["'](?:description|dc\.Description|citation_abstract)["']/i)?.[1] ??
      "";
    const text = htmlToText(html);
    const abstract = extractSection(text, ["Abstract", "Importance", "Background"]);
    const methods = extractSection(text, ["Methods", "Design", "Patients"]);
    const results = extractSection(text, ["Results", "Findings"]);
    const discussion = extractSection(text, ["Discussion", "Conclusions", "Conclusion"]);
    const parts = [
      abstract ? `Abstract: ${abstract}` : "",
      methods ? `Methods: ${methods}` : "",
      results ? `Results: ${results}` : "",
      discussion ? `Discussion: ${discussion}` : ""
    ].filter(Boolean);
    return parts.length ? parts.join(" ") : htmlToText(metaAbstract);
  } catch {
    return "";
  }
}

function appendCookie(existing: string, setCookie: string) {
  const cookiePair = setCookie.split(";")[0]?.trim();
  if (!cookiePair) {
    return existing;
  }
  return existing ? `${existing}; ${cookiePair}` : cookiePair;
}

function responseSetCookies(headers: Headers) {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  const cookies = withGetSetCookie.getSetCookie?.();
  if (cookies?.length) {
    return cookies;
  }
  const singleCookie = headers.get("set-cookie");
  return singleCookie ? [singleCookie] : [];
}

async function fetchWithCurl(url: string) {
  const command = process.platform === "win32" ? "curl.exe" : "curl";
  const { stdout } = await execFileAsync(command, [
    "--location",
    "--fail",
    "--silent",
    "--show-error",
    "--max-time",
    "30",
    "-A",
    RSS_USER_AGENT,
    url
  ], { maxBuffer: 5 * 1024 * 1024 });
  return stdout;
}

function looksLikeXmlFeed(value: string) {
  return /<(?:rss|feed|rdf:RDF)\b/i.test(value.slice(0, 500));
}

function isNatureFeedUrl(url: string) {
  return /(?:^https?:\/\/feeds\.nature\.com\/|^https?:\/\/www\.nature\.com\/[^\s]+\.rss)/i.test(url);
}

async function fetchRssText(url: string, sourceName: string) {
  let currentUrl = url;
  let cookie = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await fetch(currentUrl, {
      headers: {
        "User-Agent": RSS_USER_AGENT,
        Accept: "application/rss+xml, application/xml, text/xml, */*",
        ...(cookie ? { Cookie: cookie } : {})
      },
      redirect: "manual",
      next: { revalidate: 900 }
    });

    for (const setCookie of responseSetCookies(response.headers)) {
      cookie = appendCookie(cookie, setCookie);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error(`RSS fetch failed for ${sourceName}: redirect without location.`);
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!response.ok) {
      try {
        const curlText = await fetchWithCurl(currentUrl);
        if (looksLikeXmlFeed(curlText)) {
          return curlText;
        }
      } catch {
        // Fall through to the explicit status error below.
      }
      throw new Error(`RSS fetch failed for ${sourceName}: ${response.status}`);
    }
    const text = await response.text();
    if (looksLikeXmlFeed(text)) {
      return text;
    }
    if (isNatureFeedUrl(url)) {
      const curlText = await fetchWithCurl(url);
      if (looksLikeXmlFeed(curlText)) {
        return curlText;
      }
    }
    return text;
  }
  throw new Error(`RSS fetch failed for ${sourceName}: too many redirects.`);
}

export async function fetchRssSource(source: SourceConfig): Promise<IngestedItem[]> {
  const xml = await fetchRssText(source.url, source.name);
  const parsed = parser.parse(xml);
  const rawItems =
    parsed.rss?.channel?.item ??
    parsed.feed?.entry ??
    parsed["rdf:RDF"]?.item ??
    [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];
  if (items.length === 0) {
    throw new Error(`RSS feed returned no entries for ${source.name}.`);
  }

  // Attribute items to the matching monitored X voice handle so they
  // count in the social voice leaderboard even when the X API is unavailable.
  const matchingVoice = monitoredXVoices.find(
    (v) => v.label.toLowerCase() === source.name.toLowerCase()
  );
  const author = matchingVoice?.handle;

  return Promise.all(
    items.slice(0, 15).map(async (item, index) => {
      const url = scalar(item.link?.href ?? item.link ?? source.url);
      const feedExcerpt = scalar(
        item.description ??
        item.summary ??
        item.content ??
        item["content:encoded"] ??
        ""
      );
      const articleAbstract = isJournalSource(source)
        ? (await fetchPubMedAbstract({ title: scalar(item.title || ""), url }))?.abstract ??
          await fetchJournalArticleAbstract(url)
        : "";
      return {
        id: `${source.id}-${index}-${item.guid?.["#text"] ?? item.link ?? item.title}`,
        sourceId: source.id,
        title: scalar(item.title || "Untitled item"),
        url,
        excerpt: htmlToText(articleAbstract || feedExcerpt).slice(0, 2200),
        sourceName: source.name,
        sourceType: source.type,
        rank: source.rank,
        publishedAt: scalar(item.pubDate ?? item.updated ?? item["dc:date"]) || undefined,
        author
      };
    })
  );
}
