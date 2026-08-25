import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiUrl } from "@/lib/api";
import { legacyCookieNames, sessionCookieNames, sessionCookieOptions } from "@/lib/session-cookies";

export async function POST() {
  const jar = await cookies();
  const refreshToken = jar.get(sessionCookieNames.refresh)?.value;
  if (!apiUrl() || !refreshToken) return NextResponse.json({ message: "Sessão indisponível." }, { status: 401 });

  const upstream = await fetch(`${apiUrl()}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
  }).catch(() => null);
  const body = await upstream?.json().catch(() => ({})) as { access_token?: string; refresh_token?: string } | undefined;
  if (!upstream?.ok || !body?.access_token || !body.refresh_token) {
    const denied = NextResponse.json({ message: "Sua sessão expirou." }, { status: 401 });
    denied.cookies.delete(sessionCookieNames.access);
    denied.cookies.delete(sessionCookieNames.refresh);
    for (const name of legacyCookieNames) denied.cookies.delete(name);
    return denied;
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieNames.access, body.access_token, sessionCookieOptions(15 * 60));
  response.cookies.set(sessionCookieNames.refresh, body.refresh_token, sessionCookieOptions(30 * 24 * 60 * 60));
  return response;
}
