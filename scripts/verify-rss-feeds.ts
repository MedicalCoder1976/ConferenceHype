import { oncologyJournalSeeds } from "@/lib/catalog/oncologyJournalSeeds";
import { fetchRssSource } from "@/lib/sources/rss";

async function main() {
  const results = await Promise.all(
    oncologyJournalSeeds.map(async (journal, index) => {
      try {
        const items = await fetchRssSource({
          id: `rss-check-${index}`,
          name: journal.name,
          url: journal.rssUrl,
          type: "media",
          rank: 1,
          enabled: true
        });
        return { journal: journal.name, ok: true, entries: items.length };
      } catch (error) {
        return { journal: journal.name, ok: false, error: String(error) };
      }
    })
  );

  console.table(results);
  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    throw new Error(`${failed.length} journal RSS feed(s) failed verification.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
