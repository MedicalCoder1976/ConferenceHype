import type { SourceConfig } from "@/lib/types";

export const monitoredSocialTags = {
  primaryHashtag: "#ASCOHype",
  secondaryHashtag: "#AskASCOHype",
  conferenceHashtag: "#ASCO26",
  botHandle: "@ASCOHypeAI",
  instagramPrimaryHashtag: "#ASCOHype",
  instagramConferenceHashtag: "#ASCO26"
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

export const instagramPushPrompts = [
  {
    label: "Snack and coffee watch",
    prompt:
      "Ask viewers to tag #ASCOHype and #ASCO26 on Instagram with the best snacks and coffee in the Exhibitor Hall. Treat replies as audience tips until reviewed."
  },
  {
    label: "W-poster watch",
    prompt:
      "Invite Instagram posts or reels from the W poster area and Hall A Posters and Exhibits. Ask viewers to verify rooms and locations in the ASCO app and on-site signage."
  },
  {
    label: "Media desk callout",
    prompt:
      "Ask viewers to tag #ASCOHype on Instagram when media hits, hallway interviews, or broadcast moments deserve operator review."
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
    url: `${monitoredSocialTags.primaryHashtag} ${monitoredSocialTags.secondaryHashtag} ${monitoredSocialTags.conferenceHashtag} ${monitoredSocialTags.botHandle} ${monitoredSocialTags.instagramPrimaryHashtag} ${monitoredSocialTags.instagramConferenceHashtag} ${monitoredXVoices.map((voice) => voice.handle).join(" ")}`,
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
