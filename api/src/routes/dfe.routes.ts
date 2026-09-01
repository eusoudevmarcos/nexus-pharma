import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../infra/prisma.js";
import { authenticate, requireTenantRoles, tenantContext } from "../security/auth.js";
import { certificateEncryptionKey, encryptCertificatePayload, inspectPfx } from "../services/dfe-certificate.service.js";
import { completeDfeReceiving, startDfeReceiving } from "../services/dfe-receiving.service.js";
import { importDfeXml, withoutRawXml } from "../services/dfe.service.js";
import { synchronizeDfeDistribution, transmitManifestation } from "../services/sefaz-dfe.service.js";

const environmentSchema = z.enum(["HOMOLOGATION", "PRODUCTION"]);
const certificateSchema = z.object({ ambiente: environmentSchema, pfx_base64: z.string().min(100).max(2_000_000), senha: z.string().max(500) });
const importSchema = z.object({ ambiente: environmentSchema.default("HOMOLOGATION"), xml: z.string().min(20).max(10_000_000) });
const receivingSchema = z.object({ loja_id: z.string().uuid().nullable().default(null) });
const itemSchema = z.object({
  produto_id: z.string().uuid(), quantidade_recebida: z.number().positive().max(10_000_000),
  lote: z.string().min(1).max(60), fabricado_em: z.coerce.date(), vence_em: z.coerce.date(),
  custo_unitario: z.number().nonnegative().max(10_000_000), aceitar_divergencia: z.boolean().default(false),
});
const discrepancySchema = z.object({ decisao: z.enum(["ACCEPTED_SUGGESTION", "KEPT_SOURCE", "RESOLVED", "DISMISSED"]), observacao: z.string().max(1000).nullable().default(null) });
const manifestationSchema = z.object({ tipo: z.enum(["SCIENCE", "CONFIRMATION", "UNKNOWN_OPERATION", "OPERATION_NOT_PERFORMED"]), justificativa: z.string().max(1000).nullable().default(null), transmitir: z.boolean().default(false) });

