import { createHash } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";

export const securityActions = [
  "AUTH_LOGIN_SUCCEEDED",
  "AUTH_LOGIN_FAILED",
  "AUTH_REFRESH_ROTATED",
  "AUTH_REFRESH_REUSE_DETECTED",
  "AUTH_REFRESH_FAILED",
  "AUTH_SESSION_REVOKED",
  "AUTH_SESSION_LIMIT_REVOKED",
  "AUTH_TENANT_ACCESS_DENIED",
] as const;

export function identityFingerprint(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 20);
}

const asJson = (value: Record<string, unknown>) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export async function recordSecurityEvent(input: {
  action: (typeof securityActions)[number];
  userId?: string | null;
  companyId?: string | null;
  sessionId?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return prisma.auditLog.create({
    data: {
      companyId: input.companyId ?? null,
      userId: input.userId ?? null,
      action: input.action,
      entity: "AuthSession",
      entityId: input.sessionId ?? null,
      requestId: input.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
      metadata: asJson(input.metadata ?? {}),
    },
  });
}
