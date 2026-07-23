import { NextResponse } from "next/server";
import { getPublicBroadcastContext } from "@/lib/data";

export async function GET() {
  const context = await getPublicBroadcastContext();
  return NextResponse.json({ ok: true, streamState: context.streamState });
}
