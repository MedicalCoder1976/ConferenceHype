import { NextRequest, NextResponse } from "next/server";
import { isAdminPageSecretValid } from "@/lib/adminAccess";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const supplied = String(formData.get("secret") ?? "");
  const next = String(formData.get("next") ?? "/admin");
  const secrets = {
    operator: process.env.ADMIN_SHARED_SECRET,
    judge: process.env.JUDGE_ADMIN_SHARED_SECRET
  };

  if (!isAdminPageSecretValid(supplied, secrets)) {
    return NextResponse.redirect(new URL("/admin/login?error=1", request.url), 303);
  }

  const response = NextResponse.redirect(new URL(next, request.url), 303);
  response.cookies.set("conferencehype_admin_secret", supplied, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/"
  });
  return response;
}
