import type { Metadata } from "next";
import { portalFetch, requireCompany } from "@/lib/portal";
import { currency, date, EmptyReport, MetricCard, number, percent } from "../report-ui";

export const metadata: Metadata = { title: "Motor fiscal" };

type FiscalReport = {
  indicators: { activeCategories: number; approvedCategories: number; fiscalRules: number; uncoveredCategories: number; pendingAnalyses: number; approvedSavings: number };
  status: Array<{ status: string; count: number; estimatedSavings: number }>;
  recentAnalyses: Array<{ id: string; status: string; operationType: string | null; originState: string | null; destinationState: string | null; confidence: number; estimatedSavings: number; createdAt: string; product: { name: string; ean: string } | null; category: { name: string; ncm: string } | null; requestedBy: { name: string }; evidenceCount: number }>;
};

type TraceabilitySummary = {
  proveniencias: Array<{ status: string; _count: { _all: number }; _sum: { remainingQuantity: number | null } }>;
  avaliacoes: Array<{ status: string; _count: { _all: number } }>;
  tentativas_venda_bloqueadas: number;
  potencial_tributo_duplicado_bloqueado: number;
  observacao: string;
};

function statusCount(
  entries: Array<{ status: string; _count: { _all: number } }> | undefined,
  status: string,
) {
  return entries?.find((entry) => entry.status === status)?._count._all ?? 0;
}

export default async function FiscalPage() {
  await requireCompany(["OWNER", "ADMIN", "MANAGER", "FINANCE", "PHARMACIST", "VIEWER"]);
  const [report, traceability] = await Promise.all([
    portalFetch<FiscalReport>("/api/v1/relatorios/fiscal"),
    portalFetch<TraceabilitySummary>("/api/v1/fiscal/rastreabilidade/resumo"),
  ]);
  return <section className="report-page">
    <div className="report-heading"><div><span>INTELIGÊNCIA COM RASTREABILIDADE</span><h1>Motor fiscal</h1><p>Classificações, evidências legais e oportunidades aguardando revisão humana.</p></div><div className="report-period">Governança ativa</div></div>
    {!report ? <EmptyReport text="Conecte a API para acompanhar as classificações e análises fiscais." /> : <>
      <div className="report-metrics">
        <MetricCard label="Categorias aprovadas" value={`${report.indicators.approvedCategories}/${report.indicators.activeCategories}`} note={`${report.indicators.fiscalRules} regras por regime`} />
        <MetricCard label="Aguardando revisão" value={number(report.indicators.pendingAnalyses)} note="A IA recomenda; o responsável aprova" tone={report.indicators.pendingAnalyses ? "warning" : "default"} />
        <MetricCard label="Economia aprovada" value={currency(report.indicators.approvedSavings)} note="Somente análises validadas" tone="success" />
        <MetricCard label="Sem regra configurada" value={number(report.indicators.uncoveredCategories)} note="Categorias que exigem atenção" tone={report.indicators.uncoveredCategories ? "warning" : "default"} />
      </div>
      {traceability ? <>
        <div className="panel-title"><div><span>CADEIA ENTRADA → VENDA</span><h2>Proteção contra tributação duplicada</h2></div><strong>Rastreabilidade ativa</strong></div>
        <div className="report-metrics">
          <MetricCard label="Lotes fiscais aprovados" value={number(statusCount(traceability.proveniencias, "APPROVED"))} note="Com origem e evidência revisadas" tone="success" />
          <MetricCard label="Saídas bloqueadas" value={number(statusCount(traceability.avaliacoes, "BLOCKED") + traceability.tentativas_venda_bloqueadas)} note="Cobrança ou classificação incompatível" tone={statusCount(traceability.avaliacoes, "BLOCKED") + traceability.tentativas_venda_bloqueadas ? "warning" : "default"} />
          <MetricCard label="Potencial protegido" value={currency(traceability.potencial_tributo_duplicado_bloqueado)} note="Ainda sujeito à validação fiscal" tone="success" />
          <MetricCard label="Aguardando revisão" value={number(statusCount(traceability.proveniencias, "DRAFT") + statusCount(traceability.proveniencias, "UNDER_REVIEW"))} note="Não libera produto de alto risco" tone="warning" />
        </div>
      </> : null}
      <article className="report-panel full"><div className="panel-title"><div><span>TRILHA DE DECISÃO</span><h2>Análises recentes</h2></div><strong>{report.recentAnalyses.length} registros</strong></div>
        {report.recentAnalyses.length ? <div className="analysis-list">{report.recentAnalyses.map((analysis) => <div key={analysis.id}><span className={`status-pill ${analysis.status.toLowerCase()}`}>{analysis.status}</span><div><strong>{analysis.product?.name ?? analysis.category?.name ?? "Análise geral"}</strong><small>{analysis.category?.ncm ? `NCM ${analysis.category.ncm}` : analysis.product?.ean ?? "Sem item vinculado"} · {analysis.originState ?? "--"} → {analysis.destinationState ?? "--"}</small></div><span>{analysis.evidenceCount} fontes<br/><small>{date(analysis.createdAt)}</small></span><b>{percent(analysis.confidence)}<small>{currency(analysis.estimatedSavings)}</small></b></div>)}</div> : <EmptyReport />}
      </article>
    </>}
  </section>;
}
