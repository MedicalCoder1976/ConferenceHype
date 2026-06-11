import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import {
  disableSpecialtyXVoiceInDb,
  getSpecialtyXVoicesFromDb,
  upsertSpecialtyXVoiceInDb
} from "@/lib/db";
import { medicalSpecialties } from "@/lib/catalog/medicalSpecialties";

const handleSchema = z
  .string()
  .trim()
  .transform((value) =>
    value.replace(/^(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\//i, "")
  )
  .transform((value) => value.split(/[/?#]/)[0])
  .refine((value) => /^@?[A-Za-z0-9_]{1,15}$/.test(value), "Use a valid X handle.");

const createSchema = z.object({
  specialty: z.enum(medicalSpecialties),
  label: z.string().trim().min(1).max(100),
  handle: handleSchema,
  note: z.string().trim().max(240).optional(),
  rank: z.number().int().min(1).max(20).optional()
});

const deleteSchema = z.object({ id: z.string().uuid() });

export async function GET(request: NextRequest) {
  try {
    assertAdminRequest(request);
    return NextResponse.json({ ok: true, voices: (await getSpecialtyXVoicesFromDb()) ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = createSchema.parse(await request.json());
    const voice = await upsertSpecialtyXVoiceInDb({
      ...body,
      handle: `@${body.handle.replace(/^@/, "")}`
    });
    return NextResponse.json({ ok: true, voice });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = deleteSchema.parse(await request.json());
    const voice = await disableSpecialtyXVoiceInDb(body.id);
    return NextResponse.json({ ok: true, voice });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
