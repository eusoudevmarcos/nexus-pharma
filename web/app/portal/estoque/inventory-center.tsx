"use client";

import { useMemo, useState } from "react";

type Balance = { id: string; onHand: string; reserved: string; product: { id: string; ean: string; name: string }; lot: { id: string; code: string; expiresAt: string; unitCost: string } };
type Store = { id: string; code: string; name: string; type: string; stockBalances: Balance[] };
type Reservation = { id: string; status: string; quantity: string; expiresAt: string; reference: string | null; store: { name: string }; product: { name: string; ean: string }; lot: { code: string; expiresAt: string }; createdBy: { name: string } };
type Transfer = { id: string; code: string; status: string; originStore: { name: string }; destinationStore: { name: string }; createdBy: { name: string }; dispatchedBy: { name: string } | null; receivedBy: { name: string } | null; items: Array<{ id: string; quantity: string; product: { name: string; ean: string }; lot: { code: string; expiresAt: string } }> };
type Count = { id: string; code: string; status: string; store: { name: string }; createdBy: { name: string }; submittedBy: { name: string } | null; approvedBy: { name: string } | null; items: Array<{ id: string; expectedQuantity: string; countedQuantity: string | null; differenceQuantity: string | null; product: { name: string; ean: string }; lot: { code: string; expiresAt: string } }> };
type Adjustment = { id: string; status: string; reason: string; quantityDelta: string; justification: string; store: { name: string }; product: { name: string; ean: string }; lot: { code: string; expiresAt: string }; createdBy: { name: string }; approvedBy: { name: string } | null };

export type InventoryDashboard = { indicators: { onHand: number; reserved: number; inTransit: number; pendingApproval: number; expiredReservations: number }; stores: Store[]; reservations: Reservation[]; transfers: Transfer[]; counts: Count[]; adjustments: Adjustment[] };

const emptyDashboard: InventoryDashboard = { indicators: { onHand: 0, reserved: 0, inTransit: 0, pendingApproval: 0, expiredReservations: 0 }, stores: [], reservations: [], transfers: [], counts: [], adjustments: [] };
const number = (value: number | string, digits = 3) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(Number(value));
const date = (value: string) => new Intl.DateTimeFormat("pt-BR").format(new Date(value));
const statusLabel: Record<string, string> = { ACTIVE: "Ativa", FULFILLED: "Atendida", RELEASED: "Liberada", EXPIRED: "Expirada", DRAFT: "Rascunho", IN_TRANSIT: "Em trânsito", RECEIVED: "Recebida", CANCELLED: "Cancelada", OPEN: "Em contagem", PENDING_APPROVAL: "Aguardando aprovação", APPROVED: "Aprovado", REJECTED: "Rejeitado" };

