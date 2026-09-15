import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/iaslc-localized-editions.yml", "utf8");
const localizer = readFileSync("scripts/localize-iaslc-video.py", "utf8");
const publisher = readFileSync("scripts/publish-localized-iaslc.ts", "utf8");

for (const language of ["ko", "ja", "zh-Hans"]) assert.match(workflow, new RegExp(language));
assert.match(workflow, /inputs.broadcast_id/);

assert.match(localizer, /Source broadcast must exist and have verified status/);
assert.match(localizer, /facebook\/nllb-200-distilled-600M/);
assert.match(localizer, /assert_translation_quality/);
assert.match(localizer, /pathological repetition/);
assert.match(localizer, /Restoring exact source numerals/);
assert.match(localizer, /Reinserting protected medical terms/);
assert.match(localizer, /edge_tts/);
assert.match(localizer, /Narration clip.*unexpectedly short/);
assert.doesNotMatch(localizer, /transition\.wav/);
assert.match(localizer, /engagement\[language_key\]/);
assert.match(localizer, /subtitles=/);
assert.match(publisher, /privacyStatus: "private"/);
assert.match(publisher, /uploadCaptionTrack/);
assert.match(publisher, /makePublic/);
assert.match(publisher, /findExistingVideo/);
assert.match(publisher, /Content-Transfer-Encoding: binary/);
assert.match(publisher, /Recover a previous fail-closed upload/);
assert.match(publisher, /verified-burned-in-subtitles/);
assert.match(publisher, /YouTube OAuth lacks caption scope/);

console.log("IASLC localization safeguards verified.");
