import type { Metadata } from "next";
import { internalFetch, requireInternal } from "@/lib/portal";
import { EmptyReport, MetricCard, number } from "../../report-ui";
import { IncidentBoard, type Incident } from "./incident-board";

export const metadata: Metadata = { title: "Monitoramento interno" };
type Report = {
  generatedAt: string;
  runtime: { uptimeSeconds: number; requests: number; serverErrors: number; slowRequests: number; averageDurationMs: number };
  indicators: { databaseLatencyMs: number; openIncidents: number; criticalIncidents: number; failedEmails: number; failedBillingEvents: number; activeSessions: number };
  services: Array<{ name: string; status: string; detail: string }>;
  incidents: Incident[];
};

const uptime = (seconds: number) => seconds >= 86400 ? `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h` : `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min`;

export default async function MonitoringPage() {
  await requireInternal(["DEVELOPER"]);
  const report = await internalFetch<Report>("/api/v1/interno/monitoramento");
  return <section className="report-page"><div className="report-heading"><div><span>SAÚDE DA PLATAFORMA</span><h1>Monitoramento</h1><p>Disponibilidade, integrações, desempenho e fila central de incidentes.</p></div><div className="report-period">Tempo real</div></div>{!report ? <EmptyReport text="Conecte a API para carregar a saúde da plataforma."/> : <><div className="report-metrics"><MetricCard label="Incidentes abertos" value={number(report.indicators.openIncidents)} note={`${report.indicators.criticalIncidents} críticos`} tone={report.indicators.criticalIncidents ? "warning" : "success"}/><MetricCard label="Banco de dados" value={`${report.indicators.databaseLatencyMs} ms`} note="PostgreSQL respondendo" tone="success"/><MetricCard label="Sessões ativas" value={number(report.indicators.activeSessions)} note="Acessos ainda válidos"/><MetricCard label="Erros da API" value={number(report.runtime.serverErrors)} note={`${report.runtime.slowRequests} respostas lentas`} tone={report.runtime.serverErrors ? "warning" : "default"}/></div><article className="report-panel full service-health-panel"><div className="panel-title"><div><span>COMPONENTES</span><h2>Saúde dos serviços</h2></div><strong>Uptime {uptime(report.runtime.uptimeSeconds)}</strong></div><div className="service-health-grid">{report.services.map((service) => <div key={service.name}><i className={service.status.toLowerCase()}/><strong>{service.name}</strong><span>{service.status === "UP" ? "Operacional" : service.status === "CONFIGURED" ? "Configurado" : "Pendente"}</span><small>{service.detail}</small></div>)}</div><div className="runtime-strip"><span><b>{number(report.runtime.requests)}</b> requisições</span><span><b>{report.runtime.averageDurationMs} ms</b> tempo médio</span><span><b>{number(report.indicators.failedEmails)}</b> falhas de e-mail em 24h</span><span><b>{number(report.indicators.failedBillingEvents)}</b> falhas de cobrança em 24h</span></div></article><article className="report-panel full incident-panel"><div className="panel-title"><div><span>INCIDENTES</span><h2>Fila de tratamento</h2></div><strong>{report.incidents.length}</strong></div><IncidentBoard incidents={report.incidents}/></article></>}</section>;
}
