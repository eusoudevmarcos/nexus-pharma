import { hash } from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "../infra/prisma.js";
import { deliverInvitationEmail } from "../services/email-delivery.js";
import {
  authenticate,
  requireTenantRoles,
  tenantContext,
} from "../security/auth.js";

const tenantRoles = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "FINANCE",
  "PHARMACIST",
  "OPERATOR",
  "VIEWER",
] as const;
const invitationSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  perfil: z.enum(tenantRoles).refine((role) => role !== "OWNER", {
    message: "O perfil proprietário não pode ser enviado por convite.",
  }),
});
const membershipSchema = z
  .object({
    perfil: z.enum(tenantRoles).optional(),
    ativo: z.boolean().optional(),
  })
  .refine((value) => value.perfil !== undefined || value.ativo !== undefined);
const acceptanceSchema = z.object({
  token: z.string().min(40).max(200),
  nome: z.string().trim().min(3).max(160),
  senha: z
    .string()
    .min(10)
    .max(200)
    .regex(/[A-Za-z]/, "A senha deve conter uma letra.")
    .regex(/[0-9]/, "A senha deve conter um número."),
});
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const invitationExpiry = () => new Date(Date.now() + 72 * 60 * 60 * 1000);
const internalRoles = new Set([
  "INTERNAL_ADMIN",
  "DEVELOPER",
  "HELPDESK",
  "FINANCE",
  "COMMERCIAL",
]);

