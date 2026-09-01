"use client";

import { useState } from "react";

export type AssistantMetrics = {
  engine: string; generated: number; awaitingReview: number; approved: number; rejected: number;
  humanAgreementRate: number; sourceCoverageRate: number; averageConfidence: number; externalModelCost: number;
  compatibilityConflicts: number; repeatedHumanPatterns: number; productDataCompletenessRate: number;
};
export type AssistantProduct = {
  id: string; ean: string; name: string; activeIngredient: string; composition: string; laboratory: string; anvisaRegistration: string | null;
  category: { id: string; name: string; ncm: string; cest: string | null; ruleVersion: string };
};
export type AssistantCategory = { id: string; name: string; ncm: string; cest: string | null; ruleVersion: string; status: string };
type Compatibility = {
  status?: "COMPATIBLE" | "CONFLICT" | "INCONCLUSIVE"; score?: number; requiresNcmReview?: boolean;
  current?: { ncm?: string; description?: string | null };
  candidate?: { ncm?: string; description?: string; score?: number } | null;
  expectedPrefixes?: string[];
};
type Suggestion = {
  requiresHumanReview?: boolean;
  category?: { name?: string; ncm?: string; cest?: string | null; ruleVersion?: string };
  operation?: { type?: string; originState?: string; destinationState?: string; regime?: string };
  tax?: { cfop?: string; cstIcms?: string; csosn?: string | null; cstPisCofins?: string; revenueNature?: string | null; cstIbsCbs?: string; cClassTrib?: string } | null;
  matrixRule?: { code?: string; version?: string } | null;
  compatibility?: Compatibility;
  humanHistory?: { observations?: number; repeatedCorrection?: { ncm?: string; occurrences?: number; advisoryOnly?: boolean } | null; disclaimer?: string };
  impact?: { available?: boolean; monthlyGross?: number; currentNominalRate?: number; candidateNominalRate?: number; estimatedMonthlyTaxDelta?: number | null; candidateCategory?: { name?: string; ncm?: string }; disclaimer?: string };
  risks?: string[];
  citations?: Array<{ title?: string; url?: string | null; jurisdiction?: string | null; effectiveFrom?: string | null }>;
};
export type AssistantAnalysis = {
  id: string; status: string; originState: string | null; destinationState: string | null; operationType: string | null;
  suggestedClassification: Suggestion; legalReasoning: string | null; confidence: number | null; modelVersion: string | null;
  createdAt: string; reviewNotes: string | null;
  product: { id: string; ean: string; name: string } | null;
  category: { id: string; code: string; name: string; ncm: string } | null;
  evidence: Array<{ id: string; title: string; sourceUrl: string | null; jurisdiction: string | null; effectiveFrom: string | null }>;
  requestedBy: { id: string; name: string }; reviewedBy: { id: string; name: string } | null;
};

const stateOptions = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const riskLabels: Record<string, string> = {
  CATEGORY_NOT_APPROVED: "Categoria ainda não aprovada",
  TAX_REGIME_RULE_NOT_FOUND: "Regra do regime não encontrada",
  UF_OPERATION_MATRIX_NOT_FOUND: "Matriz da UF/operação não encontrada",
  LEGAL_SOURCE_NOT_FOUND: "Fonte legal não cadastrada",
  OPERATION_STATES_INCOMPLETE: "UFs da operação incompletas",
  PRODUCT_COMPOSITION_NOT_INFORMED: "Composição não informada",
  ANVISA_REGISTRATION_NOT_INFORMED: "Registro ANVISA não informado",
  ANVISA_WITH_NON_MEDICINAL_NCM: "Registro ANVISA com NCM aparentemente não medicinal",
  PRODUCT_NCM_CONFLICT: "Descrição/composição incompatível com o NCM",
  OFFICIAL_NCM_CATALOG_NOT_ACTIVE: "Catálogo oficial NCM ainda não está ativo",
  PRODUCT_DESCRIPTION_INSUFFICIENT: "Descrição insuficiente para comparação",
  HUMAN_PATTERN_REPEATED: "Correção humana recorrente — apenas sinal de revisão",
};
const statusLabels: Record<string, string> = { PENDING: "Aguardando geração", PROCESSING: "Processando", NEEDS_REVIEW: "Revisão humana", APPROVED: "Aprovada", REJECTED: "Rejeitada", SUPERSEDED: "Substituída" };

