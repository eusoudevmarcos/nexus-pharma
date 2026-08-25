import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../infra/prisma.js";
import { recordSecurityEvent } from "../services/security-events.js";

export type AuthUser = {
  sub: string;
  sid: string;
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
  const sessionId = uuid.safeParse(request.user.sid);
  if (!sessionId.success) return reply.status(401).send({ erro: "SESSAO_INVALIDA" });
  const session = await prisma.authSession.findUnique({
    where: { id: sessionId.data },
    include: { user: { select: { id: true, status: true } } },
  });
  if (!session || session.userId !== request.user.sub || session.user.status !== "ACTIVE" || session.revokedAt || session.expiresAt <= new Date()) {
    return reply.status(401).send({ erro: "SESSAO_INVALIDA" });
  }
  if (session.lastSeenAt.getTime() < Date.now() - 5 * 60 * 1000) {
    await prisma.authSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
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
  if (!membership?.active) {
    await recordSecurityEvent({ action: "AUTH_TENANT_ACCESS_DENIED", userId: request.user.sub, companyId: parsed.data, sessionId: request.user.sid, requestId: request.id, ipAddress: request.ip, metadata: { reason: "MEMBERSHIP_INACTIVE" } }).catch(() => undefined);
    return reply.status(403).send({ erro: "SEM_ACESSO_A_EMPRESA" });
  }
  if (["SUSPENDED", "CANCELLED"].includes(membership.company.status)) {
    await recordSecurityEvent({ action: "AUTH_TENANT_ACCESS_DENIED", userId: request.user.sub, companyId: parsed.data, sessionId: request.user.sid, requestId: request.id, ipAddress: request.ip, metadata: { reason: "COMPANY_INACTIVE", companyStatus: membership.company.status } }).catch(() => undefined);
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
