import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiUrl } from "@/lib/api";

export async function POST() {
  const jar = await cookies();
  const refreshToken = jar.get("nexus_refresh")?.value;
  if (apiUrl() && refreshToken) {
    await fetch(`${apiUrl()}/api/v1/auth/logout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    }).catch(() => null);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("nexus_access");
  response.cookies.delete("nexus_refresh");
  response.cookies.delete("nexus_company");
  return response;
}
