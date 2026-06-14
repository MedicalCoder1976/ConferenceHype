import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import {
  getDailyCoveragePlanFromDb,
  upsertDailyCoveragePlanInDb
} from "@/lib/db";

const customItemSchema = z.object({
  id: z.string().trim().min(1).max(100),
  label: z.string().trim().min(2).max(180),
  url: z.string().url().optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal(""))
});

const planSchema = z.object({
  coverageDate: z.string().date(),
  conferenceIds: z.array(z.string().uuid()).max(100),
  journalIds: z.array(z.string().uuid()).max(100),
  sourceIds: z.array(z.string().uuid()).max(200),
  customItems: z.array(customItemSchema).max(100),
  priorityTopics: z.array(z.string().trim().min(2).max(180)).max(100),
  exclusions: z.array(z.string().trim().min(2).max(180)).max(100),
  breakingNewsEnabled: z.boolean(),
  notes: z.string().trim().max(2000)
});

export async function GET(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const coverageDate = z.string().date().parse(request.nextUrl.searchParams.get("date"));
    return NextResponse.json({
      ok: true,
      plan: await getDailyCoveragePlanFromDb(coverageDate)
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const plan = await upsertDailyCoveragePlanInDb(planSchema.parse(await request.json()));
    return NextResponse.json({ ok: true, plan });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
