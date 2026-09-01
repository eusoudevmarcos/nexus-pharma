import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requireTenantRoles, tenantContext } from "../security/auth.js";
import { tenantRolesAtLeast } from "../security/access-control.js";
import { cancelCounterOrder, claimCounterOrder, createCounterOrder, getCounterDashboard, listCashierQueue } from "../services/counter-service.service.js";

const prescriptionSchema = z.object({
  numero: z.string().trim().min(1).max(80),
  prescritor_nome: z.string().trim().min(2).max(180),
  prescritor_registro: z.string().trim().min(2).max(60),
  prescritor_uf: z.string().regex(/^[A-Z]{2}$/),
  data_emissao: z.coerce.date(),
  retida: z.boolean().default(false),
}).nullable().default(null);

const createSchema = z.object({
  loja_id: z.string().uuid(),
  desconto_percentual: z.number().min(0).max(50).default(0),
  farmaceutico_credencial_id: z.string().uuid().nullable().default(null),
  consumidor: z.object({
    documento: z.string().min(11).max(18),
    nome: z.string().trim().min(2).max(180).nullable().default(null),
    data_nascimento: z.coerce.date().nullable().default(null),
  }).nullable().default(null),
  observacao: z.string().trim().max(500).nullable().default(null),
  itens: z.array(z.object({ ean: z.string().regex(/^[0-9]{8,14}$/), quantidade: z.number().positive().max(10_000), prescricao: prescriptionSchema })).min(1).max(100),
}).superRefine((data, context) => {
  const seen = new Set<string>();
  data.itens.forEach((item, index) => {
    if (seen.has(item.ean)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Consolide o mesmo produto em uma única linha", path: ["itens", index, "ean"] });
    seen.add(item.ean);
  });
});

export async function counterServiceRoutes(app: FastifyInstance) {
  const counterRead = [authenticate, tenantContext, requireTenantRoles(tenantRolesAtLeast("COUNTER_SERVICE", "VIEW"))];
  const counterOperate = [authenticate, tenantContext, requireTenantRoles(tenantRolesAtLeast("COUNTER_SERVICE", "OPERATE"))];
  const cashierOperate = [authenticate, tenantContext, requireTenantRoles(tenantRolesAtLeast("POS", "OPERATE"))];

  app.get("/painel", { preHandler: counterOperate }, async (request) => getCounterDashboard({ companyId: request.tenant!.companyId, userId: request.user.sub, role: request.tenant!.role }));

  app.post("/atendimentos", { preHandler: counterOperate }, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ erro: "ATENDIMENTO_DE_BALCAO_INVALIDO", detalhes: parsed.error.flatten() });
    const order = await createCounterOrder({
      companyId: request.tenant!.companyId, userId: request.user.sub, role: request.tenant!.role, requestId: request.id,
      storeId: parsed.data.loja_id, discountPercent: parsed.data.desconto_percentual, pharmacistCredentialId: parsed.data.farmaceutico_credencial_id,
      buyer: parsed.data.consumidor ? { taxId: parsed.data.consumidor.documento, name: parsed.data.consumidor.nome, birthDate: parsed.data.consumidor.data_nascimento } : null,
      notes: parsed.data.observacao,
      items: parsed.data.itens.map((item) => ({ ean: item.ean, quantity: item.quantidade, prescription: item.prescricao ? { number: item.prescricao.numero, prescriberName: item.prescricao.prescritor_nome, prescriberRegistration: item.prescricao.prescritor_registro, prescriberState: item.prescricao.prescritor_uf, issuedAt: item.prescricao.data_emissao, retained: item.prescricao.retida } : null })),
    });
    return reply.status(201).send(order);
  });

  app.get("/fila-caixa", { preHandler: counterRead }, async (request) => listCashierQueue(request.tenant!.companyId));

  app.post<{ Params: { id: string } }>("/atendimentos/:id/assumir", { preHandler: cashierOperate }, async (request, reply) => {
    const id = z.string().uuid().safeParse(request.params.id);
    const body = z.object({ sessao_caixa_id: z.string().uuid() }).safeParse(request.body);
    if (!id.success || !body.success) return reply.status(400).send({ erro: "PRE_VENDA_OU_CAIXA_INVALIDO" });
    return reply.send(await claimCounterOrder({ companyId: request.tenant!.companyId, orderId: id.data, cashSessionId: body.data.sessao_caixa_id, userId: request.user.sub, requestId: request.id }));
  });

  app.patch<{ Params: { id: string } }>("/atendimentos/:id/cancelar", { preHandler: counterOperate }, async (request, reply) => {
    const id = z.string().uuid().safeParse(request.params.id);
    if (!id.success) return reply.status(400).send({ erro: "PRE_VENDA_INVALIDA" });
    return reply.send(await cancelCounterOrder({ companyId: request.tenant!.companyId, orderId: id.data, userId: request.user.sub, role: request.tenant!.role, requestId: request.id }));
  });
}
