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
  JWT_ISSUER: z.string().min(3).default("nexus-pharma-api"),
  JWT_AUDIENCE: z.string().min(3).default("nexus-pharma-web"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  MAX_ACTIVE_SESSIONS: z.coerce.number().int().min(1).max(20).default(5),
  PRIVACY_REQUEST_SLA_DAYS: z.coerce.number().int().min(1).max(90).default(15),
  AUTH_SESSION_RETENTION_DAYS: z.coerce.number().int().min(7).max(730).default(90),
  ONE_TIME_TOKEN_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  DATABASE_RECOVERY_MODE: z.enum(["NONE", "PITR"]).default("NONE"),
  DATABASE_RECOVERY_WINDOW_DAYS: z.coerce.number().int().min(0).max(90).default(0),
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  LOG_LEVEL: z.string().default("info"),
  SERVICE_VERSION: z.string().default("development"),
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
  BILLING_RELAY_URL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().url().optional(),
  ),
  BILLING_RELAY_KEY: optionalText,
  OBSERVABILITY_TOKEN: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(32).optional(),
  ),
});

export const config = schema.parse({
  ...process.env,
  SERVICE_VERSION: process.env.SERVICE_VERSION || process.env.RENDER_GIT_COMMIT,
});
export const allowedOrigins = config.WEB_ORIGIN.split(",").map((origin) => {
  const value = origin.trim();
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(`WEB_ORIGIN_INVALIDA: ${value}`);
  }
  return parsed.origin;
});
