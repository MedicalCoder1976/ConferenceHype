import type { OncologyJournal } from "@/lib/types";

type JournalSeed = Omit<OncologyJournal, "id" | "enabled" | "lastIssueKey">;

export const oncologyJournalSeeds: JournalSeed[] = [
  {
    name: "Journal of Clinical Oncology",
    abbreviation: "JCO",
    rssUrl: "https://ascopubs.org/action/showFeed?type=etoc&feed=rss&jc=jco",
    officialUrl: "https://ascopubs.org/journal/jco"
  },
  {
    name: "JCO Precision Oncology",
    abbreviation: "JCO PO",
    rssUrl: "https://ascopubs.org/action/showFeed?type=etoc&feed=rss&jc=po",
    officialUrl: "https://ascopubs.org/journal/po"
  },
  {
    name: "JCO Oncology Practice",
    abbreviation: "JCO OP",
    rssUrl: "https://ascopubs.org/action/showFeed?type=etoc&feed=rss&jc=op",
    officialUrl: "https://ascopubs.org/journal/op"
  },
  {
    name: "The Lancet Oncology",
    abbreviation: "Lancet Oncology",
    rssUrl: "https://www.thelancet.com/rssfeed/lanonc_current.xml",
    officialUrl: "https://www.thelancet.com/journals/lanonc/home"
  },
  {
    name: "The Lancet Haematology",
    abbreviation: "Lancet Haematology",
    rssUrl: "https://www.thelancet.com/rssfeed/lanhae_current.xml",
    officialUrl: "https://www.thelancet.com/journals/lanhae/home"
  }
];
