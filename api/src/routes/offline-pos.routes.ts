import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../infra/prisma.js";
import { authenticate, requireTenantRoles, tenantContext } from "../security/auth.js";
import { createOfflineSnapshot, registerPosDevice, synchronizeOfflineSales } from "../services/offline-pos.service.js";

const uuid = z.string().uuid();
const salePayload = z.object({
  modelo_nota: z.literal("65"),
  sessao_caixa_id: uuid,
  desconto_percentual: z.number().min(0).max(50),
  vendedor_id: uuid.nullable(),
  consumidor: z.object({ documento: z.string().min(11).max(18), nome: z.string().min(2).max(180).nullable(), data_nascimento: z.string().date().nullable() }).nullable(),
  itens: z.array(z.object({ ean: z.string().regex(/^[0-9]{8,14}$/), quantidade: z.number().positive().max(10_000) })).min(1).max(300),
  pagamentos: z.array(z.object({ metodo: z.literal("CASH"), valor: z.number().positive().max(10_000_000), referencia_externa: z.string().max(160).nullable() })).min(1).max(10),
});

export async function offlinePosRoutes(app: FastifyInstance) {
  const operate = [authenticate, tenantContext, requireTenantRoles(["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "OPERATOR"] )];
  const manage = [authenticate, tenantContext, requireTenantRoles(["OWNER", "ADMIN", "MANAGER"] )];

  app.get("/dispositivos", { preHandler: manage }, async (request) => prisma.posDevice.findMany({ where: { companyId: request.tenant!.companyId }, select: { id: true, name: true, installationId: true, status: true, lastSeenAt: true, lastSynchronizedAt: true, createdAt: true, pointOfSale: { select: { id: true, code: true, name: true, store: { select: { name: true } } } }, _count: { select: { snapshots: true, commands: true } } }, orderBy: [{ status: "asc" }, { lastSeenAt: "desc" }] }));

  app.post("/dispositivos", { preHandler: operate }, async (request, reply) => {
    const parsed = z.object({ pdv_id: uuid, instalacao_id: z.string().min(16).max(80), nome: z.string().trim().min(3).max(120) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "DISPOSITIVO_OFFLINE_INVALIDO", detalhes: parsed.error.flatten() });
    const device = await registerPosDevice({ companyId: request.tenant!.companyId, pointOfSaleId: parsed.data.pdv_id, installationId: parsed.data.instalacao_id, name: parsed.data.nome, userId: request.user.sub, requestId: request.id });
    return reply.status(201).send({ device });
  });

  app.put<{ Params: { id: string } }>("/dispositivos/:id", { preHandler: manage }, async (request, reply) => {
    const id = uuid.safeParse(request.params.id); const parsed = z.object({ status: z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]), motivo: z.string().trim().min(10).max(500) }).safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "ALTERACAO_DO_DISPOSITIVO_INVALIDA" });
    const device = await prisma.posDevice.findFirst({ where: { id: id.data, companyId: request.tenant!.companyId } });
    if (!device) return reply.status(404).send({ erro: "DISPOSITIVO_OFFLINE_NAO_ENCONTRADO" });
    const updated = await prisma.$transaction(async (tx) => { const saved = await tx.posDevice.update({ where: { id: device.id }, data: { status: parsed.data.status } }); await tx.auditLog.create({ data: { companyId: request.tenant!.companyId, userId: request.user.sub, action: "UPDATE", entity: "POS_DEVICE", entityId: device.id, requestId: request.id, before: { status: device.status }, after: { status: saved.status, reason: parsed.data.motivo } } }); return saved; });
    return reply.send(updated);
  });

  app.post("/snapshots", { preHandler: operate }, async (request, reply) => {
    const parsed = z.object({ pdv_id: uuid, dispositivo_id: uuid }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "SNAPSHOT_OFFLINE_INVALIDO" });
    return reply.status(201).send(await createOfflineSnapshot({ companyId: request.tenant!.companyId, pointOfSaleId: parsed.data.pdv_id, deviceId: parsed.data.dispositivo_id, userId: request.user.sub, requestId: request.id }));
  });

  app.post("/sincronizar", { preHandler: operate }, async (request, reply) => {
    const parsed = z.object({ dispositivo_id: uuid, snapshot_id: uuid, comandos: z.array(z.object({ id: uuid, ocorrido_em: z.coerce.date(), tipo: z.literal("SALE"), payload: salePayload })).min(1).max(100) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "LOTE_DE_SINCRONIZACAO_INVALIDO", detalhes: parsed.error.flatten() });
    return reply.send(await synchronizeOfflineSales({ companyId: request.tenant!.companyId, deviceId: parsed.data.dispositivo_id, snapshotId: parsed.data.snapshot_id, userId: request.user.sub, actorRole: request.tenant!.role, requestId: request.id, commands: parsed.data.comandos.map((command) => ({ id: command.id, occurredAt: command.ocorrido_em, payload: command.payload })) }));
  });

  app.get("/status", { preHandler: operate }, async (request, reply) => {
    const parsed = z.object({ dispositivo_id: uuid }).safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ erro: "DISPOSITIVO_OFFLINE_INVALIDO" });
    const device = await prisma.posDevice.findFirst({ where: { id: parsed.data.dispositivo_id, companyId: request.tenant!.companyId }, include: { pointOfSale: { select: { id: true, code: true, name: true } }, snapshots: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, version: true, validFrom: true, expiresAt: true } }, commands: { orderBy: { receivedAt: "desc" }, take: 20, select: { id: true, status: true, errorCode: true, occurredAt: true, processedAt: true, saleId: true } } } });
    if (!device) return reply.status(404).send({ erro: "DISPOSITIVO_OFFLINE_NAO_ENCONTRADO" });
    const counts = await prisma.offlinePosCommand.groupBy({ by: ["status"], where: { companyId: request.tenant!.companyId, deviceId: device.id }, _count: { _all: true } });
    return { device, counts: Object.fromEntries(counts.map((entry) => [entry.status, entry._count._all])) };
  });
}
