import { proxyInternal } from "@/lib/internal-proxy";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const payload = await request.json().catch(() => ({}));
  return proxyInternal(`/api/v1/interno/privacidade/solicitacoes/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) });
}
