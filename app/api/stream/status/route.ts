import { NextResponse } from "next/server";
import { getPublicBroadcastContext } from "@/lib/data";

// Polled by the daily YouTube delivery-verification workflow (and any other
// external monitor) to check the live video id -- must never be served from
// a cache, or a stale read here could mask exactly the kind of stuck state
// that workflow exists to catch.
export const dynamic = "force-dynamic";

export async function GET() {
  const context = await getPublicBroadcastContext();
  return NextResponse.json({ ok: true, streamState: context.streamState });
}
