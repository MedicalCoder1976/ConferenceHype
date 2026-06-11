import assert from "node:assert/strict";
import { formatVoiceSegment, SEGMENT_CLOSE } from "@/lib/broadcast/voiceSegment";
import { getUnsafeGeneratedSourceErrors } from "@/lib/generation/sourceSafety";
import { validateSegmentForApproval } from "@/lib/generation/validator";
import type { IngestedItem, Segment } from "@/lib/types";

const source: IngestedItem = {
  id: "guard-source",
  title: "Conference program update",
  url: "https://example.com/program",
  excerpt:
    "The official program lists a late breaking session in the main auditorium tomorrow morning with a moderated discussion and a scheduled question period for registered conference attendees.",
  sourceName: "Official conference program",
  sourceType: "official",
  rank: 1
};

const framed = formatVoiceSegment({
  voiceName: "Echo Sage",
  topic: "late-breaking sessions",
  narrative: "The official program has published a schedule update.",
  at: new Date("2026-06-11T13:00:00Z")
});
assert.match(
  framed,
  /^Good (morning|evening), wherever you are\. This is Echo Sage from ConferenceHype\./
);
assert.ok(framed.endsWith(SEGMENT_CLOSE));

const copiedErrors = getUnsafeGeneratedSourceErrors({
  segment: {
    title: "Program update",
    summary: source.excerpt,
    script: source.excerpt
  },
  sources: [source]
});
assert.ok(copiedErrors.some((error) => error.includes("copies source wording")));

const sponsorBase: Segment = {
  id: "sponsor-guard",
  title: "Partner update",
  summary: "A commercial message from Example Health.",
  script: "Example Health is presenting its conference services.",
  contentType: "industry_floor",
  personaId: "echo-sage",
  personaName: "Echo Sage",
  hypeLevel: "standard",
  language: "English",
  status: "pending_review",
  citations: [],
  socialBuzzItems: [],
  riskFlags: ["sponsor_message", "paid_content"],
  confidenceScore: 100,
  createdAt: new Date().toISOString()
};
assert.ok(
  validateSegmentForApproval(sponsorBase).some((error) =>
    error.includes("explicitly labeled")
  )
);
assert.equal(
  validateSegmentForApproval({
    ...sponsorBase,
    title: "Sponsored: Example Health partner update",
    script: "This is a sponsored message from Example Health."
  }).length,
  0
);

console.log("Broadcast guard verification passed.");
