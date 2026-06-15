import type { OncologyJournal } from "@/lib/types";

type JournalSeed = Omit<OncologyJournal, "id" | "enabled" | "lastIssueKey">;

export const oncologyJournalSeeds: JournalSeed[] = [
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
  },
  {
    name: "The New England Journal of Medicine",
    abbreviation: "NEJM",
    rssUrl: "https://www.nejm.org/action/showFeed?type=etoc&feed=rss&jc=nejm",
    officialUrl: "https://www.nejm.org/"
  },
  {
    name: "JAMA",
    abbreviation: "JAMA",
    rssUrl: "https://jamanetwork.com/rss/site_3/67.xml",
    officialUrl: "https://jamanetwork.com/journals/jama"
  },
  {
    name: "Nature Medicine",
    abbreviation: "Nature Medicine",
    rssUrl: "https://www.nature.com/nm.rss",
    officialUrl: "https://www.nature.com/nm/"
  },
  {
    name: "Nature Cancer",
    abbreviation: "Nature Cancer",
    rssUrl: "https://www.nature.com/natcancer.rss",
    officialUrl: "https://www.nature.com/natcancer/"
  },
  {
    name: "British Journal of Cancer",
    abbreviation: "BJC",
    rssUrl: "https://www.nature.com/bjc.rss",
    officialUrl: "https://www.nature.com/bjc/"
  },
  {
    name: "Leukemia",
    abbreviation: "Leukemia",
    rssUrl: "https://www.nature.com/leu.rss",
    officialUrl: "https://www.nature.com/leu/"
  },
  {
    name: "Blood Cancer Journal",
    abbreviation: "BCJ",
    rssUrl: "https://www.nature.com/bcj.rss",
    officialUrl: "https://www.nature.com/bcj/"
  },
  {
    name: "Annals of Oncology",
    abbreviation: "Annals Oncology",
    rssUrl: "https://www.annalsofoncology.org/current.rss",
    officialUrl: "https://www.annalsofoncology.org/"
  },
  {
    name: "The Lancet",
    abbreviation: "Lancet",
    rssUrl: "https://www.thelancet.com/rssfeed/lancet_current.xml",
    officialUrl: "https://www.thelancet.com/"
  }
];
