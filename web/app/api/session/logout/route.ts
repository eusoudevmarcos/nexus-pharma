import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiUrl } from "@/lib/api";
import { legacyCookieNames, sessionCookieNames } from "@/lib/session-cookies";

export async function POST() {
  const jar = await cookies();
  const refreshToken = jar.get(sessionCookieNames.refresh)?.value;
  if (apiUrl() && refreshToken) {
    await fetch(`${apiUrl()}/api/v1/auth/logout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    }).catch(() => null);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(sessionCookieNames.access);
  response.cookies.delete(sessionCookieNames.refresh);
  response.cookies.delete(sessionCookieNames.company);
  for (const name of legacyCookieNames) response.cookies.delete(name);
  return response;
}
