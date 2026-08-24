import type { Metadata } from "next";
import { portalFetch, requireCompany } from "@/lib/portal";
import { currency, EmptyReport, MetricCard, number, percent } from "../report-ui";

export const metadata: Metadata = { title: "Gestão" };

type ManagementReport = {
  company: { tradeName: string; taxRegime: string };
  indicators: {
    salesCount: number; revenue: number; cost: number; tax: number; netProfit: number;
    margin: number; revenueVariation: number | null; reorderAlerts: number;
    expiringLots: number; pendingTaxAnalyses: number;
  };
  topProducts: Array<{ name: string; quantity: number; profit: number }>;
  daily: Array<{ date: string; revenue: number; profit: number }>;
};

export default async function ManagementPage() {
  await requireCompany(["OWNER", "ADMIN", "MANAGER", "FINANCE", "VIEWER"]);
  const report = await portalFetch<ManagementReport>("/api/v1/relatorios/gestao");
  return <section className="report-page">
    <div className="report-heading"><div><span>VISÃO EXECUTIVA · 30 DIAS</span><h1>Gestão do negócio</h1><p>Vendas, rentabilidade, tributos e pontos de atenção em uma única leitura.</p></div><div className="report-period">Atualização em tempo real</div></div>
    {!report ? <EmptyReport text="Conecte a API do Render e registre vendas para ativar a visão executiva." /> : <>
      <div className="report-metrics">
        <MetricCard label="Faturamento" value={currency(report.indicators.revenue)} note={`${percent(report.indicators.revenueVariation)} vs. período anterior`} />
        <MetricCard label="Lucro líquido" value={currency(report.indicators.netProfit)} note={`Margem de ${percent(report.indicators.margin)}`} tone="success" />
        <MetricCard label="Tributos apurados" value={currency(report.indicators.tax)} note={`${report.indicators.salesCount} vendas processadas`} />
        <MetricCard label="Alertas para compra" value={number(report.indicators.reorderAlerts)} note="Estoque baixo e boa saída" tone={report.indicators.reorderAlerts ? "warning" : "default"} />
      </div>
      <div className="report-layout">
        <article className="report-panel wide"><div className="panel-title"><div><span>DESEMPENHO</span><h2>Receita diária</h2></div><strong>{currency(report.indicators.revenue)}</strong></div>
          {report.daily.length ? <div className="bar-chart">{report.daily.slice(-14).map((item) => { const max = Math.max(...report.daily.map((day) => day.revenue), 1); return <div key={item.date}><i style={{ height: `${Math.max(8, item.revenue / max * 100)}%` }} title={`${item.date}: ${currency(item.revenue)}`} /><small>{item.date.slice(8)}</small></div>; })}</div> : <EmptyReport />}
        </article>
        <article className="report-panel"><div className="panel-title"><div><span>ATENÇÃO</span><h2>Pendências</h2></div></div><div className="attention-list"><div><b>{report.indicators.pendingTaxAnalyses}</b><span>Análises fiscais pendentes</span></div><div><b>{report.indicators.expiringLots}</b><span>Lotes vencendo em 90 dias</span></div><div><b>{report.indicators.reorderAlerts}</b><span>Sugestões de reposição</span></div></div></article>
        <article className="report-panel full"><div className="panel-title"><div><span>GIRO E MARGEM</span><h2>Produtos de maior saída</h2></div></div>
          {report.topProducts.length ? <div className="report-table"><div className="table-head"><span>Produto</span><span>Quantidade</span><span>Lucro</span></div>{report.topProducts.map((item) => <div className="table-row" key={item.name}><strong>{item.name}</strong><span>{number(item.quantity, 2)}</span><b>{currency(item.profit)}</b></div>)}</div> : <EmptyReport />}
        </article>
      </div>
    </>}
  </section>;
}
