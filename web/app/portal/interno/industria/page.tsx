import type { Metadata } from "next";
import { internalFetch, requireInternal } from "@/lib/portal";
import { EmptyReport, MetricCard, number } from "../../report-ui";
import { IndustryCenter, type IndustryOverview } from "./industry-center";

export const metadata: Metadata = { title: "Indústria e distribuição" };

export default async function IndustryPage() {
  await requireInternal(["COMMERCIAL"]);
  const overview = await internalFetch<IndustryOverview>("/api/v1/interno/industria");
  const organizations = overview?.organizations ?? [];
  const activeLinks = organizations.reduce((sum, item) => sum + item.connections.filter((connection) => connection.status === "ACTIVE").length, 0);
  const activeUsers = organizations.reduce((sum, item) => sum + item.members.filter((member) => member.active).length, 0);
  const pendingInvites = organizations.reduce((sum, item) => sum + item.invites.length, 0);
  return <section className="report-page">
    <div className="report-heading"><div><span>CLIENTES B2B · PAINEL DA INDÚSTRIA</span><h1>Indústria e distribuição</h1><p>Quem acompanha, só para consulta e em tempo real, estoque e vendas dos próprios produtos nas farmácias parceiras.</p></div><div className="report-period">{overview?.primeEnabled ? "Painel liberado" : "Painel desligado neste ambiente"}</div></div>
    {!overview ? <EmptyReport text="Sem acesso a esta área: só a Diretoria e os Gestores do Comercial gerenciam indústria e distribuição." /> : <>
      <div className="report-metrics">
        <MetricCard label="Organizações ativas" value={number(organizations.filter((item) => item.status === "ACTIVE").length)} />
        <MetricCard label="Farmácias compartilhando" value={number(activeLinks)} tone="success" />
        <MetricCard label="Usuários ativos" value={number(activeUsers)} />
        <MetricCard label="Convites pendentes" value={number(pendingInvites)} tone="warning" />
      </div>
      {!overview.primeEnabled && <p className="industry-warning">O painel da indústria está desligado neste ambiente (<code>PRIME_ENABLED</code> na API e <code>NEXT_PUBLIC_PRIME_ENABLED</code> no site). Dá para cadastrar, vincular e convidar agora; quem aceitar o convite só entra no painel depois de ligar.</p>}
      <IndustryCenter overview={overview} />
    </>}
  </section>;
}