export function InventoryCenter({ initial, role }: { initial: InventoryDashboard | null; role: string }) {
  const [data, setData] = useState(initial ?? emptyDashboard);
  const [tab, setTab] = useState<"BALANCES" | "TRANSFERS" | "COUNTS">("BALANCES");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reservation, setReservation] = useState({ storeId: initial?.stores[0]?.id ?? "", lotId: initial?.stores[0]?.stockBalances[0]?.lot.id ?? "", quantity: "1", hours: "2", reference: "" });
  const [transfer, setTransfer] = useState({ originId: initial?.stores[0]?.id ?? "", destinationId: initial?.stores[1]?.id ?? "", lotId: initial?.stores[0]?.stockBalances[0]?.lot.id ?? "", quantity: "1" });
  const [inventoryStoreId, setInventoryStoreId] = useState(initial?.stores[0]?.id ?? "");
  const [adjustment, setAdjustment] = useState({ storeId: initial?.stores[0]?.id ?? "", lotId: initial?.stores[0]?.stockBalances[0]?.lot.id ?? "", reason: "LOSS", quantity: "-1", justification: "" });
  const canManage = ["OWNER", "ADMIN", "MANAGER"].includes(role);
  const canOperate = !["VIEWER"].includes(role);
  const availableLots = useMemo(() => data.stores.flatMap((store) => store.stockBalances.map((balance) => ({ ...balance, storeId: store.id, storeName: store.name, available: Number(balance.onHand) - Number(balance.reserved) }))), [data.stores]);
  const originLots = availableLots.filter((entry) => entry.storeId === transfer.originId && entry.available > 0);

  async function api(path: string, method: "POST" | "PUT", body: unknown) {
    setError(""); setMessage(""); setBusy(path);
    try {
      const response = await fetch(`/api/portal/inventory/${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "Não foi possível concluir a operação.");
      const refresh = await fetch("/api/portal/inventory/painel", { cache: "no-store" });
      if (refresh.ok) setData(await refresh.json() as InventoryDashboard);
      setMessage("Operação registrada com rastreabilidade.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha inesperada."); }
    finally { setBusy(""); }
  }

  async function confirmExpected(entry: Count) {
    setError(""); setMessage(""); setBusy(`count-${entry.id}`);
    try {
      for (const item of entry.items) {
        const counted = await fetch(`/api/portal/inventory/inventarios/${entry.id}/itens/${item.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ quantidade_contada: Number(item.expectedQuantity) }) });
        if (!counted.ok) throw new Error(((await counted.json().catch(() => ({}))) as { message?: string }).message ?? "Falha ao registrar a contagem.");
      }
      const submitted = await fetch(`/api/portal/inventory/inventarios/${entry.id}/enviar`, { method: "PUT", headers: { "content-type": "application/json" }, body: "{}" });
      if (!submitted.ok) throw new Error(((await submitted.json().catch(() => ({}))) as { message?: string }).message ?? "Falha ao enviar o inventário.");
      const refresh = await fetch("/api/portal/inventory/painel", { cache: "no-store" });
      if (refresh.ok) setData(await refresh.json() as InventoryDashboard);
      setMessage("Contagem registrada e enviada para outro gestor aprovar.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha inesperada."); }
    finally { setBusy(""); }
  }

  function setOrigin(originId: string) {
    const first = availableLots.find((entry) => entry.storeId === originId && entry.available > 0);
    setTransfer((current) => ({ ...current, originId, destinationId: current.destinationId === originId ? data.stores.find((store) => store.id !== originId)?.id ?? "" : current.destinationId, lotId: first?.lot.id ?? "" }));
  }

  return <div className="inventory-center">
    <div className="report-metrics">
      <div className="report-metric"><span>Saldo físico</span><strong>{number(data.indicators.onHand)}</strong><small>Unidades por loja e lote</small></div>
      <div className="report-metric warning"><span>Reservado</span><strong>{number(data.indicators.reserved)}</strong><small>Separado, mas ainda físico</small></div>
      <div className="report-metric"><span>Em trânsito</span><strong>{number(data.indicators.inTransit)}</strong><small>Expedido e não recebido</small></div>
      <div className={`report-metric ${data.indicators.pendingApproval ? "warning" : "success"}`}><span>Aprovações</span><strong>{data.indicators.pendingApproval}</strong><small>Inventários e ajustes pendentes</small></div>
    </div>
    {(message || error) && <div className={`inventory-feedback ${error ? "error" : "success"}`}>{error || message}</div>}
    <div className="inventory-tabs" role="tablist"><button className={tab === "BALANCES" ? "active" : ""} onClick={() => setTab("BALANCES")}>Saldos e reservas</button><button className={tab === "TRANSFERS" ? "active" : ""} onClick={() => setTab("TRANSFERS")}>Transferências</button><button className={tab === "COUNTS" ? "active" : ""} onClick={() => setTab("COUNTS")}>Inventários e perdas</button></div>

    {tab === "BALANCES" && <div className="inventory-layout">
      <article className="report-panel inventory-form"><div className="panel-title"><div><span>SEPARAÇÃO TEMPORÁRIA</span><h2>Reservar mercadoria</h2></div></div>
        <label>Loja<select value={reservation.storeId} onChange={(event) => { const storeId = event.target.value; const first = availableLots.find((entry) => entry.storeId === storeId); setReservation((current) => ({ ...current, storeId, lotId: first?.lot.id ?? "" })); }}>{data.stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
        <label>Produto e lote<select value={reservation.lotId} onChange={(event) => setReservation((current) => ({ ...current, lotId: event.target.value }))}>{availableLots.filter((entry) => entry.storeId === reservation.storeId && entry.available > 0).map((entry) => <option key={entry.id} value={entry.lot.id}>{entry.product.name} · lote {entry.lot.code} · disp. {number(entry.available)}</option>)}</select></label>
        <div className="inventory-form-pair"><label>Quantidade<input min="0.001" step="0.001" type="number" value={reservation.quantity} onChange={(event) => setReservation((current) => ({ ...current, quantity: event.target.value }))}/></label><label>Expira em<input min="1" type="number" value={reservation.hours} onChange={(event) => setReservation((current) => ({ ...current, hours: event.target.value }))}/><small>horas</small></label></div>
        <label>Referência<input placeholder="Pedido, balcão ou cliente" value={reservation.reference} onChange={(event) => setReservation((current) => ({ ...current, reference: event.target.value }))}/></label>
        <button disabled={!canOperate || !reservation.lotId || busy !== ""} onClick={() => api("reservas", "POST", { loja_id: reservation.storeId, lote_id: reservation.lotId, quantidade: Number(reservation.quantity), expira_em: new Date(Date.now() + Number(reservation.hours) * 3_600_000).toISOString(), referencia: reservation.reference || null })}>Reservar saldo disponível</button>
      </article>
      <article className="report-panel inventory-list"><div className="panel-title"><div><span>POSIÇÃO ATUAL</span><h2>Saldo por loja e lote</h2></div><strong>{availableLots.length} lotes</strong></div>{availableLots.map((entry) => <div key={entry.id}><span className="inventory-lot-icon">{entry.product.name.slice(0, 1)}</span><p><strong>{entry.product.name}</strong><small>{entry.storeName} · lote {entry.lot.code} · vence {date(entry.lot.expiresAt)}</small></p><div><b>{number(entry.available)}</b><small>disponível</small></div><div><b>{number(entry.reserved)}</b><small>reservado</small></div></div>)}</article>
      <article className="report-panel inventory-history full"><div className="panel-title"><div><span>RESERVAS</span><h2>Histórico de separação</h2></div></div>{data.reservations.slice(0, 30).map((entry) => <div key={entry.id}><span className={`status-pill ${entry.status === "ACTIVE" ? "warning" : ""}`}>{statusLabel[entry.status] ?? entry.status}</span><p><strong>{entry.product.name} · {number(entry.quantity)}</strong><small>{entry.store.name} · lote {entry.lot.code} · por {entry.createdBy.name}</small></p><small>Expira {date(entry.expiresAt)}</small>{entry.status === "ACTIVE" && canOperate ? <button disabled={busy !== ""} onClick={() => api(`reservas/${entry.id}/finalizar`, "PUT", { status: "RELEASED" })}>Liberar</button> : <span/>}</div>)}</article>
    </div>}

    {tab === "TRANSFERS" && <div className="inventory-layout">
      <article className="report-panel inventory-form"><div className="panel-title"><div><span>MOVIMENTAÇÃO ENTRE FILIAIS</span><h2>Nova transferência</h2></div></div>
        <div className="inventory-form-pair"><label>Origem<select value={transfer.originId} onChange={(event) => setOrigin(event.target.value)}>{data.stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label><label>Destino<select value={transfer.destinationId} onChange={(event) => setTransfer((current) => ({ ...current, destinationId: event.target.value }))}>{data.stores.filter((store) => store.id !== transfer.originId).map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label></div>
        <label>Produto e lote<select value={transfer.lotId} onChange={(event) => setTransfer((current) => ({ ...current, lotId: event.target.value }))}>{originLots.map((entry) => <option key={entry.id} value={entry.lot.id}>{entry.product.name} · {entry.lot.code} · disp. {number(entry.available)}</option>)}</select></label>
        <label>Quantidade<input min="0.001" step="0.001" type="number" value={transfer.quantity} onChange={(event) => setTransfer((current) => ({ ...current, quantity: event.target.value }))}/></label>
        <button disabled={!canOperate || data.stores.length < 2 || !transfer.lotId || busy !== ""} onClick={() => api("transferencias", "POST", { loja_origem_id: transfer.originId, loja_destino_id: transfer.destinationId, itens: [{ lote_id: transfer.lotId, quantidade: Number(transfer.quantity) }] })}>Criar transferência</button>
        {data.stores.length < 2 && <p className="inventory-note">Cadastre uma filial ativa para habilitar transferências.</p>}
      </article>
      <article className="report-panel inventory-workflows"><div className="panel-title"><div><span>CADEIA DE CUSTÓDIA</span><h2>Transferências</h2></div></div>{data.transfers.map((entry) => <section key={entry.id}><div><span className={`status-pill ${entry.status === "IN_TRANSIT" ? "warning" : ""}`}>{statusLabel[entry.status] ?? entry.status}</span><strong>{entry.code}</strong><small>{entry.originStore.name} → {entry.destinationStore.name}</small></div><p>{entry.items.map((item) => <span key={item.id}>{item.product.name} · lote {item.lot.code} · <b>{number(item.quantity)}</b></span>)}</p><aside>{entry.status === "DRAFT" && canOperate && <button disabled={busy !== ""} onClick={() => api(`transferencias/${entry.id}/expedir`, "PUT", {})}>Expedir</button>}{entry.status === "IN_TRANSIT" && canOperate && <button disabled={busy !== ""} onClick={() => api(`transferencias/${entry.id}/receber`, "PUT", {})}>Confirmar recebimento</button>}</aside></section>)}</article>
    </div>}

    {tab === "COUNTS" && <div className="inventory-layout">
      <article className="report-panel inventory-form"><div className="panel-title"><div><span>CONTAGEM CEGA CONTROLADA</span><h2>Iniciar inventário</h2></div></div><label>Loja<select value={inventoryStoreId} onChange={(event) => setInventoryStoreId(event.target.value)}>{data.stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label><button disabled={!canOperate || !inventoryStoreId || busy !== ""} onClick={() => api("inventarios", "POST", { loja_id: inventoryStoreId })}>Capturar posição da loja</button>
        <hr/><strong className="inventory-subtitle">Registrar perda ou ajuste</strong><label>Loja<select value={adjustment.storeId} onChange={(event) => { const storeId = event.target.value; const first = availableLots.find((entry) => entry.storeId === storeId); setAdjustment((current) => ({ ...current, storeId, lotId: first?.lot.id ?? "" })); }}>{data.stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label><label>Produto e lote<select value={adjustment.lotId} onChange={(event) => setAdjustment((current) => ({ ...current, lotId: event.target.value }))}>{availableLots.filter((entry) => entry.storeId === adjustment.storeId).map((entry) => <option key={entry.id} value={entry.lot.id}>{entry.product.name} · lote {entry.lot.code}</option>)}</select></label><div className="inventory-form-pair"><label>Motivo<select value={adjustment.reason} onChange={(event) => setAdjustment((current) => ({ ...current, reason: event.target.value }))}><option value="LOSS">Perda</option><option value="DAMAGE">Avaria</option><option value="EXPIRED">Vencimento</option><option value="CORRECTION">Correção</option></select></label><label>Variação<input step="0.001" type="number" value={adjustment.quantity} onChange={(event) => setAdjustment((current) => ({ ...current, quantity: event.target.value }))}/></label></div><label>Justificativa<textarea minLength={10} value={adjustment.justification} onChange={(event) => setAdjustment((current) => ({ ...current, justification: event.target.value }))}/></label><button disabled={!canOperate || !adjustment.lotId || adjustment.justification.trim().length < 10 || busy !== ""} onClick={() => api("ajustes", "POST", { loja_id: adjustment.storeId, lote_id: adjustment.lotId, motivo: adjustment.reason, quantidade: Number(adjustment.quantity), justificativa: adjustment.justification })}>Enviar para aprovação</button>
      </article>
      <div className="inventory-workflow-stack"><article className="report-panel inventory-workflows"><div className="panel-title"><div><span>INVENTÁRIOS</span><h2>Contagens e divergências</h2></div></div>{data.counts.map((entry) => <section key={entry.id}><div><span className={`status-pill ${entry.status === "PENDING_APPROVAL" ? "warning" : ""}`}>{statusLabel[entry.status] ?? entry.status}</span><strong>{entry.code}</strong><small>{entry.store.name} · {entry.items.length} lotes</small></div><p>{entry.items.slice(0, 4).map((item) => <span key={item.id}>{item.product.name}: esperado {number(item.expectedQuantity)} · contado {item.countedQuantity === null ? "—" : number(item.countedQuantity)} · diferença {item.differenceQuantity === null ? "—" : number(item.differenceQuantity)}</span>)}</p><aside>{entry.status === "OPEN" && canOperate && <button disabled={busy !== ""} onClick={() => confirmExpected(entry)}>Confirmar saldo esperado</button>}{entry.status === "PENDING_APPROVAL" && canManage && <><button disabled={busy !== ""} onClick={() => api(`inventarios/${entry.id}/decidir`, "PUT", { decisao: "APPROVED" })}>Aprovar</button><button className="secondary" disabled={busy !== ""} onClick={() => api(`inventarios/${entry.id}/decidir`, "PUT", { decisao: "REJECTED" })}>Rejeitar</button></>}</aside></section>)}</article>
        <article className="report-panel inventory-workflows"><div className="panel-title"><div><span>PERDAS E AJUSTES</span><h2>Fila de autorização</h2></div></div>{data.adjustments.map((entry) => <section key={entry.id}><div><span className={`status-pill ${entry.status === "PENDING_APPROVAL" ? "warning" : ""}`}>{statusLabel[entry.status] ?? entry.status}</span><strong>{entry.product.name} · {number(entry.quantityDelta)}</strong><small>{entry.store.name} · lote {entry.lot.code} · {entry.reason}</small></div><p><span>{entry.justification}</span><small>Solicitado por {entry.createdBy.name}</small></p><aside>{entry.status === "PENDING_APPROVAL" && canManage && <><button disabled={busy !== ""} onClick={() => api(`ajustes/${entry.id}/decidir`, "PUT", { decisao: "APPROVED" })}>Aprovar</button><button className="secondary" disabled={busy !== ""} onClick={() => api(`ajustes/${entry.id}/decidir`, "PUT", { decisao: "REJECTED" })}>Rejeitar</button></>}</aside></section>)}</article></div>
    </div>}
  </div>;
}
