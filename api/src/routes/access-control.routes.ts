import type { FastifyInstance } from "fastify";
import { authenticate } from "../security/auth.js";
import { accessControlCatalog } from "../security/access-control.js";

export async function accessControlRoutes(app: FastifyInstance) {
  app.get("/matriz", { preHandler: [authenticate] }, async (request) => {
    const catalog = accessControlCatalog();
    if (request.user.systemRole !== "CUSTOMER") return catalog;
    return { ...catalog, internal: { profiles: [], domains: [] } };
  });
}
