import type { Metadata } from "next";
import { internalFetch, requireInternal } from "@/lib/portal";
import { EmptyReport, MetricCard, number } from "../../report-ui";

export const metadata: Metadata = { title: "Prontidão para produção" };

type Check = { id: string; category: string; status: "PASS" | "WARN" | "BLOCKED"; title: string; detail: string; action: string | null };
type ReadinessReport = { generatedAt: string; stage: string; ready: boolean; summary: { pass: number; warn: number; blocked: number }; checks: Check[] };

const categoryLabels: Record<string, string> = { ACCESS: "Acesso e identidade", DATABASE: "Banco e migrations", RECOVERY: "Backups e recuperação", INTEGRATIONS: "Integrações", OPERATIONS: "Operação" };
const statusLabels: Record<string, string> = { PASS: "Pronto", WARN: "Atenção", BLOCKED: "Bloqueado" };

export default async function GoLivePage() {
  await requireInternal(["DEVELOPER"]);
  const report = await internalFetch<ReadinessReport>("/api/v1/interno/go-live");
  return <section className="report-page go-live-page"><div className="report-heading"><div><span>PRÉ-PRODUÇÃO</span><h1>Go-live</h1><p>Uma única visão dos requisitos técnicos que precisam estar comprovados antes do primeiro cliente real.</p></div><div className="report-period">Gate de liberação</div></div>{!report ? <EmptyReport text="Conecte a API ao ambiente para executar o preflight."/> : <><div className={`go-live-verdict ${report.ready ? "ready" : "blocked"}`}><span>{report.ready ? "✓" : "!"}</span><div><strong>{report.ready ? "Ambiente pronto para liberação" : "Liberação comercial bloqueada"}</strong><p>{report.ready ? "Todos os controles obrigatórios foram comprovados." : `${report.summary.blocked} requisito(s) obrigatório(s) ainda precisam de ação.`} Ambiente: {report.stage}.</p></div></div><div className="report-metrics"><MetricCard label="Comprovados" value={number(report.summary.pass)} note="Controles aprovados" tone="success"/><MetricCard label="Atenções" value={number(report.summary.warn)} note="Não bloqueiam, mas exigem revisão" tone={report.summary.warn ? "warning" : "default"}/><MetricCard label="Bloqueadores" value={number(report.summary.blocked)} note="Impedem clientes reais" tone={report.summary.blocked ? "warning" : "success"}/><MetricCard label="Controles totais" value={number(report.checks.length)} note="Verificados em tempo real"/></div><article className="report-panel full go-live-check-panel"><div className="panel-title"><div><span>CHECKLIST AUTOMÁTICO</span><h2>Prontidão do ambiente</h2></div><strong>{report.ready ? "LIBERADO" : "BLOQUEADO"}</strong></div><div className="go-live-checks">{report.checks.map((item) => <div className={`go-live-check ${item.status.toLowerCase()}`} key={item.id}><span>{item.status === "PASS" ? "✓" : item.status === "WARN" ? "△" : "!"}</span><div><small>{categoryLabels[item.category] ?? item.category}</small><strong>{item.title}</strong><p>{item.detail}</p>{item.action && <b>Próxima ação: {item.action}</b>}</div><em>{statusLabels[item.status]}</em></div>)}</div></article></>}</section>;
}
