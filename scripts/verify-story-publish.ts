import assert from "node:assert/strict";
import { parsePreparedStory } from "@/lib/story/preparedStory";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanStoryNarrative } from "@/lib/story/storyFormValidation";
import { applySpokenPronunciations } from "@/lib/media/tts";
import { assertCleanNarration } from "@/lib/media/narrationText";

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

console.log("Story publish verification passed.");

const renderSource = readFileSync(path.join(process.cwd(), "scripts", "render-hour-broadcast.ts"), "utf8");
const thumbnailSource = readFileSync(path.join(process.cwd(), "app", "api", "youtube-thumbnail", "route.tsx"), "utf8");
assert.match(renderSource, /cleanStoryLayout: isPreparedStoryMode/);
assert.match(renderSource, /seriesLabel: isPreparedStoryMode\s*\? "BREAKING"/);
assert.match(renderSource, /seriesHeadline: isPreparedStoryRender\s*\? "BREAKING"/);
assert.match(thumbnailSource, /isCleanStoryLayout \? "100%" : "72%"/);
assert.match(thumbnailSource, /!isCleanStoryLayout \? <div/);
