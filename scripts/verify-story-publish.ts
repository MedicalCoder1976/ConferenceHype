import assert from "node:assert/strict";
import { parsePreparedStory } from "@/lib/story/preparedStory";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanStoryNarrative } from "@/lib/story/storyFormValidation";
import { applySpokenPronunciations } from "@/lib/media/tts";
import { assertCleanNarration } from "@/lib/media/narrationText";
import { applyUpdateLabel, extractPreviousUpdates, formatPreviousUpdatesBlock, identifyMeeting, rowMatchesMeeting, STORY_TITLE_LIMIT } from "@/lib/story/meetingUpdateNumbering";
import { buildMeetingWatchMetadata } from "@/lib/youtube/meetingWatchMetadata";

const storyFixture = {
  title: "Original complete Story title",
  topic: "ESC Congress 2026 trial results",
  sourceUrl: "https://example.com/esc-2026",
  sourceName: "ESC",
  articleTitle: "Original complete Story title",
  authors: "",
  specialty: "Story",
  descriptionOpening: "The findings, limitations, and clinical implications from ESC Congress 2026, explained clearly.",
  thumbnailHeadline: "Original complete Story title",
  narrative: Array.from(
    { length: 430 },
    (_, index) => `Evidence word ${index + 1}${index % 36 === 35 ? "." : ""}`
  ).join(" ")
};

const originalStoryHash = parsePreparedStory(storyFixture).sourceHash;
const pastedResponse = 'Title: ``` Packaging headline ``` Topic: ``` Packaging topic ``` Primary source URL: ``` https://www. biontech. com/int/en/release-2026. html ``` Narrative: ' + storyFixture.narrative;
assert.equal(cleanStoryNarrative(pastedResponse), cleanStoryNarrative(storyFixture.narrative));
assert.deepEqual(parsePreparedStory({ ...storyFixture, narrative: pastedResponse }).cards, parsePreparedStory(storyFixture).cards);
assert.equal(applySpokenPronunciations('Topic: Heart failure improved. Background: 18.5 versus 10.0 months. URL: HTTPS://example.org/trial'), 'Heart failure improved. 18.5 versus 10.0 months.');
assert.equal(cleanStoryNarrative('Results remained at 18.5 months. https://www. biontech. com/news/trial Next steps remain uncertain.'), 'Results remained at 18.5 months. Next steps remain uncertain.');
assert.equal(cleanStoryNarrative('[The trial](https://example.org/trial) reported 44.4% versus 48.8%.'), 'The trial reported 44.4% versus 48.8%.');
assert.throws(() => assertCleanNarration('Topic: an accidental label'), /refusing/);
assert.throws(() => assertCleanNarration('Visit https://example.org'), /refusing/);
assert.doesNotThrow(() => assertCleanNarration('On this topic, more evidence is needed.'));
assert.equal(applySpokenPronunciations('Prior PD-(L)1 immunotherapy.'), 'Prior P D 1 or P D L 1 immunotherapy.');
assert.equal(cleanStoryNarrative('Topic\nEvidence remains preliminary.\nURL\nhttps://example.org'), 'Evidence remains preliminary.');
const retitledStoryHash = parsePreparedStory({
  ...storyFixture,
  title: "Revised complete Story title",
  articleTitle: "Revised complete Story title",
  thumbnailHeadline: "Revised complete Story title"
}).sourceHash;

assert.notEqual(
  originalStoryHash,
  retitledStoryHash,
  "Changing a Story title must create a distinct render fingerprint"
);

