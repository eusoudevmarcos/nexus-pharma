import { proxyInternal } from "@/lib/internal-proxy";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  return proxyInternal("/api/v1/interno/faturamento/economias", { method: "POST", body: JSON.stringify(payload) });
}
