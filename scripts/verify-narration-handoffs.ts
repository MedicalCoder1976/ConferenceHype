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
assert.equal(applySpokenPronunciations("Prior MI or stroke"), "Prior M I or stroke");
assert.equal(applySpokenPronunciations("Prior MI or stroke", "myocardial infarction (MI)"), "Prior M I or stroke");
assert.equal(applySpokenPronunciations("myocardial infarction (MI) followed by MI", "myocardial infarction (MI)"), "myocardial infarction followed by M I");
assert.equal(applySpokenPronunciations("Miami and mi remain unchanged"), "Miami and mi remain unchanged");
assert.equal(applySpokenPronunciations("The ESC guideline changed"), "The E S C guideline changed");
assert.equal(applySpokenPronunciations("The ESC guideline changed", "European Society of Cardiology (ESC)"), "The E S C guideline changed");
assert.equal(applySpokenPronunciations("European Society of Cardiology (ESC) issued an ESC guideline", "European Society of Cardiology (ESC)"), "European Society of Cardiology issued an E S C guideline");
assert.equal(applySpokenPronunciations("Escape and esc remain unchanged"), "Escape and esc remain unchanged");
assert.equal(applySpokenPronunciations("NOVARTIS announced new data"), "Novartis announced new data");
assert.equal(applySpokenPronunciations("Novartis and novartis"), "Novartis and Novartis");
assert.equal(JOURNAL_MUSIC_SECONDS, 20);

console.log("Narration and handoff verification passed.");
