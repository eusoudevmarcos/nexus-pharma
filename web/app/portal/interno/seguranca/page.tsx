import type { Metadata } from "next";
import { internalFetch, requireInternal } from "@/lib/portal";
import { EmptyReport, MetricCard, number } from "../../report-ui";
import { SecurityCenter, type SecurityReport } from "./security-center";

export const metadata: Metadata = { title: "Segurança interna" };

export default async function SecurityPage() {
  await requireInternal(["DEVELOPER"]);
  const report = await internalFetch<SecurityReport>("/api/v1/interno/seguranca");
  return <section className="report-page security-page"><div className="report-heading"><div><span>IDENTIDADE E ACESSO</span><h1>Segurança</h1><p>Sessões revogáveis, MFA, tentativas de acesso e eventos críticos em uma janela independente.</p></div><div className="report-period">Defesa ativa</div></div>{!report ? <EmptyReport text="Conecte a API para carregar a central de segurança."/> : <><div className="report-metrics"><MetricCard label="Cobertura MFA privilegiada" value={`${number(report.indicators.mfaCoverage)}%`} note={`${number(report.indicators.privilegedMfa)} de ${number(report.indicators.privilegedUsers)} identidades`} tone={report.indicators.mfaCoverage === 100 ? "success" : "warning"}/><MetricCard label="Sessões ativas" value={number(report.indicators.activeSessions)} note="Tokens vinculados e válidos" tone="success"/><MetricCard label="Falhas de autenticação" value={number(report.indicators.failedLogins + report.indicators.mfaFailures)} note="Login ou MFA nas últimas 24h" tone={report.indicators.failedLogins + report.indicators.mfaFailures ? "warning" : "default"}/><MetricCard label="Reutilizações bloqueadas" value={number(report.indicators.refreshReuse)} note="Últimos 30 dias" tone={report.indicators.refreshReuse ? "warning" : "default"}/></div><SecurityCenter report={report}/></>}</section>;
}
