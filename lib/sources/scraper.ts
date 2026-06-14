import type { IngestedItem, SourceConfig } from "@/lib/types";

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

  const html = await response.text();
  const title =
    html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ??
    source.name;
  const metaDescription =
    html
      .match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]
      ?.replace(/\s+/g, " ")
      .trim();
  const pageText = Array.from(html.matchAll(/<(?:p|li|h2|h3)[^>]*>([\s\S]*?)<\/(?:p|li|h2|h3)>/gi))
    .map((match) => match[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&ndash;|&#8211;/gi, "-")
      .replace(/&mdash;|&#8212;/gi, "-")
      .replace(/&quot;|&#8220;|&#8221;/gi, "\"")
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/\s+/g, " ")
      .trim())
    .filter((value) => value.length >= 40)
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
