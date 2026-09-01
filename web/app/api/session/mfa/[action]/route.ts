import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiUrl } from "@/lib/api";
import { sessionCookieNames } from "@/lib/session-cookies";

async function forward(request: Request, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params;
  const token = (await cookies()).get(sessionCookieNames.access)?.value;
  if (!token) return NextResponse.json({ message: "Sessão indisponível." }, { status: 401 });
  if (!apiUrl()) return NextResponse.json({ message: "API não configurada." }, { status: 503 });
  const upstream = await fetch(`${apiUrl()}/api/v1/auth/mfa/${encodeURIComponent(action)}`, { method: request.method, headers: { authorization: `Bearer ${token}`, ...(!["GET", "HEAD"].includes(request.method) && { "content-type": "application/json" }) }, body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.text(), cache: "no-store" }).catch(() => null);
  if (!upstream) return NextResponse.json({ message: "API indisponível." }, { status: 503 });
  const body = await upstream.json().catch(() => ({})) as { erro?: string; [key: string]: unknown };
  if (!upstream.ok) {
    const messages: Record<string, string> = {
      MFA_CHAVE_DE_CRIPTOGRAFIA_NAO_CONFIGURADA: "Configure MFA_ENCRYPTION_KEY no ambiente da API antes de ativar o MFA.",
      MFA_JA_ATIVO: "A autenticação em duas etapas já está ativa.",
      MFA_NAO_CONFIGURADO: "Inicie a configuração do autenticador primeiro.",
      MFA_CODIGO_INVALIDO: "Código inválido. Confira o horário do dispositivo e tente novamente.",
      MFA_CODIGO_JA_UTILIZADO: "Este código já foi utilizado. Aguarde o próximo.",
      CREDENCIAIS_INVALIDAS: "Senha atual inválida.",
    };
    return NextResponse.json({ message: messages[body.erro ?? ""] ?? "Não foi possível concluir a operação de segurança." }, { status: upstream.status });
  }
  return NextResponse.json(body, { status: upstream.status });
}

export const GET = forward;
export const POST = forward;
