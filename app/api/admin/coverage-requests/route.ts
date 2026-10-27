import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";

// Operator view of the public "Request coverage" form (coverage_requests).

const COLUMNS =
  "id,conference_name,field,specialty,start_date,end_date,location,website_url,program_url,requester_name,requester_email,requester_role,note,status,created_at,updated_at";

function failure(error: unknown) {
  const message = errorMessage(error);
  return NextResponse.json({ ok: false, error: message }, { status: /unauthorized/i.test(message) ? 401 : 500 });
}

export async function GET(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const { data, error } = await createAdminClient()
      .from("coverage_requests")
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, requests: data ?? [] });
  } catch (error) {
    return failure(error);
  }
}

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "contacted", "accepted", "declined"])
});

export async function PATCH(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const input = patchSchema.parse(await request.json());
    const { data, error } = await createAdminClient()
      .from("coverage_requests")
      .update({ status: input.status, updated_at: new Date().toISOString() })
      .eq("id", input.id)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ ok: false, error: "Request not found." }, { status: 404 });
    return NextResponse.json({ ok: true, request: data });
  } catch (error) {
    return failure(error);
  }
}
