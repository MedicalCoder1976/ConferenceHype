import assert from "node:assert/strict";
import { JOURNAL_MUSIC_SECONDS } from "@/lib/broadcast/journalShowSchedule";
import { applySpokenPronunciations } from "@/lib/media/tts";
import { buildRequiredSectionSummary } from "@/lib/segments/sectionSummary";

const source = "BACKGROUND AND AIMS: LMNA-related cardiomyopathy is progressive. METHODS: Investigators studied myocardial tissue. RESULTS: RUNX1 activity increased. CONCLUSIONS: The pathway may be therapeutically relevant.";
const summary = buildRequiredSectionSummary({ title: "LMNA cardiomyopathy", sourceName: "European Heart Journal", text: source });
assert.match(summary, /^Background: LMNA-related cardiomyopathy is progressive\./);
assert.doesNotMatch(summary, /Background:\s*(?:BACKGROUND|Background) AND AIMS/i);

const spoken = applySpokenPronunciations("Background: BACKGROUND AND AIMS: LMNA-related cardiomyopathy is progressive.");
assert.equal(spoken, "Background, LMNA-related cardiomyopathy is progressive.");
assert.doesNotMatch(spoken, /A-I-M-S|Background,\s*Background/i);
assert.equal(JOURNAL_MUSIC_SECONDS, 20);

console.log("Narration and handoff verification passed.");
