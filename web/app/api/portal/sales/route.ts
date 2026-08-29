import type { NextRequest } from "next/server";
import { proxyPortal } from "@/lib/portal-proxy";

export async function POST(request: NextRequest) {
  return proxyPortal("/api/v1/vendas/processar", { method: "POST", body: await request.text() });
}
