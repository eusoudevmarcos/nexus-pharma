import { proxyPortal } from "@/lib/portal-proxy";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  return proxyPortal(`/api/v1/alertas/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) });
}
