import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requireTenantRoles, tenantContext } from "../security/auth.js";
import { awardSupplierProposal, cancelPurchaseQuote, createPurchaseQuote, getQuotationDashboard, inviteSupplier, openPurchaseQuote, saveSupplierProposal } from "../services/quotation.service.js";

const uuid = z.string().uuid();
const manage = ["OWNER", "ADMIN", "MANAGER"];
const amount = z.number().min(0).max(100_000_000);

export async function quotationRoutes(app: FastifyInstance) {
  app.get("/painel", { preHandler: [authenticate, tenantContext, requireTenantRoles([...manage, "FINANCE", "OPERATOR", "VIEWER"])] }, async (request) => getQuotationDashboard(request.tenant!.companyId));

  app.post("/cotacoes", { preHandler: [authenticate, tenantContext, requireTenantRoles(manage)] }, async (request, reply) => {
    const parsed = z.object({ loja_id: uuid, prazo_resposta: z.coerce.date().nullable().optional(), observacao: z.string().trim().max(1000).nullable().optional(), itens: z.array(z.object({ produto_id: uuid, quantidade: z.number().positive().max(10_000_000) })).min(1).max(300) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "COTACAO_INVALIDA", detalhes: parsed.error.flatten() });
    return reply.status(201).send(await createPurchaseQuote({ companyId: request.tenant!.companyId, storeId: parsed.data.loja_id, responseDueAt: parsed.data.prazo_resposta, notes: parsed.data.observacao, items: parsed.data.itens.map((item) => ({ productId: item.produto_id, quantity: item.quantidade })), userId: request.user.sub, requestId: request.id }));
  });

  app.post<{ Params: { id: string } }>("/cotacoes/:id/fornecedores", { preHandler: [authenticate, tenantContext, requireTenantRoles(manage)] }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id);
    const parsed = z.object({ fornecedor_id: uuid }).safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "FORNECEDOR_DA_COTACAO_INVALIDO" });
    return reply.status(201).send(await inviteSupplier({ companyId: request.tenant!.companyId, quoteId: id.data, supplierId: parsed.data.fornecedor_id, userId: request.user.sub, requestId: request.id }));
  });

  app.put<{ Params: { id: string } }>("/cotacoes/:id/abrir", { preHandler: [authenticate, tenantContext, requireTenantRoles(manage)] }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id);
    if (!id.success) return reply.status(400).send({ erro: "COTACAO_INVALIDA" });
    return reply.send(await openPurchaseQuote({ companyId: request.tenant!.companyId, quoteId: id.data, userId: request.user.sub, requestId: request.id }));
  });

  app.put<{ Params: { id: string } }>("/propostas/:id", { preHandler: [authenticate, tenantContext, requireTenantRoles(manage)] }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id);
    const parsed = z.object({ frete: amount.default(0), desconto_comercial: amount.default(0), desconto_financeiro: amount.default(0), condicao_pagamento: z.string().trim().max(300).nullable().optional(), prazo_entrega_dias: z.number().int().min(0).max(365), validade: z.coerce.date().nullable().optional(), observacao: z.string().trim().max(1000).nullable().optional(), itens: z.array(z.object({ item_cotacao_id: uuid, quantidade_ofertada: z.number().positive().max(10_000_000), quantidade_bonificada: z.number().min(0).max(10_000_000).default(0), custo_unitario: amount, desconto_percentual: z.number().min(0).max(100).default(0), tributo_nao_recuperavel: amount.default(0) })).min(1).max(300) }).safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "PROPOSTA_INVALIDA", detalhes: parsed.success ? undefined : parsed.error.flatten() });
    return reply.send(await saveSupplierProposal({ companyId: request.tenant!.companyId, proposalId: id.data, freightAmount: parsed.data.frete, commercialDiscountAmount: parsed.data.desconto_comercial, financialDiscountAmount: parsed.data.desconto_financeiro, paymentTerms: parsed.data.condicao_pagamento, deliveryDays: parsed.data.prazo_entrega_dias, validUntil: parsed.data.validade, notes: parsed.data.observacao, items: parsed.data.itens.map((item) => ({ quoteItemId: item.item_cotacao_id, offeredQuantity: item.quantidade_ofertada, bonusQuantity: item.quantidade_bonificada, unitCost: item.custo_unitario, discountPercent: item.desconto_percentual, nonRecoverableTaxAmount: item.tributo_nao_recuperavel })), userId: request.user.sub, requestId: request.id }));
  });

  app.post<{ Params: { id: string } }>("/cotacoes/:id/adjudicar", { preHandler: [authenticate, tenantContext, requireTenantRoles(manage)] }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id);
    const parsed = z.object({ proposta_id: uuid }).safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "ADJUDICACAO_DA_COTACAO_INVALIDA" });
    return reply.send(await awardSupplierProposal({ companyId: request.tenant!.companyId, quoteId: id.data, proposalId: parsed.data.proposta_id, userId: request.user.sub, requestId: request.id }));
  });

  app.put<{ Params: { id: string } }>("/cotacoes/:id/cancelar", { preHandler: [authenticate, tenantContext, requireTenantRoles(manage)] }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id);
    const parsed = z.object({ motivo: z.string().trim().min(10).max(500) }).safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "CANCELAMENTO_DA_COTACAO_INVALIDO" });
    return reply.send(await cancelPurchaseQuote({ companyId: request.tenant!.companyId, quoteId: id.data, reason: parsed.data.motivo, userId: request.user.sub, requestId: request.id }));
  });
}
