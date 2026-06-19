import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import {
  getDailyCoveragePlanFromDb,
  getMedicalConferencesFromDb,
  getOncologyJournalsFromDb,
  getSourcesFromDb,
  upsertDailyCoveragePlanInDb
} from "@/lib/db";
import { normalizeLegacyDailyCoverageDefaults } from "@/lib/dailyCoverage";
import { errorMessage } from "@/lib/errors";
import { sourceRegistry } from "@/lib/sources/registry";

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
  sourceIds: z.array(z.string().trim().min(1).max(120)).max(200),
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
    const [plan, journals, sources, conferences] = await Promise.all([
      getDailyCoveragePlanFromDb(coverageDate),
      getOncologyJournalsFromDb(),
      getSourcesFromDb(),
      getMedicalConferencesFromDb()
    ]);
    return NextResponse.json({
      ok: true,
      plan: plan
        ? normalizeLegacyDailyCoverageDefaults({
            plan,
            journals: journals ?? [],
            conferences: conferences ?? [],
            sources: sources ?? sourceRegistry
          })
        : null
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const [rawPlan, journals, sources, conferences] = await Promise.all([
      Promise.resolve(planSchema.parse(await request.json())),
      getOncologyJournalsFromDb(),
      getSourcesFromDb(),
      getMedicalConferencesFromDb()
    ]);
    const normalizedPlan = normalizeLegacyDailyCoverageDefaults({
      plan: rawPlan,
      journals: journals ?? [],
      conferences: conferences ?? [],
      sources: sources ?? sourceRegistry
    });
    const plan = await upsertDailyCoveragePlanInDb(normalizedPlan);
    return NextResponse.json({ ok: true, plan });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: errorMessage(error, "Could not save coverage plan.") },
      { status: 400 }
    );
  }
}
