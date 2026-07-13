import type { Segment } from "@/lib/types";

// A stable key for "is this the same underlying article/post as another
// segment row" -- different segment rows (different ids, e.g. one from a
// weekly sweep, one from an hourly batch pick) can cite the exact same
// source url. Used to dedupe by content, not just by segment id, wherever
// two independently-generated segments for the same source item could both
// end up in the same broadcast.
export function contentSignature(segment: Segment) {
  const url = segment.citations[0]?.url?.trim().toLowerCase();
  if (url) {
    return `url:${url}`;
  }
  return `script:${segment.script.trim().toLowerCase().replace(/\s+/g, " ")}`;
}
