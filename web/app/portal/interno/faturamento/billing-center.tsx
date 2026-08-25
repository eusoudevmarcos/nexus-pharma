"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Plan = { id: string; code: string; name: string; monthlyPrice: number; setupPrice: number; successFeeRate: number; hasFineTuning: boolean; includedStores: number; includedPdvsPerStore: number; additionalStorePrice: number; extraPdvPrice: number };
type Installment = { id: string; number: number; label: string; amount: number; status: string; duePeriod: string };
type Subscription = { id: string; companyId: string; status: string; contractStartedAt: string; company: { id: string; tradeName: string }; plan: Plan; stores: Array<{ id: string; active: boolean; pdvs: Array<{ id: string; active: boolean }> }>; onboarding: null | { status: string; setupTotal: number; installments: Installment[] } };
type InvoiceItem = { id: string; type: string; description: string; quantity: number; unitAmount: number; totalAmount: number };
type Invoice = { id: string; status: string; amount: number; billingPeriod: string; dueAt: string; requiresReview: boolean; items: InvoiceItem[]; chargeRequests: Array<{ status: string; provider: string; lastError: string | null }>; subscription: { company: { tradeName: string }; plan: { name: string } } };
export type BillingReport = { currentPeriod: string; plans: Plan[]; indicators: { subscriptions: number; stores: number; pdvs: number; savingsPending: number; draftInvoices: number }; subscriptions: Subscription[]; invoices: Invoice[] };

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const monthValue = (value: string) => value.slice(0, 7);
const statusLabel: Record<string, string> = { ACTIVE: "Ativa", TRIALING: "Avaliação", PAST_DUE: "Em atraso", PENDING: "Pendente", BILLED: "Faturada", PAID: "Paga", VERIFIED: "Homologada", LOCKED: "Fechada", DRAFT: "Revisão", OPEN: "Aberta", SENT: "Enviada", QUEUED: "Na fila", FAILED: "Falhou", COMPLETED: "Concluído", IN_PROGRESS: "Em andamento" };

async function post(path: string, body: unknown) {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({})) as { message?: string; invoice?: { requiresReview?: boolean }; gateway?: { status?: string } };
  if (!response.ok) throw new Error(data.message ?? "Não foi possível concluir a operação.");
  return data;
}

