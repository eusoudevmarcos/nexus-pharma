import type { Metadata } from "next";
import { internalFetch, requireInternal } from "@/lib/portal";
import { date, EmptyReport, MetricCard, number } from "../../report-ui";

export const metadata: Metadata = { title: "Catálogos fiscais oficiais" };

type FiscalCatalogHealth = {
  generatedAt: string;
  readyForProduction: boolean;
  indicators: { requiredCatalogs: number; activeCatalogs: number; releasesUnderReview: number; approvedDfRules: number; dfRulesUnderReview: number; critical: number; warning: number };
  requirements: Array<{ code: string; alternatives: readonly string[]; ready: boolean }>;
  releases: Array<{ id: string; catalog: string; sourceVersion: string; sourceUrl: string; sourcePublishedAt: string | null; payloadHash: string | null; itemCount: number; status: string; importedAt: string | null; reviewedAt: string | null; importedBy: { name: string } | null; reviewedBy: { name: string } | null }>;
  dfRules: Array<{ id: string; code: string; name: string; ncmPattern: string; cestPattern: string | null; regime: string; status: string; evidenceHash: string | null; validFrom: string; validUntil: string | null; reviewedBy: { name: string } | null }>;
  issues: Array<{ id: string; scope: string; severity: "INFO" | "WARNING" | "CRITICAL"; code: string; title: string; detail: string; catalog?: string }>;
};

export default async function FiscalCatalogsPage() {
  await requireInternal(["DEVELOPER"]);
  const report = await internalFetch<FiscalCatalogHealth>("/api/v1/interno/fiscal/saude");
  if (!report) return <section className="report-page"><EmptyReport text="Conecte a API para carregar a governança fiscal." /></section>;
  const reviewReleases = report.releases.filter((release) => release.status === "UNDER_REVIEW");
  const reviewRules = report.dfRules.filter((rule) => rule.status === "UNDER_REVIEW");
  return <section className="report-page fiscal-governance-page">
    <div className="report-heading"><div><span>BASE LEGAL CONTROLADA</span><h1>Catálogos fiscais</h1><p>Versões oficiais, matriz do Distrito Federal, evidências e homologação em quatro olhos.</p></div><div className={`report-period ${report.readyForProduction ? "ready" : "blocked"}`}>{report.readyForProduction ? "Base homologada" : "Produção bloqueada"}</div></div>
    <div className="report-metrics">
      <MetricCard label="Catálogos ativos" value={`${number(report.indicators.activeCatalogs)}/${number(report.indicators.requiredCatalogs)}`} note="Cobertura mínima fiscal" tone={report.indicators.activeCatalogs === report.indicators.requiredCatalogs ? "success" : "warning"}/>
      <MetricCard label="Revisões pendentes" value={number(report.indicators.releasesUnderReview + report.indicators.dfRulesUnderReview)} note="Exigem outro responsável" tone={report.indicators.releasesUnderReview + report.indicators.dfRulesUnderReview ? "warning" : "default"}/>
      <MetricCard label="Regras DF aprovadas" value={number(report.indicators.approvedDfRules)} note="Com NCM, CEST e vigência" tone={report.indicators.approvedDfRules ? "success" : "default"}/>
      <MetricCard label="Bloqueios críticos" value={number(report.indicators.critical)} note={`${number(report.indicators.warning)} avisos adicionais`} tone={report.indicators.critical ? "warning" : "success"}/>
    </div>
    <div className="report-layout two-columns">
      <article className="report-panel fiscal-coverage-panel"><div className="panel-title"><div><span>COBERTURA</span><h2>Pacotes obrigatórios</h2></div><strong>{report.indicators.activeCatalogs}/{report.indicators.requiredCatalogs}</strong></div><div className="fiscal-coverage-list">{report.requirements.map((item) => <div key={item.code}><span className={item.ready ? "ready" : "blocked"}>{item.ready ? "✓" : "!"}</span><div><strong>{item.code}</strong><small>{item.ready ? "Versão oficial ativa" : `Aceita: ${item.alternatives.join(" ou ")}`}</small></div></div>)}</div></article>
      <article className="report-panel fiscal-source-panel"><div className="panel-title"><div><span>FONTES PRIMÁRIAS</span><h2>Referenciais controlados</h2></div></div><div className="fiscal-source-list"><a href="https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=/NJarYc9nus=" target="_blank" rel="noreferrer"><strong>Portal Nacional da NF-e</strong><small>cClassTrib, leiautes e notas técnicas</small></a><a href="https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/manuais/despacho-de-importacao/sistemas/duimp/rtc/" target="_blank" rel="noreferrer"><strong>Receita Federal</strong><small>Fundamento legal, CST e IBS/CBS</small></a><a href="https://www.sinj.df.gov.br/sinj/Norma/33077/Decreto_18955_22_12_1997.html" target="_blank" rel="noreferrer"><strong>SINJ/DF · RICMS</strong><small>Decreto 18.955/1997 e alterações consolidadas</small></a></div><p className="fiscal-source-note">Nenhuma regra importada entra em produção sem URL governamental, referência legal, hash do pacote, vigência e revisor diferente do importador.</p></article>
      <article className="report-panel full fiscal-issue-panel"><div className="panel-title"><div><span>VIGÊNCIA E CONFLITOS</span><h2>Alertas da base fiscal</h2></div><strong>{report.issues.length}</strong></div>{report.issues.length ? <div className="fiscal-issue-list">{report.issues.slice(0, 80).map((issue) => <div key={issue.id}><span className={issue.severity.toLowerCase()}>{issue.severity === "CRITICAL" ? "!" : "•"}</span><div><strong>{issue.title}</strong><small>{issue.detail}</small></div><code>{issue.code}</code></div>)}</div> : <div className="recovery-readiness ready"><span>✓</span><div><strong>Nenhuma inconsistência detectada</strong><p>Catálogos e regras do DF estão com cobertura, vigência e evidências consistentes.</p></div></div>}</article>
      <article className="report-panel fiscal-review-panel"><div className="panel-title"><div><span>CATÁLOGOS</span><h2>Versões em revisão</h2></div><strong>{reviewReleases.length}</strong></div>{reviewReleases.length ? <div className="fiscal-review-list">{reviewReleases.map((release) => <div key={release.id}><span className="status-pill">REVISÃO</span><div><strong>{release.catalog} · {release.sourceVersion}</strong><small>{release.itemCount} itens · publicado {release.sourcePublishedAt ? date(release.sourcePublishedAt) : "sem data"}</small><small>Importado por {release.importedBy?.name ?? "não identificado"} · hash {release.payloadHash?.slice(0, 12) ?? "ausente"}</small></div></div>)}</div> : <EmptyReport text="Nenhuma versão oficial aguarda revisão."/>}</article>
      <article className="report-panel fiscal-review-panel"><div className="panel-title"><div><span>MATRIZ DF</span><h2>Regras em homologação</h2></div><strong>{reviewRules.length}</strong></div>{reviewRules.length ? <div className="fiscal-review-list">{reviewRules.map((rule) => <div key={rule.id}><span className="status-pill">REVISÃO</span><div><strong>{rule.name}</strong><small>NCM {rule.ncmPattern}{rule.cestPattern ? ` · CEST ${rule.cestPattern}` : ""} · {rule.regime.replaceAll("_", " ")}</small><small>Vigência desde {date(rule.validFrom)} · hash {rule.evidenceHash?.slice(0, 12) ?? "ausente"}</small></div></div>)}</div> : <EmptyReport text="Nenhuma regra do DF aguarda homologação."/>}</article>
    </div>
  </section>;
}
