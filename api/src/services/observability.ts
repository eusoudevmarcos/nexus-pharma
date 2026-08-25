import { createHash } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";

type Severity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";
type IncidentInput = {
  source: string;
  severity?: Severity;
  title: string;
  detail?: string | null;
  metadata?: Record<string, unknown>;
  fingerprintKey?: string;
};

const startedAt = new Date();
const counters = { requests: 0, clientErrors: 0, serverErrors: 0, slowRequests: 0, totalDurationMs: 0 };

const json = (value: Record<string, unknown>) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export function observeResponse(statusCode: number, durationMs: number) {
  counters.requests += 1;
  counters.totalDurationMs += Number.isFinite(durationMs) ? durationMs : 0;
  if (statusCode >= 400 && statusCode < 500) counters.clientErrors += 1;
  if (statusCode >= 500) counters.serverErrors += 1;
  if (durationMs >= 1000) counters.slowRequests += 1;
}

export function runtimeSnapshot() {
  return {
    startedAt,
    uptimeSeconds: Math.floor(process.uptime()),
    ...counters,
    averageDurationMs: counters.requests ? Math.round(counters.totalDurationMs / counters.requests) : 0,
  };
}

export async function recordOperationalIncident(input: IncidentInput) {
  const fingerprint = createHash("sha256")
    .update(input.fingerprintKey ?? `${input.source}:${input.title}`)
    .digest("hex");
  return prisma.operationalIncident.upsert({
    where: { fingerprint },
    create: {
      fingerprint,
      source: input.source.slice(0, 80),
      severity: input.severity ?? "ERROR",
      title: input.title.slice(0, 180),
      detail: input.detail?.slice(0, 2000) ?? null,
      metadata: json(input.metadata ?? {}),
    },
    update: {
      severity: input.severity ?? "ERROR",
      title: input.title.slice(0, 180),
      detail: input.detail?.slice(0, 2000) ?? null,
      metadata: json(input.metadata ?? {}),
      occurrenceCount: { increment: 1 },
      lastSeenAt: new Date(),
      status: "OPEN",
      resolvedAt: null,
      resolvedById: null,
    },
  });
}
