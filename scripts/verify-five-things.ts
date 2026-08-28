import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { minimumSubstantiveCards } from "@/lib/media/broadcastQuality";
import { buildMeetingWatchSlots } from "@/lib/rundown/meetingWatchSlots";
import { buildFiveThingsSearchTitle } from "@/lib/story/fiveThingsConfig";
import { parsePreparedFiveThings, preparedFiveThingsSegments } from "@/lib/story/preparedFiveThings";
import { buildMeetingWatchMetadata } from "@/lib/youtube/meetingWatchMetadata";
import { normalizeYoutubeDescription, normalizeYoutubeTitle } from "@/lib/youtube/uploadBroadcastVideo";

const paragraph = "A randomized clinical study reports a meaningful result for patient care. The investigators describe the population, intervention, comparator, outcome, safety findings, and follow-up. Clinicians should interpret the effect size alongside eligibility criteria and study limitations before changing practice. The primary source provides the complete methods and results for independent review.";
const writeup = `INTRO:\nThese developments were selected for practicing cardiologists reviewing today's evidence.\n\n${Array.from({ length: 5 }, (_, index) => `${index + 1}. ${["TAVR outcomes", "LDL lowering", "Heart failure therapy", "Atrial fibrillation", "Hypertension guidance"][index]}\nWhat happened: ${paragraph}\nKey evidence: ${paragraph}\nPrimary source URL: https://example.com/source-${index + 1}`).join("\n\n")}`;

const prepared = parsePreparedFiveThings({ specialty: "Cardiology", writeup });
assert.equal(prepared.items.length, 5);
assert.equal(prepared.title, buildFiveThingsSearchTitle("Cardiology", prepared.items.map((item) => item.title)));
assert.match(prepared.title, /^Cardiology: 5 Things to Know Today/);
assert.equal(new Set(prepared.items.map((item) => item.sourceUrl)).size, 5);
const segments = preparedFiveThingsSegments(prepared);
assert.equal(segments.filter((segment) => segment.riskFlags.some((flag) => flag.startsWith("five_things_item:"))).length, 5);
assert.ok(segments.every((segment) => segment.riskFlags.includes("prepared_five_things")));
assert.equal(minimumSubstantiveCards("fiveThings15"), 5);

const baseTime = new Date("2026-08-26T11:00:00Z");
const slots = buildMeetingWatchSlots({ segments, baseTime, meetingWatchBroadcastId: "00000000-0000-4000-8000-000000000001", meetingLabel: "5 Things to Know: Cardiology", showSeconds: prepared.durationSeconds });
const metadata = buildMeetingWatchMetadata({ hourStart: baseTime, slots, title: prepared.title, meetingLabel: "5 Things to Know: Cardiology", specialty: "Cardiology", sourceUrl: prepared.items[0].sourceUrl });
assert.equal(metadata.title, prepared.title);
assert.equal(metadata.thumbnailHeadline, "5 THINGS TO KNOW");
assert.match(metadata.description, /^Cardiology: 5 Things to Know Today\./);
assert.match(metadata.description, /Audience: Physicians; Medical Students; Cardiologists; Advanced Practice Providers \(APPs\)\./);
assert.equal((metadata.description.match(/https:\/\/example\.com\/source-/g) ?? []).length, 5);
assert.equal(normalizeYoutubeTitle("Beta-blockers after MI with LVEF >40%"), "Beta-blockers after MI with LVEF greater than 40%");
assert.equal(normalizeYoutubeDescription("LDL-C <55 mg/dL and LVEF >40%"), "LDL-C less than 55 mg/dL and LVEF greater than 40%");
assert.doesNotMatch(normalizeYoutubeDescription(metadata.description.replace("LVEF", "LVEF >40%")), /[<>]/);
assert.ok(new TextEncoder().encode(normalizeYoutubeDescription("Evidence 😀 ".repeat(1000))).length <= 5000);

assert.throws(() => parsePreparedFiveThings({ specialty: "Cardiology", writeup: writeup.replace("https://example.com/source-5", "https://example.com/source-4") }), /five distinct primary-source URLs/);
const thumbnailSource = readFileSync(path.resolve("app/api/youtube-thumbnail/route.tsx"), "utf8");
assert.match(thumbnailSource, /isFiveThings/);
assert.match(thumbnailSource, />5 THINGS TO KNOW</);
assert.match(thumbnailSource, /specialty\.toUpperCase\(\)/);
assert.match(thumbnailSource, /specialty\.length > 28 \? 46 : specialty\.length > 20 \? 56 : 66/);
assert.match(thumbnailSource, /linear-gradient\(135deg, #ffbd45 0%, #ffe58a 100%\)/);
assert.match(thumbnailSource, /color: COLORS\.ink/);
assert.match(thumbnailSource, /0 0 0 6px rgba\(244,72,58,0\.78\)/);
console.log("5 Things to Know verification passed.");
