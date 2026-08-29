import { proxyPortal } from "@/lib/portal-proxy";

const safeSegment = /^[a-zA-Z0-9_-]+$/;

async function forward(request: Request, context: { params: Promise<{ path: string[] }> }, method: string) {
  const { path } = await context.params;
  if (!path?.length || path.some((segment) => !safeSegment.test(segment))) {
    return Response.json({ message: "Caminho fiscal inválido." }, { status: 400 });
  }
  const body = ["POST", "PUT", "PATCH"].includes(method)
    ? JSON.stringify(await request.json().catch(() => null))
    : undefined;
  return proxyPortal(`/api/v1/fiscal/${path.map(encodeURIComponent).join("/")}`, { method, body });
}

export const GET = (request: Request, context: { params: Promise<{ path: string[] }> }) => forward(request, context, "GET");
export const POST = (request: Request, context: { params: Promise<{ path: string[] }> }) => forward(request, context, "POST");
export const PUT = (request: Request, context: { params: Promise<{ path: string[] }> }) => forward(request, context, "PUT");
