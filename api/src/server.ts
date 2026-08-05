import cors from "@fastify/cors";
import Fastify from "fastify";
import mongoose from "mongoose";
import { config } from "./config.js";
import { postgres } from "./infra/postgres.js";
import { vendasRoutes } from "./routes/vendas.routes.js";
import { cadastrosRoutes } from "./routes/cadastros.routes.js";

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
  },
  requestIdHeader: "x-request-id",
});

await app.register(cors, { origin: config.WEB_ORIGIN });
await app.register(vendasRoutes, { prefix: "/api/v1/vendas" });
await app.register(cadastrosRoutes, { prefix: "/api/v1/cadastros" });

app.get("/health", async () => {
  await Promise.all([
    postgres.query("SELECT 1"),
    mongoose.connection.db?.admin().ping(),
  ]);
  return { status: "ok", postgres: "up", mongo: "up" };
});

async function shutdown(signal: string) {
  app.log.info({ signal }, "Encerrando Nexus Pharma API");
  await app.close();
  await Promise.all([postgres.end(), mongoose.disconnect()]);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await mongoose.connect(config.MONGODB_URI, {
  serverSelectionTimeoutMS: 8_000,
});
await postgres.query("SELECT 1");
await app.listen({ port: config.PORT, host: config.HOST });
