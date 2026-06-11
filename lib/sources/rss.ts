import { XMLParser } from "fast-xml-parser";
import { monitoredXVoices } from "@/lib/sources/registry";
import type { IngestedItem, SourceConfig } from "@/lib/types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  processEntities: false
});

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
  const rawItems =
    parsed.rss?.channel?.item ??
    parsed.feed?.entry ??
    parsed["rdf:RDF"]?.item ??
    [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  // Attribute items to the matching monitored X voice handle so they
  // count in the social voice leaderboard even when the X API is unavailable.
  const matchingVoice = monitoredXVoices.find(
    (v) => v.label.toLowerCase() === source.name.toLowerCase()
  );
  const author = matchingVoice?.handle;

  return items.slice(0, 15).map((item, index) => ({
    id: `${source.id}-${index}-${item.guid?.["#text"] ?? item.link ?? item.title}`,
    title: scalar(item.title || "Untitled item"),
    url: scalar(item.link?.href ?? item.link ?? source.url),
    excerpt: scalar(
      item.description ??
      item.summary ??
      item.content ??
      item["content:encoded"] ??
      ""
    ).slice(0, 700),
    sourceName: source.name,
    sourceType: source.type,
    rank: source.rank,
    publishedAt: scalar(item.pubDate ?? item.updated ?? item["dc:date"]) || undefined,
    author
  }));
}
