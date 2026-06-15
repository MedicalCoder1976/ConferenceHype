import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const secret = process.env.ADMIN_SHARED_SECRET;
  if (!secret) {
    return NextResponse.next();
  }

  const isAdminPage = request.nextUrl.pathname.startsWith("/admin");
  const isLoginPage = request.nextUrl.pathname === "/admin/login";
  if (!isAdminPage || isLoginPage) {
    return NextResponse.next();
  }

  const cookieSecret = request.cookies.get("conferencehype_admin_secret")?.value;
  if (cookieSecret === secret) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/admin/login";
  url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*"]
};
