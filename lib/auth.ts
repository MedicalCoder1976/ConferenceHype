import { NextRequest } from "next/server";
import { env } from "@/lib/env";

export function assertAdminRequest(request: NextRequest) {
  if (!env.ADMIN_SHARED_SECRET) {
    return;
  }
  const supplied =
    request.headers.get("x-admin-secret") ??
    request.nextUrl.searchParams.get("secret") ??
    request.cookies.get("conferencehype_admin_secret")?.value;
  if (supplied !== env.ADMIN_SHARED_SECRET) {
    throw new Error("Unauthorized admin request.");
  }
}

export function isAdminCookieValid(secret?: string) {
  if (!env.ADMIN_SHARED_SECRET) {
    return true;
  }
  return secret === env.ADMIN_SHARED_SECRET;
}
