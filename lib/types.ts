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
  approvedAt?: string;
  updatedAt?: string;
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
  sourceId?: string;
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

export type SpecialtyXVoice = {
  id: string;
  specialty: string;
  label: string;
  handle: string;
  note: string;
  enabled: boolean;
  rank: number;
  score: number;
  lastVerifiedAt?: string;
};

export type MedicalConference = {
  id: string;
  name: string;
  acronym?: string;
  specialties: string[];
  startDate?: string;
  endDate?: string;
  month: number;
  year: number;
  city?: string;
  country?: string;
  timezone: string;
  officialUrl: string;
  enabled: boolean;
  operatorAdded: boolean;
};

export type ConferenceCoverageSlot = {
  id: string;
  conferenceId: string;
  startsAt: string;
  durationHours: number;
  enabled: boolean;
};

export type OncologyJournal = {
  id: string;
  name: string;
  abbreviation: string;
  rssUrl: string;
  officialUrl: string;
  enabled: boolean;
  lastIssueKey?: string;
};

export type EditorialPackageCard = {
  title: string;
  script: string;
  citationLabel: string;
  citationUrl: string;
  sourceType?: SourceType;
  contentType: ContentType;
  personaId: string;
};

export type EditorialPackageSection = {
  title: string;
  cards: EditorialPackageCard[];
};

export type EditorialPackage = {
  id: string;
  category: "journal_watch" | "meeting_watch";
  title: string;
  subjectName: string;
  editionKey: string;
  sourceUrl: string;
  eventDate?: string;
  introScript: string;
  sections: EditorialPackageSection[];
  status: "memory" | "scheduled";
  scheduledAt?: string;
  createdAt: string;
};
