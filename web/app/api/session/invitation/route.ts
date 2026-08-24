import { NextResponse } from "next/server";
import { apiUrl } from "@/lib/api";

export async function POST(request: Request) {
  if (!apiUrl()) return NextResponse.json({ message: "API não configurada." }, { status: 503 });
  const payload = await request.json().catch(() => null);
  const upstream = await fetch(`${apiUrl()}/api/v1/usuarios/convites/aceitar`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  }).catch(() => null);
  if (!upstream) return NextResponse.json({ message: "API indisponível." }, { status: 503 });
  const body = await upstream.json().catch(() => ({})) as { erro?: string; [key: string]: unknown };
  if (!upstream.ok) {
    const messages: Record<string, string> = {
      CONVITE_EXPIRADO_OU_UTILIZADO: "Este convite expirou ou já foi utilizado.",
      EMPRESA_INATIVA: "A empresa deste convite não está ativa.",
      CONTA_BLOQUEADA: "Esta conta está bloqueada. Fale com o suporte.",
      ACEITE_INVALIDO: "Confira seu nome e use uma senha com pelo menos 10 caracteres, letra e número.",
    };
    return NextResponse.json({ message: messages[body.erro ?? ""] ?? "Não foi possível aceitar o convite." }, { status: upstream.status });
  }
  return NextResponse.json(body);
}
