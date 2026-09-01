import { createHash } from "node:crypto";
import type { AccessReviewDecision, Prisma } from "../generated/prisma/client.js";
import { prisma } from "../infra/prisma.js";

const stableSnapshot = (memberships: Array<{ id: string; role: string; active: boolean; user: { name: string; email: string } }>) =>
  memberships
    .map((membership) => ({ id: membership.id, role: membership.role, active: membership.active, name: membership.user.name, email: membership.user.email }))
    .sort((left, right) => left.id.localeCompare(right.id));

const snapshotHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const asJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const campaignInclude = {
  createdBy: { select: { id: true, name: true } },
  completedBy: { select: { id: true, name: true } },
  items: {
    include: {
      membership: { select: { role: true, active: true, updatedAt: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ activeSnapshot: "desc" as const }, { userNameSnapshot: "asc" as const }],
  },
} satisfies Prisma.AccessReviewCampaignInclude;

function presentCampaign<T extends { items: Array<{ roleSnapshot: string; activeSnapshot: boolean; membership: { role: string; active: boolean } | null; decision: AccessReviewDecision }> }>(campaign: T) {
  const summary = { total: campaign.items.length, pending: 0, confirmed: 0, adjustmentRequired: 0, revoked: 0, drift: 0 };
  const items = campaign.items.map((item) => {
    if (item.decision === "PENDING") summary.pending += 1;
    if (item.decision === "CONFIRMED") summary.confirmed += 1;
    if (item.decision === "ADJUSTMENT_REQUIRED") summary.adjustmentRequired += 1;
    if (item.decision === "REVOKED") summary.revoked += 1;
    const drift = !item.membership || item.membership.role !== item.roleSnapshot || item.membership.active !== item.activeSnapshot;
    if (drift) summary.drift += 1;
    return { ...item, drift, currentRole: item.membership?.role ?? null, currentActive: item.membership?.active ?? null };
  });
  return { ...campaign, items, summary };
}

export async function listAccessReviews(companyId: string) {
  const campaigns = await prisma.accessReviewCampaign.findMany({
    where: { companyId },
    include: { createdBy: { select: { id: true, name: true } }, completedBy: { select: { id: true, name: true } }, _count: { select: { items: true } }, items: { select: { decision: true } } },
    orderBy: { createdAt: "desc" },
    take: 24,
  });
  return campaigns.map((campaign) => ({
    ...campaign,
    summary: {
      total: campaign._count.items,
      pending: campaign.items.filter((item) => item.decision === "PENDING").length,
      adjustmentRequired: campaign.items.filter((item) => item.decision === "ADJUSTMENT_REQUIRED").length,
      revoked: campaign.items.filter((item) => item.decision === "REVOKED").length,
    },
    items: undefined,
    _count: undefined,
  }));
}

export async function getAccessReview(companyId: string, campaignId: string) {
  const campaign = await prisma.accessReviewCampaign.findFirst({ where: { id: campaignId, companyId }, include: campaignInclude });
  return campaign ? presentCampaign(campaign) : null;
}

export async function createAccessReview(input: { companyId: string; periodLabel: string; dueAt: Date; notes?: string | null; userId: string; requestId?: string; ipAddress?: string }) {
  const existing = await prisma.accessReviewCampaign.findFirst({ where: { companyId: input.companyId, status: "OPEN" }, select: { id: true } });
  if (existing) throw new Error("REVISAO_DE_ACESSO_JA_ABERTA");
  const memberships = await prisma.membership.findMany({
    where: { companyId: input.companyId },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!memberships.length) throw new Error("REVISAO_DE_ACESSO_SEM_MEMBROS");
  const snapshot = stableSnapshot(memberships);
  const campaign = await prisma.$transaction(async (tx) => {
    const created = await tx.accessReviewCampaign.create({
      data: {
        companyId: input.companyId,
        periodLabel: input.periodLabel,
        dueAt: input.dueAt,
        notes: input.notes,
        snapshotHash: snapshotHash(snapshot),
        createdById: input.userId,
        items: {
          create: memberships.map((membership) => ({
            membershipId: membership.id,
            userNameSnapshot: membership.user.name,
            userEmailSnapshot: membership.user.email,
            roleSnapshot: membership.role,
            activeSnapshot: membership.active,
          })),
        },
      },
      include: campaignInclude,
    });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "ACCESS_REVIEW_OPENED", entity: "AccessReviewCampaign", entityId: created.id, requestId: input.requestId, ipAddress: input.ipAddress, after: asJson({ periodLabel: created.periodLabel, dueAt: created.dueAt, snapshotHash: created.snapshotHash, memberCount: created.items.length }) } });
    return created;
  });
  return presentCampaign(campaign);
}