export function BillingCenter({ report }: { report: BillingReport }) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(report.subscriptions[0]?.companyId ?? "");
  const [period, setPeriod] = useState(monthValue(report.currentPeriod));
  const [taxSavings, setTaxSavings] = useState("0");
  const [stockSavings, setStockSavings] = useState("0");
  const [evidence, setEvidence] = useState("");
  const [dueAt, setDueAt] = useState(`${monthValue(report.currentPeriod)}-10`);
  const [busy, setBusy] = useState<"savings" | "invoice" | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const selected = useMemo(() => report.subscriptions.find((item) => item.companyId === companyId), [companyId, report.subscriptions]);

  async function verifySavings(event: React.FormEvent) {
    event.preventDefault(); setBusy("savings"); setFeedback(null);
    try {
      await post("/api/portal/internal/billing/savings", { empresa_id: companyId, periodo: `${period}-01`, economia_tributaria: Number(taxSavings), economia_perdas_estoque: Number(stockSavings), evidencias: [{ descricao: evidence.trim(), origem: "homologacao_financeira" }] });
      setFeedback({ tone: "success", text: "Economia homologada com evidência. O Success Fee já pode ser fechado." });
      router.refresh();
    } catch (error) { setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Falha na homologação." }); }
    finally { setBusy(null); }
  }

  async function closeInvoice(event: React.FormEvent) {
    event.preventDefault(); setBusy("invoice"); setFeedback(null);
    try {
      const result = await post("/api/portal/internal/billing/close", { empresa_id: companyId, periodo: `${period}-01`, vencimento: dueAt });
      setFeedback({ tone: result.invoice?.requiresReview ? "error" : "success", text: result.invoice?.requiresReview ? "Fatura salva como rascunho: falta homologar a economia desta competência." : `Fatura fechada e cobrança ${result.gateway?.status === "SENT" ? "enviada ao gateway" : "colocada na fila do gateway"}.` });
      router.refresh();
    } catch (error) { setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Falha no fechamento." }); }
    finally { setBusy(null); }
  }

  return <div className="billing-center">
    <article className="report-panel full billing-plan-panel"><div className="panel-title"><div><span>MATRIZ COMERCIAL</span><h2>Planos vigentes</h2></div><strong>1 loja + 1 PDV inclusos</strong></div><div className="billing-plan-grid">{report.plans.map((plan) => <div className={plan.successFeeRate ? "billing-plan has-success" : "billing-plan"} key={plan.id}><span>{plan.code}</span><h3>{plan.name}</h3><strong>{brl.format(plan.monthlyPrice)}<small>/mês</small></strong><p>Setup {brl.format(plan.setupPrice)}</p><ul><li>Filial: {brl.format(plan.additionalStorePrice)}/mês</li><li>PDV extra: {brl.format(plan.extraPdvPrice)}/mês</li><li>{plan.successFeeRate ? `${plan.successFeeRate * 100}% sobre economia homologada` : "Sem Success Fee"}</li></ul></div>)}</div></article>
    <div className="billing-action-grid"><article className="report-panel billing-form-panel"><div className="panel-title"><div><span>PASSO 1</span><h2>Homologar economia mensal</h2></div></div><p>Só valores comprovados entram no Success Fee. A evidência fica registrada na auditoria.</p><form onSubmit={verifySavings}><label>Cliente<select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>{report.subscriptions.map((item) => <option key={item.id} value={item.companyId}>{item.company.tradeName} · {item.plan.name}</option>)}</select></label><label>Competência<input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} required/></label><div className="billing-form-pair"><label>Economia tributária<input min="0" step="0.01" type="number" value={taxSavings} onChange={(event) => setTaxSavings(event.target.value)} required/></label><label>Perdas de estoque evitadas<input min="0" step="0.01" type="number" value={stockSavings} onChange={(event) => setStockSavings(event.target.value)} required/></label></div><label>Evidência e origem<textarea minLength={5} value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Ex.: relatório fiscal aprovado e comparativo antes/depois" required/></label><button disabled={busy !== null || !companyId} type="submit">{busy === "savings" ? "Homologando..." : "Homologar economia"}</button></form></article>
    <article className="report-panel billing-form-panel"><div className="panel-title"><div><span>PASSO 2</span><h2>Fechar fatura mensal</h2></div></div><p>O cálculo consolida plano, filiais, PDVs, Success Fee e setup em itens separados.</p><form onSubmit={closeInvoice}><label>Cliente<select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>{report.subscriptions.map((item) => <option key={item.id} value={item.companyId}>{item.company.tradeName} · {item.plan.name}</option>)}</select></label><label>Competência<input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} required/></label><label>Vencimento<input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} required/></label>{selected && <div className="billing-preview"><span>Estrutura atual</span><strong>{selected.stores.filter((store) => store.active).length} loja(s) · {selected.stores.reduce((sum, store) => sum + store.pdvs.filter((pdv) => pdv.active).length, 0)} PDV(s)</strong><small>Plano {selected.plan.name} · setup {statusLabel[selected.onboarding?.status ?? "PENDING"] ?? selected.onboarding?.status}</small></div>}<button disabled={busy !== null || !companyId} type="submit">{busy === "invoice" ? "Calculando..." : "Calcular, fechar e enviar"}</button></form></article></div>
    {feedback && <div className={`billing-feedback ${feedback.tone}`} role="status">{feedback.text}</div>}
    <article className="report-panel full billing-customer-panel"><div className="panel-title"><div><span>CLIENTES</span><h2>Contratos e onboarding</h2></div></div><div className="billing-customer-list">{report.subscriptions.map((item) => { const paid = item.onboarding?.installments.filter((installment) => installment.status === "PAID").length ?? 0; const total = item.onboarding?.installments.length ?? 0; return <div className="billing-customer-row" key={item.id}><div><strong>{item.company.tradeName}</strong><small>{item.plan.name} · desde {new Date(item.contractStartedAt).toLocaleDateString("pt-BR")}</small></div><span className={`status-pill ${item.status.toLowerCase()}`}>{statusLabel[item.status] ?? item.status}</span><div><b>{item.stores.filter((store) => store.active).length}</b><small>Lojas</small></div><div><b>{item.stores.reduce((sum, store) => sum + store.pdvs.filter((pdv) => pdv.active).length, 0)}</b><small>PDVs</small></div><div><b>{paid}/{total}</b><small>Setup pago</small></div></div>; })}</div></article>
    <article className="report-panel full billing-invoice-panel"><div className="panel-title"><div><span>MEMÓRIA DE CÁLCULO</span><h2>Faturas discriminadas</h2></div></div><div className="billing-invoice-list">{report.invoices.length ? report.invoices.map((invoice) => <details key={invoice.id}><summary><div><strong>{invoice.subscription.company.tradeName}</strong><small>{invoice.subscription.plan.name} · {monthValue(invoice.billingPeriod)}</small></div><span className={`status-pill ${invoice.status.toLowerCase()}`}>{invoice.requiresReview ? "Revisão" : statusLabel[invoice.status] ?? invoice.status}</span><b>{brl.format(invoice.amount)}</b></summary><div className="billing-lines">{invoice.items.map((item) => <div key={item.id}><span>{item.description}<small>{item.quantity > 1 ? `${item.quantity} × ${brl.format(item.unitAmount)}` : item.type}</small></span><strong>{brl.format(item.totalAmount)}</strong></div>)}<footer><span>Gateway</span><strong>{invoice.requiresReview ? "Bloqueado para revisão" : statusLabel[invoice.chargeRequests[0]?.status ?? "QUEUED"] ?? invoice.chargeRequests[0]?.status}</strong></footer></div></details>) : <p>Nenhuma fatura fechada.</p>}</div></article>
  </div>;
}
