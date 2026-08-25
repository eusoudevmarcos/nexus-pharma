import { proxyInternal } from "@/lib/internal-proxy";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  return proxyInternal("/api/v1/interno/privacidade/recuperacao/testes", { method: "POST", body: JSON.stringify(payload) });
}
