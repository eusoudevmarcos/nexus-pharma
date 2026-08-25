import { NextRequest, NextResponse } from "next/server";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function proxy(request: NextRequest) {
  if (safeMethods.has(request.method)) return NextResponse.next();
  const fetchSite = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  const expectedOrigin = request.nextUrl.origin;
  if (fetchSite === "cross-site" || (origin && origin !== expectedOrigin)) {
    return NextResponse.json({ message: "Origem da requisição não autorizada." }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
