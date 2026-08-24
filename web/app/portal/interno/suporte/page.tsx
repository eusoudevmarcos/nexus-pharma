import type { Metadata } from "next";
import { internalFetch, requireInternal } from "@/lib/portal";
import { EmptyReport, MetricCard, number } from "../../report-ui";
import { type SupportAgent, type SupportTicket, SupportQueue } from "./support-queue";

export const metadata: Metadata = { title: "Helpdesk interno" };
type Report = { indicators: { open: number; urgent: number; overdue: number; resolvedToday: number }; tickets: SupportTicket[]; agents: SupportAgent[] };

export default async function SupportPage() {
  await requireInternal(["HELPDESK"]);
  const report = await internalFetch<Report>("/api/v1/interno/suporte");
  return <section className="report-page"><div className="report-heading"><div><span>CENTRAL DE ATENDIMENTO</span><h1>Helpdesk</h1><p>Fila única, responsáveis, prioridade e cumprimento do SLA.</p></div><div className="report-period">Equipe Nexus</div></div>{!report ? <EmptyReport text="Conecte a API para carregar a fila de atendimento."/> : <><div className="report-metrics"><MetricCard label="Em aberto" value={number(report.indicators.open)}/><MetricCard label="Urgentes" value={number(report.indicators.urgent)} tone={report.indicators.urgent ? "warning" : "default"}/><MetricCard label="SLA vencido" value={number(report.indicators.overdue)} tone={report.indicators.overdue ? "warning" : "default"}/><MetricCard label="Resolvidos hoje" value={number(report.indicators.resolvedToday)} tone="success"/></div><article className="report-panel full"><div className="panel-title"><div><span>FILA OPERACIONAL</span><h2>Chamados recentes</h2></div><strong>{report.tickets.length}</strong></div>{report.tickets.length ? <SupportQueue agents={report.agents} tickets={report.tickets}/> : <EmptyReport text="Nenhum chamado aguardando atendimento."/>}</article></>}</section>;
}
