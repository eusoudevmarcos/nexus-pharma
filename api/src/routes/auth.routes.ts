import { compare, hashSync } from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../infra/prisma.js";
import { authenticate } from "../security/auth.js";
import { identityFingerprint, recordSecurityEvent } from "../services/security-events.js";
import { establishAuthenticatedSession } from "../services/auth-session.service.js";
import { createMfaLoginChallenge } from "../services/mfa.service.js";

const loginSchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(200),
});
const refreshSchema = z.object({ refresh_token: z.string().min(40).max(500) });
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const refreshExpiry = () =>
  new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
const newRefreshToken = () => randomBytes(48).toString("base64url");
const dummyPasswordHash = hashSync("Nexus-Pharma-Dummy-Password-2026", 12);

export async function authRoutes(app: FastifyInstance) {
  app.post(
    "/login",
    { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.status(400).send({ erro: "CREDENCIAIS_INVALIDAS" });

      const user = await prisma.user.findUnique({
        where: { email: parsed.data.email },
        include: {
          memberships: {
            where: { active: true },
            include: {
              company: { select: { id: true, tradeName: true, status: true } },
            },
          },
          mfaMethod: { select: { status: true } },
        },
      });
      const passwordMatches = await compare(parsed.data.password, user?.passwordHash ?? dummyPasswordHash);
      if (!user?.passwordHash || user.status !== "ACTIVE" || !passwordMatches) {
        await recordSecurityEvent({ action: "AUTH_LOGIN_FAILED", userId: user?.id, requestId: request.id, ipAddress: request.ip, metadata: { identity: identityFingerprint(parsed.data.email), reason: user && user.status !== "ACTIVE" ? "ACCOUNT_INACTIVE" : "INVALID_CREDENTIALS", userAgent: request.headers["user-agent"]?.slice(0, 250) } }).catch(() => undefined);
        return reply.status(401).send({ erro: "CREDENCIAIS_INVALIDAS" });
      }

      if (user.mfaMethod?.status === "ACTIVE") {
        const challenge = await createMfaLoginChallenge(user.id, request.ip, request.headers["user-agent"]);
        await recordSecurityEvent({ action: "AUTH_MFA_CHALLENGE_CREATED", userId: user.id, requestId: request.id, ipAddress: request.ip }).catch(() => undefined);
        return reply.status(202).send({ mfa_required: true, mfa_challenge: challenge.token, expires_in: challenge.expiresIn });
      }

      const established = await establishAuthenticatedSession({ request, reply, user, mfaVerified: false });
      for (const revokedId of established.session.revokedIds) await recordSecurityEvent({ action: "AUTH_SESSION_LIMIT_REVOKED", userId: user.id, sessionId: revokedId, requestId: request.id, ipAddress: request.ip }).catch(() => undefined);
      await recordSecurityEvent({ action: "AUTH_LOGIN_SUCCEEDED", userId: user.id, sessionId: established.session.created.id, requestId: request.id, ipAddress: request.ip, metadata: { userAgent: request.headers["user-agent"]?.slice(0, 250), assuranceLevel: 1 } }).catch(() => undefined);
      const { session: _session, ...response } = established;
      void _session;
      return response;
    },
  );

  app.post(
    "/refresh",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = refreshSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.status(401).send({ erro: "SESSAO_INVALIDA" });
      const presentedHash = tokenHash(parsed.data.refresh_token);
      const session = await prisma.authSession.findFirst({
        where: { OR: [{ refreshTokenHash: presentedHash }, { previousRefreshTokenHash: presentedHash }] },
        include: { user: true },
      });
      if (session?.previousRefreshTokenHash === presentedHash) {
        await prisma.authSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: "REFRESH_REUSE_DETECTED" } });
        await recordSecurityEvent({ action: "AUTH_REFRESH_REUSE_DETECTED", userId: session.userId, sessionId: session.id, requestId: request.id, ipAddress: request.ip, metadata: { userAgent: request.headers["user-agent"]?.slice(0, 250) } }).catch(() => undefined);
        return reply.status(401).send({ erro: "SESSAO_INVALIDA" });
      }
      if (
        !session ||
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        session.user.status !== "ACTIVE"
      ) {
        await recordSecurityEvent({ action: "AUTH_REFRESH_FAILED", userId: session?.userId, sessionId: session?.id, requestId: request.id, ipAddress: request.ip, metadata: { reason: session?.revokedAt ? "SESSION_REVOKED" : "TOKEN_INVALID_OR_EXPIRED" } }).catch(() => undefined);
        return reply.status(401).send({ erro: "SESSAO_INVALIDA" });
      }
      const nextRefreshToken = newRefreshToken();
      const rotated = await prisma.authSession.updateMany({
        where: { id: session.id, refreshTokenHash: presentedHash, revokedAt: null },
        data: {
          previousRefreshTokenHash: presentedHash,
          refreshTokenHash: tokenHash(nextRefreshToken),
          expiresAt: refreshExpiry(),
          userAgent: request.headers["user-agent"]?.slice(0, 500),
          ipAddress: request.ip,
          lastSeenAt: new Date(),
          rotatedAt: new Date(),
        },
      });
      if (rotated.count !== 1) {
        await prisma.authSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: "REFRESH_RACE_DETECTED" } });
        await recordSecurityEvent({ action: "AUTH_REFRESH_REUSE_DETECTED", userId: session.userId, sessionId: session.id, requestId: request.id, ipAddress: request.ip, metadata: { reason: "CONCURRENT_ROTATION" } }).catch(() => undefined);
        return reply.status(401).send({ erro: "SESSAO_INVALIDA" });
      }
      await recordSecurityEvent({ action: "AUTH_REFRESH_ROTATED", userId: session.userId, sessionId: session.id, requestId: request.id, ipAddress: request.ip, metadata: { contextChanged: session.ipAddress !== request.ip || session.userAgent !== request.headers["user-agent"] } }).catch(() => undefined);
      return {
        access_token: await reply.jwtSign({
          sub: session.user.id,
          sid: session.id,
          email: session.user.email,
          systemRole: session.user.systemRole,
        }),
        refresh_token: nextRefreshToken,
        token_type: "Bearer",
      };
    },
  );

  app.post("/logout", async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (parsed.success) {
      const presentedHash = tokenHash(parsed.data.refresh_token);
      const session = await prisma.authSession.findFirst({ where: { OR: [{ refreshTokenHash: presentedHash }, { previousRefreshTokenHash: presentedHash }] } });
      if (session) {
        await prisma.authSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: "USER_LOGOUT" } });
        await recordSecurityEvent({ action: "AUTH_SESSION_REVOKED", userId: session.userId, sessionId: session.id, requestId: request.id, ipAddress: request.ip, metadata: { reason: "USER_LOGOUT" } }).catch(() => undefined);
      }
    }
    return reply.status(204).send();
  });

  app.get("/me", { preHandler: authenticate }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
      select: {
        id: true,
        email: true,
        name: true,
        systemRole: true,
        status: true,
        memberships: {
          where: { active: true },
          select: {
            role: true,
            company: { select: { id: true, tradeName: true, status: true } },
          },
        },
        primeMemberships: {
          where: { active: true },
          select: { role: true, organization: { select: { id: true, code: true, tradeName: true, kind: true, status: true } } },
        },
      },
    });
    return user
      ? reply.send(user)
      : reply.status(404).send({ erro: "USUARIO_NAO_ENCONTRADO" });
  });
}
