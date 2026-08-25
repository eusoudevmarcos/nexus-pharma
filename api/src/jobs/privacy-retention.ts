import type { Prisma } from "../generated/prisma/client.js";
import { config } from "../config.js";
import { prisma } from "../infra/prisma.js";
import { recordOperationalIncident } from "../services/observability.js";

const DAY = 86_400_000;
const json = (value: Record<string, unknown>) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export async function runPrivacyRetention(referenceDate = new Date()) {
  const dateKey = referenceDate.toISOString().slice(0, 10);
  const idempotencyKey = `privacy-retention:${dateKey}`;
  const previous = await prisma.backgroundJobRun.findUnique({ where: { idempotencyKey } });
  if (previous?.status === "COMPLETED") return { duplicate: true, run: previous };
  if (previous?.status === "RUNNING" && previous.startedAt > new Date(Date.now() - 2 * 60 * 60 * 1000)) return { duplicate: true, run: previous };

  const run = previous
    ? await prisma.backgroundJobRun.update({ where: { id: previous.id }, data: { status: "RUNNING", attempts: { increment: 1 }, error: null, startedAt: new Date(), finishedAt: null } })
    : await prisma.backgroundJobRun.create({ data: { jobName: "PRIVACY_RETENTION", idempotencyKey } });
  const sessionCutoff = new Date(referenceDate.getTime() - config.AUTH_SESSION_RETENTION_DAYS * DAY);
  const tokenCutoff = new Date(referenceDate.getTime() - config.ONE_TIME_TOKEN_RETENTION_DAYS * DAY);
  const counters = { authSessionsDeleted: 0, oneTimeTokensDeleted: 0 };

  try {
    const [sessions, tokens] = await prisma.$transaction([
      prisma.authSession.deleteMany({
        where: {
          OR: [
            { revokedAt: { not: null, lt: sessionCutoff } },
            { expiresAt: { lt: sessionCutoff } },
          ],
        },
      }),
      prisma.oneTimeToken.deleteMany({
        where: {
          OR: [
            { usedAt: { not: null, lt: tokenCutoff } },
            { expiresAt: { lt: tokenCutoff } },
          ],
        },
      }),
    ]);
    counters.authSessionsDeleted = sessions.count;
    counters.oneTimeTokensDeleted = tokens.count;
    const completed = await prisma.backgroundJobRun.update({ where: { id: run.id }, data: { status: "COMPLETED", counters: json(counters), result: json({ sessionCutoff: sessionCutoff.toISOString(), tokenCutoff: tokenCutoff.toISOString(), personalBusinessDataDeletion: "MANUAL_LEGAL_REVIEW_REQUIRED" }), finishedAt: new Date() } });
    return { duplicate: false, run: completed, counters };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 2000) : "ERRO_DESCONHECIDO";
    await prisma.backgroundJobRun.update({ where: { id: run.id }, data: { status: "FAILED", counters: json(counters), error: message, finishedAt: new Date() } }).catch(() => undefined);
    await recordOperationalIncident({ source: "privacy-retention", severity: "ERROR", title: "Falha na rotina de retenção de dados", detail: message, metadata: { runId: run.id, dateKey } }).catch(() => undefined);
    throw error;
  }
}
