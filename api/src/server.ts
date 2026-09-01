import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { allowedOrigins, config } from "./config.js";
import { prisma } from "./infra/prisma.js";
import { authRoutes } from "./routes/auth.routes.js";
import { accessControlRoutes } from "./routes/access-control.routes.js";
import { accessReviewRoutes } from "./routes/access-review.routes.js";
import { mfaRoutes } from "./routes/mfa.routes.js";
import { billingWebhookRoutes } from "./routes/billing-webhooks.routes.js";
import { cadastrosRoutes } from "./routes/cadastros.routes.js";
import { fiscalRoutes } from "./routes/fiscal.routes.js";
import { fiscalMatrixRoutes } from "./routes/fiscal-matrix.routes.js";
import { fiscalCatalogGovernanceRoutes } from "./routes/fiscal-catalog-governance.routes.js";
import { dfeRoutes } from "./routes/dfe.routes.js";
import { taxTraceabilityRoutes } from "./routes/tax-traceability.routes.js";
import { internalRoutes } from "./routes/internal.routes.js";
import { operationsRoutes } from "./routes/operations.routes.js";
import { privacyRoutes } from "./routes/privacy.routes.js";
import { reportsRoutes } from "./routes/reports.routes.js";
import { usersRoutes } from "./routes/users.routes.js";
import { vendasRoutes } from "./routes/vendas.routes.js";
import { nfceRoutes } from "./routes/nfce.routes.js";
import { cashRegisterRoutes } from "./routes/cash-register.routes.js";
import { counterServiceRoutes } from "./routes/counter-service.routes.js";
import { postSaleRoutes } from "./routes/post-sale.routes.js";
import { saleControlRoutes } from "./routes/sale-control.routes.js";
import { inventoryRoutes } from "./routes/inventory.routes.js";
import { purchasingRoutes } from "./routes/purchasing.routes.js";
import { accountsPayableRoutes } from "./routes/accounts-payable.routes.js";
import { quotationRoutes } from "./routes/quotation.routes.js";
import { offlinePosRoutes } from "./routes/offline-pos.routes.js";
import { productImportRoutes } from "./routes/product-import.routes.js";
import { fiscalPropagationRoutes } from "./routes/fiscal-propagation.routes.js";
import { primeRoutes } from "./routes/prime.routes.js";
import { observeResponse, recordOperationalIncident, runtimeSnapshot } from "./services/observability.js";

const app = Fastify({
  logger: { level: config.LOG_LEVEL },
  requestIdHeader: "x-request-id",
  trustProxy: config.TRUST_PROXY,
  bodyLimit: 1_048_576,
  requestTimeout: 30_000,
  connectionTimeout: 10_000,
  maxParamLength: 200,
});

await app.register(cors, {
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("ORIGEM_NAO_PERMITIDA"), false);
  },
});
await app.register(helmet, { contentSecurityPolicy: false });
await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
await app.register(jwt, {
  secret: config.JWT_SECRET,
  sign: { expiresIn: config.ACCESS_TOKEN_TTL, iss: config.JWT_ISSUER, aud: config.JWT_AUDIENCE },
  verify: { allowedIss: config.JWT_ISSUER, allowedAud: config.JWT_AUDIENCE },
});

app.addHook("onResponse", async (_request, reply) => {
  observeResponse(reply.statusCode, reply.elapsedTime);
});
app.addHook("onSend", async (request, reply, payload) => {
  if (request.url.startsWith("/api/v1/") && request.url !== "/api/v1/planos") {
    reply.header("cache-control", "no-store, max-age=0");
    reply.header("pragma", "no-cache");
  }
  return payload;
});

