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
    sessao_caixa_id: z.string().uuid().nullable().default(null),
    pagamentos: z
      .array(
        z.object({
          metodo: z.enum(["CASH", "PIX", "CREDIT_CARD", "DEBIT_CARD", "VOUCHER", "OTHER"]),
          valor: z.number().positive().max(10_000_000),
          referencia_externa: z.string().min(1).max(160).nullable().default(null),
        }),
      )
      .max(10)
      .default([]),
    desconto_percentual: z.number().min(0).max(50).default(0),
    vendedor_id: z.string().uuid().nullable().default(null),
    farmaceutico_credencial_id: z.string().uuid().nullable().default(null),
    consumidor: z.object({
      documento: z.string().min(11).max(18),
      nome: z.string().trim().min(2).max(180).nullable().default(null),
      data_nascimento: z.coerce.date().nullable().default(null),
    }).nullable().default(null),
    itens: z
      .array(
        z.object({
          ean: z.string().regex(/^[0-9]{8,14}$/),
          quantidade: z.number().positive().max(10_000),
          prescricao: z.object({
            numero: z.string().trim().min(1).max(80),
            prescritor_nome: z.string().trim().min(2).max(180),
            prescritor_registro: z.string().trim().min(2).max(60),
            prescritor_uf: z.string().regex(/^[A-Z]{2}$/),
            data_emissao: z.coerce.date(),
            retida: z.boolean().default(false),
          }).nullable().default(null),
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
    if (Boolean(data.sessao_caixa_id) !== Boolean(data.pagamentos.length)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Sessão de caixa e pagamentos devem ser informados juntos",
        path: ["pagamentos"],
      });
    }
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
          itens: parsed.data.itens.map((item) => ({
            ean: item.ean,
            quantidade: item.quantidade,
            prescricao: item.prescricao ? {
              number: item.prescricao.numero,
              prescriberName: item.prescricao.prescritor_nome,
              prescriberRegistration: item.prescricao.prescritor_registro,
              prescriberState: item.prescricao.prescritor_uf,
              issuedAt: item.prescricao.data_emissao,
              retained: item.prescricao.retida,
            } : null,
          })),
          cashSessionId: parsed.data.sessao_caixa_id,
          pagamentos: parsed.data.pagamentos.map((payment) => ({
            metodo: payment.metodo,
            valor: payment.valor,
            referenciaExterna: payment.referencia_externa,
          })),
          actorRole: request.tenant!.role,
          discountPercent: parsed.data.desconto_percentual,
          sellerId: parsed.data.vendedor_id,
          pharmacistCredentialId: parsed.data.farmaceutico_credencial_id,
          buyer: parsed.data.consumidor ? {
            taxId: parsed.data.consumidor.documento,
            name: parsed.data.consumidor.nome,
            birthDate: parsed.data.consumidor.data_nascimento,
          } : null,
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
          || message.startsWith("SESSAO_CAIXA_NAO_ENCONTRADA_OU_FECHADA")
          || message.startsWith("CAIXA_E_PAGAMENTOS_DEVEM_SER_INFORMADOS_JUNTOS")
          || message.startsWith("TOTAL_PAGAMENTOS_DIVERGENTE")
          || message.startsWith("DESCONTO_ACIMA_DO_LIMITE")
          || message.startsWith("VENDA_CONTROLADA_BLOQUEADA")
          || message.startsWith("VENDEDOR_ATIVO_NAO_ENCONTRADO")
          || message.startsWith("CREDENCIAL_FARMACEUTICA_NAO_VERIFICADA_OU_FORA_DA_VIGENCIA")
          || message.startsWith("DOCUMENTO_DO_COMPRADOR_INVALIDO")
        ) {
          return reply.status(409).send({ erro: message });
        }
        request.log.error({ err: error }, "Falha ao processar venda");
        return reply.status(500).send({ erro: "ERRO_INTERNO" });
      }
    },
  );
}
