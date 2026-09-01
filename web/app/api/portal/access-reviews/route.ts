import { proxyPortal } from "@/lib/portal-proxy";

export function GET() {
  return proxyPortal("/api/v1/usuarios/revisoes-acesso", { method: "GET" });
}

export async function POST(request: Request) {
  return proxyPortal("/api/v1/usuarios/revisoes-acesso", { method: "POST", body: await request.text() });
}
