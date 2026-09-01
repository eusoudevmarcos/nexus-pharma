import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "../infra/prisma.js";
import { authenticate, requireTenantRoles, tenantContext } from "../security/auth.js";
import { tenantRolesAtLeast } from "../security/access-control.js";
import { getPostSaleDetail, reverseSale } from "../services/post-sale.service.js";

const itemSchema = z.object({
  item_venda_id: z.string().uuid(),
  quantidade: z.number().positive().max(1_000_000),
  condicao: z.enum(["RESALABLE", "DAMAGED", "EXPIRED", "OTHER"]),
});

const reversalSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("FULL_CANCELLATION"),
    sessao_caixa_id: z.string().uuid(),
    motivo: z.string().trim().min(10).max(1000),
    idempotency_key: z.string().min(8).max(100).default(() => randomUUID()),
  }),
  z.object({
    tipo: z.literal("PARTIAL_RETURN"),
    sessao_caixa_id: z.string().uuid(),
    motivo: z.string().trim().min(10).max(1000),
    idempotency_key: z.string().min(8).max(100).default(() => randomUUID()),
    itens: z.array(itemSchema).min(1).max(100),
  }),
]);

export async function postSaleRoutes(app: FastifyInstance) {
  const read = [authenticate, tenantContext, requireTenantRoles(tenantRolesAtLeast("POS", "VIEW"))];
  const operate = [authenticate, tenantContext, requireTenantRoles(tenantRolesAtLeast("POS", "OPERATE"))];

  app.get("/vendas", { preHandler: read }, async (request) => {
    const parsed = z.object({ limite: z.coerce.number().int().min(1).max(200).default(50) }).safeParse(request.query);
    const limit = parsed.success ? parsed.data.limite : 50;
    return prisma.sale.findMany({
      where: { companyId: request.tenant!.companyId, status: { in: ["COMPLETED", "CANCELLED"] } },
      select: {
        id: true,
        soldAt: true,
        status: true,
        originalGrossAmount: true,
        discountAmount: true,
        grossAmount: true,
        taxAmount: true,
        items: { select: { id: true, productName: true, quantity: true, unitPrice: true, reversalItems: { select: { quantity: true } } } },
        nfceDocuments: { select: { id: true, status: true, series: true, number: true }, orderBy: { createdAt: "desc" }, take: 1 },
        reversals: { select: { id: true, type: true, status: true, fiscalStatus: true, grossAmount: true, createdAt: true }, orderBy: { createdAt: "desc" } },
      },
      orderBy: { soldAt: "desc" },
      take: limit,
    });
  });

  app.get<{ Params: { id: string } }>("/vendas/:id", { preHandler: read }, async (request, reply) => {
    const id = z.string().uuid().safeParse(request.params.id);
    if (!id.success) return reply.status(400).send({ erro: "VENDA_INVALIDA" });
    return reply.send(await getPostSaleDetail(request.tenant!.companyId, id.data));
  });

  app.post<{ Params: { id: string } }>("/vendas/:id/estornos", { preHandler: operate }, async (request, reply) => {
    const id = z.string().uuid().safeParse(request.params.id);
    const parsed = reversalSchema.safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "ESTORNO_INVALIDO", detalhes: parsed.success ? undefined : parsed.error.flatten() });
    if (parsed.data.tipo === "FULL_CANCELLATION" && !["OWNER", "ADMIN", "MANAGER"].includes(request.tenant!.role)) {
      return reply.status(403).send({ erro: "CANCELAMENTO_TOTAL_EXIGE_GESTOR" });
    }
    const result = await reverseSale({
      companyId: request.tenant!.companyId,
      saleId: id.data,
      cashSessionId: parsed.data.sessao_caixa_id,
      userId: request.user.sub,
      requestId: request.id,
      type: parsed.data.tipo,
      idempotencyKey: parsed.data.idempotency_key,
      reason: parsed.data.motivo,
      items: parsed.data.tipo === "PARTIAL_RETURN" ? parsed.data.itens.map((item) => ({ saleItemId: item.item_venda_id, quantity: item.quantidade, condition: item.condicao })) : undefined,
    });
    return reply.status(result.idempotent ? 200 : 201).send(result);
  });

  app.get("/pendencias-fiscais", { preHandler: read }, async (request) => prisma.saleReversal.findMany({
    where: { companyId: request.tenant!.companyId, fiscalStatus: "PENDING" },
    select: {
      id: true, type: true, reason: true, grossAmount: true, createdAt: true,
      sale: { select: { id: true, soldAt: true, nfceDocuments: { where: { status: "AUTHORIZED" }, select: { id: true, series: true, number: true, accessKey: true } } } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  }));

  app.get("/reembolsos-pendentes", { preHandler: [authenticate, tenantContext, requireTenantRoles(["OWNER", "ADMIN", "MANAGER", "FINANCE"])] }, async (request) => prisma.paymentRefund.findMany({
    where: { cashSession: { companyId: request.tenant!.companyId }, status: "BLOCKED" },
    select: {
      id: true, amount: true, status: true, reason: true, createdAt: true,
      salePayment: { select: { method: true, externalReference: true, sale: { select: { id: true, soldAt: true } } } },
      reversal: { select: { id: true, type: true, reason: true } },
    },
    orderBy: { createdAt: "asc" },
  }));
}
