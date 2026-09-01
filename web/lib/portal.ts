import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiUrl } from "./api";
import { sessionCookieNames } from "./session-cookies";

export type CompanyMembership = {
  role: string;
  company: { id: string; tradeName: string; status: string };
};

export type PortalProfile = {
  id: string;
  name: string;
  email: string;
  systemRole: string;
  status: string;
  memberships: CompanyMembership[];
  primeMemberships: Array<{ role: string; organization: { id: string; code: string; tradeName: string; kind: string; status: string } }>;
};

export const internalRoles = ["INTERNAL_ADMIN", "DEVELOPER", "HELPDESK", "FINANCE", "COMMERCIAL"];

export const getPortalSession = cache(async () => {
  const store = await cookies();
  const token = store.get(sessionCookieNames.access)?.value ?? null;
  const selectedCompanyId = store.get(sessionCookieNames.company)?.value ?? null;
  if (!token || !apiUrl()) {
    return { token, profile: null, membership: null, selectedCompanyId };
  }
  const response = await fetch(`${apiUrl()}/api/v1/auth/me`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);
  const profile = response?.ok ? ((await response.json()) as PortalProfile) : null;
  const membership =
    profile?.memberships.find((item) => item.company.id === selectedCompanyId) ??
    null;
  return { token, profile, membership, selectedCompanyId };
});

export async function requireCompany(roles?: string[]) {
  const session = await getPortalSession();
  if (!session.token) redirect("/entrar");
  if (!session.profile || !session.membership) redirect("/portal");
  if (roles && !roles.includes(session.membership.role)) redirect(defaultArea(session.membership.role));
  return { ...session, profile: session.profile, membership: session.membership };
}

export function defaultArea(role: string) {
  if (["PHARMACIST"].includes(role)) return "/portal/fiscal";
  if (["OPERATOR"].includes(role)) return "/portal/caixa";
  if (["BUYER"].includes(role)) return "/portal/operacao";
  return "/portal/gestao";
}

export function defaultInternalArea(role: string) {
  if (role === "HELPDESK") return "/portal/interno/suporte";
  if (role === "FINANCE") return "/portal/interno/financeiro";
  if (role === "COMMERCIAL") return "/portal/interno/comercial";
  return "/portal/interno/desenvolvimento";
}

export async function requireInternal(roles?: string[]) {
  const session = await getPortalSession();
  if (!session.token) redirect("/entrar");
  if (!session.profile || !internalRoles.includes(session.profile.systemRole)) redirect("/portal");
  if (roles && session.profile.systemRole !== "INTERNAL_ADMIN" && !roles.includes(session.profile.systemRole)) {
    redirect(defaultInternalArea(session.profile.systemRole));
  }
  return { ...session, profile: session.profile };
}

export async function requireIdentity() {
  const session = await getPortalSession();
  if (!session.token) redirect("/entrar");
  if (!session.profile) redirect("/entrar");
  return { ...session, profile: session.profile };
}

export async function requirePrime() {
  if (process.env.NEXT_PUBLIC_PRIME_ENABLED !== "true") redirect("/portal");
  const session = await getPortalSession();
  if (!session.token) redirect("/entrar");
  if (!session.profile) redirect("/entrar");
  const governance = ["INTERNAL_ADMIN", "COMMERCIAL"].includes(session.profile.systemRole);
  if (!governance && !session.profile.primeMemberships?.length) redirect("/portal");
  return { ...session, profile: session.profile, governance };
}

export async function primeFetch<T>(path: string): Promise<T | null> {
  const session = await requirePrime();
  if (!apiUrl()) return null;
  const jar = await cookies();
  const selected = jar.get("nexus_prime_org")?.value ?? session.profile.primeMemberships?.[0]?.organization.id;
  const response = await fetch(`${apiUrl()}${path}`, { headers: { authorization: `Bearer ${session.token}`, ...(selected ? { "x-prime-organization-id": selected } : {}) }, cache: "no-store" }).catch(() => null);
  return response?.ok ? ((await response.json()) as T) : null;
}

export async function identityFetch<T>(path: string): Promise<T | null> {
  const session = await requireIdentity();
  if (!apiUrl()) return null;
  const response = await fetch(`${apiUrl()}${path}`, { headers: { authorization: `Bearer ${session.token}` }, cache: "no-store" }).catch(() => null);
  return response?.ok ? ((await response.json()) as T) : null;
}

export async function portalFetch<T>(path: string): Promise<T | null> {
  const session = await requireCompany();
  if (!apiUrl()) return null;
  const response = await fetch(`${apiUrl()}${path}`, {
    headers: {
      authorization: `Bearer ${session.token}`,
      "x-company-id": session.membership.company.id,
    },
    cache: "no-store",
  }).catch(() => null);
  return response?.ok ? ((await response.json()) as T) : null;
}

export async function internalFetch<T>(path: string): Promise<T | null> {
  const session = await requireInternal();
  if (!apiUrl()) return null;
  const response = await fetch(`${apiUrl()}${path}`, {
    headers: { authorization: `Bearer ${session.token}` },
    cache: "no-store",
  }).catch(() => null);
  return response?.ok ? ((await response.json()) as T) : null;
}
