import { proxyPortal } from "@/lib/portal-proxy";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  return proxyPortal("/api/v1/privacidade/solicitacoes", { method: "POST", body: JSON.stringify(payload) });
}
