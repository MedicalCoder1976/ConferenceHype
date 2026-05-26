import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { blacklistXFollowSourceInDb } from "@/lib/db";

const bodySchema = z.object({
  handle: z.string().trim().min(2).max(32),
  label: z.string().trim().max(100).optional().or(z.literal(""))
});

function normalizeXHandle(value: string) {
  const handle = value
    .replace(/^(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\//i, "")
    .split(/[/?#]/)[0]
    .replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
    throw new Error("Use a valid X handle like @ASCO or x.com/ASCO.");
  }
  return `@${handle}`;
}

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = bodySchema.parse(await request.json());
    const handle = normalizeXHandle(body.handle);
    const source = await blacklistXFollowSourceInDb({
      handle,
      label: body.label || handle
    });
    if (!source) {
      return NextResponse.json(
        { ok: false, error: "Database is not configured." },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: true, source });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
