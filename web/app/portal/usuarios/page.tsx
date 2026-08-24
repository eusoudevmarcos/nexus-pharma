import type { Metadata } from "next";
import { portalFetch, requireCompany } from "@/lib/portal";
import { date, EmptyReport, MetricCard, number } from "../report-ui";

export const metadata: Metadata = { title: "Usuários" };

type UsersReport = {
  indicators: { total: number; active: number; administrators: number; activeInLast30Days: number };
  users: Array<{ membershipId: string; role: string; active: boolean; createdAt: string; activityCount: number; lastActivityAt: string | null; user: { id: string; name: string; email: string; status: string; lastLoginAt: string | null } }>;
};

export default async function UsersPage() {
  await requireCompany(["OWNER", "ADMIN", "MANAGER"]);
  const report = await portalFetch<UsersReport>("/api/v1/relatorios/usuarios");
  return <section className="report-page">
    <div className="report-heading"><div><span>ACESSOS E RESPONSABILIDADES</span><h1>Usuários</h1><p>Perfis, situação da conta e atividade auditável de cada integrante.</p></div><button className="button button-yellow" disabled>Convidar usuário</button></div>
    {!report ? <EmptyReport text="Conecte a API para carregar os usuários desta empresa." /> : <>
      <div className="report-metrics">
        <MetricCard label="Usuários vinculados" value={number(report.indicators.total)} />
        <MetricCard label="Acessos ativos" value={number(report.indicators.active)} tone="success" />
        <MetricCard label="Administradores" value={number(report.indicators.administrators)} />
        <MetricCard label="Ativos em 30 dias" value={number(report.indicators.activeInLast30Days)} />
      </div>
      <article className="report-panel full"><div className="panel-title"><div><span>EQUIPE</span><h2>Perfis da empresa</h2></div></div>
        {report.users.length ? <div className="user-list">{report.users.map((entry) => <div key={entry.membershipId}><span className="user-avatar">{entry.user.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><div><strong>{entry.user.name}</strong><small>{entry.user.email}</small></div><span><b>{entry.role}</b><small>{entry.active ? "Acesso ativo" : "Acesso suspenso"}</small></span><span><b>{entry.activityCount} ações</b><small>{entry.lastActivityAt ? `Última em ${date(entry.lastActivityAt)}` : "Sem atividade recente"}</small></span></div>)}</div> : <EmptyReport />}
      </article>
    </>}
  </section>;
}
