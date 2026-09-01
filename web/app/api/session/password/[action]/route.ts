import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiUrl } from "@/lib/api";
import { sessionCookieNames } from "@/lib/session-cookies";

const actions: Record<string, string> = { forgot: "forgot", reset: "reset", change: "change" };

export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params;
  if (!actions[action] || !apiUrl()) return NextResponse.json({ message: "Operação indisponível." }, { status: 404 });
  const jar = await cookies();
  const access = jar.get(sessionCookieNames.access)?.value;
  if (action === "change" && !access) return NextResponse.json({ message: "Sua sessão expirou." }, { status: 401 });
  const upstream = await fetch(`${apiUrl()}/api/v1/auth/password/${actions[action]}`, { method: "POST", headers: { "content-type": "application/json", ...(access && { authorization: `Bearer ${access}` }) }, body: await request.text(), cache: "no-store" }).catch(() => null);
  if (!upstream) return NextResponse.json({ message: "A API está indisponível no momento." }, { status: 503 });
  const body = await upstream.json().catch(() => ({})) as { erro?: string; mensagem?: string; development_reset_url?: string };
  const messages: Record<string, string> = {
    REDEFINICAO_DE_SENHA_INVALIDA: "A nova senha precisa ter 12 caracteres, maiúscula, minúscula, número e símbolo.",
    ALTERACAO_DE_SENHA_INVALIDA: "A nova senha precisa ter 12 caracteres, maiúscula, minúscula, número e símbolo.",
    LINK_DE_REDEFINICAO_INVALIDO_OU_EXPIRADO: "Este link é inválido, já foi usado ou expirou.",
    SENHA_ATUAL_INCORRETA: "A senha atual não confere.",
    NOVA_SENHA_DEVE_SER_DIFERENTE: "Escolha uma senha diferente da atual.",
  };
  return NextResponse.json({ message: body.mensagem ?? messages[body.erro ?? ""] ?? "Não foi possível concluir a operação.", ...(body.development_reset_url && { developmentResetUrl: body.development_reset_url }) }, { status: upstream.status });
}
