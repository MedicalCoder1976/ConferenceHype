import type { SourceConfig } from "@/lib/types";

export type XVoice = {
  label: string;
  handle: string;
  note: string;
};

export const monitoredSocialTags = {
  primaryHashtag: "#ASCOHype",
  secondaryHashtag: "#AskASCOHype",
  conferenceHashtag: "#ASCO26",
  conferenceYearHashtag: "#ASCO2026",
  botHandle: "@ASCOHypeAI",
  conferenceHypeHandle: "@ConferenceHype",
  instagramPrimaryHashtag: "#ASCOHype",
  instagramConferenceHashtag: "#ASCO26",
  instagramConferenceHypeHandle: "@ConferenceHype"
};

export const monitoredXVoices: XVoice[] = [
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
  },
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
      "Ask viewers to tag #ASCOHype, #ASCO26, #ASCO2026, and @ConferenceHype on Instagram only with source-attributed articles, official schedule items, media links, or monitored X voice callouts."
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
      "Ask viewers to tag #ASCOHype and @ConferenceHype on Instagram when media links, official sources, or monitored X voice callouts deserve operator review."
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
