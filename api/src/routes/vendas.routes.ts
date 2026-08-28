import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";
import {
  authenticate,
  requireTenantRoles,
  tenantContext,
} from "../security/auth.js";
import { processarVenda } from "../services/processar-venda.service.js";
import { TaxGuardError } from "../services/tax-chain.service.js";

const toJson = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const bodySchema = z
  .object({
    idempotency_key: z
      .string()
      .uuid()
      .default(() => randomUUID()),
    modelo_nota: z.enum(["55", "65"]).default("65"),
    uf_destino: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .default(null),
    tipo_operacao: z.string().min(2).max(60).default("REVENDA_INTERNA"),
    itens: z
      .array(
        z.object({
          ean: z.string().regex(/^[0-9]{8,14}$/),
          quantidade: z.number().positive().max(10_000),
        }),
      )
      .min(1)
      .max(300),
  })
  .superRefine((data, context) => {
    const seen = new Set<string>();
    data.itens.forEach((item, index) => {
      if (seen.has(item.ean)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Consolide quantidades do mesmo EAN em um único item",
          path: ["itens", index, "ean"],
        });
      }
      seen.add(item.ean);
    });
  });

export async function vendasRoutes(app: FastifyInstance) {
  app.post(
    "/processar",
    {
      preHandler: [
        authenticate,
        tenantContext,
        requireTenantRoles([
          "OWNER",
          "ADMIN",
          "MANAGER",
          "PHARMACIST",
          "OPERATOR",
        ]),
      ],
    },
    async (request, reply) => {
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          erro: "VENDA_INVALIDA",
          detalhes: parsed.error.flatten(),
        });
      }

      try {
        const result = await processarVenda({
          empresaId: request.tenant!.companyId,
          usuarioId: request.user.sub,
          requestId: request.id,
          idempotencyKey: parsed.data.idempotency_key,
          modeloNota: parsed.data.modelo_nota,
          ufDestino: parsed.data.uf_destino,
          tipoOperacao: parsed.data.tipo_operacao,
          itens: parsed.data.itens,
        });
        return reply.status(result.idempotente ? 200 : 201).send(result);
      } catch (error) {
        if (error instanceof TaxGuardError) {
          await prisma.auditLog
            .create({
              data: {
                companyId: request.tenant!.companyId,
                userId: request.user.sub,
                action: "BLOCK",
                entity: "SALE_TAX_GUARD",
                requestId: request.id,
                after: toJson({ evaluations: error.evaluations }),
              },
            })
            .catch(() => undefined);
          return reply.status(409).send({
            erro: error.message,
            avaliacoes: error.evaluations,
          });
        }
        const message = error instanceof Error ? error.message : "ERRO_INTERNO";
        if (
          message.startsWith("PRODUTO_NAO_ENCONTRADO") ||
          message === "EMPRESA_NAO_ENCONTRADA"
        ) {
          return reply.status(404).send({ erro: message });
        }
        if (
          message.startsWith("ESTOQUE_INSUFICIENTE") ||
          message.startsWith("LOTE_VALIDO_INSUFICIENTE") ||
          message.startsWith("PRODUTO_VENCIDO") ||
          message.startsWith("CATEGORIA_FISCAL_SEM_VIGENCIA") ||
          message.startsWith("REGRA_FISCAL_INCOMPLETA") ||
          message.startsWith("CSOSN_OBRIGATORIO") ||
          message.startsWith("SALDO_FISCAL_INSUFICIENTE")
        ) {
          return reply.status(409).send({ erro: message });
        }
        request.log.error({ err: error }, "Falha ao processar venda");
        return reply.status(500).send({ erro: "ERRO_INTERNO" });
      }
    },
  );
}
