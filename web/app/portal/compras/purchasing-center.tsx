"use client";

import { useMemo, useState } from "react";

type Numeric = number | string;
type Supplier = { id: string; taxId: string; legalName: string; tradeName: string; email: string | null; phone: string | null; contactName: string | null; leadTimeDays: number; minimumOrderValue: Numeric; paymentTerms: string | null; status: "ACTIVE" | "INACTIVE" | "BLOCKED"; notes: string | null; _count: { products: number; purchaseOrders: number } };
type Product = { id: string; ean: string; name: string; currentCost: Numeric };
type Suggestion = { productId: string; ean: string; productName: string; categoryName: string; onHand: number; reserved: number; available: number; incoming: number; soldLast30Days: number; revenueLast30Days: number; dailySalesAverage: number; coverageDays: number | null; leadTimeDays: number; minimumStock: number; suggestedQuantity: number; currentCost: number; salePrice: number; marginPercent: number; estimatedInvestment: number; estimatedGrossProfit: number; urgency: "CRITICAL" | "HIGH" | "NORMAL"; supplier: { id: string; name: string } | null };
type Order = { id: string; code: string; status: "DRAFT" | "APPROVED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED"; totalAmount: Numeric; expectedAt: string | null; orderedAt: string; supplier: { id: string; tradeName: string; taxId: string }; store: { id: string; name: string }; createdBy: { name: string }; approvedBy: { name: string } | null; items: Array<{ id: string; requestedQuantity: Numeric; receivedQuantity: Numeric; unitCost: Numeric; product: Product }>; receipts: Array<{ id: string; dfeReceiving: { document: { accessKey: string; documentNumber: string | null; totalAmount: Numeric } }; supplierReturns: Array<{ id: string; code: string; status: string; totalAmount: Numeric; createdAt: string }> }> };
type Receiving = { id: string; completedAt: string | null; document: { documentNumber: string | null; accessKey: string; issuerTaxId: string | null; issuerName: string | null; totalAmount: Numeric } };
type ReturnPreviewItem = { id: string; sourceItemNumber: number; product: { id: string; ean: string; name: string }; lot: { id: string; code: string; expiresAt: string }; sourceReceivedQuantity: number; alreadyReturnedQuantity: number; remainingFromReceipt: number; availableAtStore: number; fiscalAvailable: number; maxReturnableQuantity: number; unitCost: number; maxReturnValue: number; blockedReason: string | null };
type ReturnPreview = { receiptId: string; order: { id: string; code: string }; supplier: { id: string; taxId: string; tradeName: string }; store: { id: string; name: string }; document: { id: string; accessKey: string; number: string | null; issuedAt: string | null; totalAmount: number }; financial: { payableId: string | null; payableStatus: string | null; payableOutstanding: number; paidAmount: number }; items: ReturnPreviewItem[] };
type SupplierReturn = { id: string; code: string; scope: "ONE" | "SOME" | "ALL"; status: "PENDING_FISCAL" | "AUTHORIZED" | "FISCAL_REJECTED"; financialEffect: "NONE" | "PAYABLE_REDUCED" | "SUPPLIER_CREDIT" | "MIXED"; reason: string; sourceDocumentNumber: string | null; sourceAccessKey: string; totalAmount: Numeric; payableAdjustmentAmount: Numeric; supplierCreditAmount: Numeric; createdAt: string; supplier: { tradeName: string; taxId: string }; store: { name: string }; createdBy: { name: string }; items: Array<{ id: string; sourceItemNumber: number; quantity: Numeric; unitCost: Numeric; totalAmount: Numeric; product: { name: string; ean: string }; lot: { code: string } }> };

