import { proxyInternal } from "@/lib/internal-proxy";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyInternal(`/api/v1/interno/fiscal/catalogos/${encodeURIComponent(id)}/ativar`, { method: "POST" });
}
