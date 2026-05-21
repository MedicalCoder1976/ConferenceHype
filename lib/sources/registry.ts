import type { SourceConfig } from "@/lib/types";

export const monitoredSocialTags = {
  primaryHashtag: "#ASCOHype",
  secondaryHashtag: "#AskASCOHype",
  conferenceHashtag: "#ASCO26",
  botHandle: "@ASCOHypeAI"
};

export const monitoredXVoices = [
  {
    label: "ASCO",
    handle: "@ASCO",
    note: "official meeting and society signal"
  },
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
    label: "STAT",
    handle: "@statnews",
    note: "health and medicine media signal"
  }
];

export const sourceRegistry: SourceConfig[] = [
  {
    id: "asco-calendar",
    name: "ASCO meeting calendar",
    url: "https://meetings.asco.org/",
    type: "official",
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
    id: "asco-hype-tags",
    name: "Audience tags and X voices",
    url: `${monitoredSocialTags.primaryHashtag} ${monitoredSocialTags.secondaryHashtag} ${monitoredSocialTags.conferenceHashtag} ${monitoredSocialTags.botHandle} ${monitoredXVoices.map((voice) => voice.handle).join(" ")}`,
    type: "general_social",
    rank: 5,
    enabled: true
  },
  {
    id: "manual-instagram-social-watch",
    name: "Operator Instagram and social watchlist",
    url: "manual://instagram-social-watchlist",
    type: "manual",
    rank: 5,
    enabled: false
  }
];
