import { proxyInternal } from "@/lib/internal-proxy";

export async function POST(request: Request, context: { params: Promise<{ hash: string }> }) {
  const { hash } = await context.params;
  const payload = await request.json().catch(() => null);
  return proxyInternal(`/api/v1/interno/fiscal/matriz-df/pacotes/${encodeURIComponent(hash)}/aprovar`, { method: "POST", body: JSON.stringify(payload) });
}
