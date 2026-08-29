"use client";

import { useMemo, useState } from "react";

type Value = number | string;
type Condition = "RESALABLE" | "DAMAGED" | "EXPIRED" | "OTHER";
type SaleItem = { id: string; productName: string; quantity: Value; unitPrice: Value; reversalItems: Array<{ quantity: Value }> };
export type PostSaleSummary = {
  id: string; soldAt: string; status: string; originalGrossAmount: Value; discountAmount: Value; grossAmount: Value; taxAmount: Value;
  items: SaleItem[];
  nfceDocuments: Array<{ id: string; status: string; series: number; number: number }>;
  reversals: Array<{ id: string; type: string; status: string; fiscalStatus: string; grossAmount: Value; createdAt: string }>;
};
type PostSaleDetail = { sale: PostSaleSummary & { payments: Array<{ id: string; method: string; amount: Value; status: string }>; reversals: Array<{ id: string; type: string; status: string; fiscalStatus: string; grossAmount: Value; createdAt: string; createdBy: { name: string }; paymentRefunds: Array<{ id: string; status: string; amount: Value }> }> }; items: Array<SaleItem & { remainingQuantity: number; reversedQuantity: number }>; financial: { paid: number; refundedOrReserved: number } };
export type OpenCashSession = { id: string; openedAt: string; openedBy: { name: string }; storeName?: string; pointOfSaleName?: string };
export type FiscalPending = { id: string; type: string; reason: string; grossAmount: Value; createdAt: string; createdBy: { name: string }; sale: { id: string; soldAt: string; nfceDocuments: Array<{ series: number; number: number; accessKey: string }> } };
export type PendingRefund = { id: string; amount: Value; status: string; reason: string; createdAt: string; salePayment: { method: string; externalReference: string | null; sale: { id: string; soldAt: string } }; reversal: { id: string; type: string; reason: string } };

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const typeLabel: Record<string, string> = { FULL_CANCELLATION: "Cancelamento total", PARTIAL_RETURN: "Devolução parcial" };
const conditionLabel: Record<Condition, string> = { RESALABLE: "Reintegrar ao estoque", DAMAGED: "Avariado", EXPIRED: "Vencido", OTHER: "Não reintegrar" };

async function postSaleApi(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`/api/portal/post-sale/${path}`, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) throw new Error(payload.message ?? "Não foi possível concluir a operação.");
  return payload;
}

