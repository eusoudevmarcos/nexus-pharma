import { proxyInternal } from "@/lib/internal-proxy";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  return proxyInternal(`/api/v1/interno/comercial/lojas/${encodeURIComponent(id)}/pdvs`, { method: "POST", body: JSON.stringify(payload) });
}
