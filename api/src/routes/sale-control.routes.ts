import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";
import { authenticate, requireTenantRoles, tenantContext } from "../security/auth.js";
import { tenantRolesAtLeast } from "../security/access-control.js";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const controlPolicySchema = z.object({
  nivel: z.enum(["NONE", "PRESCRIPTION_PRESENTATION", "PRESCRIPTION_RETENTION", "SPECIAL_CONTROL"]),
  identificar_comprador: z.boolean(),
  exigir_prescricao: z.boolean(),
  exigir_farmaceutico: z.boolean(),
  reter_prescricao: z.boolean(),
  idade_minima: z.number().int().min(0).max(130).nullable(),
  versao_regra: z.string().trim().max(30).nullable(),
  base_legal: z.string().trim().max(500).nullable(),
  metadata: z.record(z.unknown()).default({}),
}).superRefine((data, context) => {
  if (data.reter_prescricao && !data.exigir_prescricao) context.addIssue({ code: z.ZodIssueCode.custom, message: "retenção exige prescrição", path: ["reter_prescricao"] });
  if (data.nivel === "NONE" && (data.identificar_comprador || data.exigir_prescricao || data.exigir_farmaceutico || data.reter_prescricao || data.idade_minima !== null)) context.addIssue({ code: z.ZodIssueCode.custom, message: "selecione um nível de controle para ativar requisitos", path: ["nivel"] });
  if (data.nivel !== "NONE" && (!data.versao_regra || (data.base_legal?.length ?? 0) < 10)) context.addIssue({ code: z.ZodIssueCode.custom, message: "controle exige versão e base legal", path: ["base_legal"] });
});

const credentialSchema = z.object({
  conselho: z.string().trim().min(2).max(20).default("CRF"),
  registro: z.string().trim().min(2).max(40),
  uf: z.string().regex(/^[A-Z]{2}$/),
  status: z.enum(["DRAFT", "VERIFIED", "SUSPENDED", "EXPIRED"]),
  vigencia_inicio: z.coerce.date(),
  vigencia_fim: z.coerce.date().nullable().default(null),
}).refine((data) => !data.vigencia_fim || data.vigencia_fim >= data.vigencia_inicio, { message: "vigência final inválida", path: ["vigencia_fim"] });

