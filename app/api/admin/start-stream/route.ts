import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/auth";
import { env } from "@/lib/env";

const bodySchema = z.object({
  startAt: z.string().datetime(),
  durationMinutes: z.literal("60").default("60")
});

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = bodySchema.parse(await request.json());
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

    const response = await fetch(
      `https://api.github.com/repos/${env.GITHUB_DISPATCH_REPO}/actions/workflows/youtube-stream.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28"
        },
        body: JSON.stringify({
          ref: "main",
          inputs: {
            duration_minutes: body.durationMinutes,
            stream_input_path: "public/rendered/fallback-loop.mp4",
            stream_start_time: body.startAt
          }
        })
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

    return NextResponse.json({
      ok: true,
      startAt: body.startAt,
      durationMinutes: body.durationMinutes,
      workflow: "youtube-stream.yml"
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