// 2026-10-13: Stories on a conference that already has videos are titled
// "<Meeting> <Year> Update <N>: <headline>", N = videos already delivered.
const esmo = identifyMeeting("European Society for Medical Oncology Congress 2026", "ESMO 2026: Moderna melanoma vaccine");
assert.ok(esmo && esmo.displayName === "ESMO 2026");
assert.equal(applyUpdateLabel("Moderna Melanoma Vaccine Takes the Stage", esmo!, 0), "Moderna Melanoma Vaccine Takes the Stage");
assert.equal(applyUpdateLabel("Moderna Melanoma Vaccine Takes the Stage", esmo!, 3), "ESMO 2026 Update 3: Moderna Melanoma Vaccine Takes the Stage");
assert.equal(applyUpdateLabel("ESMO 2026: Moderna Melanoma Vaccine Takes the Stage", esmo!, 3), "ESMO 2026 Update 3: Moderna Melanoma Vaccine Takes the Stage");
assert.equal(applyUpdateLabel("ESMO 2026 Update 3: Already labelled", esmo!, 3), "ESMO 2026 Update 3: Already labelled");
assert.throws(() => applyUpdateLabel("x".repeat(STORY_TITLE_LIMIT - 5), esmo!, 3), /Shorten the headline/);
assert.equal(identifyMeeting("CHEST 2026 Annual Meeting")?.displayName, "CHEST 2026");
assert.equal(identifyMeeting("A story about chest pain in 2026"), null);
assert.equal(identifyMeeting("American Heart Association Scientific Sessions 2026")?.displayName, "AHA 2026");
assert.equal(identifyMeeting("Unlisted Regional Society Meeting 2026"), null);
assert.equal(rowMatchesMeeting("Create a Story: ESMO 2026 Madrid: Incyte KRAS G12D", esmo!), true);
assert.equal(rowMatchesMeeting("ESMO 2025 Berlin highlights", esmo!), false);
assert.equal(rowMatchesMeeting("EASD 2026 Milan: retatrutide", esmo!), false);

// 2026-10-14: earlier updates on the same meeting are linked in the description.
const sampleUpdates = [
  { title: "ESMO 2026 Update 8: Moderna Melanoma Vaccine, Pfizer Sigvotatug", url: "https://www.youtube.com/watch?v=abc123", publishedAt: "2026-10-13T16:06:00Z" },
  { title: "ESMO 2026 Game Plan: The mRNA Vaccine Day", url: "https://www.youtube.com/watch?v=def456", publishedAt: "2026-10-11T22:37:00Z" }
];
const storedDescription = ["Opening line.", "Primary source: https://example.com/a", ...formatPreviousUpdatesBlock(sampleUpdates)].join("\n");
assert.deepEqual(
  extractPreviousUpdates(storedDescription),
  sampleUpdates.map(({ title, url }) => ({ title, url }))
);
assert.deepEqual(extractPreviousUpdates("Opening line.\nPrimary source: https://example.com/a"), []);
const withLinks = buildMeetingWatchMetadata({
  hourStart: new Date("2026-10-14T12:00:00Z"), slots: [], title: "ESMO 2026 Update 9: Test", meetingLabel: "ESMO 2026",
  sourceUrl: "https://example.com/source", descriptionOpening: "Opening line.",
  previousUpdates: sampleUpdates.map(({ title, url }) => ({ title, url }))
});
assert.match(withLinks.description, /Previous updates in this series:/);
assert.match(withLinks.description, /https:\/\/www\.youtube\.com\/watch\?v=abc123/);
const withoutLinks = buildMeetingWatchMetadata({
  hourStart: new Date("2026-10-14T12:00:00Z"), slots: [], title: "ESMO 2026 Update 9: Test", meetingLabel: "ESMO 2026",
  sourceUrl: "https://example.com/source", descriptionOpening: "Opening line."
});
assert.doesNotMatch(withoutLinks.description, /Previous updates in this series:/);

console.log("Story publish verification passed.");

const renderSource = readFileSync(path.join(process.cwd(), "scripts", "render-hour-broadcast.ts"), "utf8");
const thumbnailSource = readFileSync(path.join(process.cwd(), "app", "api", "youtube-thumbnail", "route.tsx"), "utf8");
assert.match(renderSource, /cleanStoryLayout: isPreparedStoryMode/);
assert.match(renderSource, /seriesLabel: isPreparedStoryMode\s*\? "BREAKING"/);
assert.match(renderSource, /seriesHeadline: isPreparedStoryRender\s*\? "BREAKING"/);
assert.match(thumbnailSource, /isCleanStoryLayout \? "100%" : "72%"/);
assert.match(thumbnailSource, /!isCleanStoryLayout \? <div/);
