import type { Metadata } from "next";
import { internalFetch, requireInternal } from "@/lib/portal";
import { EmptyReport, MetricCard, number } from "../../report-ui";
import { PrivacyOperations, type PrivacyOperationsReport } from "./privacy-operations";

export const metadata: Metadata = { title: "Privacidade e recuperação" };

export default async function InternalPrivacyPage() {
  await requireInternal();
  const report = await internalFetch<PrivacyOperationsReport>("/api/v1/interno/privacidade");
  return <section className="report-page privacy-operations-page"><div className="report-heading"><div><span>GOVERNANÇA DE DADOS</span><h1>Privacidade & DR</h1><p>Direitos dos titulares, retenção controlada e evidências de recuperação em uma janela restrita.</p></div><div className="report-period">Acesso administrativo</div></div>{!report ? <EmptyReport text="Conecte a API para carregar a operação de privacidade."/> : <><div className="report-metrics"><MetricCard label="Em andamento" value={number(report.indicators.open)} note="Pedidos ainda não encerrados"/><MetricCard label="Vencem em 3 dias" value={number(report.indicators.dueSoon)} note="Prioridade operacional" tone={report.indicators.dueSoon ? "warning" : "default"}/><MetricCard label="Fora do prazo" value={number(report.indicators.overdue)} note="Exigem ação imediata" tone={report.indicators.overdue ? "warning" : "success"}/><MetricCard label="Concluídos" value={number(report.indicators.completed)} note="Últimos 30 dias" tone="success"/></div><PrivacyOperations report={report}/></>}</section>;
}
