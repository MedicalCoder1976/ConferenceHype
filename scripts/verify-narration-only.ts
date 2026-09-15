import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { prepareNarrationOnlyCards, assertNarrationOnlyCards, BROADCAST_ENGAGEMENT } from "../lib/broadcast/narrationOnly";
import { buildNarrationAudioArgs, buildSegmentRenderCommand, getFfmpegBinary } from "../lib/media/ffmpeg";
import { assertNarrationWindowsAudible } from "../lib/media/broadcastQuality";

async function main() {
  const source = { text: "Source-backed result.", script: "Source-backed result.", isMusic: false, duration: 35, segmentId: "source", riskFlags: ["prepared_story"] };
  const result = prepareNarrationOnlyCards([source, { ...source, isMusic: true, script: "", duration: 16 }, { ...source, script: "Old closing", riskFlags: ["prepared_closing"] }]);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0].script, source.script);
  assert.equal(result[1].segmentId, undefined);
  assert.equal(result[1].script, BROADCAST_ENGAGEMENT);
  assert.ok(result[1].riskFlags.includes("prepared_story"));
  assert.deepEqual(prepareNarrationOnlyCards(result), result);
  assertNarrationOnlyCards(result);
  assert.throws(() => prepareNarrationOnlyCards([{ ...source, isMusic: true }]));
  assert.throws(() => assertNarrationOnlyCards([source]));
  assert.throws(() => buildNarrationAudioArgs([]));
  const legacy = buildSegmentRenderCommand({ voicePath: "voice.wav", outputPath: "out.m4a", musicPath: "music.wav", withMusic: true });
  assert.ok(!legacy.includes("music.wav"));
  for (const phrase of ["like this video and subscribe", "content you would like us to cover", "translation into another language", "which conferences we should cover next"]) assert.ok(BROADCAST_ENGAGEMENT.includes(phrase));

  const temp = mkdtempSync(path.join(os.tmpdir(), "narration-only-"));
  const ffmpeg = getFfmpegBinary();
  const run = (args: string[]) => {
    const process = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], { encoding: "utf8" });
    assert.equal(process.status, 0, process.error?.message || process.stderr);
  };
  const voice = path.join(temp, "voice.wav");
  const silence = path.join(temp, "silence.wav");
  const output = path.join(temp, "combined.m4a");
  run(["-f", "lavfi", "-i", "sine=frequency=500:duration=1", voice]);
  run(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "2", silence]);
  run(["-f", "lavfi", "-i", "color=black:s=16x16:d=2", ...buildNarrationAudioArgs([{path: voice, startMs: 0, durationMs: 1000}, {path: voice, startMs: 1000, durationMs: 1000}]), "-map", "[a]", "-c:a", "aac", output]);
  const windows = [{isMusic: false, duration: 1}, {isMusic: false, duration: 1}];
  await assertNarrationWindowsAudible({ffmpeg, mediaPath: output, cards: windows});
  await assert.rejects(assertNarrationWindowsAudible({ffmpeg, mediaPath: silence, cards: windows}), /silent or inaudible/);
  console.log("Narration-only policy, closing, late audio and silent-output rejection passed.");
}
main().catch(error => { console.error(error); process.exit(1); });
