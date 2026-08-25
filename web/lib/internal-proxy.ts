import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiUrl } from "./api";
import { sessionCookieNames } from "./session-cookies";

export async function proxyInternal(path: string, init: RequestInit) {
  const token = (await cookies()).get(sessionCookieNames.access)?.value;
  if (!token) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });
  if (!apiUrl()) return NextResponse.json({ message: "API não configurada." }, { status: 503 });
  const upstream = await fetch(`${apiUrl()}${path}`, {
    ...init,
    headers: { ...(init.body && { "content-type": "application/json" }), authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);
  if (!upstream) return NextResponse.json({ message: "API indisponível." }, { status: 503 });
  if (upstream.status === 204) return new NextResponse(null, { status: 204 });
  const body = await upstream.json().catch(() => ({})) as { erro?: string };
  if (!upstream.ok) return NextResponse.json({ message: body.erro === "PERFIL_NAO_AUTORIZADO" ? "Seu perfil não pode executar esta ação." : "Não foi possível concluir a operação." }, { status: upstream.status });
  return NextResponse.json(body, { status: upstream.status });
}
