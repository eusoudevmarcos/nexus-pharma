import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "../infra/prisma.js";
import { authenticate, requireTenantRoles, tenantContext } from "../security/auth.js";
import { addCashMovement, closeCashSession, getCashSession, openCashSession, reviewCashReconciliation } from "../services/cash-register.service.js";
import { discountLimitForRole } from "../services/processar-venda.service.js";

const amountSchema = z.number().nonnegative().max(10_000_000);
const declaredSchema = z.object({
  CASH: amountSchema.default(0),
  PIX: amountSchema.default(0),
  CREDIT_CARD: amountSchema.default(0),
  DEBIT_CARD: amountSchema.default(0),
  VOUCHER: amountSchema.default(0),
  OTHER: amountSchema.default(0),
});

export async function cashRegisterRoutes(app: FastifyInstance) {
  const read = [authenticate, tenantContext];
  const operate = [authenticate, tenantContext, requireTenantRoles(["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "OPERATOR"] )];
  const manage = [authenticate, tenantContext, requireTenantRoles(["OWNER", "ADMIN", "MANAGER"] )];

  app.get("/politica-desconto", { preHandler: read }, async (request) => {
    const company = await prisma.company.findUniqueOrThrow({ where: { id: request.tenant!.companyId }, select: { settings: true } });
    return { role: request.tenant!.role, maxPercent: discountLimitForRole(request.tenant!.role, company.settings) };
  });

  app.get("/estrutura", { preHandler: read }, async (request) => prisma.store.findMany({
    where: { companyId: request.tenant!.companyId, active: true },
    select: {
      id: true, code: true, name: true, type: true,
      pointsOfSale: {
        where: { active: true }, orderBy: { code: "asc" },
        select: { id: true, code: true, name: true, cashSessions: { where: { status: "OPEN" }, select: { id: true, openedAt: true, openingAmount: true, openedBy: { select: { name: true } } } } },
      },
    },
    orderBy: [{ type: "asc" }, { code: "asc" }],
  }));

  app.get("/sessoes", { preHandler: read }, async (request) => {
    const query = z.object({ status: z.enum(["OPEN", "CLOSED"]).optional(), limite: z.coerce.number().int().min(1).max(200).default(50) }).safeParse(request.query);
    const options = query.success ? query.data : { limite: 50 };
    return prisma.cashSession.findMany({
      where: { companyId: request.tenant!.companyId, ...(options.status ? { status: options.status } : {}) },
      select: {
        id: true, status: true, openingAmount: true, openedAt: true, closedAt: true, closingNote: true,
        store: { select: { id: true, code: true, name: true } }, pointOfSale: { select: { id: true, code: true, name: true } },
        openedBy: { select: { name: true } }, closedBy: { select: { name: true } }, reconciliation: true,
        _count: { select: { sales: true, payments: true, movements: true } },
      },
      orderBy: { openedAt: "desc" }, take: options.limite,
    });
  });

  app.post("/sessoes", { preHandler: operate }, async (request, reply) => {
    const parsed = z.object({ pdv_id: z.string().uuid(), saldo_inicial: amountSchema.default(0) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "ABERTURA_CAIXA_INVALIDA", detalhes: parsed.error.flatten() });
    const result = await openCashSession({ companyId: request.tenant!.companyId, pointOfSaleId: parsed.data.pdv_id, openingAmount: parsed.data.saldo_inicial, userId: request.user.sub, requestId: request.id });
    return reply.status(result.idempotent ? 200 : 201).send(result);
  });

  app.get<{ Params: { id: string } }>("/sessoes/:id", { preHandler: read }, async (request, reply) => {
    const id = z.string().uuid().safeParse(request.params.id);
    if (!id.success) return reply.status(400).send({ erro: "SESSAO_CAIXA_INVALIDA" });
    return reply.send(await getCashSession(request.tenant!.companyId, id.data));
  });

  app.post<{ Params: { id: string } }>("/sessoes/:id/movimentos", { preHandler: operate }, async (request, reply) => {
    const id = z.string().uuid().safeParse(request.params.id);
    const parsed = z.object({ tipo: z.enum(["SUPPLY", "WITHDRAWAL"]), valor: z.number().positive().max(10_000_000), motivo: z.string().min(5).max(500), idempotency_key: z.string().min(8).max(80).default(() => randomUUID()) }).safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "MOVIMENTO_CAIXA_INVALIDO", detalhes: parsed.success ? undefined : parsed.error.flatten() });
    const result = await addCashMovement({ companyId: request.tenant!.companyId, sessionId: id.data, userId: request.user.sub, requestId: request.id, type: parsed.data.tipo, amount: parsed.data.valor, reason: parsed.data.motivo, idempotencyKey: parsed.data.idempotency_key });
    return reply.status(result.idempotent ? 200 : 201).send(result);
  });

  app.post<{ Params: { id: string } }>("/sessoes/:id/fechar", { preHandler: operate }, async (request, reply) => {
    const id = z.string().uuid().safeParse(request.params.id);
    const parsed = z.object({ valores_declarados: declaredSchema, observacao: z.string().max(1000).nullable().default(null) }).safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "FECHAMENTO_CAIXA_INVALIDO", detalhes: parsed.success ? undefined : parsed.error.flatten() });
    return reply.send(await closeCashSession({ companyId: request.tenant!.companyId, sessionId: id.data, userId: request.user.sub, requestId: request.id, declared: parsed.data.valores_declarados, note: parsed.data.observacao }));
  });

  app.put<{ Params: { id: string } }>("/conciliacoes/:id/revisar", { preHandler: manage }, async (request, reply) => {
    const id = z.string().uuid().safeParse(request.params.id);
    const parsed = z.object({ observacao: z.string().min(10).max(1000) }).safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "REVISAO_CONCILIACAO_INVALIDA" });
    return reply.send(await reviewCashReconciliation({ companyId: request.tenant!.companyId, reconciliationId: id.data, userId: request.user.sub, requestId: request.id, note: parsed.data.observacao }));
  });
}
