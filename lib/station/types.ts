import type { BroadcastWriteoutCard } from "@/lib/types";

export type StationScheduleStatus =
  | "draft"
  | "building"
  | "verified"
  | "active"
  | "failed"
  | "superseded";

export type StationProgram = {
  id: string;
  scheduleId: string;
  position: number;
  specialty: string;
  journalId?: string;
  journalName: string;
  programType: "new" | "journal_replay" | "specialty_replay" | "fallback";
  sourceProgramId?: string;
  startsAtOffsetMinutes: number;
  durationMinutes: 30;
  status: "planned" | "reserved" | "rendering" | "uploaded" | "verified" | "failed";
  youtubeVideoId?: string;
  youtubeUrl?: string;
  title?: string;
  description?: string;
  tags: string[];
  cardIds: string[];
  writeoutCards: BroadcastWriteoutCard[];
  renderChecksum?: string;
  failureReason?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
};

export type StationDailySchedule = {
  id: string;
  scheduleDate: string;
  timezone: string;
  status: StationScheduleStatus;
  cycleStartMinutes: number;
  verificationSummary: Record<string, unknown>;
  previousScheduleId?: string;
  activatedAt?: string;
  createdAt: string;
  updatedAt: string;
  programs: StationProgram[];
};

export type StationBreakIn = {
  id: string;
  targetAt: string;
  placement: "top" | "bottom";
  durationMinutes: 15;
  title: string;
  summary: string;
  script: string;
  specialty?: string;
  sourceLabel: string;
  sourceUrl: string;
  segmentId?: string;
  status: "approved" | "rendering" | "verified" | "failed" | "cancelled";
  youtubeVideoId?: string;
  youtubeUrl?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
};
