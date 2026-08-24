import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { apiUrl } from "@/lib/api";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Profile = {
  memberships?: Array<{ company: { id: string; status: string } }>;
};

export async function POST(request: Request) {
  const token = (await cookies()).get("nexus_access")?.value;
  const body = (await request.json().catch(() => null)) as { companyId?: string } | null;
  if (!token) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });
  if (!apiUrl()) return NextResponse.json({ message: "API não configurada." }, { status: 503 });
  if (!body?.companyId || !uuid.test(body.companyId)) {
    return NextResponse.json({ message: "Empresa inválida." }, { status: 400 });
  }
  const upstream = await fetch(`${apiUrl()}/api/v1/auth/me`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);
  if (!upstream?.ok) return NextResponse.json({ message: "Não foi possível validar a empresa." }, { status: 401 });
  const profile = (await upstream.json()) as Profile;
  const membership = profile.memberships?.find((item) => item.company.id === body.companyId);
  if (!membership || ["SUSPENDED", "CANCELLED"].includes(membership.company.status)) {
    return NextResponse.json({ message: "Você não possui acesso a esta empresa." }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set("nexus_company", body.companyId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("nexus_company", "", { path: "/", maxAge: 0 });
  return response;
}
