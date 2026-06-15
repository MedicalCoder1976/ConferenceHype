import type { SourceConfig } from "@/lib/types";

export type XVoice = {
  label: string;
  handle: string;
  note: string;
};

export const monitoredSocialTags = {
  primaryHashtag: "#ConferenceHype",
  secondaryHashtag: "#EHA2026",
  conferenceHashtag: "#EHA26",
  conferenceYearHashtag: "#EHA2026",
  botHandle: "@conferencehype",
  conferenceHypeHandle: "@conferencehype",
  instagramPrimaryHashtag: "#ConferenceHype",
  instagramConferenceHashtag: "#EHA2026",
  instagramConferenceHypeHandle: "@conferencehype"
};

export const monitoredXVoices: XVoice[] = [
  {
    label: "European Hematology Association",
    handle: "@EHA_Hematology",
    note: "official EHA2026 Congress, program, abstract, and on-site signal"
  },
  // Official ASCO channels
  {
    label: "ASCO",
    handle: "@ASCO",
    note: "official meeting and society signal"
  },
  {
    label: "ASCO University",
    handle: "@ASCOuniversity",
    note: "ASCO education and abstract signal"
  },
  {
    label: "JCO — Journal of Clinical Oncology",
    handle: "@JCO_ASCO",
    note: "ASCO flagship journal signal"
  },
  // Oncology media
  {
    label: "The ASCO Post",
    handle: "@ASCOPost",
    note: "oncology meeting media signal"
  },
  {
    label: "OncLive",
    handle: "@OncLive",
    note: "oncology media signal"
  },
  {
    label: "STAT News",
    handle: "@statnews",
    note: "health and medicine media signal"
  },
  {
    label: "Cancer Network",
    handle: "@CancerNetwork",
    note: "oncology news and conference signal"
  },
  {
    label: "Hem/Onc Today",
    handle: "@HemOncToday",
    note: "hematology and oncology news signal"
  },
  {
    label: "The Lancet Oncology",
    handle: "@TheLancetOncol",
    note: "top-tier oncology journal signal"
  },
  {
    label: "NEJM",
    handle: "@NEJM",
    note: "New England Journal signal for major trial readouts at ASCO"
  },
  // Major cancer centres
  {
    label: "MD Anderson",
    handle: "@MDAndersonNews",
    note: "MD Anderson Cancer Center ASCO signal"
  },
  {
    label: "Memorial Sloan Kettering",
    handle: "@MSKCancerCenter",
    note: "MSK ASCO signal"
  },
  {
    label: "Dana-Farber",
    handle: "@DanaFarber",
    note: "Dana-Farber Cancer Institute ASCO signal"
  },
  {
    label: "NCI",
    handle: "@NCINews",
    note: "National Cancer Institute ASCO and research signal"
  },
  // ConferenceHype own channel
  {
    label: "ConferenceHype",
    handle: "@ConferenceHype",
    note: "listener steps, workouts, end-of-day audience fuel, and ConferenceHype community signal"
  }
];

export function sourceToXVoice(source: SourceConfig): XVoice | null {
  if (
    source.type !== "general_social" ||
    !/\b(x\.com|twitter\.com)\//i.test(source.url)
  ) {
    return null;
  }
  const match = source.url.match(/\b(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})/i);
  if (!match?.[1]) {
    return null;
  }
  const label = source.name.replace(/^X follow:\s*/i, "").trim() || match[1];
  return {
    label,
    handle: `@${match[1]}`,
    note: "operator-added X follow"
  };
}

export const instagramPushPrompts = [
  {
    label: "Verified source watch",
    prompt:
      "Ask viewers to tag #ConferenceHype, #ASCO26, #ASCO2026, and @ConferenceHype on Instagram only with source-attributed articles, official schedule items, media links, or monitored X voice callouts."
  },
  {
    label: "Steps and workout watch",
    prompt:
      "Ask listeners to tag @ConferenceHype with their conference steps, walks, gym sessions, runs, and other workouts. Collect these for an end-of-day reviewed audience fitness shoutout, not medical or fitness advice."
  },
  {
    label: "W-poster watch",
    prompt:
      "Invite Instagram posts or reels from the W poster area and Hall A Posters and Exhibits. Ask viewers to check rooms and locations in the ASCO app and on-site signage."
  },
  {
    label: "Media desk callout",
    prompt:
      "Ask viewers to tag #ConferenceHype and @ConferenceHype on Instagram when media links, official sources, or monitored X voice callouts deserve operator review."
  }
];