export type PurchasingDashboard = {
  indicators: { critical: number; purchaseInvestment: number; potentialGrossProfit: number; openOrders: number; returnsPendingFiscal: number };
  targetDays: number; suppliers: Supplier[]; stores: Array<{ id: string; code: string; name: string }>; products: Product[];
  suggestions: Suggestion[]; orders: Order[]; availableReceivings: Receiving[]; supplierReturns: SupplierReturn[];
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const canManage = (role: string) => ["OWNER", "ADMIN", "MANAGER"].includes(role);
const canOperate = (role: string) => [...["OWNER", "ADMIN", "MANAGER", "OPERATOR"]].includes(role);

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(`/api/portal/purchasing/${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => ({})) as { erro?: string; message?: string };
  if (!response.ok) throw new Error(payload.message ?? payload.erro ?? "Não foi possível concluir a operação.");
  return payload;
}

export function PurchasingCenter({ initial, role }: { initial: PurchasingDashboard | null; role: string }) {
  if (!initial) return <div className="empty-state">A central de compras ficará disponível assim que a API estiver conectada e a migration desta fase for aplicada.</div>;
  return <PurchasingCenterReady initial={initial} role={role}/>;
}

function PurchasingCenterReady({ initial, role }: { initial: PurchasingDashboard; role: string }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<"suggestions" | "orders" | "returns" | "suppliers">("suggestions");
  const [storeId, setStoreId] = useState("");
  const [targetDays, setTargetDays] = useState(String(initial.targetDays));
  const [selected, setSelected] = useState<string[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [receiptByOrder, setReceiptByOrder] = useState<Record<string, string>>({});
  const [supplierForm, setSupplierForm] = useState({ cnpj: "", legalName: "", tradeName: "", email: "", phone: "", contact: "", leadTime: "7", minimumOrder: "0", paymentTerms: "" });
  const [mapping, setMapping] = useState({ supplierId: "", productId: "", supplierCode: "", unitCost: "", minimumQuantity: "1", packageQuantity: "1", preferred: true });
  const [returnFlow, setReturnFlow] = useState<{ preview: ReturnPreview; step: 1 | 2 | 3; scope: "ONE" | "SOME" | "ALL" | null; selected: string[]; quantities: Record<string, string>; reason: string } | null>(null);

  const activeSuppliers = data.suppliers.filter((entry) => entry.status === "ACTIVE");
  const selectedSuggestions = useMemo(() => data.suggestions.filter((entry) => selected.includes(entry.productId)), [data.suggestions, selected]);
  const selectedInvestment = selectedSuggestions.reduce((sum, entry) => sum + entry.estimatedInvestment, 0);

  async function reload(nextStore = storeId, nextDays = targetDays) {
    const query = new URLSearchParams();
    if (nextStore) query.set("loja_id", nextStore);
    query.set("dias_cobertura", nextDays || "30");
    const refreshed = await requestJson(`painel?${query}`) as PurchasingDashboard;
    setData(refreshed);
  }

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); setMessage(success); await reload(); }
    catch (failure) { setError(failure instanceof Error ? failure.message.replaceAll("_", " ") : "Falha inesperada."); }
    finally { setBusy(false); }
  }

  async function createOrder() {
    if (!supplierId || !storeId || !selectedSuggestions.length) { setError("Selecione fornecedor, loja e ao menos um produto."); return; }
    await run(async () => {
      await requestJson("pedidos", { method: "POST", body: JSON.stringify({ fornecedor_id: supplierId, loja_id: storeId, previsao_entrega: expectedAt || null, itens: selectedSuggestions.map((entry) => ({ produto_id: entry.productId, quantidade: entry.suggestedQuantity, custo_unitario: entry.currentCost })) }) });
      setSelected([]); setTab("orders");
    }, "Pedido criado como rascunho para conferência e aprovação.");
  }

  async function saveNewSupplier(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      await requestJson("fornecedores", { method: "POST", body: JSON.stringify({ cnpj: supplierForm.cnpj.replace(/\D/g, ""), razao_social: supplierForm.legalName, nome_fantasia: supplierForm.tradeName, email: supplierForm.email || null, telefone: supplierForm.phone || null, contato: supplierForm.contact || null, prazo_entrega_dias: Number(supplierForm.leadTime), pedido_minimo: Number(supplierForm.minimumOrder), condicao_pagamento: supplierForm.paymentTerms || null, status: "ACTIVE" }) });
      setSupplierForm({ cnpj: "", legalName: "", tradeName: "", email: "", phone: "", contact: "", leadTime: "7", minimumOrder: "0", paymentTerms: "" });
    }, "Fornecedor cadastrado.");
  }

  async function saveMapping(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      await requestJson(`fornecedores/${mapping.supplierId}/produtos`, { method: "PUT", body: JSON.stringify({ produto_id: mapping.productId, codigo_fornecedor: mapping.supplierCode || null, ultimo_custo: mapping.unitCost ? Number(mapping.unitCost) : null, quantidade_minima: Number(mapping.minimumQuantity), quantidade_embalagem: Number(mapping.packageQuantity), preferencial: mapping.preferred }) });
    }, "Produto vinculado ao fornecedor; a próxima sugestão usará prazo e embalagem cadastrados.");
  }

  async function openReturn(receiptId: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      const preview = await requestJson(`recebimentos/${receiptId}/devolucao`) as ReturnPreview;
      if (!preview.items.some((item) => item.maxReturnableQuantity > 0)) throw new Error("Esta NF-e não possui mais itens disponíveis para devolução.");
      setReturnFlow({ preview, step: 1, scope: null, selected: [], quantities: {}, reason: "" });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível preparar a devolução."); }
    finally { setBusy(false); }
  }

  function chooseReturnScope(scope: "ONE" | "SOME" | "ALL") {
    if (!returnFlow) return;
    setError("");
    const eligible = returnFlow.preview.items.filter((item) => item.maxReturnableQuantity > 0);
    const selected = scope === "ALL" ? eligible.map((item) => item.id) : [];
    const quantities = Object.fromEntries(eligible.map((item) => [item.id, scope === "ALL" ? String(item.maxReturnableQuantity) : ""]));
    setReturnFlow({ ...returnFlow, step: 2, scope, selected, quantities });
  }

  function toggleReturnItem(item: ReturnPreviewItem) {
    if (!returnFlow?.scope || returnFlow.scope === "ALL" || item.maxReturnableQuantity <= 0) return;
    const alreadySelected = returnFlow.selected.includes(item.id);
    let selected = alreadySelected ? returnFlow.selected.filter((id) => id !== item.id) : [...returnFlow.selected, item.id];
    if (returnFlow.scope === "ONE" && !alreadySelected) selected = [item.id];
    setReturnFlow({ ...returnFlow, selected, quantities: { ...returnFlow.quantities, [item.id]: alreadySelected ? "" : String(item.maxReturnableQuantity) } });
  }

  function reviewReturn() {
    if (!returnFlow?.scope) return;
    const expected = returnFlow.scope === "ONE" ? 1 : returnFlow.scope === "SOME" ? 2 : returnFlow.preview.items.filter((item) => item.maxReturnableQuantity > 0).length;
    if (returnFlow.selected.length < expected || (returnFlow.scope === "ONE" && returnFlow.selected.length !== 1)) { setError(returnFlow.scope === "ONE" ? "Selecione exatamente um item." : returnFlow.scope === "SOME" ? "Selecione pelo menos dois itens." : "Todos os itens disponíveis precisam estar selecionados."); return; }
    const invalid = returnFlow.selected.some((id) => { const item = returnFlow.preview.items.find((entry) => entry.id === id)!; const value = Number(returnFlow.quantities[id]); return !value || value <= 0 || value > item.maxReturnableQuantity; });
    if (invalid) { setError("Confira as quantidades: elas devem ser maiores que zero e não podem ultrapassar o saldo devolvível."); return; }
    if (returnFlow.reason.trim().length < 10) { setError("Informe o motivo da devolução com pelo menos 10 caracteres."); return; }
    setError(""); setReturnFlow({ ...returnFlow, step: 3 });
  }

  async function confirmReturn() {
    if (!returnFlow?.scope) return;
    const current = returnFlow;
    await run(async () => {
      await requestJson(`recebimentos/${current.preview.receiptId}/devolucoes`, { method: "POST", body: JSON.stringify({
        chave_idempotencia: crypto.randomUUID(), alcance: current.scope, motivo: current.reason,
        itens: current.selected.map((id) => ({ item_recebimento_id: id, quantidade: Number(current.quantities[id]) })),
      }) });
      setReturnFlow(null); setTab("returns");
    }, "Devolução registrada: estoque e financeiro foram revertidos. A NF-e de devolução aguarda revisão e autorização fiscal.");
  }

  const returnTotalValue = returnFlow ? returnFlow.selected.reduce((sum, id) => { const item = returnFlow.preview.items.find((entry) => entry.id === id); return sum + Number(returnFlow.quantities[id] || 0) * (item?.unitCost ?? 0); }, 0) : 0;
  const returnTotal = money.format(returnTotalValue);

  return <div className="purchasing-center">
    <div className="management-filters purchasing-filters">
      <label>Loja para reposição<select value={storeId} onChange={(event) => setStoreId(event.target.value)}><option value="">Todas as lojas</option>{data.stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
      <label>Dias de cobertura<input min="7" max="90" type="number" value={targetDays} onChange={(event) => setTargetDays(event.target.value)}/></label>
      <button className="secondary-button" disabled={busy} onClick={() => run(() => reload(), "Sugestões recalculadas.")} type="button">Recalcular</button>
    </div>
    <div className="management-metrics purchasing-metrics">
      <article><span>Itens críticos</span><strong>{data.indicators.critical}</strong><small>Sem saldo disponível</small></article>
      <article><span>Investimento sugerido</span><strong>{money.format(data.indicators.purchaseInvestment)}</strong><small>Para a cobertura escolhida</small></article>
      <article><span>Lucro bruto potencial</span><strong>{money.format(data.indicators.potentialGrossProfit)}</strong><small>Antes das despesas operacionais</small></article>
      <article><span>Pedidos abertos</span><strong>{data.indicators.openOrders}</strong><small>Rascunho, aprovado ou parcial</small></article>
      <article><span>Devoluções pendentes</span><strong>{data.indicators.returnsPendingFiscal}</strong><small>Aguardando NF-e autorizada</small></article>
    </div>
    {(message || error) && <div className={`portal-feedback ${error ? "error" : "success"}`} role="status">{error || message}</div>}
    <div className="management-tabs" role="tablist">
      <button className={tab === "suggestions" ? "active" : ""} onClick={() => setTab("suggestions")} type="button">Sugestões</button>
      <button className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")} type="button">Pedidos</button>
      <button className={tab === "returns" ? "active" : ""} onClick={() => setTab("returns")} type="button">Devoluções</button>
      <button className={tab === "suppliers" ? "active" : ""} onClick={() => setTab("suppliers")} type="button">Fornecedores</button>
    </div>

    {tab === "suggestions" && <>
      {canOperate(role) && <div className="purchase-order-bar">
        <div><strong>{selected.length} itens selecionados</strong><small>{money.format(selectedInvestment)} de investimento estimado</small></div>
        <select aria-label="Fornecedor do pedido" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Fornecedor</option>{activeSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.tradeName}</option>)}</select>
        <select aria-label="Loja de destino" value={storeId} onChange={(event) => setStoreId(event.target.value)}><option value="">Loja de destino</option>{data.stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select>
        <input aria-label="Previsão de entrega" type="date" value={expectedAt} onChange={(event) => setExpectedAt(event.target.value)}/>
        <button disabled={busy || !selected.length} onClick={createOrder} type="button">Criar pedido</button>
      </div>}
      <div className="data-table-wrap"><table className="data-table purchasing-table"><thead><tr><th>Comprar</th><th>Produto</th><th>Saldo real</th><th>Venda 30 dias</th><th>Cobertura</th><th>Margem</th><th>Sugestão</th><th>Resultado potencial</th></tr></thead><tbody>{data.suggestions.map((entry) => <tr key={entry.productId}>
        <td>{canOperate(role) && <input aria-label={`Selecionar ${entry.productName}`} checked={selected.includes(entry.productId)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, entry.productId] : current.filter((id) => id !== entry.productId))} type="checkbox"/>}</td>
        <td><strong>{entry.productName}</strong><small>{entry.ean} · {entry.categoryName}</small><em className={`urgency ${entry.urgency.toLowerCase()}`}>{entry.urgency === "CRITICAL" ? "Sem saldo" : entry.urgency === "HIGH" ? "Comprar logo" : "Planejar"}</em></td>
        <td>{number.format(entry.available)}<small>{number.format(entry.onHand)} físico · {number.format(entry.reserved)} reservado · {number.format(entry.incoming)} a receber</small></td>
        <td>{number.format(entry.soldLast30Days)}<small>{money.format(entry.revenueLast30Days)}</small></td>
        <td>{entry.coverageDays === null ? "Sem giro" : `${entry.coverageDays} dias`}<small>Fornecedor: {entry.leadTimeDays} dias</small></td>
        <td>{entry.marginPercent.toFixed(1)}%<small>{money.format(entry.salePrice - entry.currentCost)} por unidade</small></td>
        <td><strong>{number.format(entry.suggestedQuantity)}</strong><small>{money.format(entry.estimatedInvestment)}</small></td>
        <td><strong>{money.format(entry.estimatedGrossProfit)}</strong><small>{entry.supplier?.name ?? "Fornecedor não definido"}</small></td>
      </tr>)}</tbody></table>{!data.suggestions.length && <div className="empty-state">Nenhuma reposição necessária para os filtros atuais.</div>}</div>
    </>}

    {tab === "orders" && <div className="purchase-order-list">{data.orders.map((order) => {
      const matchingReceivings = data.availableReceivings.filter((entry) => !entry.document.issuerTaxId || entry.document.issuerTaxId === order.supplier.taxId);
      return <article className="purchase-order-card" key={order.id}><header><div><span>{order.code}</span><h3>{order.supplier.tradeName}</h3><small>{order.store.name} · criado por {order.createdBy.name}</small></div><div><strong>{money.format(Number(order.totalAmount))}</strong><em className={`order-status ${order.status.toLowerCase()}`}>{order.status.replaceAll("_", " ")}</em></div></header>
        <div className="order-items">{order.items.map((item) => <p key={item.id}><span>{item.product.name}</span><strong>{number.format(Number(item.receivedQuantity))} / {number.format(Number(item.requestedQuantity))}</strong><small>{money.format(Number(item.unitCost))}/un.</small></p>)}</div>
        {!!order.receipts.length && <div className="purchase-receipts"><strong>NF-e recebidas</strong>{order.receipts.map((receipt) => <div key={receipt.id}><span>NF {receipt.dfeReceiving.document.documentNumber ?? receipt.dfeReceiving.document.accessKey.slice(-9)}<small>{receipt.supplierReturns.length ? `${receipt.supplierReturns.length} devolução(ões) vinculada(s)` : "Sem devolução"}</small></span>{canManage(role) && <button className="secondary-button" disabled={busy} onClick={() => openReturn(receipt.id)} type="button">Devolver itens</button>}</div>)}</div>}
        <footer><small>{order.expectedAt ? `Previsto para ${new Date(order.expectedAt).toLocaleDateString("pt-BR", { timeZone: "UTC" })}` : "Sem previsão informada"}</small><div>
          {canManage(role) && order.status === "DRAFT" && <button disabled={busy} onClick={() => run(() => requestJson(`pedidos/${order.id}/aprovar`, { method: "PUT", body: "{}" }).then(() => undefined), "Pedido aprovado e considerado como mercadoria a receber." )} type="button">Aprovar</button>}
          {canManage(role) && ["DRAFT", "APPROVED"].includes(order.status) && <button className="danger-button" disabled={busy} onClick={() => { const reason = window.prompt("Motivo do cancelamento (mínimo 10 caracteres):"); if (reason) run(() => requestJson(`pedidos/${order.id}/cancelar`, { method: "PUT", body: JSON.stringify({ motivo: reason }) }).then(() => undefined), "Pedido cancelado."); }} type="button">Cancelar</button>}
          {canOperate(role) && ["APPROVED", "PARTIALLY_RECEIVED"].includes(order.status) && <><select aria-label={`NF-e recebida para ${order.code}`} value={receiptByOrder[order.id] ?? ""} onChange={(event) => setReceiptByOrder((current) => ({ ...current, [order.id]: event.target.value }))}><option value="">Selecionar NF-e conferida</option>{matchingReceivings.map((entry) => <option key={entry.id} value={entry.id}>NF {entry.document.documentNumber ?? entry.document.accessKey.slice(-9)} · {money.format(Number(entry.document.totalAmount))}</option>)}</select><button disabled={busy || !receiptByOrder[order.id]} onClick={() => run(() => requestJson(`pedidos/${order.id}/recebimentos`, { method: "POST", body: JSON.stringify({ recebimento_id: receiptByOrder[order.id] }) }).then(() => undefined), "Recebimento fiscal vinculado ao pedido." )} type="button">Vincular recebimento</button></>}
        </div></footer>
      </article>})}{!data.orders.length && <div className="empty-state">Ainda não existem pedidos de compra.</div>}</div>}

    {tab === "returns" && <div className="supplier-return-history">{data.supplierReturns.map((entry) => <article key={entry.id}>
      <header><div><span>{entry.code}</span><h3>{entry.supplier.tradeName}</h3><small>NF {entry.sourceDocumentNumber ?? entry.sourceAccessKey.slice(-9)} · {entry.store.name}</small></div><div><strong>{money.format(Number(entry.totalAmount))}</strong><em className={`order-status ${entry.status.toLowerCase()}`}>{entry.status === "PENDING_FISCAL" ? "Aguardando fiscal" : entry.status === "AUTHORIZED" ? "Autorizada" : "Rejeitada"}</em></div></header>
      <div className="return-history-items">{entry.items.map((item) => <p key={item.id}><span>{item.product.name}<small>Item {item.sourceItemNumber} · lote {item.lot.code}</small></span><strong>{number.format(Number(item.quantity))} × {money.format(Number(item.unitCost))}</strong></p>)}</div>
      <footer><span>{entry.reason}</span><div><small>Abatido: {money.format(Number(entry.payableAdjustmentAmount))}</small><small>Crédito: {money.format(Number(entry.supplierCreditAmount))}</small><small>Por {entry.createdBy.name}</small></div></footer>
    </article>)}{!data.supplierReturns.length && <div className="empty-state">Ainda não existem devoluções vinculadas às NF-e de compra.</div>}</div>}

    {tab === "suppliers" && <div className="supplier-layout">
      <div className="supplier-list">{data.suppliers.map((supplier) => <article key={supplier.id}><header><div><span>{supplier.status}</span><h3>{supplier.tradeName}</h3><small>{supplier.taxId}</small></div><strong>{supplier.leadTimeDays} dias</strong></header><p>{supplier.contactName || "Contato não informado"} · {supplier.phone || supplier.email || "sem canal cadastrado"}</p><footer><span>{supplier._count.products} produtos</span><span>{supplier._count.purchaseOrders} pedidos</span><span>Mínimo {money.format(Number(supplier.minimumOrderValue))}</span></footer></article>)}</div>
      {canManage(role) && <div className="supplier-forms"><form className="portal-form" onSubmit={saveNewSupplier}><h3>Novo fornecedor</h3><label>CNPJ<input required pattern="[0-9]{14}" value={supplierForm.cnpj} onChange={(event) => setSupplierForm({ ...supplierForm, cnpj: event.target.value })}/></label><label>Razão social<input required value={supplierForm.legalName} onChange={(event) => setSupplierForm({ ...supplierForm, legalName: event.target.value })}/></label><label>Nome fantasia<input required value={supplierForm.tradeName} onChange={(event) => setSupplierForm({ ...supplierForm, tradeName: event.target.value })}/></label><div className="form-grid"><label>Prazo de entrega<input min="0" max="365" type="number" value={supplierForm.leadTime} onChange={(event) => setSupplierForm({ ...supplierForm, leadTime: event.target.value })}/></label><label>Pedido mínimo<input min="0" step="0.01" type="number" value={supplierForm.minimumOrder} onChange={(event) => setSupplierForm({ ...supplierForm, minimumOrder: event.target.value })}/></label></div><label>Contato<input value={supplierForm.contact} onChange={(event) => setSupplierForm({ ...supplierForm, contact: event.target.value })}/></label><label>E-mail<input type="email" value={supplierForm.email} onChange={(event) => setSupplierForm({ ...supplierForm, email: event.target.value })}/></label><label>Telefone<input value={supplierForm.phone} onChange={(event) => setSupplierForm({ ...supplierForm, phone: event.target.value })}/></label><label>Condição de pagamento<input value={supplierForm.paymentTerms} onChange={(event) => setSupplierForm({ ...supplierForm, paymentTerms: event.target.value })}/></label><button disabled={busy} type="submit">Salvar fornecedor</button></form>
        <form className="portal-form" onSubmit={saveMapping}><h3>Vincular produto</h3><label>Fornecedor<select required value={mapping.supplierId} onChange={(event) => setMapping({ ...mapping, supplierId: event.target.value })}><option value="">Selecione</option>{activeSuppliers.map((entry) => <option key={entry.id} value={entry.id}>{entry.tradeName}</option>)}</select></label><label>Produto<select required value={mapping.productId} onChange={(event) => setMapping({ ...mapping, productId: event.target.value })}><option value="">Selecione</option>{data.products.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><label>Código no fornecedor<input value={mapping.supplierCode} onChange={(event) => setMapping({ ...mapping, supplierCode: event.target.value })}/></label><div className="form-grid"><label>Último custo<input min="0" step="0.0001" type="number" value={mapping.unitCost} onChange={(event) => setMapping({ ...mapping, unitCost: event.target.value })}/></label><label>Unidades/embalagem<input min="1" step="0.001" type="number" value={mapping.packageQuantity} onChange={(event) => setMapping({ ...mapping, packageQuantity: event.target.value })}/></label></div><label className="check-row"><input checked={mapping.preferred} onChange={(event) => setMapping({ ...mapping, preferred: event.target.checked })} type="checkbox"/> Fornecedor preferencial deste produto</label><button disabled={busy} type="submit">Salvar vínculo</button></form></div>}
    </div>}

    {returnFlow && <div className="return-modal-backdrop" role="presentation"><section aria-labelledby="return-title" aria-modal="true" className="return-modal" role="dialog">
      <header><div><span>DEVOLUÇÃO VINCULADA À NF-e</span><h2 id="return-title">NF {returnFlow.preview.document.number ?? returnFlow.preview.document.accessKey.slice(-9)}</h2><p>{returnFlow.preview.supplier.tradeName} · {returnFlow.preview.store.name}</p></div><button aria-label="Fechar devolução" disabled={busy} onClick={() => setReturnFlow(null)} type="button">×</button></header>
      <div className="return-stepper"><span className={returnFlow.step >= 1 ? "active" : ""}>1. Alcance</span><span className={returnFlow.step >= 2 ? "active" : ""}>2. Itens e quantidades</span><span className={returnFlow.step >= 3 ? "active" : ""}>3. Confirmar</span></div>
      {error && <div className="return-modal-error" role="alert">{error}</div>}
      {returnFlow.step === 1 && <div className="return-scope"><h3>O que será devolvido?</h3><p>Escolha primeiro o alcance. A quantidade total ou fracionada será definida na próxima etapa.</p><div><button onClick={() => chooseReturnScope("ONE")} type="button"><strong>Um item</strong><small>Escolher somente um produto da nota</small></button><button onClick={() => chooseReturnScope("SOME")} type="button"><strong>Alguns itens</strong><small>Selecionar dois ou mais produtos</small></button><button onClick={() => chooseReturnScope("ALL")} type="button"><strong>Todos os itens</strong><small>Selecionar tudo o que ainda está disponível</small></button></div></div>}
      {returnFlow.step === 2 && <div className="return-items-step"><div className="return-guidance"><strong>{returnFlow.scope === "ONE" ? "Selecione um item" : returnFlow.scope === "SOME" ? "Selecione os itens" : "Todos os itens disponíveis foram selecionados"}</strong><span>Você pode devolver a quantidade inteira ou apenas uma fração de cada item.</span></div><div className="return-item-list">{returnFlow.preview.items.map((item) => { const selectedItem = returnFlow.selected.includes(item.id); return <article className={`${selectedItem ? "selected" : ""} ${item.maxReturnableQuantity <= 0 ? "blocked" : ""}`} key={item.id}><label><input checked={selectedItem} disabled={returnFlow.scope === "ALL" || item.maxReturnableQuantity <= 0} onChange={() => toggleReturnItem(item)} type={returnFlow.scope === "ONE" ? "radio" : "checkbox"}/><span><strong>{item.product.name}</strong><small>Item {item.sourceItemNumber} · lote {item.lot.code} · recebido {number.format(item.sourceReceivedQuantity)} · já devolvido {number.format(item.alreadyReturnedQuantity)}</small>{item.blockedReason && <em>{item.blockedReason}</em>}</span></label><div><label>Quantidade a devolver<input disabled={!selectedItem} max={item.maxReturnableQuantity} min="0.001" onChange={(event) => setReturnFlow({ ...returnFlow, quantities: { ...returnFlow.quantities, [item.id]: event.target.value } })} step="0.001" type="number" value={returnFlow.quantities[item.id] ?? ""}/></label><button disabled={!selectedItem} onClick={() => setReturnFlow({ ...returnFlow, quantities: { ...returnFlow.quantities, [item.id]: String(item.maxReturnableQuantity) } })} type="button">Usar tudo ({number.format(item.maxReturnableQuantity)})</button></div></article>})}</div><label className="return-reason">Motivo da devolução<textarea maxLength={1000} minLength={10} onChange={(event) => setReturnFlow({ ...returnFlow, reason: event.target.value })} placeholder="Ex.: produto avariado, divergência comercial ou validade inadequada" value={returnFlow.reason}/></label><footer><button className="secondary-button" onClick={() => setReturnFlow({ ...returnFlow, step: 1 })} type="button">Voltar</button><div><strong>{returnTotal}</strong><button onClick={reviewReturn} type="button">Revisar devolução</button></div></footer></div>}
      {returnFlow.step === 3 && <div className="return-confirm"><div className="return-warning"><strong>Confirme a transação reversa</strong><p>Ao confirmar, o estoque, o saldo fiscal de origem, o pedido e o financeiro serão atualizados juntos. Esta operação interna não poderá ser apagada.</p></div><dl><div><dt>NF-e de origem</dt><dd>{returnFlow.preview.document.accessKey}</dd></div><div><dt>Itens selecionados</dt><dd>{returnFlow.selected.length}</dd></div><div><dt>Valor da devolução</dt><dd>{returnTotal}</dd></div><div><dt>Abatimento possível no título</dt><dd>{money.format(Math.min(returnTotalValue, returnFlow.preview.financial.payableOutstanding))}</dd></div></dl><div className="return-fiscal-note"><strong>Etapa fiscal separada</strong><p>O rascunho da NF-e de devolução será criado com referência à chave e aos itens da nota original. A autorização SEFAZ continuará pendente até a revisão tributária.</p></div><footer><button className="secondary-button" disabled={busy} onClick={() => setReturnFlow({ ...returnFlow, step: 2 })} type="button">Corrigir</button><button disabled={busy} onClick={confirmReturn} type="button">{busy ? "Processando…" : "Confirmar devolução"}</button></footer></div>}
    </section></div>}
  </div>;
}
