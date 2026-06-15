import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { addSourceToDb, addXFollowSourceToDb } from "@/lib/db";

const bodySchema = z.object({
  kind: z.enum(["x_user", "news_site"]),
  name: z.string().trim().max(100).optional().or(z.literal("")),
  urlOrHandle: z.string().trim().min(2).max(600),
  note: z.string().trim().max(160).optional().or(z.literal(""))
});

function normalizeXHandle(value: string) {
  const handle = value
    .replace(/^(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\//i, "")
    .split(/[/?#]/)[0]
    .replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
    throw new Error("Use a valid X handle like @EHA_Hematology or x.com/EHA_Hematology.");
  }
  return `@${handle}`;
}

function normalizeNewsUrl(value: string) {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const parsed = new URL(withProtocol);
  return parsed.toString();
}

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = bodySchema.parse(await request.json());

    if (body.kind === "x_user") {
      const handle = normalizeXHandle(body.urlOrHandle);
      const result = await addXFollowSourceToDb({
        handle,
        label: body.name || handle,
        note: body.note || "operator-added X follow"
      });
      if (!result) {
        return NextResponse.json(
          { ok: false, error: "Database is not configured." },
          { status: 503 }
        );
      }
      return NextResponse.json({ ok: true, source: result.source });
    }

    const url = normalizeNewsUrl(body.urlOrHandle);
    const source = await addSourceToDb({
      name: body.name || new URL(url).hostname.replace(/^www\./, ""),
      url,
      type: "media",
      rank: 2
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
