import os from "node:os";
import path from "node:path";

// Where rendered media is written when a script is run by hand.
//
// The project folder sits inside the operator's OneDrive-synced Desktop, so a
// local render written to public/rendered (or .tmp) is uploaded to OneDrive
// and fills the personal account. Local runs therefore default to the OS temp
// directory, which is outside OneDrive. GitHub Actions keeps the original
// relative paths because the workflows cache and upload from public/rendered
// on the runner.
//
// CONFERENCEHYPE_MEDIA_DIR overrides both (an absolute path outside OneDrive).
export function defaultRenderPath(...segments: string[]) {
  const override = process.env.CONFERENCEHYPE_MEDIA_DIR;
  if (override) return path.join(override, ...segments);
  if (process.env.GITHUB_ACTIONS || process.env.CI) return path.join("public", "rendered", ...segments);
  return path.join(os.tmpdir(), "conferencehype", "rendered", ...segments);
}