async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`/api/portal/fiscal/assistant/${path}`, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => ({})) as { message?: string; erro?: string };
  if (!response.ok) throw new Error(payload.message ?? payload.erro ?? "Não foi possível concluir a análise.");
  return payload;
}

function percent(value: number) { return new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(value); }
function money(value: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value); }

export function FiscalAssistant({ initialAnalyses, initialMetrics, products, categories, role }: { initialAnalyses: AssistantAnalysis[]; initialMetrics: AssistantMetrics; products: AssistantProduct[]; categories: AssistantCategory[]; role: string }) {
  const [analyses, setAnalyses] = useState(initialAnalyses); const [metrics, setMetrics] = useState(initialMetrics);
  const [targetType, setTargetType] = useState<"product" | "category">("product"); const [targetId, setTargetId] = useState(products[0]?.id ?? categories[0]?.id ?? "");
  const [origin, setOrigin] = useState("DF"); const [destination, setDestination] = useState("DF"); const [operation, setOperation] = useState("SAIDA_REVENDA");
  const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({}); const [correctedNcms, setCorrectedNcms] = useState<Record<string, string>>({});
  const canRequest = role !== "VIEWER"; const canReview = ["OWNER", "ADMIN", "MANAGER", "PHARMACIST"].includes(role);
  const selectedProduct = products.find((product) => product.id === targetId);
  const selectedCategory = categories.find((category) => category.id === targetId) ?? (selectedProduct ? categories.find((category) => category.id === selectedProduct.category.id) : undefined);

  async function refresh() {
    const [analysisData, metricData] = await Promise.all([api("analises") as Promise<AssistantAnalysis[]>, api("assistente/metricas") as Promise<AssistantMetrics>]);
    setAnalyses(analysisData); setMetrics(metricData);
  }
  function changeTarget(type: "product" | "category") { setTargetType(type); setTargetId(type === "product" ? products[0]?.id ?? "" : categories[0]?.id ?? ""); }
  async function createAndSuggest() {
    if (!targetId) return; setBusy("new"); setError(""); setMessage("");
    try {
      const created = await api("analises", "POST", {
        produto_id: targetType === "product" ? targetId : null, categoria_id: targetType === "category" ? targetId : null,
        uf_origem: origin || null, uf_destino: destination || null, tipo_operacao: operation,
        composicao_produto: selectedProduct ? { principio_ativo: selectedProduct.activeIngredient, composicao: selectedProduct.composition, laboratorio: selectedProduct.laboratory, registro_anvisa: selectedProduct.anvisaRegistration } : {},
        classificacao_atual: selectedCategory ? { ncm: selectedCategory.ncm, cest: selectedCategory.cest, versao: selectedCategory.ruleVersion } : {},
      }) as { id: string };
      await api(`analises/${created.id}/sugerir`, "POST", {});
      await refresh(); setMessage("Análise de produto, NCM e tributação gerada e enviada para revisão humana.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha na análise."); } finally { setBusy(""); }
  }
  async function decide(id: string, decision: "APPROVED" | "REJECTED") {
    setBusy(id); setError(""); setMessage("");
    try {
      const correctedNcm = correctedNcms[id]?.replace(/\D/g, "") ?? "";
      await api(`analises/${id}/decisao`, "PUT", { decisao: decision, observacoes: reviewNotes[id]?.trim() || null, correcao: correctedNcm.length === 8 ? { ncm: correctedNcm } : null });
      await refresh();
      setMessage(decision === "APPROVED" ? "Análise aprovada sem alterar o cadastro automaticamente." : "Rejeição e eventual correção registradas como memória consultiva.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha na decisão."); } finally { setBusy(""); }
  }
  return <div className="fiscal-assistant-center">
    <div className="assistant-summary"><div><span>Sugestões locais</span><strong>{metrics.generated}</strong><small>Custo externo: {money(metrics.externalModelCost)}</small></div><div><span>Conflitos produto × NCM</span><strong>{metrics.compatibilityConflicts}</strong><small>{metrics.awaitingReview} aguardando revisão</small></div><div><span>Dados completos</span><strong>{percent(metrics.productDataCompletenessRate)}</strong><small>Descrição, composição e catálogo oficial</small></div><div><span>Concordância humana</span><strong>{percent(metrics.humanAgreementRate)}</strong><small>{metrics.repeatedHumanPatterns} padrão(ões) recorrente(s), sem automação</small></div></div>
    {canRequest && <article className="assistant-request"><div><span>ASSISTENTE LOCAL AUDITÁVEL</span><h2>Analisar classificação fiscal</h2><p>Descrição, composição, ANVISA, NCM, matriz e fontes homologadas são cruzados sem alterar o cadastro.</p></div><div className="assistant-request-form"><label>Alvo<select value={targetType} onChange={(event) => changeTarget(event.target.value as "product" | "category")}><option value="product">Produto</option><option value="category">Categoria</option></select></label><label>{targetType === "product" ? "Produto" : "Categoria"}<select value={targetId} onChange={(event) => setTargetId(event.target.value)}>{(targetType === "product" ? products : categories).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{"ean" in entry ? ` · ${entry.ean}` : ` · NCM ${entry.ncm}`}</option>)}</select></label><label>UF origem<select value={origin} onChange={(event) => setOrigin(event.target.value)}>{stateOptions.map((state) => <option key={state}>{state}</option>)}</select></label><label>UF destino<select value={destination} onChange={(event) => setDestination(event.target.value)}>{stateOptions.map((state) => <option key={state}>{state}</option>)}</select></label><label>Operação<select value={operation} onChange={(event) => setOperation(event.target.value)}><option value="SAIDA_REVENDA">Saída para revenda</option><option value="ENTRADA_REVENDA">Entrada para revenda</option><option value="TRANSFERENCIA">Transferência</option><option value="DEVOLUCAO">Devolução</option></select></label><button disabled={busy === "new" || !targetId} onClick={createAndSuggest} type="button">{busy === "new" ? "Cruzando dados…" : "Analisar produto e tributação"}</button></div></article>}
    {message && <p className="form-feedback">{message}</p>}{error && <p className="form-error">{error}</p>}
    <article className="report-panel full assistant-queue"><div className="panel-title"><div><span>REVISÃO OBRIGATÓRIA</span><h2>Fila do assistente fiscal</h2></div><strong>{analyses.length}</strong></div><div className="assistant-analysis-list">{analyses.length ? analyses.map((analysis) => {
      const suggestion = analysis.suggestedClassification ?? {}; const tax = suggestion.tax; const risks = suggestion.risks ?? []; const compatibility = suggestion.compatibility; const conflict = compatibility?.status === "CONFLICT";
      return <section key={analysis.id} className={analysis.status.toLowerCase()}><header><span className={`status-pill ${analysis.status.toLowerCase()}`}>{statusLabels[analysis.status] ?? analysis.status}</span><div><strong>{analysis.product?.name ?? analysis.category?.name ?? "Análise fiscal"}</strong><small>{analysis.product?.ean ?? `NCM ${analysis.category?.ncm ?? suggestion.category?.ncm ?? "—"}`} · {analysis.originState ?? "--"} → {analysis.destinationState ?? "--"}</small></div><b>{percent(Number(analysis.confidence ?? 0))}<small>{analysis.modelVersion ?? "Aguardando motor"}</small></b></header>
        {analysis.legalReasoning && <p>{analysis.legalReasoning}</p>}
        {compatibility && <div className={`assistant-compatibility ${compatibility.status?.toLowerCase()}`}><div><span>Compatibilidade produto × NCM</span><strong>{compatibility.status === "COMPATIBLE" ? "Coerente" : compatibility.status === "CONFLICT" ? "Conflito detectado" : "Inconclusiva"}</strong><small>Confiança do indício: {percent(Number(compatibility.score ?? 0))}</small></div><div><span>NCM atual</span><strong>{compatibility.current?.ncm ?? "—"}</strong><small>{compatibility.current?.description ?? "Não localizado no catálogo ativo"}</small></div><div><span>Candidato para revisão</span><strong>{compatibility.candidate?.ncm ?? compatibility.expectedPrefixes?.join(" / ") ?? "—"}</strong><small>{compatibility.candidate?.description ?? "Sem candidato oficial completo"}</small></div></div>}
        {tax && <div className="assistant-tax-grid"><span>CFOP<strong>{tax.cfop ?? "—"}</strong></span><span>ICMS<strong>{tax.cstIcms ?? tax.csosn ?? "—"}</strong></span><span>PIS/COFINS<strong>{tax.cstPisCofins ?? "—"}</strong></span><span>IBS/CBS<strong>{tax.cstIbsCbs ?? "—"}</strong></span><span>cClassTrib<strong>{tax.cClassTrib ?? "—"}</strong></span></div>}
        {suggestion.impact && <div className="assistant-impact"><strong>{suggestion.impact.available ? `${Number(suggestion.impact.estimatedMonthlyTaxDelta ?? 0) >= 0 ? "+" : "−"} ${money(Math.abs(Number(suggestion.impact.estimatedMonthlyTaxDelta ?? 0)))}/mês` : "Impacto ainda indisponível"}</strong><span>{suggestion.impact.available ? `Comparação nominal com ${suggestion.impact.candidateCategory?.name ?? "categoria candidata"}` : suggestion.impact.disclaimer}</span><small>{suggestion.impact.available ? suggestion.impact.disclaimer : "Não é contabilizado como economia."}</small></div>}
        {suggestion.humanHistory?.repeatedCorrection && <div className="assistant-human-signal"><span>↻</span><div><strong>Correção recorrente: NCM {suggestion.humanHistory.repeatedCorrection.ncm}</strong><small>{suggestion.humanHistory.repeatedCorrection.occurrences} ocorrências. É apenas sinal de revisão e nunca altera a regra automaticamente.</small></div></div>}
        {risks.length > 0 && <div className="assistant-risks">{risks.map((risk) => <span key={risk}>{riskLabels[risk] ?? risk}</span>)}</div>}
        <div className="assistant-evidence"><strong>{analysis.evidence.length} fonte(s)</strong>{analysis.evidence.map((evidence) => evidence.sourceUrl ? <a href={evidence.sourceUrl} key={evidence.id} rel="noreferrer" target="_blank">{evidence.title}</a> : <span key={evidence.id}>{evidence.title}</span>)}</div>
        {analysis.status === "NEEDS_REVIEW" && canReview && <div className="assistant-decisions"><input onChange={(event) => setReviewNotes((current) => ({ ...current, [analysis.id]: event.target.value }))} placeholder="Parecer ou justificativa obrigatória para rejeitar" value={reviewNotes[analysis.id] ?? ""}/><input inputMode="numeric" maxLength={8} onChange={(event) => setCorrectedNcms((current) => ({ ...current, [analysis.id]: event.target.value.replace(/\D/g, "").slice(0, 8) }))} placeholder="NCM corrigido (opcional)" value={correctedNcms[analysis.id] ?? ""}/>{compatibility?.candidate?.ncm && <button className="secondary" onClick={() => setCorrectedNcms((current) => ({ ...current, [analysis.id]: compatibility.candidate?.ncm ?? "" }))} type="button">Usar NCM sugerido</button>}<button disabled={busy === analysis.id || analysis.evidence.length === 0 || conflict} onClick={() => decide(analysis.id, "APPROVED")} type="button">Aprovar análise</button><button className="danger" disabled={busy === analysis.id || (reviewNotes[analysis.id]?.trim().length ?? 0) < 10} onClick={() => decide(analysis.id, "REJECTED")} type="button">Rejeitar e registrar</button></div>}
        {analysis.reviewedBy && <small className="assistant-reviewed">Revisada por {analysis.reviewedBy.name}{analysis.reviewNotes ? ` · ${analysis.reviewNotes}` : ""}</small>}
      </section>;
    }) : <div className="monitor-empty"><span>◇</span><strong>Nenhuma análise local</strong><p>Crie uma solicitação para cruzar produto, NCM e tributação.</p></div>}</div></article>
  </div>;
}
