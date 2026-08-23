import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "../config.js";
import { PrismaClient } from "../generated/prisma/client.js";

const adapter = new PrismaPg({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 8_000,
});

export const prisma = new PrismaClient({ adapter });
