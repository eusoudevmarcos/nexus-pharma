"use client";

import { useMemo, useState } from "react";

export type AssistantMetrics = {
  engine: string; generated: number; awaitingReview: number; approved: number; rejected: number;
  humanAgreementRate: number; sourceCoverageRate: number; averageConfidence: number; externalModelCost: number;
};
export type AssistantProduct = { id: string; ean: string; name: string; activeIngredient: string; laboratory: string; category: { id: string; name: string; ncm: string; cest: string | null; ruleVersion: string } };
export type AssistantCategory = { id: string; name: string; ncm: string; cest: string | null; ruleVersion: string; status: string };
type Suggestion = {
  requiresHumanReview?: boolean;
  category?: { name?: string; ncm?: string; cest?: string | null; ruleVersion?: string };
  operation?: { type?: string; originState?: string; destinationState?: string; regime?: string };
  tax?: { cfop?: string; cstIcms?: string; csosn?: string | null; cstPisCofins?: string; revenueNature?: string | null; cstIbsCbs?: string; cClassTrib?: string } | null;
  matrixRule?: { code?: string; version?: string } | null;
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
};
const statusLabels: Record<string, string> = { PENDING: "Aguardando geração", PROCESSING: "Processando", NEEDS_REVIEW: "Revisão humana", APPROVED: "Aprovada", REJECTED: "Rejeitada", SUPERSEDED: "Substituída" };

async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`/api/portal/fiscal/assistant/${path}`, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) throw new Error(payload.message ?? "Não foi possível concluir a análise.");
  return payload;
}

function percent(value: number) { return new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(value); }

