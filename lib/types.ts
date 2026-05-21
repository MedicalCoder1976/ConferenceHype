export type ContentType =
  | "agenda_preview"
  | "abstract_buzz"
  | "media_roundup"
  | "social_signal"
  | "industry_floor"
  | "market_watch"
  | "patient_lens"
  | "hype_clip";

export type SourceType =
  | "official"
  | "media"
  | "company"
  | "verified_social"
  | "general_social"
  | "manual";

export type HypeLevel = "restrained" | "standard" | "high_energy";

export type Persona = {
  id: string;
  name: string;
  specialty: string;
  voiceGender: "female" | "male";
  voiceEnvKey: string;
  style: string;
};

export type Citation = {
  label: string;
  url: string;
  sourceType: SourceType;
};

export type Segment = {
  id: string;
  title: string;
  summary: string;
  script: string;
  contentType: ContentType;
  personaId: string;
  personaName: string;
  hypeLevel: HypeLevel;
  language: string;
  status: "draft" | "pending_review" | "approved" | "rejected" | "rendered";
  citations: Citation[];
  socialBuzzItems: Citation[];
  riskFlags: string[];
  confidenceScore: number;
  createdAt: string;
};

export type StreamState = {
  mode: "youtube_primary" | "hls_fallback" | "preview";
  emergencyActive: boolean;
  emergencyMessage: string;
  currentSegmentId?: string;
};

export type SourceConfig = {
  id: string;
  name: string;
  url: string;
  type: SourceType;
  rank: number;
  enabled: boolean;
};

export type AnalyticsSnapshot = {
  views: number;
  clipsCreated: number;
  pendingReview: number;
};

export type IngestedItem = {
  id: string;
  title: string;
  url: string;
  excerpt: string;
  sourceName: string;
  sourceType: SourceType;
  rank: number;
  publishedAt?: string;
  author?: string;
  engagementScore?: number;
};

export type SocialVoiceLeader = {
  label: string;
  handle: string;
  note: string;
  score: number;
  mentions: number;
  momentum: "rising" | "steady" | "new";
  lastSeen?: string;
};
