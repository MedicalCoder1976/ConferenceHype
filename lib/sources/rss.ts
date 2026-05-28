import { XMLParser } from "fast-xml-parser";
import { monitoredXVoices } from "@/lib/sources/registry";
import type { IngestedItem, SourceConfig } from "@/lib/types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ""
});

export async function fetchRssSource(source: SourceConfig): Promise<IngestedItem[]> {
  const response = await fetch(source.url, {
    headers: {
      "User-Agent": "ASCOHypeBot/0.1 reporter-style conference coverage"
    },
    next: { revalidate: 900 }
  });
  if (!response.ok) {
    throw new Error(`RSS fetch failed for ${source.name}: ${response.status}`);
  }

  const xml = await response.text();
  const parsed = parser.parse(xml);
  const rawItems = parsed.rss?.channel?.item ?? parsed.feed?.entry ?? [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  // Attribute items to the matching monitored X voice handle so they
  // count in the social voice leaderboard even when the X API is unavailable.
  const matchingVoice = monitoredXVoices.find(
    (v) => v.label.toLowerCase() === source.name.toLowerCase()
  );
  const author = matchingVoice?.handle;

  return items.slice(0, 15).map((item, index) => ({
    id: `${source.id}-${index}-${item.guid?.["#text"] ?? item.link ?? item.title}`,
    title: String(item.title?.["#text"] ?? item.title ?? "Untitled item"),
    url: String(item.link?.href ?? item.link ?? source.url),
    excerpt: String(item.description ?? item.summary ?? item.content ?? "").slice(0, 700),
    sourceName: source.name,
    sourceType: source.type,
    rank: source.rank,
    publishedAt: item.pubDate ?? item.updated,
    author
  }));
}
