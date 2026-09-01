import { createHash, randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { SystemRole, TenantRole } from "../generated/prisma/client.js";
import { config } from "../config.js";
import { prisma } from "../infra/prisma.js";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  systemRole: SystemRole;
  memberships: Array<{ role: TenantRole; company: { id: string; tradeName: string; status: string } }>;
};

export const authTokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const refreshExpiry = () => new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
const newRefreshToken = () => randomBytes(48).toString("base64url");

export async function establishAuthenticatedSession(input: { request: FastifyRequest; reply: FastifyReply; user: SessionUser; mfaVerified: boolean }) {
  const refreshToken = newRefreshToken();
  const now = new Date();
  const session = await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: input.user.id }, data: { lastLoginAt: now } });
    const created = await tx.authSession.create({ data: { userId: input.user.id, refreshTokenHash: authTokenHash(refreshToken), userAgent: input.request.headers["user-agent"]?.slice(0, 500), ipAddress: input.request.ip, expiresAt: refreshExpiry(), mfaVerifiedAt: input.mfaVerified ? now : null, assuranceLevel: input.mfaVerified ? 2 : 1 } });
    const excess = await tx.authSession.findMany({ where: { userId: input.user.id, revokedAt: null, expiresAt: { gt: now } }, orderBy: { createdAt: "desc" }, skip: config.MAX_ACTIVE_SESSIONS, select: { id: true } });
    if (excess.length) await tx.authSession.updateMany({ where: { id: { in: excess.map((item) => item.id) } }, data: { revokedAt: now, revokedReason: "SESSION_LIMIT" } });
    return { created, revokedIds: excess.map((item) => item.id) };
  });
  const accessToken = await input.reply.jwtSign({ sub: input.user.id, sid: session.created.id, email: input.user.email, systemRole: input.user.systemRole });
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "Bearer",
    assurance_level: session.created.assuranceLevel,
    user: { id: input.user.id, name: input.user.name, email: input.user.email, system_role: input.user.systemRole },
    companies: input.user.memberships.map((membership) => ({ id: membership.company.id, name: membership.company.tradeName, status: membership.company.status, role: membership.role })),
    session,
  };
}
