import { proxyInternal } from "@/lib/internal-proxy";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  return proxyInternal(`/api/v1/interno/comercial/empresas/${encodeURIComponent(id)}/assinatura`, { method: "PUT", body: JSON.stringify(payload) });
}
