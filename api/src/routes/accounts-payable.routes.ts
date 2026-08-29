import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requireTenantRoles, tenantContext } from "../security/auth.js";
import { cancelAccountPayable, configureAccountPayable, getAccountsPayableDashboard, recordPayablePayment, reversePayablePayment } from "../services/accounts-payable.service.js";

const uuid = z.string().uuid();
const roles = ["OWNER", "ADMIN", "MANAGER", "FINANCE"];

export async function accountsPayableRoutes(app: FastifyInstance) {
  app.get("/painel", { preHandler: [authenticate, tenantContext, requireTenantRoles([...roles, "VIEWER"])] }, async (request, reply) => {
    const parsed = z.object({ fornecedor_id: uuid.optional(), status: z.enum(["DRAFT", "OPEN", "PARTIAL", "PAID", "CANCELLED", "DISPUTED"]).optional() }).safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ erro: "FILTROS_DE_CONTAS_A_PAGAR_INVALIDOS" });
    return getAccountsPayableDashboard({ companyId: request.tenant!.companyId, supplierId: parsed.data.fornecedor_id, status: parsed.data.status });
  });

  app.put<{ Params: { id: string } }>("/titulos/:id/configurar", { preHandler: [authenticate, tenantContext, requireTenantRoles(roles)] }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id);
    const parsed = z.object({ parcelas: z.array(z.object({ vencimento: z.coerce.date(), valor: z.number().positive().max(100_000_000), codigo_barras: z.string().trim().max(200).nullable().optional(), referencia: z.string().trim().max(120).nullable().optional() })).min(1).max(60), observacao: z.string().trim().max(1000).nullable().optional() }).safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "CONFIGURACAO_DO_TITULO_INVALIDA", detalhes: parsed.success ? undefined : parsed.error.flatten() });
    return reply.send(await configureAccountPayable({ companyId: request.tenant!.companyId, payableId: id.data, installments: parsed.data.parcelas.map((entry) => ({ dueAt: entry.vencimento, amount: entry.valor, barcode: entry.codigo_barras, externalRef: entry.referencia })), notes: parsed.data.observacao, userId: request.user.sub, requestId: request.id }));
  });

  app.post<{ Params: { id: string } }>("/parcelas/:id/pagamentos", { preHandler: [authenticate, tenantContext, requireTenantRoles(roles)] }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id);
    const parsed = z.object({ valor: z.number().positive().max(100_000_000), metodo: z.enum(["CASH", "PIX", "BANK_TRANSFER", "BOLETO", "CARD", "OTHER"]), pago_em: z.coerce.date().refine((date) => date <= new Date(Date.now() + 5 * 60_000), "PAGAMENTO_NAO_PODE_ESTAR_NO_FUTURO"), referencia: z.string().trim().max(160).nullable().optional(), observacao: z.string().trim().max(500).nullable().optional() }).safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "BAIXA_DE_PAGAMENTO_INVALIDA", detalhes: parsed.success ? undefined : parsed.error.flatten() });
    return reply.status(201).send(await recordPayablePayment({ companyId: request.tenant!.companyId, installmentId: id.data, amount: parsed.data.valor, method: parsed.data.metodo, paidAt: parsed.data.pago_em, reference: parsed.data.referencia, notes: parsed.data.observacao, userId: request.user.sub, requestId: request.id }));
  });

  app.post<{ Params: { id: string } }>("/pagamentos/:id/estornar", { preHandler: [authenticate, tenantContext, requireTenantRoles(roles)] }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id);
    const parsed = z.object({ motivo: z.string().trim().min(10).max(500) }).safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "ESTORNO_DE_PAGAMENTO_INVALIDO" });
    return reply.send(await reversePayablePayment({ companyId: request.tenant!.companyId, paymentId: id.data, reason: parsed.data.motivo, userId: request.user.sub, requestId: request.id }));
  });

  app.put<{ Params: { id: string } }>("/titulos/:id/cancelar", { preHandler: [authenticate, tenantContext, requireTenantRoles(roles)] }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id);
    const parsed = z.object({ motivo: z.string().trim().min(10).max(500) }).safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "CANCELAMENTO_DO_TITULO_INVALIDO" });
    return reply.send(await cancelAccountPayable({ companyId: request.tenant!.companyId, payableId: id.data, reason: parsed.data.motivo, userId: request.user.sub, requestId: request.id }));
  });
}
