import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

// Public "Request coverage" form. Requests are stored for the operator to
// review in admin; nothing is emailed and nothing is published.

const MAX_PER_HOUR = 5;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : null));

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : null))
  .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), "Dates must be YYYY-MM-DD.");

const httpsUrl = z.string().trim().url().max(500).refine((value) => /^https?:\/\//i.test(value), "Use a full web address.");

const requestSchema = z
  .object({
    conferenceName: z.string().trim().min(3).max(200),
    field: z.enum(["medicine", "engineering", "law", "business", "education", "other"]),
    specialty: optionalText(120),
    startDate: optionalDate,
    endDate: optionalDate,
    location: optionalText(160),
    websiteUrl: httpsUrl,
    programUrl: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value ? value : null))
      .pipe(httpsUrl.nullable()),
    requesterName: z.string().trim().min(2).max(120),
    requesterEmail: z.string().trim().email().max(200),
    requesterRole: z.enum(["organizer", "speaker", "sponsor", "attendee", "other"]).optional(),
    note: optionalText(2000),
    consent: z.literal(true, { errorMap: () => ({ message: "Please agree to be contacted about this request." }) }),
    // Honeypot: hidden from people, filled in by bots.
    companyWebsite: z.string().optional()
  })
  .refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, {
    message: "The end date is before the start date.",
    path: ["endDate"]
  });

function clientIpHash(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${process.env.ADMIN_SHARED_SECRET ?? ""}:${ip}`).digest("hex");
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: `${issue.path.join(".") || "form"}: ${issue.message}` }, { status: 400 });
  }
  const input = parsed.data;
  // Pretend success so a bot learns nothing.
  if (input.companyWebsite) return NextResponse.json({ ok: true });

  const supabase = createAdminClient();
  const ipHash = clientIpHash(request);
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recent = await supabase
    .from("coverage_requests")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);
  if (recent.error) {
    console.error("coverage_requests rate check failed", recent.error);
    return NextResponse.json({ ok: false, error: "Requests are not being accepted right now. Please try again later." }, { status: 503 });
  }
  if ((recent.count ?? 0) >= MAX_PER_HOUR) {
    return NextResponse.json({ ok: false, error: "Too many requests from this connection. Please try again in an hour." }, { status: 429 });
  }

  const { error } = await supabase.from("coverage_requests").insert({
    conference_name: input.conferenceName,
    field: input.field,
    specialty: input.specialty,
    start_date: input.startDate,
    end_date: input.endDate,
    location: input.location,
    website_url: input.websiteUrl,
    program_url: input.programUrl,
    requester_name: input.requesterName,
    requester_email: input.requesterEmail,
    requester_role: input.requesterRole ?? null,
    note: input.note,
    consent: true,
    ip_hash: ipHash
  });
  if (error) {
    console.error("coverage_requests insert failed", error);
    return NextResponse.json({ ok: false, error: "Your request could not be saved. Please try again later." }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
