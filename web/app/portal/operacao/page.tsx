import type { Metadata } from "next";
import { portalFetch, requireCompany } from "@/lib/portal";
import { currency, date, EmptyReport, MetricCard, number, percent } from "../report-ui";

export const metadata: Metadata = { title: "Painel de controle" };

type OperationReport = {
  indicators: { activeProducts: number; todaySalesCount: number; todayRevenue: number; openReorderAlerts: number; expiringLots: number; todayMovements: number };
  reorderAlerts: Array<{ id: string; reason: string; suggestedQuantity: number; estimatedMargin: number; product: { name: string; ean: string; stockQuantity: number; dailySalesAverage: number; salePrice: number } }>;
  expiringLots: Array<{ id: string; code: string; expiresAt: string; quantity: number; expired: boolean; product: { name: string; ean: string } }>;
};

export default async function OperationPage() {
  await requireCompany(["OWNER", "ADMIN", "MANAGER", "BUYER", "FINANCE", "PHARMACIST", "VIEWER"]);
  const report = await portalFetch<OperationReport>("/api/v1/relatorios/operacao");
  return <section className="report-page">
    <div className="report-heading"><div><span>CONTROLE DA FARMÁCIA</span><h1>Estoque, validades e compras</h1><p>O que está faltando, o que vence primeiro e quanto pedir sem criar excesso ou perda.</p></div><div className="report-period">Atualizado hoje</div></div>
    {!report ? <EmptyReport text="A operação aparecerá aqui assim que a API e o banco estiverem conectados." /> : <>
      <div className="report-metrics">
        <MetricCard label="Vendas hoje" value={currency(report.indicators.todayRevenue)} note={`${report.indicators.todaySalesCount} transações`} />
        <MetricCard label="Produtos ativos" value={number(report.indicators.activeProducts)} note={`${report.indicators.todayMovements} movimentações hoje`} />
        <MetricCard label="Reposições sugeridas" value={number(report.indicators.openReorderAlerts)} note="Priorizadas por giro e margem" tone={report.indicators.openReorderAlerts ? "warning" : "default"} />
        <MetricCard label="Lotes em atenção" value={number(report.indicators.expiringLots)} note="Vencidos ou até 90 dias" tone={report.indicators.expiringLots ? "warning" : "default"} />
      </div>
      <div className="report-layout two-columns">
        <article className="report-panel"><div className="panel-title"><div><span>COMPRAS</span><h2>Reposição inteligente</h2></div></div>
          {report.reorderAlerts.length ? <div className="task-list">{report.reorderAlerts.map((alert) => <div key={alert.id}><span className="task-icon">↗</span><div><strong>{alert.product.name}</strong><small>Estoque {number(alert.product.stockQuantity, 2)} · sugerido {number(alert.suggestedQuantity, 2)}</small><p>{alert.reason}</p></div><b>{percent(alert.estimatedMargin)}</b></div>)}</div> : <EmptyReport text="Nenhum item precisa de reposição agora." />}
        </article>
        <article className="report-panel"><div className="panel-title"><div><span>VALIDADE</span><h2>Lotes prioritários</h2></div></div>
          {report.expiringLots.length ? <div className="task-list">{report.expiringLots.map((lot) => <div key={lot.id}><span className={`task-icon ${lot.expired ? "danger" : ""}`}>!</span><div><strong>{lot.product.name}</strong><small>Lote {lot.code} · {number(lot.quantity, 2)} un.</small><p>{lot.expired ? "Vencido" : `Vence em ${date(lot.expiresAt)}`}</p></div><b>{lot.product.ean}</b></div>)}</div> : <EmptyReport text="Nenhum lote vencido ou próximo do vencimento." />}
        </article>
      </div>
    </>}
  </section>;
}