export const sourceRegistry: SourceConfig[] = [
  {
    id: "eha-2026-abstract-library",
    name: "EHA2026 official abstract library",
    url: "https://library.ehaweb.org/eha/#!*menu=6*browseby=3*sortby=2*ce_id=2934",
    type: "official",
    rank: 1,
    enabled: true
  },
  {
    id: "eha-2026-program",
    name: "EHA2026 official program",
    url: "https://ehaweb.org/connect-network/eha2026-congress/eha2026-program",
    type: "official",
    rank: 1,
    enabled: true
  },
  {
    id: "eha-2026-onsite",
    name: "EHA2026 on-site essentials",
    url: "https://ehaweb.org/connect-network/eha2026-congress/eha2026-on-site-essentials",
    type: "official",
    rank: 1,
    enabled: true
  },
  {
    id: "eha-2026-exhibition",
    name: "EHA2026 exhibition and sponsorship information",
    url: "https://ehaweb.org/connect-network/eha2026-congress/eha2026-sponsorship-opportunities",
    type: "company",
    rank: 2,
    enabled: true
  },
  {
    id: "eha-2026-media",
    name: "EHA2026 official media information",
    url: "https://ehaweb.org/connect-network/eha2026-congress/eha2026-media-registration",
    type: "media",
    rank: 1,
    enabled: true
  },
  {
    id: "asco-calendar",
    name: "ASCO meeting calendar",
    url: "https://meetings.asco.org/",
    type: "official",
    rank: 1,
    enabled: true
  },
  {
    // ASCO Daily News — official conference daily publication.
    // The ingest job will use fetchPageSummary on the base URL.
    // If a feed URL is discovered (e.g. /feed/), update this URL so
    // fetchRssSource picks it up automatically (the job routes on "rss"/"feed" in the URL).
    id: "asco-daily-news",
    name: "ASCO Daily News",
    url: "https://dailynews.ascopubs.org/",
    type: "media",
    rank: 1,
    enabled: true
  },
  {
    id: "asco-post",
    name: "The ASCO Post",
    url: "https://ascopost.com/rss/",
    type: "media",
    rank: 2,
    enabled: true
  },
  {
    id: "onclive",
    name: "OncLive",
    url: "https://www.onclive.com/rss",
    type: "media",
    rank: 2,
    enabled: true
  },
  {
    id: "stat-news",
    name: "STAT News",
    url: "https://www.statnews.com/feed/",
    type: "media",
    rank: 2,
    enabled: true
  },
  {
    id: "nejm",
    name: "New England Journal of Medicine",
    url: "https://www.nejm.org/action/showFeed?type=etoc&feed=rss&jc=nejm",
    type: "media",
    rank: 1,
    enabled: true
  },
  {
    id: "jama",
    name: "JAMA",
    url: "https://jamanetwork.com/rss/site_3/67.xml",
    type: "media",
    rank: 1,
    enabled: true
  },
  {
    id: "nature-medicine",
    name: "Nature Medicine",
    url: "https://www.nature.com/nm.rss",
    type: "media",
    rank: 1,
    enabled: true
  },
  {
    id: "annals-oncology",
    name: "Annals of Oncology",
    url: "https://www.annalsofoncology.org/current.rss",
    type: "media",
    rank: 1,
    enabled: true
  },
  {
    id: "medpage-today",
    name: "MedPage Today",
    url: "https://www.medpagetoday.com/rss/headlines.xml",
    type: "media",
    rank: 2,
    enabled: true
  },
  {
    id: "fierce-healthcare",
    name: "Fierce Healthcare",
    url: "https://www.fiercehealthcare.com/rss/xml",
    type: "media",
    rank: 2,
    enabled: true
  },
  {
    id: "beckers-healthcare",
    name: "Becker's Healthcare",
    url: "https://www.beckershospitalreview.com/",
    type: "media",
    rank: 2,
    enabled: true
  },
  {
    id: "cancer-network",
    name: "Cancer Network",
    url: "https://www.cancernetwork.com/",
    type: "media",
    rank: 2,
    enabled: true
  },
  {
    id: "healio-hem-onc",
    name: "Healio HemOnc Today",
    url: "https://www.healio.com/news/hematology-oncology",
    type: "media",
    rank: 2,
    enabled: true
  },
  {
    id: "medscape-medical-news",
    name: "Medscape Medical News",
    url: "https://www.medscape.com/medical-news",
    type: "media",
    rank: 2,
    enabled: true
  },
  {
    id: "modern-healthcare",
    name: "Modern Healthcare",
    url: "https://www.modernhealthcare.com/",
    type: "media",
    rank: 2,
    enabled: true
  },
  {
    id: "endpoints-news",
    name: "Endpoints News",
    url: "https://endpts.com/",
    type: "media",
    rank: 2,
    enabled: true
  },
  {
    id: "fierce-biotech",
    name: "Fierce Biotech",
    url: "https://www.fiercebiotech.com/rss/xml",
    type: "media",
    rank: 2,
    enabled: true
  },
  {
    id: "biopharma-dive",
    name: "BioPharma Dive",
    url: "https://www.biopharmadive.com/feeds/news/",
    type: "media",
    rank: 2,
    enabled: true
  },
  {
    id: "ajmc",
    name: "The American Journal of Managed Care",
    url: "https://www.ajmc.com/",
    type: "media",
    rank: 2,
    enabled: true
  },
  {
    id: "conferencehype-tags",
    name: "Audience tags, X voices, and Instagram prompts",
    url: `${monitoredSocialTags.primaryHashtag} ${monitoredSocialTags.secondaryHashtag} ${monitoredSocialTags.conferenceHashtag} ${monitoredSocialTags.conferenceYearHashtag} ${monitoredSocialTags.botHandle} ${monitoredSocialTags.conferenceHypeHandle} ${monitoredSocialTags.instagramPrimaryHashtag} ${monitoredSocialTags.instagramConferenceHashtag} ${monitoredSocialTags.instagramConferenceHypeHandle} ${monitoredXVoices.map((voice) => voice.handle).join(" ")}`,
    type: "general_social",
    rank: 5,
    enabled: true
  },
  {
    id: "manual-instagram-social-watch",
    name: "Operator Instagram intake and push prep",
    url: "manual://instagram-social-watchlist",
    type: "manual",
    rank: 5,
    enabled: true
  }
];
