import { proxyInternal } from "@/lib/internal-proxy";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyInternal(`/api/v1/interno/comercial/empresas/${encodeURIComponent(id)}/historico`, { method: "GET" });
}
