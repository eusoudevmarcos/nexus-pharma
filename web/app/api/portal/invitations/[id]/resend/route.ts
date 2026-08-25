import { NextResponse } from "next/server";
import { proxyPortal } from "@/lib/portal-proxy";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const response = await proxyPortal(`/api/v1/usuarios/convites/${encodeURIComponent(id)}/reenviar`, {
    method: "POST",
  });
  if (!response.ok) return response;
  const body = await response.json() as { token: string; [key: string]: unknown };
  const inviteUrl = `${new URL(request.url).origin}/convite?token=${encodeURIComponent(body.token)}`;
  const { token: _token, ...safeBody } = body;
  void _token;
  return NextResponse.json({ ...safeBody, inviteUrl });
}
