import type { IngestedItem, SourceConfig } from "@/lib/types";

function stripUnsafeHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ");
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&ndash;|&#8211;/gi, "-")
    .replace(/&mdash;|&#8212;/gi, "-")
    .replace(/&quot;|&#8220;|&#8221;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isReadableText(value: string) {
  return (
    value.length >= 40 &&
    !/[{};]/.test(value) &&
    !/\b(?:document|window|function|const|let|var|script|addEventListener|createElement|appendChild|charset|async)\b/i.test(value)
  );
}

export async function fetchPageSummary(source: SourceConfig): Promise<IngestedItem[]> {
  const response = await fetch(source.url, {
    headers: {
      "User-Agent": "ConferenceHypeBot/0.1 source-attributed summaries"
    },
    next: { revalidate: 1800 }
  });
  if (!response.ok) {
    throw new Error(`Page fetch failed for ${source.name}: ${response.status}`);
  }

  const html = stripUnsafeHtml(await response.text());
  const title =
    decodeHtml(html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] ?? "") ||
    source.name;
  const metaDescription =
    decodeHtml(
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1] ??
        ""
    );
  const pageText = Array.from(html.matchAll(/<(?:p|li|h2|h3)[^>]*>([\s\S]*?)<\/(?:p|li|h2|h3)>/gi))
    .map((match) => match[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim())
    .map(decodeHtml)
    .filter(isReadableText)
    .slice(-12)
    .join(" ")
    .slice(0, 2400);
  const description =
    pageText ||
    metaDescription ||
    "Source page discovered by ConferenceHype.";

  return [
    {
      id: `page-${source.id}`,
      sourceId: source.id,
      title,
      url: source.url,
      excerpt: description,
      sourceName: source.name,
      sourceType: source.type,
      rank: source.rank
    }
  ];
}