export async function saleControlRoutes(app: FastifyInstance) {
  const read = [authenticate, tenantContext, requireTenantRoles(tenantRolesAtLeast("POS", "OPERATE"))];
  const manage = [authenticate, tenantContext, requireTenantRoles(["OWNER", "ADMIN", "MANAGER"] )];
  const fiscalManage = [authenticate, tenantContext, requireTenantRoles(["OWNER", "ADMIN", "MANAGER", "PHARMACIST"] )];

  app.get("/contexto", { preHandler: read }, async (request) => {
    const now = new Date();
    const [members, pharmacists] = await Promise.all([
      prisma.membership.findMany({
        where: { companyId: request.tenant!.companyId, active: true, role: { in: ["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "ATTENDANT", "OPERATOR"] }, user: { status: "ACTIVE" } },
        select: { role: true, user: { select: { id: true, name: true, email: true } } }, orderBy: { user: { name: "asc" } },
      }),
      prisma.pharmacistCredential.findMany({
        where: { companyId: request.tenant!.companyId, status: "VERIFIED", validFrom: { lte: now }, OR: [{ validUntil: null }, { validUntil: { gte: now } }], user: { status: "ACTIVE", memberships: { some: { companyId: request.tenant!.companyId, active: true, role: "PHARMACIST" } } } },
        include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { user: { name: "asc" } },
      }),
    ]);
    return { sellers: members.map((entry) => ({ ...entry.user, role: entry.role })), pharmacists };
  });

  app.get("/farmaceuticos", { preHandler: [authenticate, tenantContext, requireTenantRoles(["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "VIEWER"])] }, async (request) => prisma.pharmacistCredential.findMany({
    where: { companyId: request.tenant!.companyId }, include: { user: { select: { id: true, name: true, email: true, status: true } } }, orderBy: { user: { name: "asc" } },
  }));

  app.put<{ Params: { userId: string } }>("/farmaceuticos/:userId", { preHandler: manage }, async (request, reply) => {
    const userId = z.string().uuid().safeParse(request.params.userId);
    const parsed = credentialSchema.safeParse(request.body);
    if (!userId.success || !parsed.success) return reply.status(400).send({ erro: "CREDENCIAL_FARMACEUTICA_INVALIDA", detalhes: parsed.success ? undefined : parsed.error.flatten() });
    const membership = await prisma.membership.findFirst({ where: { companyId: request.tenant!.companyId, userId: userId.data, active: true, role: "PHARMACIST", user: { status: "ACTIVE" } } });
    if (!membership) return reply.status(409).send({ erro: "USUARIO_NAO_E_FARMACEUTICO_ATIVO" });
    const previous = await prisma.pharmacistCredential.findUnique({ where: { companyId_userId: { companyId: request.tenant!.companyId, userId: userId.data } } });
    const credential = await prisma.$transaction(async (tx) => {
      const saved = await tx.pharmacistCredential.upsert({
        where: { companyId_userId: { companyId: request.tenant!.companyId, userId: userId.data } },
        create: { companyId: request.tenant!.companyId, userId: userId.data, council: parsed.data.conselho, registration: parsed.data.registro, state: parsed.data.uf, status: parsed.data.status, validFrom: parsed.data.vigencia_inicio, validUntil: parsed.data.vigencia_fim, verifiedAt: parsed.data.status === "VERIFIED" ? new Date() : null },
        update: { council: parsed.data.conselho, registration: parsed.data.registro, state: parsed.data.uf, status: parsed.data.status, validFrom: parsed.data.vigencia_inicio, validUntil: parsed.data.vigencia_fim, verifiedAt: parsed.data.status === "VERIFIED" ? new Date() : null },
      });
      await tx.auditLog.create({ data: { companyId: request.tenant!.companyId, userId: request.user.sub, action: previous ? "UPDATE" : "CREATE", entity: "PHARMACIST_CREDENTIAL", entityId: saved.id, requestId: request.id, before: previous ? json(previous) : undefined, after: json(saved) } });
      return saved;
    });
    return reply.send(credential);
  });

  app.get("/produtos", { preHandler: read }, async (request) => prisma.product.findMany({
    where: { companyId: request.tenant!.companyId },
    select: { id: true, ean: true, name: true, activeIngredient: true, laboratory: true, active: true, controlLevel: true, requiresBuyerId: true, requiresPrescription: true, requiresPharmacist: true, retainsPrescription: true, minimumBuyerAge: true, controlRuleVersion: true, controlLegalBasis: true, controlMetadata: true },
    orderBy: { name: "asc" },
  }));

  app.put<{ Params: { id: string } }>("/produtos/:id/politica", { preHandler: fiscalManage }, async (request, reply) => {
    const id = z.string().uuid().safeParse(request.params.id);
    const parsed = controlPolicySchema.safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "POLITICA_DE_CONTROLE_INVALIDA", detalhes: parsed.success ? undefined : parsed.error.flatten() });
    const previous = await prisma.product.findFirst({ where: { id: id.data, companyId: request.tenant!.companyId } });
    if (!previous) return reply.status(404).send({ erro: "PRODUTO_NAO_ENCONTRADO" });
    const product = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({ where: { id: previous.id }, data: {
        controlLevel: parsed.data.nivel, requiresBuyerId: parsed.data.identificar_comprador, requiresPrescription: parsed.data.exigir_prescricao,
        requiresPharmacist: parsed.data.exigir_farmaceutico, retainsPrescription: parsed.data.reter_prescricao, minimumBuyerAge: parsed.data.idade_minima,
        controlRuleVersion: parsed.data.nivel === "NONE" ? null : parsed.data.versao_regra,
        controlLegalBasis: parsed.data.nivel === "NONE" ? null : parsed.data.base_legal,
        controlMetadata: json(parsed.data.metadata),
      } });
      await tx.auditLog.create({ data: { companyId: request.tenant!.companyId, userId: request.user.sub, action: "UPDATE", entity: "PRODUCT_SALE_CONTROL", entityId: updated.id, requestId: request.id, before: json({ controlLevel: previous.controlLevel, requiresBuyerId: previous.requiresBuyerId, requiresPrescription: previous.requiresPrescription, requiresPharmacist: previous.requiresPharmacist, retainsPrescription: previous.retainsPrescription, minimumBuyerAge: previous.minimumBuyerAge, controlRuleVersion: previous.controlRuleVersion, controlLegalBasis: previous.controlLegalBasis }), after: json(parsed.data) } });
      return updated;
    });
    return reply.send(product);
  });

  app.get("/registros", { preHandler: [authenticate, tenantContext, requireTenantRoles(["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "VIEWER"])] }, async (request) => prisma.controlledSaleRecord.findMany({
    where: { companyId: request.tenant!.companyId }, include: { saleItem: { select: { productName: true, ean: true, quantity: true } }, sale: { select: { soldAt: true, status: true, seller: { select: { name: true } } } }, pharmacistCredential: { include: { user: { select: { name: true } } } } }, orderBy: { createdAt: "desc" }, take: 200,
  }));
}
