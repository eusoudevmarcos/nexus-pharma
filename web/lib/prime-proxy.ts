import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiUrl } from "./api";
import { sessionCookieNames } from "./session-cookies";

export async function proxyPrime(path: string, init: RequestInit) {
  const jar = await cookies();
  const token = jar.get(sessionCookieNames.access)?.value;
  const organizationId = jar.get("nexus_prime_org")?.value;
  if (!token) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });
  if (!apiUrl()) return NextResponse.json({ message: "API não configurada." }, { status: 503 });
  const upstream = await fetch(`${apiUrl()}${path}`, { ...init, headers: { ...(init.body && { "content-type": "application/json" }), authorization: `Bearer ${token}`, ...(organizationId ? { "x-prime-organization-id": organizationId } : {}) }, cache: "no-store" }).catch(() => null);
  if (!upstream) return NextResponse.json({ message: "Rede Prime temporariamente indisponível." }, { status: 503 });
  if (upstream.status === 204) return new NextResponse(null, { status: 204 });
  const body = await upstream.json().catch(() => ({})) as { erro?: string; message?: string };
  const messages: Record<string, string> = {
    MFA_CONFIGURACAO_OBRIGATORIA: "Ative a autenticação em duas etapas antes de acessar o Painel Prime.",
    MFA_CONFIRMACAO_RECENTE_OBRIGATORIA: "Confirme sua identidade em Minha segurança para alterar as configurações Prime.",
    SEM_ACESSO_AO_PAINEL_PRIME: "Sua conta ainda não está vinculada a uma operação Prime.",
    PERFIL_PRIME_NAO_AUTORIZADO: "Seu perfil Prime não permite esta operação.",
  };
  return NextResponse.json(upstream.ok ? body : { message: body.message ?? messages[body.erro ?? ""] ?? "Não foi possível concluir a operação Prime." }, { status: upstream.status });
}
