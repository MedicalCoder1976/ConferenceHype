import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parsePreparedNarrative, preparedNarrativeSegments } from "@/lib/meetingWatch/preparedNarrative";
import { buildMeetingWatchSlots } from "@/lib/rundown/meetingWatchSlots";
import { buildMeetingWatchMetadata } from "@/lib/youtube/meetingWatchMetadata";
import { cleanMeetingWatchCopy } from "@/lib/meetingWatch/packaging";
import { assertMeetingWatchFiveNewsComplete, minimumSubstantiveCards } from "@/lib/media/broadcastQuality";

const narration = "The official primary source reports a meeting update with a defined population, intervention, comparator, endpoint, numerical result, safety context, and follow-up. Clinicians should review eligibility criteria, absolute effects, limitations, and the complete abstract before interpreting the finding. The company attribution is included only because the official source explicitly identifies the sponsor or developer. This recap distinguishes the reported result from interpretation and avoids extending the evidence beyond the population and follow-up described by investigators.";
const packageJson = {
  schema_version: "conferencehype_meeting_watch_five_news_v1",
  status: "ready",
  meeting: { name: "ESC Congress", year: 2026, dates: "August 28-31, 2026", specialty: "Cardiology", specialist_alert: "CARDIOLOGIST ALERT", eye_catching_topic: "Five Hot Trials From Novartis and AstraZeneca" },
  news_items: Array.from({ length: 5 }, (_, index) => ({ position: index + 1, headline: `Complete meeting headline ${index + 1}`, visible_text: `Key source-supported result ${index + 1}`, narration, primary_source_url: `https://example.com/abstract-${index + 1}`, source_label: `ESC abstract ${index + 1}`, abstract_number: `Abstract ${100 + index}`, study_name: `TRIAL-${index + 1}`, pharma_companies: index < 2 ? [index === 0 ? "Novartis" : "AstraZeneca"] : [], reported_numbers: ["42 percent"], limitations: ["Follow-up remains limited"] })),
  disclaimer: "This medical meeting recap is for educational and informational purposes only and is not individualized medical advice.",
  closing: "ESC Congress 2026 ran August 28-31, 2026. Comment with the abstract or company update we should cover next and subscribe.",
  quality_report: { exactly_five_news_items: true }
};

const parsed = parsePreparedNarrative(JSON.stringify(packageJson));
assert.equal(parsed.package.cards.length, 5);
assert.equal(parsed.package.program.conference_name, "ESC Congress 2026");
assert.match(parsed.package.program.title, /^ESC Congress 2026 \| CARDIOLOGIST ALERT:/);
assert.match(parsed.package.program.title, /Novartis.*AstraZeneca/);
assert.ok(parsed.package.program.title.length <= 150);
const segments = preparedNarrativeSegments(parsed.package);
assert.equal(segments.filter((segment) => segment.riskFlags.includes("meeting_watch_five_news")).length, 5);
assert.equal(new Set(segments.filter((segment) => segment.riskFlags.includes("meeting_watch_five_news")).map((segment) => segment.citations[0]?.url)).size, 5);
const slots = buildMeetingWatchSlots({ segments, baseTime: new Date("2026-08-30T12:00:00Z"), meetingWatchBroadcastId: "five-news-test", meetingLabel: "ESC Congress 2026", showSeconds: parsed.durationSeconds });
const metadata = buildMeetingWatchMetadata({ hourStart: new Date("2026-08-30T12:00:00Z"), slots, title: parsed.package.program.title, meetingLabel: "ESC Congress 2026", specialty: "Cardiology", sourceUrl: packageJson.news_items[0].primary_source_url, descriptionOpening: parsed.package.program.description_opening });
assert.match(metadata.title, /^ESC Congress 2026 \| CARDIOLOGIST ALERT:/);
assert.equal(metadata.meetingLabel, "ESC Congress 2026");
assert.equal(metadata.specialistAlert, "CARDIOLOGIST ALERT");
assert.equal(metadata.meetingDates, "August 28-31, 2026");
assert.match(segments[0].script, /ESC Congress 2026, held August 28-31, 2026/);
assert.match(metadata.thumbnailEntity ?? "", /Novartis.*AstraZeneca/);
assert.doesNotMatch([metadata.title, metadata.description, metadata.thumbnailHeadline].join(" "), /Clinical Evidence Brief|New Evidence|The Story Behind the Result|Why This Result Matters/i);
assert.equal(cleanMeetingWatchCopy("Clinical Evidence Brief: New Evidence — Why This Result Matters"), "");
const edited = parsePreparedNarrative(JSON.stringify(packageJson), { title: "ESC Congress 2026 | CARDIOLOGIST ALERT: Five Practice-Changing Trials", thumbnailStatement: "FIVE PRACTICE-CHANGING TRIALS" });
assert.equal(edited.package.program.title, "ESC Congress 2026 | CARDIOLOGIST ALERT: Five Practice-Changing Trials");
assert.equal(edited.package.program.thumbnail_headline, "FIVE PRACTICE-CHANGING TRIALS");
assert.notEqual(edited.sourceHash, parsed.sourceHash);
assert.throws(() => parsePreparedNarrative(JSON.stringify(packageJson), { title: "Five Practice-Changing Trials", thumbnailStatement: "FIVE PRACTICE-CHANGING TRIALS" }), /must start with ESC Congress 2026/);
assert.throws(() => parsePreparedNarrative(JSON.stringify(packageJson), { title: "ESC Congress 2026 | CARDIOLOGIST ALERT: Five Trials", thumbnailStatement: "Clinical Evidence Brief" }), /generic evidence labels/);
assert.equal(minimumSubstantiveCards("meetingWatchFiveNews"), 5);
const completeCards = segments.map((segment) => ({ duration: 60, isMusic: false, segmentId: segment.id, riskFlags: segment.riskFlags }));
assert.deepEqual(assertMeetingWatchFiveNewsComplete(completeCards), { sourcedNewsItems: 5, hasDisclaimer: true, hasClosing: true });
assert.throws(() => assertMeetingWatchFiveNewsComplete(completeCards.filter((card) => !card.riskFlags.includes("prepared_disclaimer"))), /incomplete story/);

