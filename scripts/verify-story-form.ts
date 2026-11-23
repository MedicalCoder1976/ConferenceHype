import assert from "node:assert/strict";
import { storyFormIssues, storySkipNote, storyWordCount } from "../lib/story/storyFormValidation";

const input = { sourceUrl: " https://example.com/study ", narrative: "Evidence ".repeat(339), title: "Conference study results", topic: "Conference results", thumbnailHeadline: "Conference results", sourceName: "", authors: "", specialty: "Story" };
assert.deepEqual(storyFormIssues(input), ["Narrative has 339 spoken words. Add at least 81 more source-supported words (420 required)."]);
assert.equal(storyFormIssues({ ...input, narrative: "Evidence ".repeat(420) }).length, 0);
assert.equal(storyWordCount("# Heading\n- **Evidence**"), 2);
assert.ok(storyFormIssues({ ...input, sourceUrl: "invalid" }).some(issue => issue.includes("source URL")));
assert.ok(storyFormIssues({ ...input, authors: "a".repeat(501) }).some(issue => issue.includes("Authors")));
for (const bad of [
  "Our earlier update covered Faron's Bexmab trial and Ascentage Pharma's Apg-5918, so those are not repeated here.",
  "Our earlier videos covered Cognita and Uptunity, so none of those are repeated here.",
  "Previews 1 and 2 already covered tozorakimab; those stories will not be covered here.",
  "That poster is noted here only in brief and is not expanded as a separate item."
]) {
  assert.ok(storySkipNote(`Opening sentence. ${bad} Next sentence.`), bad);
  assert.ok(storyFormIssues({ ...input, narrative: "Evidence ".repeat(420) + bad }).some(issue => issue.includes("does not cover")), bad);
}
for (const good of [
  "Our earlier update covered Faron's Bexmab trial and Ascentage Pharma's Apg-5918.",
  "Median overall survival was not reached, and the dose was not repeated in children.",
  "Results were consistent across the subgroups covered here."
]) assert.equal(storySkipNote(good), null, good);
console.log("Story form: screenshot shortfall, valid submission, spoken word normalization, URL and optional-field limits and the no skip-note rule passed.");
