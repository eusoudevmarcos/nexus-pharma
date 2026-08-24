import { proxyPortal } from "@/lib/portal-proxy";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyPortal(`/api/v1/usuarios/convites/${encodeURIComponent(id)}`, { method: "DELETE" });
}