const storyNarration = `${narration} ${narration}`;
const storyPackage = {
  ...packageJson,
  schema_version: "conferencehype_meeting_watch_story_v2",
  story: {
    thesis: "The five trials collectively test whether cardiovascular benefit can move earlier while becoming more precisely targeted.",
    opening_hook: storyNarration,
    closing_synthesis: storyNarration
  },
  news_items: packageJson.news_items.map((item, index) => ({
    ...item,
    bridge_from_previous: index === 0 ? "That question begins with the meeting's first major trial." : "The next finding carries that same clinical question into another population.",
    narration: storyNarration
  })),
  closing: undefined
};
const parsedStory = parsePreparedNarrative(JSON.stringify(storyPackage));
assert.equal(parsedStory.package.cards.length, 5);
assert.equal(parsedStory.package.transitions.length, 0);
assert.equal(parsedStory.transitionSeconds, 0);
assert.match(parsedStory.package.opening_hook.speaker_turns[0].text, /^ESC Congress 2026, held August 28-31, 2026\./);
assert.match(parsedStory.package.opening_hook.speaker_turns[0].text, /five trials collectively test/);
assert.match(parsedStory.package.cards[1].speaker_turns[0].text, /^The next finding carries/);
assert.doesNotMatch(parsedStory.package.cards.map((card) => card.speaker_turns[0].text).join(" "), /Number (?:one|two|three|four|five)/i);
assert.match(parsedStory.package.closing.speaker_turns[0].text, /ESC Congress 2026/);
assert.throws(() => parsePreparedNarrative(JSON.stringify({ ...storyPackage, story: undefined })), /continuous-story package requires/);
assert.throws(() => parsePreparedNarrative(JSON.stringify({ ...storyPackage, news_items: storyPackage.news_items.map((item, index) => index === 1 ? { ...item, bridge_from_previous: "Next." } : item) })), /narrative bridge/);

const thumbnailSource = readFileSync(path.resolve("app/api/youtube-thumbnail/route.tsx"), "utf8");
const renderSource = readFileSync(path.resolve("scripts/render-hour-broadcast.ts"), "utf8");
assert.match(thumbnailSource, /if \(isMeetingWatch && seriesLabel\)/);
assert.match(thumbnailSource, /isMeetingWatch \? detailLabel \?\? seriesLabel : date/);
assert.match(renderSource, /meetingWatch: isMeetingWatchMode/);
assert.match(renderSource, /cleanMeetingWatchCopy\(card\.script\)/);
console.log("Meeting Watch five-news verification passed.");
