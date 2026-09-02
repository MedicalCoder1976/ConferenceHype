import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/iaslc-localized-editions.yml", "utf8");
const localizer = readFileSync("scripts/localize-iaslc-video.py", "utf8");
const publisher = readFileSync("scripts/publish-localized-iaslc.ts", "utf8");

for (const language of ["ko", "ja", "zh-Hans"]) assert.match(workflow, new RegExp(language));
for (const broadcastId of [
  "9832487d-dfe5-458d-89cf-85241fbf4e8c",
  "67709ac5-b18d-4aeb-ac5b-b88c1337974c"
]) assert.match(workflow, new RegExp(broadcastId));

assert.match(localizer, /Source broadcast must exist and have verified status/);
assert.match(localizer, /Restoring exact source numerals/);
assert.match(localizer, /Reinserting protected medical terms/);
assert.match(localizer, /edge_tts/);
assert.match(localizer, /Narration clip.*unexpectedly short/);
assert.match(localizer, /-t", "16"/);
assert.match(localizer, /subtitles=/);
assert.match(publisher, /privacyStatus: "private"/);
assert.match(publisher, /uploadCaptionTrack/);
assert.match(publisher, /makePublic/);
assert.match(publisher, /findExistingVideo/);
assert.match(publisher, /status: "verified"/);

console.log("IASLC localization safeguards verified.");
