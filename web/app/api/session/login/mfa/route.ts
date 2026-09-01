import { NextResponse } from "next/server";
import { apiUrl } from "@/lib/api";
import { sessionCookieNames, sessionCookieOptions } from "@/lib/session-cookies";

export async function POST(request: Request) {
  if (!apiUrl()) return NextResponse.json({ message: "O ambiente ainda não foi conectado à API." }, { status: 503 });
  const payload = await request.json().catch(() => null);
  const upstream = await fetch(`${apiUrl()}/api/v1/auth/mfa/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" }).catch(() => null);
  if (!upstream) return NextResponse.json({ message: "A API está indisponível no momento." }, { status: 503 });
  const body = await upstream.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; user?: unknown; companies?: unknown; erro?: string };
  if (!upstream.ok || !body.access_token || !body.refresh_token) {
    const messages: Record<string, string> = { MFA_CODIGO_INVALIDO: "Código de autenticação inválido.", MFA_CODIGO_JA_UTILIZADO: "Este código já foi utilizado. Aguarde o próximo código.", MFA_DESAFIO_INVALIDO_OU_EXPIRADO: "O desafio expirou. Informe e-mail e senha novamente." };
    return NextResponse.json({ message: messages[body.erro ?? ""] ?? "Não foi possível confirmar a autenticação." }, { status: upstream.status });
  }
  const response = NextResponse.json({ user: body.user, companies: body.companies });
  response.cookies.set(sessionCookieNames.access, body.access_token, sessionCookieOptions(15 * 60));
  response.cookies.set(sessionCookieNames.refresh, body.refresh_token, sessionCookieOptions(30 * 24 * 60 * 60));
  return response;
}