export function PostSaleCenter({ fiscalPending, openSessions, pendingRefunds, role, sales }: { fiscalPending: FiscalPending[]; openSessions: OpenCashSession[]; pendingRefunds: PendingRefund[]; role: string; sales: PostSaleSummary[] }) {
  const [selectedId, setSelectedId] = useState(sales[0]?.id ?? "");
  const [detail, setDetail] = useState<PostSaleDetail | null>(null);
  const [type, setType] = useState<"PARTIAL_RETURN" | "FULL_CANCELLATION">("PARTIAL_RETURN");
  const [reason, setReason] = useState("");
  const [cashSessionId, setCashSessionId] = useState(openSessions[0]?.id ?? "");
  const [rows, setRows] = useState<Record<string, { quantity: string; condition: Condition }>>({});
  const [busy, setBusy] = useState(""); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const canOperate = ["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "OPERATOR"].includes(role);
  const canCancel = ["OWNER", "ADMIN", "MANAGER"].includes(role);
  const selected = sales.find((sale) => sale.id === selectedId);
  const selectedItems = useMemo(() => detail?.items.filter((item) => Number(rows[item.id]?.quantity ?? 0) > 0) ?? [], [detail, rows]);

  async function load(id: string) {
    setSelectedId(id); setBusy("load"); setError(""); setMessage("");
    try {
      const loaded = await postSaleApi(`vendas/${id}`) as unknown as PostSaleDetail;
      setDetail(loaded);
      setRows(Object.fromEntries(loaded.items.map((item) => [item.id, { quantity: "0", condition: "RESALABLE" as Condition }])));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao carregar venda."); }
    finally { setBusy(""); }
  }

  async function submit() {
    if (!detail || !cashSessionId) return;
    setBusy("submit"); setError(""); setMessage("");
    try {
      const body = type === "FULL_CANCELLATION"
        ? { tipo: type, sessao_caixa_id: cashSessionId, motivo: reason }
        : { tipo: type, sessao_caixa_id: cashSessionId, motivo: reason, itens: selectedItems.map((item) => ({ item_venda_id: item.id, quantidade: Number(rows[item.id].quantity), condicao: rows[item.id].condition })) };
      await postSaleApi(`vendas/${detail.sale.id}/estornos`, "POST", body);
      setMessage(type === "FULL_CANCELLATION" ? "Cancelamento registrado com trilha íntegra." : "Devolução registrada e estoque recomposto somente para itens vendáveis.");
      setReason("");
      await load(detail.sale.id);
      window.setTimeout(() => window.location.reload(), 900);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Operação bloqueada."); }
    finally { setBusy(""); }
  }

  return <div className="post-sale-center">
    <div className="report-metrics"><div className="report-metric"><span>Vendas recentes</span><strong>{sales.length}</strong><small>Com trilha preservada</small></div><div className={`report-metric ${fiscalPending.length ? "warning" : "success"}`}><span>Pendências fiscais</span><strong>{fiscalPending.length}</strong><small>NFC-e autorizada exige evento oficial</small></div><div className={`report-metric ${pendingRefunds.length ? "warning" : "success"}`}><span>Reembolsos externos</span><strong>{pendingRefunds.length}</strong><small>Sem baixa fictícia no provedor</small></div><div className={`report-metric ${openSessions.length ? "success" : "warning"}`}><span>Caixa operacional</span><strong>{openSessions.length}</strong><small>Obrigatório para movimentar valores</small></div></div>
    {message && <p className="form-feedback">{message}</p>}{error && <p className="form-error">{error}</p>}
    <div className="post-sale-layout">
      <article className="report-panel post-sale-list"><div className="panel-title"><div><span>ORIGINAIS IMUTÁVEIS</span><h2>Localizar venda</h2></div><strong>{sales.length}</strong></div>
        <div>{sales.length === 0 ? <p className="post-sale-empty">Nenhuma venda disponível.</p> : sales.map((sale) => { const reversed = sale.items.reduce((sum, item) => sum + item.reversalItems.reduce((value, reversal) => value + Number(reversal.quantity), 0), 0); return <button className={selectedId === sale.id ? "active" : ""} key={sale.id} onClick={() => load(sale.id)} type="button"><span>{sale.status === "CANCELLED" ? "Cancelada" : reversed ? "Com devolução" : "Concluída"}</span><div><strong>Venda {sale.id.slice(0, 8)}</strong><small>{dateTime(sale.soldAt)} · {sale.items.length} item(ns)</small></div><b>{brl.format(Number(sale.grossAmount))}</b></button>; })}</div>
      </article>
      <article className="report-panel post-sale-operation"><div className="panel-title"><div><span>OPERAÇÃO CONTROLADA</span><h2>{selected ? `Venda ${selected.id.slice(0, 8)}` : "Selecione uma venda"}</h2></div>{selected && <strong>{brl.format(Number(selected.grossAmount))}</strong>}</div>
        {!detail ? <div className="monitor-empty"><span>↶</span><strong>{busy === "load" ? "Carregando…" : "Abra uma venda"}</strong><p>Confira quantidades, pagamentos, documento fiscal e devoluções anteriores.</p></div> : <>
          <div className="post-sale-context"><span>Pago <b>{brl.format(detail.financial.paid)}</b></span><span>Reservado/devolvido <b>{brl.format(detail.financial.refundedOrReserved)}</b></span><span>Desconto original <b>{brl.format(Number(detail.sale.discountAmount))}</b></span><span>NFC-e <b>{detail.sale.nfceDocuments[0]?.status ?? "Não preparada"}</b></span></div>
          <div className="post-sale-mode"><button className={type === "PARTIAL_RETURN" ? "active" : ""} onClick={() => setType("PARTIAL_RETURN")} type="button">Devolução parcial</button><button className={type === "FULL_CANCELLATION" ? "active" : ""} disabled={!canCancel} onClick={() => setType("FULL_CANCELLATION")} type="button">Cancelamento total</button></div>
          {type === "PARTIAL_RETURN" && <div className="post-sale-items">{detail.items.map((item) => <div key={item.id}><div><strong>{item.productName}</strong><small>Vendido {Number(item.quantity)} · já devolvido {item.reversedQuantity} · disponível {item.remainingQuantity}</small></div><input disabled={item.remainingQuantity <= 0} max={item.remainingQuantity} min="0" step="0.001" type="number" value={rows[item.id]?.quantity ?? "0"} onChange={(event) => setRows((current) => ({ ...current, [item.id]: { ...(current[item.id] ?? { condition: "RESALABLE" }), quantity: event.target.value } }))}/><select disabled={item.remainingQuantity <= 0} value={rows[item.id]?.condition ?? "RESALABLE"} onChange={(event) => setRows((current) => ({ ...current, [item.id]: { ...(current[item.id] ?? { quantity: "0" }), condition: event.target.value as Condition } }))}>{Object.entries(conditionLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>)}</div>}
          <label className="post-sale-session">Caixa que realizará o movimento<select disabled={!openSessions.length} value={cashSessionId} onChange={(event) => setCashSessionId(event.target.value)}><option value="">Selecione um caixa aberto</option>{openSessions.map((session) => <option key={session.id} value={session.id}>{session.storeName ?? "Loja"} · {session.pointOfSaleName ?? "PDV"} · {session.openedBy.name}</option>)}</select></label>
          <label className="post-sale-reason">Motivo auditável<textarea maxLength={1000} placeholder="Descreva a ocorrência, a conferência e a decisão tomada (mínimo 10 caracteres)." value={reason} onChange={(event) => setReason(event.target.value)}/></label>
          {detail.sale.nfceDocuments.some((document) => document.status === "AUTHORIZED") && <p className="post-sale-warning"><b>Atenção:</b> o registro interno não cancela a NFC-e autorizada. Será aberta uma pendência fiscal para o evento oficial.</p>}
          <button className="post-sale-submit" disabled={!canOperate || detail.sale.status === "CANCELLED" || !cashSessionId || reason.trim().length < 10 || (type === "PARTIAL_RETURN" && !selectedItems.length) || busy === "submit"} onClick={submit} type="button">{busy === "submit" ? "Validando e registrando…" : type === "FULL_CANCELLATION" ? "Registrar cancelamento total" : "Registrar devolução selecionada"}</button>
          {!openSessions.length && <small className="post-sale-blocked">Abra um caixa antes de registrar a movimentação financeira.</small>}
        </>}
      </article>
    </div>
    <div className="post-sale-pending-grid">
      <article className="report-panel post-sale-pending"><div className="panel-title"><div><span>ACOMPANHAMENTO FISCAL</span><h2>Eventos oficiais pendentes</h2></div><strong>{fiscalPending.length}</strong></div>{fiscalPending.length === 0 ? <p className="post-sale-empty">Nenhum evento fiscal pendente.</p> : fiscalPending.map((entry) => <div key={entry.id}><span className="status-pill pending">Pendente</span><p><strong>{typeLabel[entry.type] ?? entry.type} · venda {entry.sale.id.slice(0, 8)}</strong><small>{entry.sale.nfceDocuments[0] ? `NFC-e ${entry.sale.nfceDocuments[0].series}/${entry.sale.nfceDocuments[0].number}` : "Documento autorizado"} · {entry.createdBy.name}</small></p><b>{brl.format(Number(entry.grossAmount))}</b></div>)}</article>
      <article className="report-panel post-sale-pending"><div className="panel-title"><div><span>PROVEDORES DE PAGAMENTO</span><h2>Reembolsos a confirmar</h2></div><strong>{pendingRefunds.length}</strong></div>{pendingRefunds.length === 0 ? <p className="post-sale-empty">Nenhuma pendência externa visível para seu perfil.</p> : pendingRefunds.map((entry) => <div key={entry.id}><span className="status-pill pending">Bloqueado</span><p><strong>{entry.salePayment.method} · venda {entry.salePayment.sale.id.slice(0, 8)}</strong><small>{entry.reason}</small></p><b>{brl.format(Number(entry.amount))}</b></div>)}</article>
    </div>
  </div>;
}
