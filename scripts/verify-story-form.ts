import assert from "node:assert/strict";
import { storyFormIssues, storyWordCount } from "../lib/story/storyFormValidation";

const input = { sourceUrl: " https://example.com/study ", narrative: "Evidence ".repeat(339), title: "Conference study results", topic: "Conference results", thumbnailHeadline: "Conference results", sourceName: "", authors: "", specialty: "Story" };
assert.deepEqual(storyFormIssues(input), ["Narrative has 339 spoken words. Add at least 81 more source-supported words (420 required)."]);
assert.equal(storyFormIssues({ ...input, narrative: "Evidence ".repeat(420) }).length, 0);
assert.equal(storyWordCount("# Heading\n- **Evidence**"), 2);
assert.ok(storyFormIssues({ ...input, sourceUrl: "invalid" }).some(issue => issue.includes("source URL")));
assert.ok(storyFormIssues({ ...input, authors: "a".repeat(501) }).some(issue => issue.includes("Authors")));
console.log("Story form: screenshot shortfall, valid submission, spoken word normalization, URL and optional-field limits passed.");
