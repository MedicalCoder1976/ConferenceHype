import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { getMedicalConferencesFromDb, upsertMedicalConferenceInDb } from "@/lib/db";
import { medicalSpecialties } from "@/lib/catalog/medicalSpecialties";

function normalizedUrl(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

const bodySchema = z.object({
  name: z.string().trim().min(2).max(180),
  acronym: z.string().trim().max(30).optional().or(z.literal("")),
  specialties: z.array(z.enum(medicalSpecialties)).min(1),
  startDate: z.string().date().optional().or(z.literal("")),
  endDate: z.string().date().optional().or(z.literal("")),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  country: z.string().trim().max(100).optional().or(z.literal("")),
  timezone: z.string().trim().min(1).max(80),
  officialUrl: z.preprocess(normalizedUrl, z.string().url())
}).superRefine((body, context) => {
  if (body.startDate && body.endDate && body.endDate < body.startDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "End date must be on or after the start date."
    });
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: body.timezone }).format();
  } catch {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["timezone"],
      message: "Use a valid IANA timezone such as Europe/Stockholm."
    });
  }
});

export async function GET(request: NextRequest) {
  try {
    assertAdminRequest(request);
    return NextResponse.json({
      ok: true,
      conferences: (await getMedicalConferencesFromDb()) ?? []
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = bodySchema.parse(await request.json());
    const conference = await upsertMedicalConferenceInDb({
      name: body.name,
      acronym: body.acronym || undefined,
      specialties: body.specialties,
      startDate: body.startDate || undefined,
      endDate: body.endDate || undefined,
      month: body.month,
      year: body.year,
      city: body.city || undefined,
      country: body.country || undefined,
      timezone: body.timezone,
      officialUrl: body.officialUrl,
      enabled: true,
      operatorAdded: true
    });
    if (!conference) {
      return NextResponse.json(
        { ok: false, error: "Conference database is not configured." },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: true, conference });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.issues.map((issue) => issue.message).join(" ")
        },
        { status: 422 }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 400 }
    );
  }
}
