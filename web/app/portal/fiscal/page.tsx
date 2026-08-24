import type { Metadata } from "next";
import { portalFetch, requireCompany } from "@/lib/portal";
import { currency, date, EmptyReport, MetricCard, number, percent } from "../report-ui";

export const metadata: Metadata = { title: "Motor fiscal" };

type FiscalReport = {
  indicators: { activeCategories: number; approvedCategories: number; fiscalRules: number; uncoveredCategories: number; pendingAnalyses: number; approvedSavings: number };
  status: Array<{ status: string; count: number; estimatedSavings: number }>;
  recentAnalyses: Array<{ id: string; status: string; operationType: string | null; originState: string | null; destinationState: string | null; confidence: number; estimatedSavings: number; createdAt: string; product: { name: string; ean: string } | null; category: { name: string; ncm: string } | null; requestedBy: { name: string }; evidenceCount: number }>;
};

export default async function FiscalPage() {
  await requireCompany(["OWNER", "ADMIN", "MANAGER", "FINANCE", "PHARMACIST", "VIEWER"]);
  const report = await portalFetch<FiscalReport>("/api/v1/relatorios/fiscal");
  return <section className="report-page">
    <div className="report-heading"><div><span>INTELIGÊNCIA COM RASTREABILIDADE</span><h1>Motor fiscal</h1><p>Classificações, evidências legais e oportunidades aguardando revisão humana.</p></div><div className="report-period">Governança ativa</div></div>
    {!report ? <EmptyReport text="Conecte a API para acompanhar as classificações e análises fiscais." /> : <>
      <div className="report-metrics">
        <MetricCard label="Categorias aprovadas" value={`${report.indicators.approvedCategories}/${report.indicators.activeCategories}`} note={`${report.indicators.fiscalRules} regras por regime`} />
        <MetricCard label="Aguardando revisão" value={number(report.indicators.pendingAnalyses)} note="A IA recomenda; o responsável aprova" tone={report.indicators.pendingAnalyses ? "warning" : "default"} />
        <MetricCard label="Economia aprovada" value={currency(report.indicators.approvedSavings)} note="Somente análises validadas" tone="success" />
        <MetricCard label="Sem regra configurada" value={number(report.indicators.uncoveredCategories)} note="Categorias que exigem atenção" tone={report.indicators.uncoveredCategories ? "warning" : "default"} />
      </div>
      <article className="report-panel full"><div className="panel-title"><div><span>TRILHA DE DECISÃO</span><h2>Análises recentes</h2></div><strong>{report.recentAnalyses.length} registros</strong></div>
        {report.recentAnalyses.length ? <div className="analysis-list">{report.recentAnalyses.map((analysis) => <div key={analysis.id}><span className={`status-pill ${analysis.status.toLowerCase()}`}>{analysis.status}</span><div><strong>{analysis.product?.name ?? analysis.category?.name ?? "Análise geral"}</strong><small>{analysis.category?.ncm ? `NCM ${analysis.category.ncm}` : analysis.product?.ean ?? "Sem item vinculado"} · {analysis.originState ?? "--"} → {analysis.destinationState ?? "--"}</small></div><span>{analysis.evidenceCount} fontes<br/><small>{date(analysis.createdAt)}</small></span><b>{percent(analysis.confidence)}<small>{currency(analysis.estimatedSavings)}</small></b></div>)}</div> : <EmptyReport />}
      </article>
    </>}
  </section>;
}
