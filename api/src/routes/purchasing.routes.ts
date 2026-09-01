import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requireTenantRoles, tenantContext } from "../security/auth.js";
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  createPurchaseOrder,
  getPurchasingDashboard,
  linkPurchaseReceipt,
  saveSupplier,
  saveSupplierProduct,
  savePurchasePolicy,
  saveDemandSeasonality,
} from "../services/purchasing.service.js";
import { createSupplierReturn, getSupplierReturnPreview } from "../services/supplier-return.service.js";

const uuid = z.string().uuid();
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const supplierBody = z.object({
  cnpj: z.string().regex(/^\d{14}$/), razao_social: z.string().trim().min(2).max(180), nome_fantasia: z.string().trim().min(2).max(180),
  email: z.string().trim().email().max(254).nullable().optional(), telefone: nullableText(30), contato: nullableText(120),
  prazo_entrega_dias: z.number().int().min(0).max(365).default(7), pedido_minimo: z.number().min(0).max(100_000_000).default(0),
  condicao_pagamento: nullableText(300), status: z.enum(["ACTIVE", "INACTIVE", "BLOCKED"]).default("ACTIVE"), observacao: nullableText(1000),
});

export async function purchasingRoutes(app: FastifyInstance) {
  const read = [authenticate, tenantContext, requireTenantRoles(["OWNER", "ADMIN", "MANAGER", "BUYER", "FINANCE", "VIEWER"])];
  const operate = [authenticate, tenantContext, requireTenantRoles(["OWNER", "ADMIN", "MANAGER", "BUYER"])];
  const manage = [authenticate, tenantContext, requireTenantRoles(["OWNER", "ADMIN", "MANAGER"])];
  const maintainSuppliers = [authenticate, tenantContext, requireTenantRoles(["OWNER", "ADMIN", "MANAGER", "BUYER"])];

  app.get("/painel", { preHandler: read }, async (request, reply) => {
    const parsed = z.object({ loja_id: uuid.optional(), dias_cobertura: z.coerce.number().int().min(7).max(90).optional() }).safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ erro: "FILTROS_DE_COMPRA_INVALIDOS", detalhes: parsed.error.flatten() });
    return getPurchasingDashboard({ companyId: request.tenant!.companyId, storeId: parsed.data.loja_id, targetDays: parsed.data.dias_cobertura });
  });

  app.put("/politica", { preHandler: manage }, async (request, reply) => {
    const parsed = z.object({
      dias_cobertura_padrao: z.number().int().min(7).max(90),
      aumento_promocional_percentual: z.number().min(0).max(3),
      limite_aprovacao_gerencial: z.number().min(0).max(100_000_000),
      exigir_proprietario_acima_limite: z.boolean(),
      sazonalidade_ativa: z.boolean(),
    }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "POLITICA_DE_COMPRAS_INVALIDA", detalhes: parsed.error.flatten() });
    return reply.send(await savePurchasePolicy({ companyId: request.tenant!.companyId, defaultCoverageDays: parsed.data.dias_cobertura_padrao, promotionLiftPercent: parsed.data.aumento_promocional_percentual, managerApprovalLimit: parsed.data.limite_aprovacao_gerencial, ownerApprovalAboveLimit: parsed.data.exigir_proprietario_acima_limite, seasonalityEnabled: parsed.data.sazonalidade_ativa, userId: request.user.sub, requestId: request.id }));
  });

  app.put("/sazonalidade", { preHandler: manage }, async (request, reply) => {
    const parsed = z.object({ loja_id: uuid, produto_id: uuid, mes: z.number().int().min(1).max(12), fator: z.number().min(0.1).max(10), motivo: nullableText(500) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "SAZONALIDADE_INVALIDA", detalhes: parsed.error.flatten() });
    return reply.send(await saveDemandSeasonality({ companyId: request.tenant!.companyId, storeId: parsed.data.loja_id, productId: parsed.data.produto_id, month: parsed.data.mes, factor: parsed.data.fator, reason: parsed.data.motivo, userId: request.user.sub, requestId: request.id }));
  });

  app.post("/fornecedores", { preHandler: maintainSuppliers }, async (request, reply) => {
    const parsed = supplierBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "FORNECEDOR_INVALIDO", detalhes: parsed.error.flatten() });
    const data = parsed.data;
    return reply.status(201).send(await saveSupplier({ companyId: request.tenant!.companyId, taxId: data.cnpj, legalName: data.razao_social, tradeName: data.nome_fantasia, email: data.email, phone: data.telefone, contactName: data.contato, leadTimeDays: data.prazo_entrega_dias, minimumOrderValue: data.pedido_minimo, paymentTerms: data.condicao_pagamento, status: data.status, notes: data.observacao, userId: request.user.sub, requestId: request.id }));
  });

  app.put<{ Params: { id: string } }>("/fornecedores/:id", { preHandler: maintainSuppliers }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id);
    const parsed = supplierBody.safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "FORNECEDOR_INVALIDO" });
    const data = parsed.data;
    return reply.send(await saveSupplier({ companyId: request.tenant!.companyId, supplierId: id.data, taxId: data.cnpj, legalName: data.razao_social, tradeName: data.nome_fantasia, email: data.email, phone: data.telefone, contactName: data.contato, leadTimeDays: data.prazo_entrega_dias, minimumOrderValue: data.pedido_minimo, paymentTerms: data.condicao_pagamento, status: data.status, notes: data.observacao, userId: request.user.sub, requestId: request.id }));
  });

  app.put<{ Params: { id: string } }>("/fornecedores/:id/produtos", { preHandler: maintainSuppliers }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id);
    const parsed = z.object({ produto_id: uuid, codigo_fornecedor: nullableText(80), ultimo_custo: z.number().min(0).max(100_000_000).nullable().optional(), quantidade_minima: z.number().positive().max(10_000_000).default(1), quantidade_embalagem: z.number().positive().max(10_000_000).default(1), preferencial: z.boolean().default(false) }).safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "VINCULO_FORNECEDOR_PRODUTO_INVALIDO" });
    return reply.send(await saveSupplierProduct({ companyId: request.tenant!.companyId, supplierId: id.data, productId: parsed.data.produto_id, supplierCode: parsed.data.codigo_fornecedor, lastUnitCost: parsed.data.ultimo_custo, minimumOrderQuantity: parsed.data.quantidade_minima, packageQuantity: parsed.data.quantidade_embalagem, preferred: parsed.data.preferencial, userId: request.user.sub, requestId: request.id }));
  });

  app.post("/pedidos", { preHandler: operate }, async (request, reply) => {
    const parsed = z.object({ fornecedor_id: uuid, loja_id: uuid, previsao_entrega: z.coerce.date().nullable().optional(), observacao: nullableText(1000), itens: z.array(z.object({ produto_id: uuid, quantidade: z.number().positive().max(10_000_000), custo_unitario: z.number().min(0).max(100_000_000), recomendacao_id: uuid.optional() })).min(1).max(300) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "PEDIDO_DE_COMPRA_INVALIDO", detalhes: parsed.error.flatten() });
    return reply.status(201).send(await createPurchaseOrder({ companyId: request.tenant!.companyId, supplierId: parsed.data.fornecedor_id, storeId: parsed.data.loja_id, expectedAt: parsed.data.previsao_entrega, notes: parsed.data.observacao, items: parsed.data.itens.map((item) => ({ productId: item.produto_id, quantity: item.quantidade, unitCost: item.custo_unitario, recommendationId: item.recomendacao_id })), userId: request.user.sub, requestId: request.id }));
  });

  app.put<{ Params: { id: string } }>("/pedidos/:id/aprovar", { preHandler: manage }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id);
    if (!id.success) return reply.status(400).send({ erro: "PEDIDO_DE_COMPRA_INVALIDO" });
    return reply.send(await approvePurchaseOrder({ companyId: request.tenant!.companyId, orderId: id.data, userId: request.user.sub, approverRole: request.tenant!.role, requestId: request.id }));
  });

  app.put<{ Params: { id: string } }>("/pedidos/:id/cancelar", { preHandler: manage }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id);
    const parsed = z.object({ motivo: z.string().trim().min(10).max(500) }).safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "CANCELAMENTO_DE_PEDIDO_INVALIDO" });
    return reply.send(await cancelPurchaseOrder({ companyId: request.tenant!.companyId, orderId: id.data, reason: parsed.data.motivo, userId: request.user.sub, requestId: request.id }));
  });

  app.post<{ Params: { id: string } }>("/pedidos/:id/recebimentos", { preHandler: operate }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id);
    const parsed = z.object({ recebimento_id: uuid, observacao: nullableText(500) }).safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "VINCULO_DE_RECEBIMENTO_INVALIDO" });
    return reply.send(await linkPurchaseReceipt({ companyId: request.tenant!.companyId, orderId: id.data, receivingId: parsed.data.recebimento_id, notes: parsed.data.observacao, userId: request.user.sub, requestId: request.id }));
  });

  app.get<{ Params: { id: string } }>("/recebimentos/:id/devolucao", { preHandler: read }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id);
    if (!id.success) return reply.status(400).send({ erro: "RECEBIMENTO_DE_COMPRA_INVALIDO" });
    return reply.send(await getSupplierReturnPreview({ companyId: request.tenant!.companyId, receiptId: id.data }));
  });

  app.post<{ Params: { id: string } }>("/recebimentos/:id/devolucoes", { preHandler: manage }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id);
    const parsed = z.object({
      chave_idempotencia: uuid,
      alcance: z.enum(["ONE", "SOME", "ALL"]),
      motivo: z.string().trim().min(10).max(1000),
      itens: z.array(z.object({ item_recebimento_id: uuid, quantidade: z.number().positive().max(10_000_000) })).min(1).max(300),
    }).safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "DEVOLUCAO_AO_FORNECEDOR_INVALIDA", detalhes: parsed.success ? undefined : parsed.error.flatten() });
    return reply.status(201).send(await createSupplierReturn({
      companyId: request.tenant!.companyId,
      receiptId: id.data,
      idempotencyKey: parsed.data.chave_idempotencia,
      scope: parsed.data.alcance,
      reason: parsed.data.motivo,
      items: parsed.data.itens.map((item) => ({ receivingItemId: item.item_recebimento_id, quantity: item.quantidade })),
      userId: request.user.sub,
      requestId: request.id,
    }));
  });
}
