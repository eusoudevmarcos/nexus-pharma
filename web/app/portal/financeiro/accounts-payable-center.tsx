"use client";

import { useState } from "react";

type Numeric = number | string;
type Payment = { id: string; amount: Numeric; method: string; paidAt: string; reference: string | null; notes: string | null; reversedAt: string | null; reversalReason: string | null; recordedBy: { name: string }; reversedBy: { name: string } | null; installment: { number: number; payable: { documentNumber: string | null; supplier: { tradeName: string } } } };
type Installment = { id: string; number: number; dueAt: string; amount: Numeric; paidAmount: Numeric; outstandingAmount: number; status: string; effectiveStatus: string; barcode: string | null; externalRef: string | null; payments: Payment[] };
type Payable = { id: string; status: string; documentNumber: string | null; accessKey: string; issuedAt: string | null; totalAmount: Numeric; paidAmount: Numeric; outstandingAmount: number; configuredAt: string | null; notes: string | null; supplier: { id: string; tradeName: string; taxId: string }; purchaseOrder: { id: string; code: string; store: { name: string } }; approvedBy: { name: string } | null; createdBy: { name: string }; installments: Installment[] };

export type AccountsPayableDashboard = {
  indicators: { drafts: number; draftAmount: number; overdueAmount: number; overdueCount: number; dueSoonAmount: number; dueSoonCount: number; paidThisMonth: number; openAmount: number };
  suppliers: Array<{ id: string; tradeName: string; taxId: string }>;
  payables: Payable[];
  payments: Payment[];
};

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string) => new Date(value).toLocaleDateString("pt-BR", { timeZone: "UTC" });
const todayInput = () => new Date().toISOString().slice(0, 10);
const canWrite = (role: string) => ["OWNER", "ADMIN", "MANAGER", "FINANCE"].includes(role);

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(`/api/portal/payables/${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => ({})) as { erro?: string; message?: string };
  if (!response.ok) throw new Error(payload.message ?? payload.erro ?? "Não foi possível concluir a operação.");
  return payload;
}

function splitInstallments(total: number, count: number, firstDueDate: string) {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  const initial = new Date(`${firstDueDate}T00:00:00.000Z`);
  return Array.from({ length: count }, (_, index) => {
    const dueAt = new Date(initial); dueAt.setUTCMonth(initial.getUTCMonth() + index);
    return { vencimento: dueAt.toISOString().slice(0, 10), valor: (base + (index < remainder ? 1 : 0)) / 100 };
  });
}

export function AccountsPayableCenter({ initial, role }: { initial: AccountsPayableDashboard | null; role: string }) {
  if (!initial) return <div className="empty-state">As contas a pagar ficarão disponíveis quando a API estiver conectada e a migration desta fase for aplicada.</div>;
  return <AccountsPayableReady initial={initial} role={role}/>;
}

function AccountsPayableReady({ initial, role }: { initial: AccountsPayableDashboard; role: string }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<"open" | "draft" | "history">("open");
  const [supplierId, setSupplierId] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [config, setConfig] = useState<Record<string, { count: string; firstDue: string }>>({});
  const [payment, setPayment] = useState<Record<string, { amount: string; method: string; paidAt: string; reference: string }>>({});

  async function reload(nextSupplier = supplierId, nextStatus = status) {
    const query = new URLSearchParams();
    if (nextSupplier) query.set("fornecedor_id", nextSupplier);
    if (nextStatus) query.set("status", nextStatus);
    setData(await requestJson(`painel?${query}`) as AccountsPayableDashboard);
  }
  async function run(action: () => Promise<void>, success: string) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); setMessage(success); await reload(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Falha inesperada."); }
    finally { setBusy(false); }
  }
  async function configure(payable: Payable) {
    const current = config[payable.id] ?? { count: "1", firstDue: todayInput() };
    const count = Number(current.count);
    if (!current.firstDue || count < 1 || count > 60) { setError("Informe quantidade e primeiro vencimento válidos."); return; }
    await run(() => requestJson(`titulos/${payable.id}/configurar`, { method: "PUT", body: JSON.stringify({ parcelas: splitInstallments(Number(payable.totalAmount), count, current.firstDue) }) }).then(() => undefined), "Parcelas conferidas e título liberado para baixa.");
  }
  async function pay(installment: Installment) {
    const current = payment[installment.id] ?? { amount: String(installment.outstandingAmount), method: "BANK_TRANSFER", paidAt: todayInput(), reference: "" };
    await run(() => requestJson(`parcelas/${installment.id}/pagamentos`, { method: "POST", body: JSON.stringify({ valor: Number(current.amount), metodo: current.method, pago_em: current.paidAt, referencia: current.reference || null }) }).then(() => undefined), "Baixa manual registrada com sucesso.");
  }

  const drafts = data.payables.filter((entry) => entry.status === "DRAFT");
  const open = data.payables.filter((entry) => ["OPEN", "PARTIAL", "DISPUTED"].includes(entry.status));

  return <div className="payables-center">
    <div className="management-filters payable-filters"><label>Fornecedor<select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Todos</option>{data.suppliers.map((entry) => <option key={entry.id} value={entry.id}>{entry.tradeName}</option>)}</select></label><label>Situação<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todas</option><option value="DRAFT">Aguardando parcelas</option><option value="OPEN">Em aberto</option><option value="PARTIAL">Parcial</option><option value="PAID">Pago</option><option value="CANCELLED">Cancelado</option></select></label><button className="secondary-button" disabled={busy} onClick={() => run(() => reload(), "Filtro atualizado.")} type="button">Filtrar</button></div>
    <div className="management-metrics payable-metrics"><article><span>Em aberto</span><strong>{currency.format(data.indicators.openAmount)}</strong><small>Saldo total pendente</small></article><article><span>Vencidas</span><strong>{currency.format(data.indicators.overdueAmount)}</strong><small>{data.indicators.overdueCount} parcelas</small></article><article><span>Próximos 7 dias</span><strong>{currency.format(data.indicators.dueSoonAmount)}</strong><small>{data.indicators.dueSoonCount} parcelas</small></article><article><span>Pago neste mês</span><strong>{currency.format(data.indicators.paidThisMonth)}</strong><small>Baixas não estornadas</small></article></div>
    {(message || error) && <div className={`portal-feedback ${error ? "error" : "success"}`} role="status">{error || message}</div>}
    <div className="management-tabs" role="tablist"><button className={tab === "open" ? "active" : ""} onClick={() => setTab("open")} type="button">A vencer e vencidas</button><button className={tab === "draft" ? "active" : ""} onClick={() => setTab("draft")} type="button">Configurar parcelas ({drafts.length})</button><button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")} type="button">Histórico de baixas</button></div>

    {tab === "draft" && <div className="payable-list">{drafts.map((entry) => { const current = config[entry.id] ?? { count: "1", firstDue: todayInput() }; return <article className="payable-card draft" key={entry.id}><header><div><span>NF {entry.documentNumber ?? entry.accessKey.slice(-9)}</span><h3>{entry.supplier.tradeName}</h3><small>{entry.purchaseOrder.code} · {entry.purchaseOrder.store.name}</small></div><strong>{currency.format(Number(entry.totalAmount))}</strong></header><p>O recebimento fiscal foi concluído. Defina as parcelas antes de registrar qualquer pagamento.</p>{canWrite(role) && <div className="payable-config"><label>Parcelas<input min="1" max="60" type="number" value={current.count} onChange={(event) => setConfig({ ...config, [entry.id]: { ...current, count: event.target.value } })}/></label><label>Primeiro vencimento<input type="date" value={current.firstDue} onChange={(event) => setConfig({ ...config, [entry.id]: { ...current, firstDue: event.target.value } })}/></label><div><small>Prévia por parcela</small><strong>{currency.format(Number(entry.totalAmount) / Math.max(1, Number(current.count)))}</strong></div><button disabled={busy} onClick={() => configure(entry)} type="button">Confirmar parcelas</button><button className="danger-button" disabled={busy} onClick={() => { const reason = window.prompt("Motivo do cancelamento (mínimo 10 caracteres):"); if (reason) run(() => requestJson(`titulos/${entry.id}/cancelar`, { method: "PUT", body: JSON.stringify({ motivo: reason }) }).then(() => undefined), "Título cancelado."); }} type="button">Cancelar</button></div>}</article>})}{!drafts.length && <div className="empty-state">Nenhuma NF-e aguardando configuração financeira.</div>}</div>}

    {tab === "open" && <div className="payable-list">{open.map((entry) => <article className="payable-card" key={entry.id}><header><div><span>NF {entry.documentNumber ?? entry.accessKey.slice(-9)} · {entry.purchaseOrder.code}</span><h3>{entry.supplier.tradeName}</h3><small>{entry.purchaseOrder.store.name} · configurado por {entry.approvedBy?.name ?? "não informado"}</small></div><div><strong>{currency.format(entry.outstandingAmount)}</strong><em className={`order-status ${entry.status.toLowerCase()}`}>{entry.status}</em></div></header><div className="payable-installments">{entry.installments.map((installment) => { const current = payment[installment.id] ?? { amount: String(installment.outstandingAmount), method: "BANK_TRANSFER", paidAt: todayInput(), reference: "" }; return <section className={installment.effectiveStatus === "OVERDUE" ? "overdue" : ""} key={installment.id}><div><span>Parcela {installment.number}</span><strong>{date(installment.dueAt)}</strong><small>{installment.effectiveStatus === "OVERDUE" ? "Vencida" : installment.status === "PAID" ? "Paga" : "Em aberto"}</small></div><div><small>Valor</small><strong>{currency.format(Number(installment.amount))}</strong><span>Saldo {currency.format(installment.outstandingAmount)}</span></div>{canWrite(role) && ["OPEN", "PARTIAL"].includes(installment.status) && <div className="payable-payment-form"><input aria-label="Valor da baixa" min="0.01" step="0.01" type="number" value={current.amount} onChange={(event) => setPayment({ ...payment, [installment.id]: { ...current, amount: event.target.value } })}/><select aria-label="Meio de pagamento" value={current.method} onChange={(event) => setPayment({ ...payment, [installment.id]: { ...current, method: event.target.value } })}><option value="BANK_TRANSFER">Transferência</option><option value="PIX">Pix</option><option value="BOLETO">Boleto</option><option value="CASH">Dinheiro</option><option value="CARD">Cartão</option><option value="OTHER">Outro</option></select><input aria-label="Data do pagamento" type="date" value={current.paidAt} onChange={(event) => setPayment({ ...payment, [installment.id]: { ...current, paidAt: event.target.value } })}/><input aria-label="Referência bancária" placeholder="Referência/comprovante" value={current.reference} onChange={(event) => setPayment({ ...payment, [installment.id]: { ...current, reference: event.target.value } })}/><button disabled={busy} onClick={() => pay(installment)} type="button">Registrar baixa</button></div>}</section>})}</div>{canWrite(role) && Number(entry.paidAmount) === 0 && <footer><button className="danger-button" disabled={busy} onClick={() => { const reason = window.prompt("Motivo do cancelamento (mínimo 10 caracteres):"); if (reason) run(() => requestJson(`titulos/${entry.id}/cancelar`, { method: "PUT", body: JSON.stringify({ motivo: reason }) }).then(() => undefined), "Título cancelado."); }} type="button">Cancelar título</button></footer>}</article>)}{!open.length && <div className="empty-state">Nenhuma conta pendente com os filtros atuais.</div>}</div>}

    {tab === "history" && <div className="payment-history">{data.payments.map((entry) => <article className={entry.reversedAt ? "reversed" : ""} key={entry.id}><div><span>{entry.installment.payable.supplier.tradeName}</span><strong>NF {entry.installment.payable.documentNumber ?? "sem número"} · parcela {entry.installment.number}</strong><small>{entry.method.replaceAll("_", " ")} · {entry.recordedBy.name}</small></div><div><strong>{currency.format(Number(entry.amount))}</strong><span>{date(entry.paidAt)}</span>{entry.reference && <small>{entry.reference}</small>}</div>{entry.reversedAt ? <div><em>Estornado</em><small>{entry.reversalReason}<br/>{entry.reversedBy?.name}</small></div> : canWrite(role) && <button disabled={busy} onClick={() => { const reason = window.prompt("Motivo do estorno (mínimo 10 caracteres):"); if (reason) run(() => requestJson(`pagamentos/${entry.id}/estornar`, { method: "POST", body: JSON.stringify({ motivo: reason }) }).then(() => undefined), "Pagamento estornado e saldos recalculados."); }} type="button">Estornar</button>}</article>)}{!data.payments.length && <div className="empty-state">Nenhuma baixa registrada.</div>}</div>}
  </div>;
}
