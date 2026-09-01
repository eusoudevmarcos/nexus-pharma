import type { Metadata } from "next";
import { portalFetch, requireCompany } from "@/lib/portal";
import { EmptyReport, MetricCard, number } from "../report-ui";
import { AlertCenter, type BusinessAlert } from "./alert-center";

export const metadata: Metadata = { title: "Central de alertas" };
type Report = {
  indicators: { open: number; acknowledged: number; critical: number; purchaseOpportunities: number };
  alerts: BusinessAlert[];
  lastRun: { status: string; finishedAt: string | null } | null;
};

export default async function AlertsPage() {
  const session = await requireCompany(["OWNER", "ADMIN", "MANAGER", "BUYER", "FINANCE", "PHARMACIST", "VIEWER"]);
  const report = await portalFetch<Report>("/api/v1/relatorios/alertas");
  return <section className="report-page"><div className="report-heading"><div><span>DECISÕES E PENDÊNCIAS</span><h1>Central de alertas</h1><p>O que comprar, o que está vencendo e o que precisa de ação agora.</p></div><div className="report-period">Atualização diária</div></div>{!report ? <EmptyReport text="Conecte a API para ativar as automações diárias."/> : <><div className="report-metrics"><MetricCard label="Novos alertas" value={number(report.indicators.open)} note="Ainda não assumidos" tone={report.indicators.open ? "warning" : "success"}/><MetricCard label="Em tratamento" value={number(report.indicators.acknowledged)} note="Responsável já sinalizado"/><MetricCard label="Críticos" value={number(report.indicators.critical)} note="Ação prioritária" tone={report.indicators.critical ? "warning" : "default"}/><MetricCard label="Boas compras" value={number(report.indicators.purchaseOpportunities)} note="Margem alta e estoque curto" tone="success"/></div><article className="report-panel full alert-center-panel"><div className="panel-title"><div><span>FILA INTELIGENTE</span><h2>Alertas ativos</h2></div><strong>{report.lastRun?.status === "COMPLETED" ? "Automação em dia" : "Aguardando rotina"}</strong></div><AlertCenter alerts={report.alerts} currentRole={session.membership.role}/></article></>}</section>;
}
