import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiUrl } from "@/lib/api";

export async function POST() {
  const jar = await cookies();
  const refreshToken = jar.get("nexus_refresh")?.value;
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
    denied.cookies.delete("nexus_access");
    denied.cookies.delete("nexus_refresh");
    return denied;
  }

  const response = NextResponse.json({ ok: true });
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set("nexus_access", body.access_token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 15 * 60 });
  response.cookies.set("nexus_refresh", body.refresh_token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 30 * 24 * 60 * 60 });
  return response;
}
