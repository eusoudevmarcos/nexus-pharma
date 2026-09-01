import { compare, hash as bcryptHash, hashSync } from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../infra/prisma.js";
import { authenticate } from "../security/auth.js";
import { identityFingerprint, recordSecurityEvent } from "../services/security-events.js";
import { establishAuthenticatedSession } from "../services/auth-session.service.js";
import { createMfaLoginChallenge } from "../services/mfa.service.js";
import { deliverPasswordResetEmail } from "../services/email-delivery.js";

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
const passwordSchema = z.string().min(12).max(72).refine((value) => /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value), { message: "A senha deve ter maiúscula, minúscula, número e símbolo." });

export async function authRoutes(app: FastifyInstance) {
  app.post("/password/forgot", { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const parsed = z.object({ email: z.string().email().transform((value) => value.trim().toLowerCase()) }).safeParse(request.body);
    if (!parsed.success) return reply.status(202).send({ mensagem: "Se a conta existir, enviaremos as instruções de redefinição." });
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true, email: true, status: true } });
    if (user?.status === "ACTIVE") {
      const token = randomBytes(48).toString("base64url");
      await prisma.$transaction([
        prisma.oneTimeToken.updateMany({ where: { userId: user.id, purpose: "PASSWORD_RESET", usedAt: null }, data: { usedAt: new Date() } }),
        prisma.oneTimeToken.create({ data: { userId: user.id, purpose: "PASSWORD_RESET", tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 30 * 60_000) } }),
      ]);
      const delivery = await deliverPasswordResetEmail({ recipient: user.email, token });
      await recordSecurityEvent({ action: "AUTH_PASSWORD_RESET_REQUESTED", userId: user.id, requestId: request.id, ipAddress: request.ip, metadata: { automaticDelivery: delivery.automatic, identity: identityFingerprint(user.email) } }).catch(() => undefined);
      return reply.status(202).send({ mensagem: "Se a conta existir, enviaremos as instruções de redefinição.", ...(config.DEPLOYMENT_STAGE === "development" && !delivery.automatic ? { development_reset_url: delivery.resetUrl } : {}) });
    }
    await compare("Nexus-Pharma-Dummy-Password-2026", dummyPasswordHash);
    return reply.status(202).send({ mensagem: "Se a conta existir, enviaremos as instruções de redefinição." });
  });

  app.post("/password/reset", { config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const parsed = z.object({ token: z.string().min(40).max(500), nova_senha: passwordSchema }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "REDEFINICAO_DE_SENHA_INVALIDA", detalhes: parsed.error.flatten() });
    const resetToken = await prisma.oneTimeToken.findUnique({ where: { tokenHash: tokenHash(parsed.data.token) }, include: { user: { select: { id: true, status: true } } } });
    if (!resetToken || resetToken.purpose !== "PASSWORD_RESET" || resetToken.usedAt || resetToken.expiresAt <= new Date() || resetToken.user.status !== "ACTIVE") return reply.status(400).send({ erro: "LINK_DE_REDEFINICAO_INVALIDO_OU_EXPIRADO" });
    const passwordHash = await bcryptHash(parsed.data.nova_senha, 12);
    await prisma.$transaction(async (tx) => {
      const consumed = await tx.oneTimeToken.updateMany({ where: { id: resetToken.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (consumed.count !== 1) throw new Error("LINK_DE_REDEFINICAO_INVALIDO_OU_EXPIRADO");
      await tx.user.update({ where: { id: resetToken.userId }, data: { passwordHash } });
      await tx.authSession.updateMany({ where: { userId: resetToken.userId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: "PASSWORD_RESET" } });
    });
    await recordSecurityEvent({ action: "AUTH_PASSWORD_RESET_COMPLETED", userId: resetToken.userId, requestId: request.id, ipAddress: request.ip }).catch(() => undefined);
    return reply.send({ mensagem: "Senha redefinida. Entre novamente em todos os dispositivos." });
  });

  app.post("/password/change", { preHandler: authenticate, config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const parsed = z.object({ senha_atual: z.string().min(8).max(200), nova_senha: passwordSchema }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "ALTERACAO_DE_SENHA_INVALIDA", detalhes: parsed.error.flatten() });
    const user = await prisma.user.findUnique({ where: { id: request.user.sub }, select: { id: true, passwordHash: true } });
    if (!user?.passwordHash || !(await compare(parsed.data.senha_atual, user.passwordHash))) return reply.status(401).send({ erro: "SENHA_ATUAL_INCORRETA" });
    if (await compare(parsed.data.nova_senha, user.passwordHash)) return reply.status(400).send({ erro: "NOVA_SENHA_DEVE_SER_DIFERENTE" });
    const passwordHash = await bcryptHash(parsed.data.nova_senha, 12);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.authSession.updateMany({ where: { userId: user.id, id: { not: request.user.sid }, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: "PASSWORD_CHANGED" } });
      await tx.oneTimeToken.updateMany({ where: { userId: user.id, purpose: "PASSWORD_RESET", usedAt: null }, data: { usedAt: new Date() } });
    });
    await recordSecurityEvent({ action: "AUTH_PASSWORD_CHANGED", userId: user.id, sessionId: request.user.sid, requestId: request.id, ipAddress: request.ip }).catch(() => undefined);
    return reply.send({ mensagem: "Senha alterada. As outras sessões foram encerradas." });
  });

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