export async function decideAccessReviewItem(input: { companyId: string; campaignId: string; itemId: string; decision: Exclude<AccessReviewDecision, "PENDING">; justification?: string | null; confirmation?: string; userId: string; requestId?: string; ipAddress?: string }) {
  const item = await prisma.accessReviewItem.findFirst({
    where: { id: input.itemId, campaignId: input.campaignId, campaign: { companyId: input.companyId, status: "OPEN" } },
    include: { membership: true, campaign: { select: { id: true } } },
  });
  if (!item) throw new Error("ITEM_DE_REVISAO_NAO_ENCONTRADO");
  if (input.decision !== "CONFIRMED" && (!input.justification || input.justification.trim().length < 10)) throw new Error("DECISAO_DE_REVISAO_EXIGE_JUSTIFICATIVA");
  if (input.decision === "REVOKED" && input.confirmation !== "REVOGAR ACESSO") throw new Error("REVOGACAO_EXIGE_CONFIRMACAO_EXPLICITA");
  if (input.decision === "REVOKED" && item.membership.userId === input.userId) throw new Error("AUTO_REVOGACAO_NAO_PERMITIDA");

  const updated = await prisma.$transaction(async (tx) => {
    if (input.decision === "REVOKED") {
      if (item.membership.role === "OWNER" && item.membership.active) {
        const owners = await tx.membership.count({ where: { companyId: input.companyId, role: "OWNER", active: true } });
        if (owners <= 1) throw new Error("ULTIMO_PROPRIETARIO");
      }
      await tx.membership.update({ where: { id: item.membershipId }, data: { active: false } });
    }
    const saved = await tx.accessReviewItem.update({ where: { id: item.id }, data: { decision: input.decision, justification: input.justification?.trim() || null, reviewedById: input.userId, reviewedAt: new Date() }, include: { membership: { select: { role: true, active: true, updatedAt: true } }, reviewedBy: { select: { id: true, name: true } } } });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: input.decision === "REVOKED" ? "ACCESS_REVIEW_ACCESS_REVOKED" : "ACCESS_REVIEW_ITEM_DECIDED", entity: "AccessReviewItem", entityId: item.id, requestId: input.requestId, ipAddress: input.ipAddress, before: asJson({ decision: item.decision, role: item.membership.role, active: item.membership.active }), after: asJson({ decision: input.decision, justification: input.justification, active: input.decision === "REVOKED" ? false : item.membership.active }) } });
    return saved;
  });
  return { ...updated, drift: updated.membership.role !== item.roleSnapshot || updated.membership.active !== item.activeSnapshot, currentRole: updated.membership.role, currentActive: updated.membership.active };
}

export async function completeAccessReview(input: { companyId: string; campaignId: string; confirmation: string; notes?: string | null; userId: string; requestId?: string; ipAddress?: string }) {
  if (input.confirmation !== "CONCLUIR REVISAO") throw new Error("CONCLUSAO_EXIGE_CONFIRMACAO_EXPLICITA");
  const campaign = await prisma.accessReviewCampaign.findFirst({ where: { id: input.campaignId, companyId: input.companyId, status: "OPEN" }, include: { items: { select: { decision: true } } } });
  if (!campaign) throw new Error("REVISAO_DE_ACESSO_NAO_ENCONTRADA");
  if (campaign.createdById === input.userId) throw new Error("REVISAO_EXIGE_SEGUNDO_USUARIO");
  if (campaign.items.some((item) => item.decision === "PENDING")) throw new Error("REVISAO_POSSUI_ITENS_PENDENTES");
  const completed = await prisma.$transaction(async (tx) => {
    const saved = await tx.accessReviewCampaign.update({ where: { id: campaign.id }, data: { status: "COMPLETED", completedAt: new Date(), completedById: input.userId, ...(input.notes !== undefined && { notes: input.notes }) }, include: campaignInclude });
    await tx.auditLog.create({ data: { companyId: input.companyId, userId: input.userId, action: "ACCESS_REVIEW_COMPLETED", entity: "AccessReviewCampaign", entityId: campaign.id, requestId: input.requestId, ipAddress: input.ipAddress, after: asJson({ snapshotHash: saved.snapshotHash, total: saved.items.length, decisions: saved.items.map((item) => item.decision) }) } });
    return saved;
  });
  return presentCampaign(completed);
}

const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function exportAccessReviewCsv(companyId: string, campaignId: string) {
  const campaign = await getAccessReview(companyId, campaignId);
  if (!campaign) return null;
  const rows = [
    ["campanha", campaign.periodLabel],
    ["status", campaign.status],
    ["hash_snapshot", campaign.snapshotHash],
    ["prazo", campaign.dueAt.toISOString()],
    [],
    ["nome", "email", "perfil_snapshot", "ativo_snapshot", "perfil_atual", "ativo_atual", "divergencia", "decisao", "justificativa", "revisor", "revisado_em"],
    ...campaign.items.map((item) => [item.userNameSnapshot, item.userEmailSnapshot, item.roleSnapshot, item.activeSnapshot, item.membership?.role ?? null, item.membership?.active ?? null, !item.membership || item.membership.role !== item.roleSnapshot || item.membership.active !== item.activeSnapshot, item.decision, item.justification, item.reviewedBy?.name, item.reviewedAt?.toISOString()]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
}
