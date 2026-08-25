import { NextResponse } from "next/server";
import { apiUrl } from "@/lib/api";
import { sessionCookieNames, sessionCookieOptions } from "@/lib/session-cookies";

type LoginResponse = {
  access_token?: string;
  refresh_token?: string;
  user?: unknown;
  companies?: unknown;
  erro?: string;
};

export async function POST(request: Request) {
  if (!apiUrl()) return NextResponse.json({ message: "O ambiente ainda não foi conectado à API." }, { status: 503 });

  const credentials = await request.json().catch(() => null);
  const upstream = await fetch(`${apiUrl()}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(credentials),
    cache: "no-store",
  }).catch(() => null);

  if (!upstream) return NextResponse.json({ message: "A API está indisponível no momento." }, { status: 503 });
  const body = await upstream.json().catch(() => ({})) as LoginResponse;
  if (!upstream.ok || !body.access_token || !body.refresh_token) {
    return NextResponse.json({ message: body.erro === "CREDENCIAIS_INVALIDAS" ? "E-mail ou senha inválidos." : "Não foi possível entrar." }, { status: upstream.status });
  }

  const response = NextResponse.json({ user: body.user, companies: body.companies });
  response.cookies.set(sessionCookieNames.access, body.access_token, sessionCookieOptions(15 * 60));
  response.cookies.set(sessionCookieNames.refresh, body.refresh_token, sessionCookieOptions(30 * 24 * 60 * 60));
  return response;
}
