import type { NextRequest } from "next/server";
import { proxyInternal } from "@/lib/internal-proxy";

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) { const { path } = await context.params; return proxyInternal(`/api/v1/interno/suporte/${path.join("/")}${request.nextUrl.search}`, { method: request.method, body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.text() }); }
export const GET = forward; export const POST = forward; export const PATCH = forward;
