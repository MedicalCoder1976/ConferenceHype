import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { addXFollowSourceToDb, getXFollowVoicesFromDb } from "@/lib/db";
import { monitoredXVoices } from "@/lib/sources/registry";

const bodySchema = z.object({
  handle: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .transform((value) =>
      value.replace(/^(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\//i, "")
    )
    .transform((value) => value.split(/[/?#]/)[0])
    .refine((value) => /^@?[A-Za-z0-9_]{1,15}$/.test(value), {
      message: "Use a valid X handle like @EHA_Hematology or x.com/EHA_Hematology."
    }),
  label: z.string().trim().max(80).optional().or(z.literal("")),
  note: z.string().trim().max(160).optional().or(z.literal(""))
});

export async function GET(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const savedVoices = (await getXFollowVoicesFromDb()) ?? [];
    return NextResponse.json({
      ok: true,
      voices: [...monitoredXVoices, ...savedVoices]
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = bodySchema.parse(await request.json());
    const normalizedHandle = `@${body.handle.replace(/^@/, "")}`;
    const label = body.label || normalizedHandle;
    const result = await addXFollowSourceToDb({
      handle: normalizedHandle,
      label,
      note: body.note || "operator-added X follow"
    });

    if (!result) {
      return NextResponse.json({
        ok: false,
        error: "Database is not configured, so custom X follows cannot be saved."
      }, { status: 503 });
    }

    return NextResponse.json({
      ok: true,
      voice: result.voice,
      source: result.source
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