export async function dfeRoutes(app: FastifyInstance) {
  const read = [authenticate, tenantContext, requireTenantRoles(["OWNER", "ADMIN", "MANAGER", "BUYER", "PHARMACIST", "VIEWER"] )];
  const write = [authenticate, tenantContext, requireTenantRoles(["OWNER", "ADMIN", "MANAGER", "BUYER", "PHARMACIST"] )];
  const admin = [authenticate, tenantContext, requireTenantRoles(["OWNER", "ADMIN"] )];

  app.get("/certificados", { preHandler: admin }, async (request) => prisma.dfeCertificate.findMany({
    where: { companyId: request.tenant!.companyId },
    select: { id: true, environment: true, fingerprint: true, subject: true, serialNumber: true, validFrom: true, validUntil: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  }));

  app.post("/certificados", { preHandler: admin, bodyLimit: 2_500_000 }, async (request, reply) => {
    const parsed = certificateSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "CERTIFICADO_INVALIDO", detalhes: parsed.error.flatten() });
    const pfx = Buffer.from(parsed.data.pfx_base64, "base64");
    const inspected = inspectPfx(pfx, parsed.data.senha);
    if (inspected.validUntil <= new Date()) return reply.status(400).send({ erro: "CERTIFICADO_EXPIRADO" });
    const encryptedPayload = encryptCertificatePayload(
      { pfxBase64: parsed.data.pfx_base64, passphrase: parsed.data.senha },
      certificateEncryptionKey(config.DFE_CERTIFICATE_ENCRYPTION_KEY),
    );
    const certificate = await prisma.$transaction(async (tx) => {
      await tx.dfeCertificate.updateMany({ where: { companyId: request.tenant!.companyId, environment: parsed.data.ambiente, status: "ACTIVE" }, data: { status: "REVOKED" } });
      const created = await tx.dfeCertificate.create({ data: {
        companyId: request.tenant!.companyId, installedById: request.user.sub, environment: parsed.data.ambiente,
        encryptedPayload, fingerprint: inspected.fingerprint, subject: inspected.subject, serialNumber: inspected.serialNumber,
        validFrom: inspected.validFrom, validUntil: inspected.validUntil,
      } });
      await tx.auditLog.create({ data: { companyId: request.tenant!.companyId, userId: request.user.sub, action: "DFE_CERTIFICATE_INSTALLED", entity: "DfeCertificate", entityId: created.id, after: { environment: created.environment, fingerprint: created.fingerprint, validUntil: created.validUntil } } });
      return created;
    });
    return reply.status(201).send({ id: certificate.id, environment: certificate.environment, fingerprint: certificate.fingerprint, subject: certificate.subject, validUntil: certificate.validUntil, status: certificate.status });
  });

  app.post("/sincronizar", { preHandler: admin }, async (request, reply) => {
    const parsed = z.object({ ambiente: environmentSchema }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "AMBIENTE_DFE_INVALIDO" });
    return reply.send(await synchronizeDfeDistribution({ companyId: request.tenant!.companyId, environment: parsed.data.ambiente }));
  });

  app.post("/importar-xml", { preHandler: write, bodyLimit: 10_500_000 }, async (request, reply) => {
    const parsed = importSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "XML_DFE_INVALIDO", detalhes: parsed.error.flatten() });
    const document = await importDfeXml({ companyId: request.tenant!.companyId, environment: parsed.data.ambiente, rawXml: parsed.data.xml });
    return reply.status(201).send(withoutRawXml(document));
  });

  app.get("/documentos", { preHandler: read }, async (request) => {
    const query = z.object({ status: z.enum(["DISCOVERED", "XML_AVAILABLE", "UNDER_REVIEW", "CONFERENCING", "ACCEPTED", "REJECTED", "CANCELLED"]).optional(), limite: z.coerce.number().int().min(1).max(200).default(50) }).safeParse(request.query);
    const options = query.success ? query.data : { limite: 50 };
    return prisma.dfeDocument.findMany({
      where: { companyId: request.tenant!.companyId, ...(options.status ? { status: options.status } : {}) },
      select: { id: true, environment: true, nsu: true, accessKey: true, schemaName: true, documentType: true, status: true, xmlHash: true, issuerTaxId: true, issuerName: true, documentNumber: true, issuedAt: true, totalAmount: true, receivedAt: true, _count: { select: { items: true, discrepancies: true } }, receiving: { select: { id: true, status: true } } },
      orderBy: { receivedAt: "desc" }, take: options.limite,
    });
  });

  app.get<{ Params: { id: string } }>("/documentos/:id", { preHandler: read }, async (request, reply) => {
    const id = z.string().uuid().safeParse(request.params.id);
    if (!id.success) return reply.status(400).send({ erro: "DFE_INVALIDO" });
    const document = await prisma.dfeDocument.findFirst({ where: { id: id.data, companyId: request.tenant!.companyId }, include: { items: true, discrepancies: true, manifestations: { select: { id: true, type: true, status: true, responseCode: true, responseMessage: true, protocol: true, createdAt: true } }, receiving: { include: { items: true } } } });
    if (!document) return reply.status(404).send({ erro: "DFE_NAO_ENCONTRADO" });
    return withoutRawXml(document);
  });

  app.get<{ Params: { id: string } }>("/documentos/:id/xml", { preHandler: read }, async (request, reply) => {
    const id = z.string().uuid().safeParse(request.params.id);
    if (!id.success) return reply.status(400).send({ erro: "DFE_INVALIDO" });
    const document = await prisma.dfeDocument.findFirst({ where: { id: id.data, companyId: request.tenant!.companyId }, select: { rawXml: true, accessKey: true } });
    if (!document) return reply.status(404).send({ erro: "DFE_NAO_ENCONTRADO" });
    return reply.header("content-type", "application/xml; charset=utf-8").header("content-disposition", `attachment; filename="nfe-${document.accessKey ?? id.data}.xml"`).send(document.rawXml);
  });

  app.post<{ Params: { id: string } }>("/documentos/:id/conferencia", { preHandler: write }, async (request, reply) => {
    const id = z.string().uuid().safeParse(request.params.id); const parsed = receivingSchema.safeParse(request.body ?? {});
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "CONFERENCIA_INVALIDA" });
    const receiving = await startDfeReceiving({ companyId: request.tenant!.companyId, documentId: id.data, storeId: parsed.data.loja_id, userId: request.user.sub });
    if (config.DFE_ENABLE_SEFAZ_TRANSMISSION) {
      const science = await prisma.dfeManifestation.findUnique({ where: { documentId_type_sequence: { documentId: id.data, type: "SCIENCE", sequence: 1 } } });
      if (science?.status === "PENDING") await transmitManifestation(science.id, request.tenant!.companyId);
    }
    return reply.status(201).send(receiving);
  });

  app.put<{ Params: { receivingId: string; itemId: string } }>("/conferencias/:receivingId/itens/:itemId", { preHandler: write }, async (request, reply) => {
    const ids = z.object({ receivingId: z.string().uuid(), itemId: z.string().uuid() }).safeParse(request.params); const parsed = itemSchema.safeParse(request.body);
    if (!ids.success || !parsed.success) return reply.status(400).send({ erro: "ITEM_DE_CONFERENCIA_INVALIDO", detalhes: parsed.success ? undefined : parsed.error.flatten() });
    const item = await prisma.dfeReceivingItem.findFirst({ where: { id: ids.data.itemId, receivingId: ids.data.receivingId, receiving: { companyId: request.tenant!.companyId, status: "IN_PROGRESS" } }, include: { receiving: true } });
    if (!item) return reply.status(404).send({ erro: "ITEM_DE_CONFERENCIA_NAO_ENCONTRADO" });
    const product = await prisma.product.findFirst({ where: { id: parsed.data.produto_id, companyId: request.tenant!.companyId, active: true } });
    if (!product) return reply.status(404).send({ erro: "PRODUTO_NAO_ENCONTRADO" });
    const divergent = Number(item.expectedQuantity) !== parsed.data.quantidade_recebida;
    const updated = await prisma.dfeReceivingItem.update({ where: { id: item.id }, data: {
      productId: product.id, receivedQuantity: parsed.data.quantidade_recebida, lotCode: parsed.data.lote,
      manufacturedAt: parsed.data.fabricado_em, expiresAt: parsed.data.vence_em, unitCost: parsed.data.custo_unitario,
      status: divergent && !parsed.data.aceitar_divergencia ? "DIVERGENT" : "ACCEPTED",
    } });
    return reply.send(updated);
  });

  app.post<{ Params: { id: string } }>("/conferencias/:id/concluir", { preHandler: write }, async (request, reply) => {
    const id = z.string().uuid().safeParse(request.params.id); if (!id.success) return reply.status(400).send({ erro: "CONFERENCIA_INVALIDA" });
    const completed = await completeDfeReceiving({ companyId: request.tenant!.companyId, receivingId: id.data, userId: request.user.sub });
    if (config.DFE_ENABLE_SEFAZ_TRANSMISSION) {
      const confirmation = await prisma.dfeManifestation.findFirst({ where: { document: { receiving: { id: id.data } }, type: "CONFIRMATION", sequence: 1 } });
      if (confirmation?.status === "PENDING") await transmitManifestation(confirmation.id, request.tenant!.companyId);
    }
    return reply.send(completed);
  });

  app.put<{ Params: { id: string } }>("/divergencias/:id", { preHandler: write }, async (request, reply) => {
    const id = z.string().uuid().safeParse(request.params.id); const parsed = discrepancySchema.safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "DECISAO_DE_DIVERGENCIA_INVALIDA" });
    const discrepancy = await prisma.dfeDiscrepancy.findFirst({ where: { id: id.data, document: { companyId: request.tenant!.companyId } } });
    if (!discrepancy) return reply.status(404).send({ erro: "DIVERGENCIA_NAO_ENCONTRADA" });
    return prisma.dfeDiscrepancy.update({ where: { id: discrepancy.id }, data: { status: parsed.data.decisao, resolution: { observation: parsed.data.observacao, decidedBy: request.user.sub, decidedAt: new Date().toISOString() } } });
  });

  app.post<{ Params: { id: string } }>("/documentos/:id/manifestacoes", { preHandler: write }, async (request, reply) => {
    const id = z.string().uuid().safeParse(request.params.id); const parsed = manifestationSchema.safeParse(request.body);
    if (!id.success || !parsed.success) return reply.status(400).send({ erro: "MANIFESTACAO_INVALIDA" });
    if (parsed.data.tipo === "OPERATION_NOT_PERFORMED" && (parsed.data.justificativa?.length ?? 0) < 15) return reply.status(400).send({ erro: "JUSTIFICATIVA_MINIMA_15_CARACTERES" });
    const document = await prisma.dfeDocument.findFirst({ where: { id: id.data, companyId: request.tenant!.companyId } });
    if (!document?.accessKey) return reply.status(404).send({ erro: "DFE_OU_CHAVE_NAO_ENCONTRADA" });
    const previous = await prisma.dfeManifestation.findFirst({ where: { documentId: document.id, type: parsed.data.tipo }, orderBy: { sequence: "desc" } });
    const manifestation = await prisma.dfeManifestation.create({ data: { documentId: document.id, createdById: request.user.sub, type: parsed.data.tipo, sequence: (previous?.sequence ?? 0) + 1, justification: parsed.data.justificativa } });
    if (parsed.data.transmitir) return reply.status(201).send(await transmitManifestation(manifestation.id, request.tenant!.companyId));
    return reply.status(201).send(manifestation);
  });
}
