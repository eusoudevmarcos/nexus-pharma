import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiUrl } from "./api";
import { sessionCookieNames } from "./session-cookies";

export async function proxyPortal(path: string, init: RequestInit) {
  const jar = await cookies();
  const token = jar.get(sessionCookieNames.access)?.value;
  const companyId = jar.get(sessionCookieNames.company)?.value;
  if (!token || !companyId) {
    return NextResponse.json({ message: "Sessão ou empresa não selecionada." }, { status: 401 });
  }
  if (!apiUrl()) return NextResponse.json({ message: "API não configurada." }, { status: 503 });
  const upstream = await fetch(`${apiUrl()}${path}`, {
    ...init,
    headers: {
      ...(init.body && { "content-type": "application/json" }),
      authorization: `Bearer ${token}`,
      "x-company-id": companyId,
    },
    cache: "no-store",
  }).catch(() => null);
  if (!upstream) return NextResponse.json({ message: "API indisponível." }, { status: 503 });
  if (upstream.status === 204) return new NextResponse(null, { status: 204 });
  const body = await upstream.json().catch(() => ({})) as { erro?: string };
  if (!upstream.ok) {
    const messages: Record<string, string> = {
      USUARIO_JA_VINCULADO: "Este usuário já pertence à empresa.",
      CONVITE_JA_ENVIADO: "Já existe um convite válido para este e-mail.",
      ULTIMO_PROPRIETARIO: "A empresa precisa manter ao menos um proprietário ativo.",
      AUTO_SUSPENSAO_NAO_PERMITIDA: "Você não pode suspender o próprio acesso.",
      PROPRIETARIO_PROTEGIDO: "Somente um proprietário pode alterar este acesso.",
    };
    return NextResponse.json({ message: messages[body.erro ?? ""] ?? "Não foi possível concluir a operação." }, { status: upstream.status });
  }
  return NextResponse.json(body, { status: upstream.status });
}
