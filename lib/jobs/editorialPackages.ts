import {
  getOncologyJournalsFromDb,
  saveEditorialPackageToDb,
  updateOncologyJournalIssueKeyInDb,
  upsertAdminCatalogSeedsToDb
} from "@/lib/db";
import {
  developJournalWatchPackage,
  journalEditionKey
} from "@/lib/editorial/packages";
import { fetchRssSource } from "@/lib/sources/rss";

export async function developAutomaticJournalPackages() {
  await upsertAdminCatalogSeedsToDb();
  const journals = (await getOncologyJournalsFromDb())?.filter((journal) => journal.enabled) ?? [];
  for (const journal of journals) {
    try {
      const items = await fetchRssSource({
        id: journal.id,
        name: journal.name,
        url: journal.rssUrl,
        type: "media",
        rank: 1,
        enabled: true
      });
      const key = `${journal.id}:${journalEditionKey(items)}`;
      if (!items.length || journal.lastIssueKey === key) continue;
      const developed = await developJournalWatchPackage(journal, items);
      const saved = await saveEditorialPackageToDb(developed);
      await updateOncologyJournalIssueKeyInDb(journal.id, key);
      return saved ? [saved] : [];
    } catch (error) {
      console.warn(`Automatic Journal Watch failed for ${journal.name}: ${error}`);
    }
  }
  return [];
}
