import assert from "node:assert/strict";
import { repackageFiveThingsDescription } from "@/lib/youtube/repackageFiveThings";
import { formatFiveThingsDisclaimer } from "@/lib/story/fiveThingsDisclaimer";

const original = ["Cardiology: 5 Things to Know Today.", "Topics covered: Lung cancer; EGFR.", "Relevant specialty: Cardiology.", "Audience: Cardiologists.", "0:00 Opening", "1. Source: https://example.com/cardiology", formatFiveThingsDisclaimer("Cardiology", []), "#Cardiology", "#ConferenceHype"].join("\n");
const corrected = repackageFiveThingsDescription(original, "Oncology", "Cardiology");
assert.ok(corrected.startsWith("Oncology: 5 things to know today."));
assert.match(corrected, /Relevant specialty: Oncology\./);
assert.match(corrected, /Oncologists/);
assert.match(corrected, /0:00 Opening/);
assert.match(corrected, /https:\/\/example.com\/cardiology/);
assert.doesNotMatch(corrected, /Cardiology|Cardiologists|CARDIOLOGY|Cardiovascular/);
assert.equal((corrected.match(/ONCOLOGY DISCLAIMER:/g) ?? []).length, 1);
assert.equal(repackageFiveThingsDescription(corrected, "Oncology", "Oncology"), corrected);
console.log("Five Things specialty repackage verification passed.");
