import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { allowedOrigins, config } from "./config.js";
import { prisma } from "./infra/prisma.js";
import { authRoutes } from "./routes/auth.routes.js";
import { cadastrosRoutes } from "./routes/cadastros.routes.js";
import { fiscalRoutes } from "./routes/fiscal.routes.js";
import { operationsRoutes } from "./routes/operations.routes.js";
import { reportsRoutes } from "./routes/reports.routes.js";
import { usersRoutes } from "./routes/users.routes.js";
import { vendasRoutes } from "./routes/vendas.routes.js";

const app = Fastify({
  logger: { level: config.LOG_LEVEL },
  requestIdHeader: "x-request-id",
  trustProxy: config.TRUST_PROXY,
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
  sign: { expiresIn: config.ACCESS_TOKEN_TTL },
});

await app.register(authRoutes, { prefix: "/api/v1/auth" });
await app.register(cadastrosRoutes, { prefix: "/api/v1/cadastros" });
await app.register(fiscalRoutes, { prefix: "/api/v1/fiscal" });
await app.register(vendasRoutes, { prefix: "/api/v1/vendas" });
await app.register(reportsRoutes, { prefix: "/api/v1/relatorios" });
await app.register(usersRoutes, { prefix: "/api/v1/usuarios" });
await app.register(operationsRoutes, { prefix: "/api/v1" });

app.get("/health", async () => {
  await prisma.$queryRaw`SELECT 1`;
  return { status: "ok", database: "up", service: "nexus-pharma-api" };
});

app.setErrorHandler((error, request, reply) => {
  const failure = error as { validation?: unknown; statusCode?: number };
  request.log.error({ err: error }, "Falha não tratada");
  if (failure.validation)
    return reply.status(400).send({ erro: "REQUISICAO_INVALIDA" });
  return reply
    .status(
      failure.statusCode && failure.statusCode < 500 ? failure.statusCode : 500,
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
