import type { Metadata } from "next";
import { portalFetch, requireCompany } from "@/lib/portal";
import { EmptyReport, MetricCard, number } from "../report-ui";
import { type PendingInvitation, type UserEntry, UserAdministration } from "./user-administration";
import { AccessGovernance, AccessPrinciples, type AccessCatalog } from "../access-governance";
import { AccessReviewCenter, type AccessReviewDetail, type AccessReviewListItem } from "./access-review-center";

export const metadata: Metadata = { title: "Usuários" };

type UsersReport = {
  indicators: { total: number; active: number; administrators: number; activeInLast30Days: number };
  users: UserEntry[];
};

export default async function UsersPage() {
  const session = await requireCompany(["OWNER", "ADMIN", "MANAGER"]);
  const [report, invitations, accessCatalog, accessReviews] = await Promise.all([
    portalFetch<UsersReport>("/api/v1/relatorios/usuarios"),
    portalFetch<PendingInvitation[]>("/api/v1/usuarios/convites"),
    portalFetch<AccessCatalog>("/api/v1/acessos/matriz"),
    portalFetch<AccessReviewListItem[]>("/api/v1/usuarios/revisoes-acesso"),
  ]);
  const selectedReview = accessReviews?.find((review) => review.status === "OPEN") ?? accessReviews?.[0] ?? null;
  const accessReview = selectedReview ? await portalFetch<AccessReviewDetail>(`/api/v1/usuarios/revisoes-acesso/${selectedReview.id}`) : null;
  return <section className="report-page">
    <div className="report-heading"><div><span>ACESSOS E RESPONSABILIDADES</span><h1>Usuários</h1><p>Perfis, situação da conta e atividade auditável de cada integrante.</p></div></div>
    {!report ? <EmptyReport text="Conecte a API para carregar os usuários desta empresa." /> : <>
      <div className="report-metrics">
        <MetricCard label="Usuários vinculados" value={number(report.indicators.total)} />
        <MetricCard label="Acessos ativos" value={number(report.indicators.active)} tone="success" />
        <MetricCard label="Administradores" value={number(report.indicators.administrators)} />
        <MetricCard label="Ativos em 30 dias" value={number(report.indicators.activeInLast30Days)} />
      </div>
      {accessCatalog && <><AccessPrinciples catalog={accessCatalog} /><AccessGovernance catalog={accessCatalog} scope="tenant" compact /></>}
      <AccessReviewCenter campaigns={accessReviews ?? []} currentRole={session.membership.role} review={accessReview} />
      {report.users.length ? <UserAdministration currentRole={session.membership.role} invitations={invitations ?? []} users={report.users} /> : <EmptyReport />}
    </>}
  </section>;
}
