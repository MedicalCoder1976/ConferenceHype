import { NextRequest, NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/auth";
import { env } from "@/lib/env";

const ALLOWED_SCOPES = ["all", "journals", "conferences", "newspapers"] as const;
type WeeklyBatchScope = (typeof ALLOWED_SCOPES)[number];

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    if (!env.GITHUB_DISPATCH_TOKEN) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "GITHUB_DISPATCH_TOKEN is not configured in Vercel, so the admin button cannot start GitHub Actions."
        },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const scope: WeeklyBatchScope = ALLOWED_SCOPES.includes(body?.scope)
      ? body.scope
      : "all";

    const response = await fetch(
      `https://api.github.com/repos/${env.GITHUB_DISPATCH_REPO}/actions/workflows/weekly-source-cards.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28"
        },
        body: JSON.stringify({ ref: "main", inputs: { scope } })
      }
    );

    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json(
        {
          ok: false,
          error: `GitHub workflow dispatch failed: ${response.status} ${detail}`
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, workflow: "weekly-source-cards.yml", scope });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
