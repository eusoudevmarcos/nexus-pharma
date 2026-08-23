import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../infra/prisma.js";

export type AuthUser = {
  sub: string;
  email: string;
  systemRole:
    | "CUSTOMER"
    | "INTERNAL_ADMIN"
    | "DEVELOPER"
    | "HELPDESK"
    | "FINANCE"
    | "COMMERCIAL";
};

export type TenantContext = { companyId: string; role: string };

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

declare module "fastify" {
  interface FastifyRequest {
    tenant?: TenantContext;
  }
}

const internalRoles = new Set([
  "INTERNAL_ADMIN",
  "DEVELOPER",
  "HELPDESK",
  "FINANCE",
  "COMMERCIAL",
]);
const uuid = z.string().uuid();

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ erro: "TOKEN_INVALIDO_OU_EXPIRADO" });
  }
}

export async function tenantContext(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = uuid.safeParse(request.headers["x-company-id"]);
  if (!parsed.success)
    return reply.status(400).send({ erro: "EMPRESA_OBRIGATORIA" });

  if (internalRoles.has(request.user.systemRole)) {
    const company = await prisma.company.findUnique({
      where: { id: parsed.data },
      select: { id: true },
    });
    if (!company)
      return reply.status(404).send({ erro: "EMPRESA_NAO_ENCONTRADA" });
    request.tenant = { companyId: company.id, role: request.user.systemRole };
    return;
  }

  const membership = await prisma.membership.findUnique({
    where: {
      companyId_userId: { companyId: parsed.data, userId: request.user.sub },
    },
    include: { company: { select: { status: true } } },
  });
  if (!membership?.active)
    return reply.status(403).send({ erro: "SEM_ACESSO_A_EMPRESA" });
  if (["SUSPENDED", "CANCELLED"].includes(membership.company.status)) {
    return reply.status(403).send({ erro: "EMPRESA_INATIVA" });
  }
  request.tenant = { companyId: parsed.data, role: membership.role };
}

export function requireSystemRoles(roles: AuthUser["systemRole"][]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!roles.includes(request.user.systemRole))
      return reply.status(403).send({ erro: "PERFIL_NAO_AUTORIZADO" });
  };
}

export function requireTenantRoles(roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (
      !request.tenant ||
      (!internalRoles.has(request.user.systemRole) &&
        !roles.includes(request.tenant.role))
    ) {
      return reply
        .status(403)
        .send({ erro: "PERFIL_DA_EMPRESA_NAO_AUTORIZADO" });
    }
  };
}
