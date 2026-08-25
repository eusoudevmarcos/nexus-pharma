import type { Metadata } from "next";
import { internalFetch, requireInternal } from "@/lib/portal";
import { EmptyReport, MetricCard, number } from "../../report-ui";
import { CommercialPipeline, type CommercialPlan, type PipelineCompany } from "./commercial-pipeline";

export const metadata: Metadata = { title: "Comercial interno" };
type Report = { indicators: Partial<Record<"LEAD" | "ONBOARDING" | "ACTIVE" | "SUSPENDED" | "CANCELLED", number>>; pipeline: PipelineCompany[]; plans: CommercialPlan[] };

export default async function CommercialPage() {
  await requireInternal(["COMMERCIAL"]);
  const report = await internalFetch<Report>("/api/v1/interno/comercial");
  return <section className="report-page"><div className="report-heading"><div><span>CLIENTES E IMPLANTAÇÃO</span><h1>Comercial</h1><p>Do primeiro contato à ativação da farmácia no Nexus Pharma.</p></div><div className="report-period">Pipeline SaaS</div></div>{!report ? <EmptyReport text="Conecte a API para carregar o pipeline comercial."/> : <><div className="report-metrics"><MetricCard label="Novos leads" value={number(report.indicators.LEAD ?? 0)}/><MetricCard label="Em implantação" value={number(report.indicators.ONBOARDING ?? 0)} tone="warning"/><MetricCard label="Clientes ativos" value={number(report.indicators.ACTIVE ?? 0)} tone="success"/><MetricCard label="Suspensos ou cancelados" value={number((report.indicators.SUSPENDED ?? 0) + (report.indicators.CANCELLED ?? 0))}/></div><article className="report-panel full"><div className="panel-title"><div><span>CARTEIRA</span><h2>Empresas, contratos e andamento</h2></div><strong>{report.pipeline.length}</strong></div>{report.pipeline.length ? <CommercialPipeline companies={report.pipeline} plans={report.plans}/> : <EmptyReport text="Nenhuma empresa no pipeline."/>}</article></>}</section>;
}