export function FiscalAssistant({ initialAnalyses, initialMetrics, products, categories, role }: { initialAnalyses: AssistantAnalysis[]; initialMetrics: AssistantMetrics; products: AssistantProduct[]; categories: AssistantCategory[]; role: string }) {
  const [analyses, setAnalyses] = useState(initialAnalyses); const [metrics, setMetrics] = useState(initialMetrics);
  const [targetType, setTargetType] = useState<"product" | "category">("product"); const [targetId, setTargetId] = useState(products[0]?.id ?? categories[0]?.id ?? "");
  const [origin, setOrigin] = useState("DF"); const [destination, setDestination] = useState("DF"); const [operation, setOperation] = useState("SAIDA_REVENDA");
  const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [rejectionNotes, setRejectionNotes] = useState<Record<string, string>>({});
  const canRequest = role !== "VIEWER"; const canReview = ["OWNER", "ADMIN", "MANAGER", "PHARMACIST"].includes(role);
  const selectedProduct = products.find((product) => product.id === targetId);
  const selectedCategory = categories.find((category) => category.id === targetId) ?? (selectedProduct ? categories.find((category) => category.id === selectedProduct.category.id) : undefined);
  const pending = useMemo(() => analyses.filter((analysis) => analysis.status === "NEEDS_REVIEW"), [analyses]);

  async function refresh() {
    const [analysisData, metricData] = await Promise.all([api("analises") as Promise<AssistantAnalysis[]>, api("assistente/metricas") as Promise<AssistantMetrics>]);
    setAnalyses(analysisData); setMetrics(metricData);
  }
  function changeTarget(type: "product" | "category") { setTargetType(type); setTargetId(type === "product" ? products[0]?.id ?? "" : categories[0]?.id ?? ""); }
  async function createAndSuggest() {
    if (!targetId) return; setBusy("new"); setError(""); setMessage("");
    try {
      const created = await api("analises", "POST", {
        produto_id: targetType === "product" ? targetId : null,
        categoria_id: targetType === "category" ? targetId : null,
        uf_origem: origin || null, uf_destino: destination || null, tipo_operacao: operation,
        composicao_produto: selectedProduct ? { principio_ativo: selectedProduct.activeIngredient, laboratorio: selectedProduct.laboratory } : {},
        classificacao_atual: selectedCategory ? { ncm: selectedCategory.ncm, cest: selectedCategory.cest, versao: selectedCategory.ruleVersion } : {},
      }) as { id: string };
      await api(`analises/${created.id}/sugerir`, "POST", {});
      await refresh(); setMessage("Sugestão local gerada sem custo externo e enviada para revisão humana.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha na análise."); } finally { setBusy(""); }
  }
  async function decide(id: string, decision: "APPROVED" | "REJECTED") {
    setBusy(id); setError(""); setMessage("");
    try {
      await api(`analises/${id}/decisao`, "PUT", { decisao: decision, observacoes: rejectionNotes[id]?.trim() || null });
      await refresh(); setMessage(decision === "APPROVED" ? "Análise aprovada. O cadastro fiscal não foi alterado automaticamente." : "Sugestão rejeitada e registrada para avaliação do motor.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha na decisão."); } finally { setBusy(""); }
  }
  return <div className="fiscal-assistant-center">
    <div className="assistant-summary"><div><span>Sugestões locais</span><strong>{metrics.generated}</strong><small>Custo externo: R$ {metrics.externalModelCost.toFixed(2)}</small></div><div><span>Aguardando revisão</span><strong>{metrics.awaitingReview}</strong><small>{pending.length} visível(is) na fila</small></div><div><span>Cobertura de fontes</span><strong>{percent(metrics.sourceCoverageRate)}</strong><small>Somente fontes cadastradas</small></div><div><span>Concordância humana</span><strong>{percent(metrics.humanAgreementRate)}</strong><small>Não vira regra automaticamente</small></div></div>
    {canRequest && <article className="assistant-request"><div><span>ASSISTENTE LOCAL AUDITÁVEL</span><h2>Solicitar classificação fiscal</h2><p>O motor cruza apenas cadastros, matriz e fontes aprovadas. Nenhuma API paga é utilizada.</p></div><div className="assistant-request-form"><label>Alvo<select value={targetType} onChange={(event) => changeTarget(event.target.value as "product" | "category")}><option value="product">Produto</option><option value="category">Categoria</option></select></label><label>{targetType === "product" ? "Produto" : "Categoria"}<select value={targetId} onChange={(event) => setTargetId(event.target.value)}>{(targetType === "product" ? products : categories).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{"ean" in entry ? ` · ${entry.ean}` : ` · NCM ${entry.ncm}`}</option>)}</select></label><label>UF origem<select value={origin} onChange={(event) => setOrigin(event.target.value)}>{stateOptions.map((state) => <option key={state}>{state}</option>)}</select></label><label>UF destino<select value={destination} onChange={(event) => setDestination(event.target.value)}>{stateOptions.map((state) => <option key={state}>{state}</option>)}</select></label><label>Operação<select value={operation} onChange={(event) => setOperation(event.target.value)}><option value="SAIDA_REVENDA">Saída para revenda</option><option value="ENTRADA_REVENDA">Entrada para revenda</option><option value="TRANSFERENCIA">Transferência</option><option value="DEVOLUCAO">Devolução</option></select></label><button disabled={busy === "new" || !targetId} onClick={createAndSuggest} type="button">{busy === "new" ? "Cruzando regras…" : "Gerar sugestão sem custo"}</button></div></article>}
    {message && <p className="form-feedback">{message}</p>}{error && <p className="form-error">{error}</p>}
    <article className="report-panel full assistant-queue"><div className="panel-title"><div><span>REVISÃO OBRIGATÓRIA</span><h2>Fila do assistente fiscal</h2></div><strong>{analyses.length}</strong></div><div className="assistant-analysis-list">{analyses.length ? analyses.map((analysis) => { const suggestion = analysis.suggestedClassification ?? {}; const tax = suggestion.tax; const risks = suggestion.risks ?? []; return <section key={analysis.id} className={analysis.status.toLowerCase()}><header><span className={`status-pill ${analysis.status.toLowerCase()}`}>{statusLabels[analysis.status] ?? analysis.status}</span><div><strong>{analysis.product?.name ?? analysis.category?.name ?? "Análise fiscal"}</strong><small>{analysis.product?.ean ?? `NCM ${analysis.category?.ncm ?? suggestion.category?.ncm ?? "—"}`} · {analysis.originState ?? "--"} → {analysis.destinationState ?? "--"}</small></div><b>{percent(Number(analysis.confidence ?? 0))}<small>{analysis.modelVersion ?? "Aguardando motor"}</small></b></header>{analysis.legalReasoning && <p>{analysis.legalReasoning}</p>}{tax && <div className="assistant-tax-grid"><span>CFOP<strong>{tax.cfop ?? "—"}</strong></span><span>ICMS<strong>{tax.cstIcms ?? tax.csosn ?? "—"}</strong></span><span>PIS/COFINS<strong>{tax.cstPisCofins ?? "—"}</strong></span><span>IBS/CBS<strong>{tax.cstIbsCbs ?? "—"}</strong></span><span>cClassTrib<strong>{tax.cClassTrib ?? "—"}</strong></span></div>}{risks.length > 0 && <div className="assistant-risks">{risks.map((risk) => <span key={risk}>{riskLabels[risk] ?? risk}</span>)}</div>}<div className="assistant-evidence"><strong>{analysis.evidence.length} fonte(s)</strong>{analysis.evidence.map((evidence) => evidence.sourceUrl ? <a href={evidence.sourceUrl} key={evidence.id} rel="noreferrer" target="_blank">{evidence.title}</a> : <span key={evidence.id}>{evidence.title}</span>)}</div>{analysis.status === "NEEDS_REVIEW" && canReview && <div className="assistant-decisions"><input onChange={(event) => setRejectionNotes((current) => ({ ...current, [analysis.id]: event.target.value }))} placeholder="Justificativa obrigatória para rejeitar" value={rejectionNotes[analysis.id] ?? ""}/><button disabled={busy === analysis.id || analysis.evidence.length === 0} onClick={() => decide(analysis.id, "APPROVED")} type="button">Aprovar análise</button><button className="danger" disabled={busy === analysis.id || (rejectionNotes[analysis.id]?.trim().length ?? 0) < 10} onClick={() => decide(analysis.id, "REJECTED")} type="button">Rejeitar</button></div>}{analysis.reviewedBy && <small className="assistant-reviewed">Revisada por {analysis.reviewedBy.name}{analysis.reviewNotes ? ` · ${analysis.reviewNotes}` : ""}</small>}</section>; }) : <div className="monitor-empty"><span>◇</span><strong>Nenhuma análise local</strong><p>Crie uma solicitação para testar o cruzamento sem custo externo.</p></div>}</div></article>
  </div>;
}
