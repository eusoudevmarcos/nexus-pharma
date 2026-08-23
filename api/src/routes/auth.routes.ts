import { compare } from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../infra/prisma.js";
import { authenticate } from "../security/auth.js";

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
        },
      });
      if (
        !user?.passwordHash ||
        user.status !== "ACTIVE" ||
        !(await compare(parsed.data.password, user.passwordHash))
      ) {
        return reply.status(401).send({ erro: "CREDENCIAIS_INVALIDAS" });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      const token = await reply.jwtSign({
        sub: user.id,
        email: user.email,
        systemRole: user.systemRole,
      });
      const refreshToken = newRefreshToken();
      await prisma.authSession.create({
        data: {
          userId: user.id,
          refreshTokenHash: tokenHash(refreshToken),
          userAgent: request.headers["user-agent"],
          ipAddress: request.ip,
          expiresAt: refreshExpiry(),
        },
      });
      return {
        access_token: token,
        refresh_token: refreshToken,
        token_type: "Bearer",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          system_role: user.systemRole,
        },
        companies: user.memberships.map((membership) => ({
          id: membership.company.id,
          name: membership.company.tradeName,
          status: membership.company.status,
          role: membership.role,
        })),
      };
    },
  );

  app.post(
    "/refresh",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = refreshSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.status(401).send({ erro: "SESSAO_INVALIDA" });
      const session = await prisma.authSession.findUnique({
        where: { refreshTokenHash: tokenHash(parsed.data.refresh_token) },
        include: { user: true },
      });
      if (
        !session ||
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        session.user.status !== "ACTIVE"
      ) {
        return reply.status(401).send({ erro: "SESSAO_INVALIDA" });
      }
      const nextRefreshToken = newRefreshToken();
      await prisma.authSession.update({
        where: { id: session.id },
        data: {
          refreshTokenHash: tokenHash(nextRefreshToken),
          expiresAt: refreshExpiry(),
          userAgent: request.headers["user-agent"],
          ipAddress: request.ip,
        },
      });
      return {
        access_token: await reply.jwtSign({
          sub: session.user.id,
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
      await prisma.authSession.updateMany({
        where: {
          refreshTokenHash: tokenHash(parsed.data.refresh_token),
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
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
      },
    });
    return user
      ? reply.send(user)
      : reply.status(404).send({ erro: "USUARIO_NAO_ENCONTRADO" });
  });
}
