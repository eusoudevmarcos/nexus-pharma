import type { Metadata } from "next";
import { internalFetch, requireInternal } from "@/lib/portal";
import { EmptyReport, MetricCard, number } from "../../report-ui";
import { BillingCenter, type BillingReport } from "./billing-center";

export const metadata: Metadata = { title: "Faturamento SaaS" };

export default async function BillingPage() {
  await requireInternal(["FINANCE"]);
  const report = await internalFetch<BillingReport>("/api/v1/interno/faturamento");
  return <section className="report-page billing-page"><div className="report-heading"><div><span>OPERAÇÃO OCEAN</span><h1>Faturamento SaaS</h1><p>Planos, onboarding, economia homologada e fechamento mensal em uma única janela.</p></div><div className="report-period">Cobrança auditável</div></div>{!report ? <EmptyReport text="Conecte a API para operar o faturamento SaaS."/> : <><div className="report-metrics"><MetricCard label="Assinaturas" value={number(report.indicators.subscriptions)} note="Contratos faturáveis"/><MetricCard label="Lojas ativas" value={number(report.indicators.stores)} note="Matrizes e filiais conectadas"/><MetricCard label="PDVs ativos" value={number(report.indicators.pdvs)} note="Caixas em operação"/><MetricCard label="Aguardando revisão" value={number(report.indicators.draftInvoices + report.indicators.savingsPending)} note="Nunca são enviados ao gateway" tone={report.indicators.draftInvoices ? "warning" : "default"}/></div><BillingCenter report={report}/></>}</section>;
}
