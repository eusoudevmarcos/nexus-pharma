import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../infra/prisma.js";
import { authenticate, requireTenantRoles, tenantContext } from "../security/auth.js";
import {
  createInventoryCount,
  createStockAdjustment,
  createStockReservation,
  createStockTransfer,
  decideInventoryCount,
  decideStockAdjustment,
  dispatchStockTransfer,
  finalizeStockReservation,
  receiveStockTransfer,
  submitInventoryCount,
  updateInventoryCountItem,
} from "../services/inventory-workflow.service.js";

const uuid = z.string().uuid();
const positiveQuantity = z.number().positive().max(10_000_000);
const decision = z.object({ decisao: z.enum(["APPROVED", "REJECTED"]) });

export async function inventoryRoutes(app: FastifyInstance) {
  const read = [authenticate, tenantContext, requireTenantRoles(["OWNER", "ADMIN", "MANAGER", "BUYER", "PHARMACIST", "VIEWER"])];
  const operate = [authenticate, tenantContext, requireTenantRoles(["OWNER", "ADMIN", "MANAGER", "BUYER", "PHARMACIST"])];
  const manage = [authenticate, tenantContext, requireTenantRoles(["OWNER", "ADMIN", "MANAGER"])];

  app.get("/painel", { preHandler: read }, async (request) => {
    const companyId = request.tenant!.companyId;
    const now = new Date();
    const [stores, reservations, transfers, counts, adjustments] = await Promise.all([
      prisma.store.findMany({
        where: { companyId, active: true },
        select: {
          id: true, code: true, name: true, type: true,
          stockBalances: {
            where: { onHand: { gt: 0 } },
            include: { product: { select: { id: true, ean: true, name: true } }, lot: { select: { id: true, code: true, expiresAt: true, unitCost: true } } },
            orderBy: [{ product: { name: "asc" } }, { lot: { expiresAt: "asc" } }],
          },
        },
        orderBy: [{ type: "asc" }, { code: "asc" }],
      }),
      prisma.stockReservation.findMany({ where: { companyId }, include: { store: { select: { name: true } }, product: { select: { name: true, ean: true } }, lot: { select: { code: true, expiresAt: true } }, createdBy: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.stockTransfer.findMany({ where: { companyId }, include: { originStore: { select: { name: true } }, destinationStore: { select: { name: true } }, createdBy: { select: { name: true } }, dispatchedBy: { select: { name: true } }, receivedBy: { select: { name: true } }, items: { include: { product: { select: { name: true, ean: true } }, lot: { select: { code: true, expiresAt: true } } } } }, orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.inventoryCount.findMany({ where: { companyId }, include: { store: { select: { name: true } }, createdBy: { select: { name: true } }, submittedBy: { select: { name: true } }, approvedBy: { select: { name: true } }, items: { include: { product: { select: { name: true, ean: true } }, lot: { select: { code: true, expiresAt: true } } } } }, orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.stockAdjustment.findMany({ where: { companyId }, include: { store: { select: { name: true } }, product: { select: { name: true, ean: true } }, lot: { select: { code: true, expiresAt: true } }, createdBy: { select: { name: true } }, approvedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    ]);
    const balances = stores.flatMap((store) => store.stockBalances);
    return {
      indicators: {
        onHand: balances.reduce((sum, entry) => sum + Number(entry.onHand), 0),
        reserved: balances.reduce((sum, entry) => sum + Number(entry.reserved), 0),
        inTransit: transfers.filter((entry) => entry.status === "IN_TRANSIT").flatMap((entry) => entry.items).reduce((sum, entry) => sum + Number(entry.quantity), 0),
        pendingApproval: counts.filter((entry) => entry.status === "PENDING_APPROVAL").length + adjustments.filter((entry) => entry.status === "PENDING_APPROVAL").length,
        expiredReservations: reservations.filter((entry) => entry.status === "ACTIVE" && entry.expiresAt <= now).length,
      },
      stores, reservations, transfers, counts, adjustments,
    };
  });

  app.post("/reservas", { preHandler: operate }, async (request, reply) => {
    const parsed = z.object({ loja_id: uuid, lote_id: uuid, quantidade: positiveQuantity, expira_em: z.coerce.date(), referencia: z.string().trim().max(120).nullable().default(null), observacao: z.string().trim().max(500).nullable().default(null) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "RESERVA_DE_ESTOQUE_INVALIDA", detalhes: parsed.error.flatten() });
    return reply.status(201).send(await createStockReservation({ companyId: request.tenant!.companyId, storeId: parsed.data.loja_id, lotId: parsed.data.lote_id, quantity: parsed.data.quantidade, expiresAt: parsed.data.expira_em, reference: parsed.data.referencia, notes: parsed.data.observacao, userId: request.user.sub, requestId: request.id }));
  });

  app.put<{ Params: { id: string } }>("/reservas/:id/finalizar", { preHandler: operate }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id);
    const parsed = z.object({ status: z.enum(["FULFILLED", "RELEASED"]) }).safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "FINALIZACAO_DE_RESERVA_INVALIDA" });
    return reply.send(await finalizeStockReservation({ companyId: request.tenant!.companyId, reservationId: id.data, status: parsed.data.status, userId: request.user.sub, requestId: request.id }));
  });

  app.post("/transferencias", { preHandler: operate }, async (request, reply) => {
    const parsed = z.object({ loja_origem_id: uuid, loja_destino_id: uuid, itens: z.array(z.object({ lote_id: uuid, quantidade: positiveQuantity })).min(1).max(200), observacao: z.string().trim().max(500).nullable().default(null) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "TRANSFERENCIA_DE_ESTOQUE_INVALIDA", detalhes: parsed.error.flatten() });
    return reply.status(201).send(await createStockTransfer({ companyId: request.tenant!.companyId, originStoreId: parsed.data.loja_origem_id, destinationStoreId: parsed.data.loja_destino_id, items: parsed.data.itens.map((item) => ({ lotId: item.lote_id, quantity: item.quantidade })), notes: parsed.data.observacao, userId: request.user.sub, requestId: request.id }));
  });

  app.put<{ Params: { id: string } }>("/transferencias/:id/expedir", { preHandler: operate }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id);
    if (!id.success) return reply.status(400).send({ erro: "TRANSFERENCIA_INVALIDA" });
    return reply.send(await dispatchStockTransfer({ companyId: request.tenant!.companyId, transferId: id.data, userId: request.user.sub, requestId: request.id }));
  });

  app.put<{ Params: { id: string } }>("/transferencias/:id/receber", { preHandler: operate }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id);
    if (!id.success) return reply.status(400).send({ erro: "TRANSFERENCIA_INVALIDA" });
    return reply.send(await receiveStockTransfer({ companyId: request.tenant!.companyId, transferId: id.data, userId: request.user.sub, requestId: request.id }));
  });

  app.post("/inventarios", { preHandler: operate }, async (request, reply) => {
    const parsed = z.object({ loja_id: uuid, observacao: z.string().trim().max(500).nullable().default(null) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "INVENTARIO_INVALIDO" });
    return reply.status(201).send(await createInventoryCount({ companyId: request.tenant!.companyId, storeId: parsed.data.loja_id, notes: parsed.data.observacao, userId: request.user.sub, requestId: request.id }));
  });

  app.put<{ Params: { id: string; itemId: string } }>("/inventarios/:id/itens/:itemId", { preHandler: operate }, async (request, reply) => {
    const ids = z.object({ id: uuid, itemId: uuid }).safeParse(request.params);
    const parsed = z.object({ quantidade_contada: z.number().min(0).max(10_000_000), observacao: z.string().trim().max(500).nullable().default(null) }).safeParse(request.body);
    if (!ids.success || !parsed.success) return reply.status(400).send({ erro: "CONTAGEM_DE_INVENTARIO_INVALIDA" });
    return reply.send(await updateInventoryCountItem({ companyId: request.tenant!.companyId, countId: ids.data.id, itemId: ids.data.itemId, countedQuantity: parsed.data.quantidade_contada, notes: parsed.data.observacao }));
  });

  app.put<{ Params: { id: string } }>("/inventarios/:id/enviar", { preHandler: operate }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id);
    if (!id.success) return reply.status(400).send({ erro: "INVENTARIO_INVALIDO" });
    return reply.send(await submitInventoryCount({ companyId: request.tenant!.companyId, countId: id.data, userId: request.user.sub, requestId: request.id }));
  });

  app.put<{ Params: { id: string } }>("/inventarios/:id/decidir", { preHandler: manage }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id);
    const parsed = decision.safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "DECISAO_DE_INVENTARIO_INVALIDA" });
    return reply.send(await decideInventoryCount({ companyId: request.tenant!.companyId, countId: id.data, decision: parsed.data.decisao, userId: request.user.sub, requestId: request.id }));
  });

  app.post("/ajustes", { preHandler: operate }, async (request, reply) => {
    const parsed = z.object({ loja_id: uuid, lote_id: uuid, motivo: z.enum(["LOSS", "DAMAGE", "EXPIRED", "CORRECTION"]), quantidade: z.number().min(-10_000_000).max(10_000_000).refine((value) => value !== 0), justificativa: z.string().trim().min(10).max(500) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "AJUSTE_DE_ESTOQUE_INVALIDO", detalhes: parsed.error.flatten() });
    return reply.status(201).send(await createStockAdjustment({ companyId: request.tenant!.companyId, storeId: parsed.data.loja_id, lotId: parsed.data.lote_id, reason: parsed.data.motivo, quantityDelta: parsed.data.quantidade, justification: parsed.data.justificativa, userId: request.user.sub, requestId: request.id }));
  });

  app.put<{ Params: { id: string } }>("/ajustes/:id/decidir", { preHandler: manage }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id);
    const parsed = decision.safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "DECISAO_DE_AJUSTE_INVALIDA" });
    return reply.send(await decideStockAdjustment({ companyId: request.tenant!.companyId, adjustmentId: id.data, decision: parsed.data.decisao, userId: request.user.sub, requestId: request.id }));
  });
}
