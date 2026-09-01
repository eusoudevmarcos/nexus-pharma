"use client";

import { useMemo, useState } from "react";
import { registrationApi, type FiscalCategory } from "../cadastro-types";

type FiscalDifference = { scope: string; field: string; before: unknown; after: unknown };
export type FiscalPropagation = {
  id: string; status: string; baseHash: string; differences: FiscalDifference[];
  impactSummary: { productCount: number; stockQuantity: number; inventoryCost: number; inventorySaleValue: number; fieldsChanged: number; sampleProducts: Array<{ id: string; ean: string; name: string }> };
  rejectionReason: string | null; createdAt: string; submittedAt: string | null; appliedAt: string | null;
  sourceCategory: { id: string; code: string; name: string; ruleVersion: string; ncm: string };
  targetCategory: { id: string; code: string; name: string; ruleVersion: string; ncm: string };
  createdBy: { id: string; name: string }; reviewedBy: { id: string; name: string } | null;
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const quantity = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const labels: Record<string, string> = { VALIDATED: "Simulada", PENDING_APPROVAL: "Aguardando aprovação", APPLIED: "Aplicada", REJECTED: "Rejeitada" };
const fieldLabels: Record<string, string> = { ncm: "NCM", cest: "CEST", classification: "Classificação", ruleVersion: "Versão", validFrom: "Vigência inicial", validUntil: "Vigência final", cfop: "CFOP", cstIcms: "CST ICMS", csosn: "CSOSN", icmsRate: "Alíquota ICMS", mvaRate: "MVA", cstPisCofins: "CST PIS/COFINS", revenueNature: "Natureza da receita", pisRate: "Alíquota PIS", cofinsRate: "Alíquota COFINS", cstIbsCbs: "CST IBS/CBS", cClassTrib: "cClassTrib", cbsRate: "Alíquota CBS", ibsRate: "Alíquota IBS", cbsReduction: "Redução CBS", ibsReduction: "Redução IBS" };

export function FiscalPropagationCenter({ categories, initial, role, userId }: { categories: FiscalCategory[]; initial: FiscalPropagation[]; role: string; userId: string }) {
  const [proposals, setProposals] = useState(initial); const [sourceId, setSourceId] = useState(categories.find((entry) => entry._count.products > 0)?.id ?? "");
  const [targetId, setTargetId] = useState(""); const [selectedId, setSelectedId] = useState(initial[0]?.id ?? ""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const canCreate = ["OWNER", "ADMIN", "MANAGER", "PHARMACIST"].includes(role); const canReview = ["OWNER", "ADMIN", "MANAGER"].includes(role);
  const targets = useMemo(() => categories.filter((entry) => entry.id !== sourceId && entry.active && entry.status === "APPROVED"), [categories, sourceId]);
  const active = proposals.find((entry) => entry.id === selectedId) ?? proposals[0];
  async function reload(id?: string) { const data = await registrationApi("propagacoes-fiscais") as FiscalPropagation[]; setProposals(data); setSelectedId(id ?? data[0]?.id ?? ""); }
  async function run(action: () => Promise<unknown>, success: string, id?: string) { setBusy(true); setError(""); setMessage(""); try { await action(); await reload(id); setMessage(success); } catch (cause) { setError(cause instanceof Error ? cause.message.replaceAll("_", " ") : "Não foi possível concluir."); } finally { setBusy(false); } }
  async function simulate() { const created = await registrationApi("propagacoes-fiscais/simular", { method: "POST", body: JSON.stringify({ categoria_origem_id: sourceId, categoria_destino_id: targetId }) }) as FiscalPropagation; await reload(created.id); }
  function reject() { const reason = window.prompt("Justificativa da rejeição (mínimo 10 caracteres):"); if (reason && active) void run(() => registrationApi(`propagacoes-fiscais/${active.id}/revisar`, { method: "PUT", body: JSON.stringify({ decisao: "REJECTED", justificativa: reason }) }), "Propagação fiscal rejeitada.", active.id); }

  return <details className="fiscal-propagation" open={active?.status === "PENDING_APPROVAL"}>
    <summary><span><strong>Simulação de propagação fiscal</strong><small>Compare versões e veja todos os produtos afetados antes da alteração.</small></span><b>{proposals.filter((entry) => entry.status === "PENDING_APPROVAL").length} pendente(s)</b></summary>
    <div className="fiscal-propagation-body">
      {canCreate && <div className="fiscal-simulation-form"><label>Categoria atual<select value={sourceId} onChange={(event) => { setSourceId(event.target.value); setTargetId(""); }}><option value="">Selecione</option>{categories.filter((entry) => entry._count.products > 0).map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · v{entry.ruleVersion} · {entry._count.products} produtos</option>)}</select></label><label>Regra de destino aprovada<select value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">Selecione</option>{targets.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · v{entry.ruleVersion} · NCM {entry.ncm}</option>)}</select></label><button disabled={busy || !sourceId || !targetId} onClick={() => run(simulate, "Simulação criada. Revise o impacto antes de enviar.")} type="button">Simular impacto</button></div>}
      {(message || error) && <div className={`portal-feedback ${error ? "error" : ""}`}>{error || message}</div>}
      <div className="fiscal-propagation-layout"><aside>{proposals.map((proposal) => <button className={active?.id === proposal.id ? "active" : ""} key={proposal.id} onClick={() => setSelectedId(proposal.id)} type="button"><span className={`status-pill ${proposal.status.toLowerCase()}`}>{labels[proposal.status] ?? proposal.status}</span><strong>{proposal.sourceCategory.code} → {proposal.targetCategory.code}</strong><small>{proposal.impactSummary.productCount} produtos · {new Date(proposal.createdAt).toLocaleString("pt-BR")}</small></button>)}{!proposals.length && <p>Nenhuma simulação criada.</p>}</aside>
        {active && <main><header><div><span>COMPARAÇÃO VERSIONADA</span><h3>{active.sourceCategory.name} → {active.targetCategory.name}</h3><p>v{active.sourceCategory.ruleVersion} para v{active.targetCategory.ruleVersion} · criado por {active.createdBy.name}</p></div><div>{active.status === "VALIDATED" && active.createdBy.id === userId && <button disabled={busy} onClick={() => run(() => registrationApi(`propagacoes-fiscais/${active.id}/enviar`, { method: "POST", body: "{}" }), "Simulação enviada. Outro gerente deve aprovar.", active.id)} type="button">Enviar para aprovação</button>}{active.status === "PENDING_APPROVAL" && canReview && active.createdBy.id !== userId && <><button disabled={busy} onClick={() => run(() => registrationApi(`propagacoes-fiscais/${active.id}/revisar`, { method: "PUT", body: JSON.stringify({ decisao: "APPROVED" }) }), "Propagação aprovada e aplicada aos produtos.", active.id)} type="button">Aprovar e aplicar</button><button className="danger-button" disabled={busy} onClick={reject} type="button">Rejeitar</button></>}</div></header>
          <div className="fiscal-impact"><span>Produtos<strong>{active.impactSummary.productCount}</strong></span><span>Estoque<strong>{quantity.format(active.impactSummary.stockQuantity)}</strong></span><span>Custo em estoque<strong>{brl.format(active.impactSummary.inventoryCost)}</strong></span><span>Venda potencial<strong>{brl.format(active.impactSummary.inventorySaleValue)}</strong></span><span>Campos alterados<strong>{active.impactSummary.fieldsChanged}</strong></span></div>
          {active.status === "PENDING_APPROVAL" && active.createdBy.id === userId && <p className="bulk-four-eyes">Quatro olhos ativo: outro gerente precisa aprovar. Se a base ou os produtos mudarem, a aplicação será bloqueada e exigirá nova simulação.</p>}
          {active.rejectionReason && <p className="bulk-four-eyes error">Rejeitada: {active.rejectionReason}</p>}
          <div className="fiscal-version-cards"><article><span>ATUAL</span><strong>v{active.sourceCategory.ruleVersion}</strong><small>NCM {active.sourceCategory.ncm}</small></article><b>→</b><article><span>DESTINO</span><strong>v{active.targetCategory.ruleVersion}</strong><small>NCM {active.targetCategory.ncm}</small></article></div>
          <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Escopo</th><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead><tbody>{active.differences.map((difference, index) => <tr key={`${difference.scope}-${difference.field}-${index}`}><td>{difference.scope}</td><td>{fieldLabels[difference.field] ?? difference.field}</td><td>{String(difference.before ?? "—")}</td><td><strong>{String(difference.after ?? "—")}</strong></td></tr>)}</tbody></table></div>
        </main>}
      </div>
    </div>
  </details>;
}
