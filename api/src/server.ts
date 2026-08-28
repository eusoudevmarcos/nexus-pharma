import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { allowedOrigins, config } from "./config.js";
import { prisma } from "./infra/prisma.js";
import { authRoutes } from "./routes/auth.routes.js";
import { billingWebhookRoutes } from "./routes/billing-webhooks.routes.js";
import { cadastrosRoutes } from "./routes/cadastros.routes.js";
import { fiscalRoutes } from "./routes/fiscal.routes.js";
import { taxTraceabilityRoutes } from "./routes/tax-traceability.routes.js";
import { internalRoutes } from "./routes/internal.routes.js";
import { operationsRoutes } from "./routes/operations.routes.js";
import { privacyRoutes } from "./routes/privacy.routes.js";
import { reportsRoutes } from "./routes/reports.routes.js";
import { usersRoutes } from "./routes/users.routes.js";
import { vendasRoutes } from "./routes/vendas.routes.js";
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
await app.register(billingWebhookRoutes, { prefix: "/api/v1/webhooks" });
await app.register(cadastrosRoutes, { prefix: "/api/v1/cadastros" });
await app.register(fiscalRoutes, { prefix: "/api/v1/fiscal" });
await app.register(taxTraceabilityRoutes, {
  prefix: "/api/v1/fiscal/rastreabilidade",
});
await app.register(internalRoutes, { prefix: "/api/v1/interno" });
await app.register(vendasRoutes, { prefix: "/api/v1/vendas" });
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
  const statusCode = failure.statusCode && failure.statusCode < 500 ? failure.statusCode : 500;
  if (statusCode >= 500) {
    const errorMessage = error instanceof Error ? error.message : "ERRO_DESCONHECIDO";
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
