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
  youtubeVideoId?: string;
  youtubeUrl?: string;
  youtubeStatus?: ConferenceCoverageSlot["youtubeStatus"];
  continuousEnabled?: boolean;
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
  approvalStatus: "draft" | "approved" | "rejected";
  approvedAt?: string;
  approvalScope?: "slot" | "day" | "week";
  youtubeStatus:
    | "not_scheduled"
    | "queued"
    | "rendering"
    | "live"
    | "completed"
    | "failed";
  youtubeVideoId?: string;
  youtubeUrl?: string;
  workflowRunId?: string;
  workflowUrl?: string;
  streamStartedAt?: string;
  streamEndedAt?: string;
  deliveryError?: string;
  updatedAt?: string;
};

export type BroadcastWriteoutCard = {
  position: number;
  startsAt: string;
  durationSeconds: number;
  kind: "content" | "music";
  title: string;
  personaName?: string;
  contentType?: ContentType;
  script?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  riskFlags?: string[];
};

export type BroadcastWriteout = {
  id: string;
  coverageSlotId?: string;
  startsAt: string;
  durationMinutes: number;
  title: string;
  status: ConferenceCoverageSlot["youtubeStatus"];
  youtubeVideoId?: string;
  youtubeUrl?: string;
  workflowRunId?: string;
  workflowUrl?: string;
  deliveryError?: string;
  cards: BroadcastWriteoutCard[];
  writeoutMarkdown: string;
  createdAt: string;
  updatedAt: string;
};

export type PlatformSmokeRun = {
  id: string;
  attempt: number;
  attemptsAllowed: number;
  outcome: "running" | "passed" | "failed";
  conferenceName?: string;
  journalName?: string;
  sourceName?: string;
  workflowRunUrl?: string;
  errorMessage?: string;
  fixDeployedAt?: string;
  fixNotes?: string;
  startedAt: string;
  finishedAt?: string;
};

export type DailyCoverageCustomItem = {
  id: string;
  label: string;
  url?: string;
  notes?: string;
};

export type DailyCoveragePlan = {
  id?: string;
  coverageDate: string;
  conferenceIds: string[];
  journalIds: string[];
  sourceIds: string[];
  customItems: DailyCoverageCustomItem[];
  priorityTopics: string[];
  exclusions: string[];
  breakingNewsEnabled: boolean;
  notes: string;
  updatedAt?: string;
};

export type OncologyJournal = {
  id: string;
  name: string;
  abbreviation: string;
  rssUrl: string;
  officialUrl: string;
  enabled: boolean;
  lastIssueKey?: string;
  // Journal Watch specialty tab grouping -- see
  // lib/catalog/journalWatchSpecialties.ts. Optional/free string so an
  // unrecognized or missing value never breaks reads; the UI's
  // groupJournalsBySpecialty() falls back to "Others".
  specialty?: string;
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
