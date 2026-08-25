import "dotenv/config";
import { z } from "zod";

const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional(),
);

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3333),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  LOG_LEVEL: z.string().default("info"),
  WEB_APP_URL: z.string().url().default("http://localhost:3100"),
  EMAIL_RELAY_URL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().url().optional(),
  ),
  EMAIL_RELAY_KEY: optionalText,
  EMAIL_FROM: z.string().default("Nexus Pharma <convites@nexuspharma.com.br>"),
  BILLING_WEBHOOK_SECRET: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(32).optional(),
  ),
});

export const config = schema.parse(process.env);
export const allowedOrigins = config.WEB_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
