import { NextResponse } from "next/server";
import { apiUrl } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = apiUrl();
  if (!base) return NextResponse.json({ status: "blocked", api: "not_configured" }, { status: 503 });
  try {
    const response = await fetch(`${base}/health/ready`, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    const upstream = await response.json().catch(() => null);
    return NextResponse.json({ status: response.ok ? "ok" : "blocked", api: response.ok ? "ready" : "unavailable", upstream }, { status: response.ok ? 200 : 503 });
  } catch {
    return NextResponse.json({ status: "blocked", api: "unreachable" }, { status: 503 });
  }
}
