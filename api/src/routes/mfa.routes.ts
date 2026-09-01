import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../security/auth.js";
import { prisma } from "../infra/prisma.js";
import { establishAuthenticatedSession } from "../services/auth-session.service.js";
import { activateMfa, beginMfaEnrollment, disableMfa, mfaRequirement, stepUpMfa, verifyMfaLoginChallenge } from "../services/mfa.service.js";
import { recordSecurityEvent } from "../services/security-events.js";

const code = z.string().trim().min(6).max(20);

function mfaError(reply: import("fastify").FastifyReply, cause: unknown) {
  const error = cause instanceof Error ? cause.message : "MFA_OPERACAO_NAO_CONCLUIDA";
  const unauthorized = ["MFA_CODIGO_INVALIDO", "MFA_CODIGO_JA_UTILIZADO", "MFA_DESAFIO_INVALIDO_OU_EXPIRADO", "CREDENCIAIS_INVALIDAS"].includes(error);
  return reply.status(unauthorized ? 401 : 409).send({ erro: error });
}

export async function mfaRoutes(app: FastifyInstance) {
  app.post("/login", { config: { rateLimit: { max: 8, timeWindow: "5 minutes" } } }, async (request, reply) => {
    const parsed = z.object({ desafio: z.string().min(40).max(200), codigo: code }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "MFA_DESAFIO_INVALIDO" });
    try {
      const result = await verifyMfaLoginChallenge(parsed.data.desafio, parsed.data.codigo);
      const established = await establishAuthenticatedSession({ request, reply, user: result.user, mfaVerified: true });
      for (const revokedId of established.session.revokedIds) await recordSecurityEvent({ action: "AUTH_SESSION_LIMIT_REVOKED", userId: result.user.id, sessionId: revokedId, requestId: request.id, ipAddress: request.ip }).catch(() => undefined);
      await recordSecurityEvent({ action: "AUTH_MFA_SUCCEEDED", userId: result.user.id, sessionId: established.session.created.id, requestId: request.id, ipAddress: request.ip, metadata: { recoveryCodeUsed: result.recoveryCodeUsed, assuranceLevel: 2 } }).catch(() => undefined);
      const { session: _session, ...response } = established; void _session;
      return reply.send(response);
    } catch (cause) {
      await recordSecurityEvent({ action: "AUTH_MFA_FAILED", requestId: request.id, ipAddress: request.ip, metadata: { reason: cause instanceof Error ? cause.message : "UNKNOWN" } }).catch(() => undefined);
      return mfaError(reply, cause);
    }
  });

  app.get("/status", { preHandler: [authenticate] }, async (request) => {
    const [status, session] = await Promise.all([
      mfaRequirement(request.user.sub),
      prisma.authSession.findUnique({ where: { id: request.user.sid }, select: { assuranceLevel: true, mfaVerifiedAt: true } }),
    ]);
    return { ...status, session: { assuranceLevel: session?.assuranceLevel ?? 1, verifiedAt: session?.mfaVerifiedAt ?? null, stepUpValidUntil: session?.mfaVerifiedAt ? new Date(session.mfaVerifiedAt.getTime() + 10 * 60 * 1000) : null } };
  });

  app.post("/enroll", { preHandler: [authenticate], config: { rateLimit: { max: 4, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const parsed = z.object({ senha: z.string().min(8).max(200) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "CREDENCIAIS_INVALIDAS" });
    try { return reply.status(201).send(await beginMfaEnrollment(request.user.sub, request.user.email, parsed.data.senha)); }
    catch (cause) { return mfaError(reply, cause); }
  });

  app.post("/activate", { preHandler: [authenticate], config: { rateLimit: { max: 8, timeWindow: "10 minutes" } } }, async (request, reply) => {
    const parsed = z.object({ codigo: code }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "MFA_CODIGO_INVALIDO" });
    try {
      const result = await activateMfa(request.user.sub, request.user.sid, parsed.data.codigo);
      await recordSecurityEvent({ action: "AUTH_MFA_ENROLLED", userId: request.user.sub, sessionId: request.user.sid, requestId: request.id, ipAddress: request.ip }).catch(() => undefined);
      return reply.send(result);
    } catch (cause) { return mfaError(reply, cause); }
  });

  app.post("/step-up", { preHandler: [authenticate], config: { rateLimit: { max: 8, timeWindow: "10 minutes" } } }, async (request, reply) => {
    const parsed = z.object({ codigo: code }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "MFA_CODIGO_INVALIDO" });
    try {
      const result = await stepUpMfa(request.user.sub, request.user.sid, parsed.data.codigo);
      await recordSecurityEvent({ action: "AUTH_MFA_STEP_UP", userId: request.user.sub, sessionId: request.user.sid, requestId: request.id, ipAddress: request.ip, metadata: { recoveryCodeUsed: result.recoveryCodeUsed } }).catch(() => undefined);
      return reply.send(result);
    } catch (cause) { return mfaError(reply, cause); }
  });

  app.post("/disable", { preHandler: [authenticate], config: { rateLimit: { max: 4, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const parsed = z.object({ senha: z.string().min(8).max(200), codigo: code, confirmacao: z.literal("DESATIVAR MFA") }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "MFA_DESATIVACAO_INVALIDA" });
    try {
      const result = await disableMfa(request.user.sub, request.user.sid, parsed.data.senha, parsed.data.codigo);
      await recordSecurityEvent({ action: "AUTH_MFA_DISABLED", userId: request.user.sub, sessionId: request.user.sid, requestId: request.id, ipAddress: request.ip }).catch(() => undefined);
      return reply.send(result);
    } catch (cause) { return mfaError(reply, cause); }
  });
}
