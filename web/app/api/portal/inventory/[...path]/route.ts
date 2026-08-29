import type { NextRequest } from "next/server";
import { proxyPortal } from "@/lib/portal-proxy";

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyPortal(`/api/v1/estoque/${path.join("/")}`, { method: request.method, body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.text() });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