await app.register(authRoutes, { prefix: "/api/v1/auth" });
await app.register(mfaRoutes, { prefix: "/api/v1/auth/mfa" });
await app.register(accessControlRoutes, { prefix: "/api/v1/acessos" });
await app.register(accessReviewRoutes, { prefix: "/api/v1/usuarios/revisoes-acesso" });
await app.register(billingWebhookRoutes, { prefix: "/api/v1/webhooks" });
await app.register(cadastrosRoutes, { prefix: "/api/v1/cadastros" });
await app.register(productImportRoutes, { prefix: "/api/v1/cadastros/importacoes" });
await app.register(fiscalPropagationRoutes, { prefix: "/api/v1/cadastros/propagacoes-fiscais" });
if (config.PRIME_ENABLED) {
  await app.register(primeRoutes, { prefix: "/api/v1/prime" });
}
await app.register(fiscalRoutes, { prefix: "/api/v1/fiscal" });
await app.register(fiscalMatrixRoutes, { prefix: "/api/v1/fiscal/matriz" });
await app.register(fiscalCatalogGovernanceRoutes, { prefix: "/api/v1/interno/fiscal" });
await app.register(dfeRoutes, { prefix: "/api/v1/fiscal/dfe" });
await app.register(taxTraceabilityRoutes, {
  prefix: "/api/v1/fiscal/rastreabilidade",
});
await app.register(internalRoutes, { prefix: "/api/v1/interno" });
await app.register(vendasRoutes, { prefix: "/api/v1/vendas" });
await app.register(nfceRoutes, { prefix: "/api/v1/fiscal/nfce" });
await app.register(cashRegisterRoutes, { prefix: "/api/v1/caixa" });
await app.register(counterServiceRoutes, { prefix: "/api/v1/balcao" });
await app.register(offlinePosRoutes, { prefix: "/api/v1/caixa/offline" });
await app.register(postSaleRoutes, { prefix: "/api/v1/pos-venda" });
await app.register(saleControlRoutes, { prefix: "/api/v1/controle-venda" });
await app.register(inventoryRoutes, { prefix: "/api/v1/estoque" });
await app.register(purchasingRoutes, { prefix: "/api/v1/compras" });
await app.register(accountsPayableRoutes, { prefix: "/api/v1/contas-pagar" });
await app.register(quotationRoutes, { prefix: "/api/v1/cotacoes" });
await app.register(reportsRoutes, { prefix: "/api/v1/relatorios" });
await app.register(usersRoutes, { prefix: "/api/v1/usuarios" });
await app.register(operationsRoutes, { prefix: "/api/v1" });
await app.register(privacyRoutes, { prefix: "/api/v1" });

app.get("/health/live", async () => ({ status: "ok", service: "nexus-pharma-api", version: config.SERVICE_VERSION }));

app.get("/health/ready", async () => {
  const started = performance.now();
  await prisma.$queryRaw`SELECT 1`;
  return { status: "ok", database: "up", databaseLatencyMs: Math.round(performance.now() - started), service: "nexus-pharma-api", version: config.SERVICE_VERSION };
});

app.get("/health", async () => {
  const started = performance.now();
  await prisma.$queryRaw`SELECT 1`;
  return { status: "ok", database: "up", databaseLatencyMs: Math.round(performance.now() - started), service: "nexus-pharma-api", version: config.SERVICE_VERSION };
});

app.get("/api/v1/operations/metrics", async (request, reply) => {
  if (!config.OBSERVABILITY_TOKEN || request.headers.authorization !== `Bearer ${config.OBSERVABILITY_TOKEN}`) {
    return reply.status(401).send({ erro: "TOKEN_DE_OBSERVABILIDADE_INVALIDO" });
  }
  return runtimeSnapshot();
});

