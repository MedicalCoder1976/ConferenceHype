import assert from "node:assert/strict";
import { parsePreparedStory } from "@/lib/story/preparedStory";
import { readFileSync } from "node:fs";
import path from "node:path";

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
assert.match(thumbnailSource, /isCleanStoryLayout \? "100%" : "72%"/);
assert.match(thumbnailSource, /!isCleanStoryLayout \? <div/);
