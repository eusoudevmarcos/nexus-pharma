import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../infra/prisma.js";

export type PrimeContext = {
  organizationId: string;
  organizationKind: "PLATFORM" | "LABORATORY" | "DISTRIBUTOR" | "WHOLESALER";
  role: "OWNER" | "ADMIN" | "MANAGER" | "SALES" | "LOGISTICS" | "ANALYST";
  governance: boolean;
};

declare module "fastify" {
  interface FastifyRequest {
    prime?: PrimeContext;
  }
}

const internalPrimeRoles = new Set(["INTERNAL_ADMIN", "COMMERCIAL"]);
const uuid = z.string().uuid();

export async function ensurePrimePlatform() {
  return prisma.primeOrganization.upsert({
    where: { code: "NEXUS_PRIME" },
    update: {},
    create: { code: "NEXUS_PRIME", legalName: "Nexus Prime — Rede de Abastecimento", tradeName: "Nexus Prime", kind: "PLATFORM" },
  });
}

export async function primeContext(request: FastifyRequest, reply: FastifyReply) {
  const mfa = await prisma.userMfaMethod.findUnique({ where: { userId: request.user.sub }, select: { status: true } });
  if (mfa?.status !== "ACTIVE") return reply.status(403).send({ erro: "MFA_CONFIGURACAO_OBRIGATORIA" });
  const selected = uuid.safeParse(request.headers["x-prime-organization-id"]);
  if (internalPrimeRoles.has(request.user.systemRole)) {
    const organization = selected.success
      ? await prisma.primeOrganization.findFirst({ where: { id: selected.data, status: "ACTIVE" } })
      : await ensurePrimePlatform();
    if (!organization) return reply.status(404).send({ erro: "ORGANIZACAO_PRIME_NAO_ENCONTRADA" });
    request.prime = { organizationId: organization.id, organizationKind: organization.kind, role: request.user.systemRole === "INTERNAL_ADMIN" ? "OWNER" : "MANAGER", governance: true };
    return;
  }

  const membership = await prisma.primeMembership.findFirst({
    where: { userId: request.user.sub, active: true, ...(selected.success ? { organizationId: selected.data } : {}), organization: { status: "ACTIVE" } },
    include: { organization: { select: { id: true, kind: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return reply.status(403).send({ erro: "SEM_ACESSO_AO_PAINEL_PRIME" });
  request.prime = { organizationId: membership.organizationId, organizationKind: membership.organization.kind, role: membership.role, governance: false };
}

export function requirePrimeRoles(roles: PrimeContext["role"][]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.prime || !roles.includes(request.prime.role)) return reply.status(403).send({ erro: "PERFIL_PRIME_NAO_AUTORIZADO" });
  };
}
