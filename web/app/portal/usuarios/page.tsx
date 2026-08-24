import type { Metadata } from "next";
import { portalFetch, requireCompany } from "@/lib/portal";
import { EmptyReport, MetricCard, number } from "../report-ui";
import { type PendingInvitation, type UserEntry, UserAdministration } from "./user-administration";

export const metadata: Metadata = { title: "Usuários" };

type UsersReport = {
  indicators: { total: number; active: number; administrators: number; activeInLast30Days: number };
  users: UserEntry[];
};

export default async function UsersPage() {
  const session = await requireCompany(["OWNER", "ADMIN", "MANAGER"]);
  const [report, invitations] = await Promise.all([
    portalFetch<UsersReport>("/api/v1/relatorios/usuarios"),
    portalFetch<PendingInvitation[]>("/api/v1/usuarios/convites"),
  ]);
  return <section className="report-page">
    <div className="report-heading"><div><span>ACESSOS E RESPONSABILIDADES</span><h1>Usuários</h1><p>Perfis, situação da conta e atividade auditável de cada integrante.</p></div></div>
    {!report ? <EmptyReport text="Conecte a API para carregar os usuários desta empresa." /> : <>
      <div className="report-metrics">
        <MetricCard label="Usuários vinculados" value={number(report.indicators.total)} />
        <MetricCard label="Acessos ativos" value={number(report.indicators.active)} tone="success" />
        <MetricCard label="Administradores" value={number(report.indicators.administrators)} />
        <MetricCard label="Ativos em 30 dias" value={number(report.indicators.activeInLast30Days)} />
      </div>
      {report.users.length ? <UserAdministration currentRole={session.membership.role} invitations={invitations ?? []} users={report.users} /> : <EmptyReport />}
    </>}
  </section>;
}