app.setErrorHandler(async (error, request, reply) => {
  const failure = error as { validation?: unknown; statusCode?: number };
  request.log.error({ err: error }, "Falha não tratada");
  if (failure.validation)
    return reply.status(400).send({ erro: "REQUISICAO_INVALIDA" });
  const errorMessage = error instanceof Error ? error.message : "ERRO_DESCONHECIDO";
  const safeDfeError = /^(DFE_|NFCE_|CAIXA_|SESSAO_CAIXA_|PDV_|PRE_VENDA_|ATENDIMENTO_|DISPOSITIVO_OFFLINE_|SNAPSHOT_OFFLINE_|COMANDO_|LOTE_DE_SINCRONIZACAO_|PAGAMENTO_OFFLINE_|CATALOGO_OU_REGRA_|SANGRIA_|DIVERGENCIA_CAIXA_|CONCILIACAO_|ESTORNO_|DEVOLUCAO_|VENDA_|VENDEDOR_|ITEM_VENDA_|ITEM_ESTORNO_|QUANTIDADE_DEVOLUCAO_|QUANTIDADE_DE_DEVOLUCAO_|LOTE_DEVOLVIDO_|SALDO_PAGAMENTO_|SALDO_DA_LOJA_|SALDO_DISPONIVEL_|SALDO_CONSOLIDADO_|SALDO_FISCAL_|SALDO_DAS_PARCELAS_|DINHEIRO_INSUFICIENTE_|ESTOQUE_ALTERADO_|DESCONTO_|DESCONTOS_|CANCELAMENTO_TOTAL_|RESERVA_|TRANSFERENCIA_|LOTE_DUPLICADO_|LOTE_VENCIDO_|INVENTARIO_|CONTAGEM_|APROVACAO_|AJUSTE_|PERDA_|FORNECEDOR_|VINCULO_FORNECEDOR_|PEDIDO_|COTACAO_|PROPOSTA_|ADJUDICACAO_|RECEBIMENTO_FISCAL_|RECEBIMENTO_DE_COMPRA_|TITULO_|PARCELA_|PAGAMENTO_|SOMA_DAS_PARCELAS_|CONFIGURACAO_DO_TITULO_|BAIXA_DE_PAGAMENTO_|ESTORNO_PAGAMENTO_|FILTROS_DE_CONTAS_|FECHAMENTO_GERENCIAL_|FILTROS_GERENCIAIS_|FILTROS_DE_COMPRA_|CREDENCIAL_FARMACEUTICA_|DOCUMENTO_DO_COMPRADOR_|USUARIO_NAO_E_FARMACEUTICO_|POLITICA_DE_CONTROLE_|CERTIFICADO_|TRANSMISSAO_SEFAZ_|CNPJ_|UF_|XML_|TIPO_XML_|CONSULTA_SEFAZ_|SEFAZ_|RESPOSTA_SEFAZ_|CONFERENCIA_|DIVERGENCIAS_|CHAVE_|ITEM_|LOJA_|NFE_|MANIFESTACAO_|JUSTIFICATIVA_|ANALISE_|SUGESTAO_|REJEICAO_)/.test(errorMessage);
  const safeCatalogError = /^CATALOGO_/.test(errorMessage);
  if (safeDfeError || safeCatalogError) {
    const unavailable = /(NAO_CONFIGURAD|DESABILITADA|TIMEOUT|HTTP_|AGUARDE_ATE)/.test(errorMessage);
    return reply.status(unavailable ? 503 : 409).send({ erro: errorMessage });
  }
  const statusCode = failure.statusCode && failure.statusCode < 500 ? failure.statusCode : 500;
  if (statusCode >= 500) {
    await recordOperationalIncident({
      source: "api",
      severity: "ERROR",
      title: "Falha não tratada na API",
      detail: errorMessage,
      metadata: { method: request.method, route: request.routeOptions.url, requestId: request.id },
      fingerprintKey: `api:${request.method}:${request.routeOptions.url}:${errorMessage}`,
    }).catch(() => undefined);
  }
  return reply
    .status(
      statusCode,
    )
    .send({
      erro: failure.statusCode === 401 ? "NAO_AUTORIZADO" : "ERRO_INTERNO",
      request_id: request.id,
    });
});

async function shutdown(signal: string) {
  app.log.info({ signal }, "Encerrando Nexus Pharma API");
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await prisma.$queryRaw`SELECT 1`;
await app.listen({ port: config.PORT, host: config.HOST });
