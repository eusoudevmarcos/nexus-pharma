import type { FastifyInstance } from "fastify";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { config } from "../config.js";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";

const providerSchema = z.string().regex(/^[a-z0-9_-]{2,40}$/);
const eventSchema = z.object({
  type: z.enum([
    "invoice.opened",
    "invoice.paid",
    "invoice.past_due",
    "invoice.voided",
    "subscription.activated",
    "subscription.paused",
    "subscription.cancelled",
  ]),
  company_id: z.string().uuid().optional(),
  provider_contract_id: z.string().min(1).max(120).optional(),
  provider_customer_id: z.string().min(1).max(120).optional(),
  provider_invoice_id: z.string().min(1).max(120).optional(),
  amount: z.number().min(0).optional(),
  due_at: z.coerce.date().optional(),
  paid_at: z.coerce.date().optional(),
  metadata: z.record(z.unknown()).default({}),
});
const toJson = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function validSignature(body: unknown, eventId: string, timestamp: string, signature: string) {
  if (!config.BILLING_WEBHOOK_SECRET) return false;
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt * 1000) > 5 * 60 * 1000) return false;
  const digest = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const expected = createHmac("sha256", config.BILLING_WEBHOOK_SECRET)
    .update(`${timestamp}.${eventId}.${digest}`)
    .digest("hex");
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

export async function billingWebhookRoutes(app: FastifyInstance) {
  app.post<{ Params: { provider: string } }>(
    "/billing/:provider",
    { config: { rateLimit: { max: 180, timeWindow: "1 minute" } } },
    async (request, reply) => {
      if (!config.BILLING_WEBHOOK_SECRET) {
        return reply.status(503).send({ erro: "WEBHOOK_NAO_CONFIGURADO" });
      }
      const provider = providerSchema.safeParse(request.params.provider);
      const event = eventSchema.safeParse(request.body);
      const eventId = request.headers["x-nexus-event-id"];
      const timestamp = request.headers["x-nexus-timestamp"];
      const signature = request.headers["x-nexus-signature"];
      if (
        !provider.success ||
        !event.success ||
        typeof eventId !== "string" ||
        typeof timestamp !== "string" ||
        typeof signature !== "string"
      ) {
        return reply.status(400).send({ erro: "EVENTO_INVALIDO" });
      }
      if (!validSignature(request.body, eventId, timestamp, signature)) {
        return reply.status(401).send({ erro: "ASSINATURA_INVALIDA" });
      }
      const duplicate = await prisma.billingWebhookEvent.findUnique({
        where: { provider_externalEventId: { provider: provider.data, externalEventId: eventId } },
      });
      if (duplicate) return reply.send({ received: true, duplicate: true });

      const subscription = event.data.provider_contract_id
        ? await prisma.subscription.findFirst({ where: { providerContractId: event.data.provider_contract_id } })
        : event.data.company_id
          ? await prisma.subscription.findFirst({
              where: { companyId: event.data.company_id, status: { not: "CANCELLED" } },
              orderBy: { updatedAt: "desc" },
            })
          : null;
      let stored;
      try {
        stored = await prisma.billingWebhookEvent.create({
          data: {
            provider: provider.data,
            externalEventId: eventId,
            eventType: event.data.type,
            companyId: subscription?.companyId ?? event.data.company_id ?? null,
            subscriptionId: subscription?.id ?? null,
            payload: toJson(event.data),
          },
        });
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
          return reply.send({ received: true, duplicate: true });
        }
        throw error;
      }
      if (!subscription) {
        await prisma.billingWebhookEvent.update({
          where: { id: stored.id },
          data: { status: "IGNORED", processedAt: new Date(), lastError: "ASSINATURA_NAO_ENCONTRADA" },
        });
        return reply.status(202).send({ received: true, ignored: true });
      }

      try {
        await prisma.$transaction(async (tx) => {
          await tx.billingWebhookEvent.update({ where: { id: stored.id }, data: { status: "PROCESSING" } });
          const invoiceEvent = event.data.type.startsWith("invoice.");
          if (invoiceEvent) {
            if (!event.data.provider_invoice_id || event.data.amount === undefined || !event.data.due_at) {
              throw new Error("DADOS_DA_FATURA_INCOMPLETOS");
            }
            const invoiceStatus = event.data.type === "invoice.paid"
              ? "PAID"
              : event.data.type === "invoice.voided"
                ? "VOID"
                : "OPEN";
            await tx.invoice.upsert({
              where: { providerReference: event.data.provider_invoice_id },
              create: {
                subscriptionId: subscription.id,
                providerReference: event.data.provider_invoice_id,
                amount: event.data.amount,
                dueAt: event.data.due_at,
                paidAt: event.data.type === "invoice.paid" ? event.data.paid_at ?? new Date() : null,
                status: invoiceStatus,
                metadata: toJson(event.data.metadata),
              },
              update: {
                amount: event.data.amount,
                dueAt: event.data.due_at,
                paidAt: event.data.type === "invoice.paid" ? event.data.paid_at ?? new Date() : null,
                status: invoiceStatus,
                metadata: toJson(event.data.metadata),
              },
            });
          }
          const subscriptionStatus = event.data.type === "invoice.past_due"
            ? "PAST_DUE"
            : event.data.type === "subscription.cancelled"
              ? "CANCELLED"
              : event.data.type === "subscription.paused"
                ? "PAUSED"
                : ["invoice.paid", "subscription.activated"].includes(event.data.type)
                  ? "ACTIVE"
                  : null;
          if (subscriptionStatus) {
            await tx.subscription.update({
              where: { id: subscription.id },
              data: {
                status: subscriptionStatus,
                provider: provider.data,
                ...(event.data.provider_customer_id && { providerCustomerId: event.data.provider_customer_id }),
                ...(event.data.provider_contract_id && { providerContractId: event.data.provider_contract_id }),
                ...(subscriptionStatus === "CANCELLED" && { cancelledAt: new Date() }),
              },
            });
          }
          await tx.billingWebhookEvent.update({
            where: { id: stored.id },
            data: { status: "PROCESSED", processedAt: new Date(), lastError: null },
          });
          await tx.auditLog.create({
            data: {
              companyId: subscription.companyId,
              action: "BILLING_WEBHOOK_PROCESSED",
              entity: "Subscription",
              entityId: subscription.id,
              after: { provider: provider.data, eventId, type: event.data.type },
            },
          });
        });
        return reply.send({ received: true, processed: true });
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 2000) : "ERRO_DESCONHECIDO";
        await prisma.billingWebhookEvent.update({
          where: { id: stored.id },
          data: { status: "FAILED", processedAt: new Date(), lastError: message },
        });
        request.log.error({ eventId, provider: provider.data, err: error }, "Falha no webhook financeiro");
        return reply.status(500).send({ erro: "PROCESSAMENTO_FINANCEIRO_FALHOU" });
      }
    },
  );
}
