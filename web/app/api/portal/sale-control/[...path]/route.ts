import type { NextRequest } from "next/server";
import { proxyPortal } from "@/lib/portal-proxy";

type Context = { params: Promise<{ path: string[] }> };
const target = async (context: Context) => `/api/v1/controle-venda/${(await context.params).path.join("/")}`;

export async function GET(_request: NextRequest, context: Context) {
  return proxyPortal(await target(context), { method: "GET" });
}

export async function PUT(request: NextRequest, context: Context) {
  return proxyPortal(await target(context), { method: "PUT", body: await request.text() });
}