export async function usersRoutes(app: FastifyInstance) {
  app.get(
    "/convites",
    {
      preHandler: [
        authenticate,
        tenantContext,
        requireTenantRoles(["OWNER", "ADMIN", "MANAGER"]),
      ],
    },
    async (request) =>
      prisma.invitation.findMany({
        where: {
          companyId: request.tenant!.companyId,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
          createdAt: true,
          invitedBy: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
  );

  app.post(
    "/convites",
    {
      preHandler: [
        authenticate,
        tenantContext,
        requireTenantRoles(["OWNER", "ADMIN"]),
      ],
    },
    async (request, reply) => {
      const parsed = invitationSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ erro: "CONVITE_INVALIDO", detalhes: parsed.error.flatten() });
      }
      const companyId = request.tenant!.companyId;
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { tradeName: true },
      });
      if (!company) return reply.status(404).send({ erro: "EMPRESA_NAO_ENCONTRADA" });
      const existingMember = await prisma.membership.findFirst({
        where: { companyId, user: { email: parsed.data.email } },
      });
      if (existingMember) {
        return reply.status(409).send({ erro: "USUARIO_JA_VINCULADO" });
      }
      const pending = await prisma.invitation.findFirst({
        where: {
          companyId,
          email: parsed.data.email,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (pending) return reply.status(409).send({ erro: "CONVITE_JA_ENVIADO" });

      const token = randomBytes(36).toString("base64url");
      const invitation = await prisma.$transaction(async (tx) => {
        const created = await tx.invitation.create({
          data: {
            companyId,
            email: parsed.data.email,
            role: parsed.data.perfil,
            tokenHash: tokenHash(token),
            invitedById: request.user.sub,
            expiresAt: invitationExpiry(),
          },
          select: { id: true, email: true, role: true, expiresAt: true },
        });
        await tx.auditLog.create({
          data: {
            companyId,
            userId: request.user.sub,
            action: "USER_INVITED",
            entity: "Invitation",
            entityId: created.id,
            requestId: request.id,
            ipAddress: request.ip,
            after: { email: created.email, role: created.role },
          },
        });
        return created;
      });
      const delivery = await deliverInvitationEmail({
        invitationId: invitation.id,
        companyId,
        companyName: company.tradeName,
        recipient: invitation.email,
        role: invitation.role,
        token,
      });
      return reply.status(201).send({
        ...invitation,
        token,
        delivery: { status: delivery.delivery.status, automatic: delivery.automatic },
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    "/convites/:id/reenviar",
    {
      preHandler: [
        authenticate,
        tenantContext,
        requireTenantRoles(["OWNER", "ADMIN"]),
      ],
    },
    async (request, reply) => {
      const id = z.string().uuid().safeParse(request.params.id);
      if (!id.success) return reply.status(400).send({ erro: "CONVITE_INVALIDO" });
      const invitation = await prisma.invitation.findFirst({
        where: { id: id.data, companyId: request.tenant!.companyId, acceptedAt: null },
        include: { company: { select: { tradeName: true } } },
      });
      if (!invitation) return reply.status(404).send({ erro: "CONVITE_NAO_ENCONTRADO" });
      const token = randomBytes(36).toString("base64url");
      const expiresAt = invitationExpiry();
      await prisma.$transaction([
        prisma.invitation.update({
          where: { id: invitation.id },
          data: { tokenHash: tokenHash(token), expiresAt },
        }),
        prisma.emailDelivery.updateMany({
          where: { invitationId: invitation.id, status: { in: ["QUEUED", "FAILED"] } },
          data: { status: "CANCELLED" },
        }),
        prisma.auditLog.create({
          data: {
            companyId: invitation.companyId,
            userId: request.user.sub,
            action: "USER_INVITATION_RESENT",
            entity: "Invitation",
            entityId: invitation.id,
            requestId: request.id,
            ipAddress: request.ip,
          },
        }),
      ]);
      const delivery = await deliverInvitationEmail({
        invitationId: invitation.id,
        companyId: invitation.companyId,
        companyName: invitation.company.tradeName,
        recipient: invitation.email,
        role: invitation.role,
        token,
      });
      return reply.send({
        id: invitation.id,
        token,
        expiresAt,
        delivery: { status: delivery.delivery.status, automatic: delivery.automatic },
      });
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/convites/:id",
    {
      preHandler: [
        authenticate,
        tenantContext,
        requireTenantRoles(["OWNER", "ADMIN"]),
      ],
    },
    async (request, reply) => {
      const id = z.string().uuid().safeParse(request.params.id);
      if (!id.success) return reply.status(400).send({ erro: "CONVITE_INVALIDO" });
      const invitation = await prisma.invitation.findFirst({
        where: { id: id.data, companyId: request.tenant!.companyId, acceptedAt: null },
      });
      if (!invitation) return reply.status(404).send({ erro: "CONVITE_NAO_ENCONTRADO" });
      await prisma.$transaction([
        prisma.invitation.delete({ where: { id: invitation.id } }),
        prisma.auditLog.create({
          data: {
            companyId: request.tenant!.companyId,
            userId: request.user.sub,
            action: "USER_INVITATION_REVOKED",
            entity: "Invitation",
            entityId: invitation.id,
            requestId: request.id,
            ipAddress: request.ip,
            before: { email: invitation.email, role: invitation.role },
          },
        }),
      ]);
      return reply.status(204).send();
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/membros/:id",
    {
      preHandler: [
        authenticate,
        tenantContext,
        requireTenantRoles(["OWNER", "ADMIN"]),
      ],
    },
    async (request, reply) => {
      const id = z.string().uuid().safeParse(request.params.id);
      const parsed = membershipSchema.safeParse(request.body);
      if (!id.success || !parsed.success) {
        return reply.status(400).send({ erro: "ALTERACAO_INVALIDA" });
      }
      const companyId = request.tenant!.companyId;
      const membership = await prisma.membership.findFirst({
        where: { id: id.data, companyId },
      });
      if (!membership) return reply.status(404).send({ erro: "MEMBRO_NAO_ENCONTRADO" });
      const internal = internalRoles.has(request.user.systemRole);
      if (!internal && request.tenant!.role !== "OWNER" && membership.role === "OWNER") {
        return reply.status(403).send({ erro: "PROPRIETARIO_PROTEGIDO" });
      }
      if (!internal && request.tenant!.role !== "OWNER" && parsed.data.perfil === "OWNER") {
        return reply.status(403).send({ erro: "PERFIL_NAO_AUTORIZADO" });
      }
      if (membership.userId === request.user.sub && parsed.data.ativo === false) {
        return reply.status(409).send({ erro: "AUTO_SUSPENSAO_NAO_PERMITIDA" });
      }
      const removesOwner =
        membership.role === "OWNER" &&
        (parsed.data.ativo === false ||
          (parsed.data.perfil !== undefined && parsed.data.perfil !== "OWNER"));
      if (removesOwner) {
        const owners = await prisma.membership.count({
          where: { companyId, role: "OWNER", active: true },
        });
        if (owners <= 1) return reply.status(409).send({ erro: "ULTIMO_PROPRIETARIO" });
      }
      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.membership.update({
          where: { id: membership.id },
          data: {
            ...(parsed.data.perfil !== undefined && { role: parsed.data.perfil }),
            ...(parsed.data.ativo !== undefined && { active: parsed.data.ativo }),
          },
          include: { user: { select: { id: true, name: true, email: true } } },
        });
        await tx.auditLog.create({
          data: {
            companyId,
            userId: request.user.sub,
            action: "MEMBERSHIP_UPDATED",
            entity: "Membership",
            entityId: membership.id,
            requestId: request.id,
            ipAddress: request.ip,
            before: { role: membership.role, active: membership.active },
            after: { role: result.role, active: result.active },
          },
        });
        return result;
      });
      return reply.send(updated);
    },
  );

  app.post("/convites/aceitar", async (request, reply) => {
    const parsed = acceptanceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ erro: "ACEITE_INVALIDO", detalhes: parsed.error.flatten() });
    }
    const invitation = await prisma.invitation.findUnique({
      where: { tokenHash: tokenHash(parsed.data.token) },
      include: { company: { select: { id: true, tradeName: true, status: true } } },
    });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
      return reply.status(410).send({ erro: "CONVITE_EXPIRADO_OU_UTILIZADO" });
    }
    if (["SUSPENDED", "CANCELLED"].includes(invitation.company.status)) {
      return reply.status(403).send({ erro: "EMPRESA_INATIVA" });
    }
    const existing = await prisma.user.findUnique({ where: { email: invitation.email } });
    if (existing && ["SUSPENDED", "DISABLED"].includes(existing.status)) {
      return reply.status(403).send({ erro: "CONTA_BLOQUEADA" });
    }
    const requiresLogin = existing?.status === "ACTIVE";
    const passwordHash = requiresLogin ? undefined : await hash(parsed.data.senha, 12);
    const result = await prisma.$transaction(async (tx) => {
      const user = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: requiresLogin
              ? {}
              : { name: parsed.data.nome, passwordHash, status: "ACTIVE" },
          })
        : await tx.user.create({
            data: {
              email: invitation.email,
              name: parsed.data.nome,
              passwordHash: passwordHash!,
              status: "ACTIVE",
            },
          });
      await tx.membership.upsert({
        where: {
          companyId_userId: { companyId: invitation.companyId, userId: user.id },
        },
        create: {
          companyId: invitation.companyId,
          userId: user.id,
          role: invitation.role,
          active: true,
        },
        update: { role: invitation.role, active: true },
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          companyId: invitation.companyId,
          userId: user.id,
          action: "INVITATION_ACCEPTED",
          entity: "Invitation",
          entityId: invitation.id,
          requestId: request.id,
          ipAddress: request.ip,
          after: { role: invitation.role },
        },
      });
      return user;
    });
    return reply.send({
      accepted: true,
      requiresLogin,
      company: invitation.company.tradeName,
      user: { id: result.id, email: result.email, name: result.name },
    });
  });
}
