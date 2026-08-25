import type { Metadata } from "next";
import { internalFetch, requireInternal } from "@/lib/portal";
import { EmptyReport, MetricCard, number } from "../../report-ui";
import { SecurityCenter, type SecurityReport } from "./security-center";

export const metadata: Metadata = { title: "Segurança interna" };

export default async function SecurityPage() {
  await requireInternal(["DEVELOPER"]);
  const report = await internalFetch<SecurityReport>("/api/v1/interno/seguranca");
  return <section className="report-page security-page"><div className="report-heading"><div><span>IDENTIDADE E ACESSO</span><h1>Segurança</h1><p>Sessões revogáveis, tentativas de acesso e eventos críticos em uma janela independente.</p></div><div className="report-period">Defesa ativa</div></div>{!report ? <EmptyReport text="Conecte a API para carregar a central de segurança."/> : <><div className="report-metrics"><MetricCard label="Sessões ativas" value={number(report.indicators.activeSessions)} note="Tokens vinculados e válidos" tone="success"/><MetricCard label="Falhas de login" value={number(report.indicators.failedLogins)} note="Últimas 24 horas" tone={report.indicators.failedLogins ? "warning" : "default"}/><MetricCard label="Reutilizações bloqueadas" value={number(report.indicators.refreshReuse)} note="Últimos 30 dias" tone={report.indicators.refreshReuse ? "warning" : "default"}/><MetricCard label="Sessões revogadas" value={number(report.indicators.revokedSessions)} note="Últimos 7 dias"/></div><SecurityCenter report={report}/></>}</section>;
}
