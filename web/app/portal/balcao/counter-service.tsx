"use client";

import { useMemo, useState } from "react";

type Prescription = { number: string; prescriberName: string; prescriberRegistration: string; prescriberState: string; issuedAt: string; retained: boolean };
type Store = { id: string; code: string; name: string; type: string };
type Product = {
  id: string; ean: string; name: string; laboratory: string; activeIngredient: string; salePrice: number; promotionPrice: number | null; stockQuantity: number;
  salesStrategy: string; strategyStartsAt: string | null; strategyEndsAt: string | null; controlLevel: string; requiresBuyerId: boolean; requiresPrescription: boolean;
  requiresPharmacist: boolean; retainsPrescription: boolean; minimumBuyerAge: number | null; controlLegalBasis: string | null; category: { name: string; ncm: string };
  availability: Array<{ storeId: string; available: number }>;
};
type Pharmacist = { id: string; council: string; registration: string; state: string; user: { id: string; name: string } };
export type CounterOrder = {
  id: string; code: string; status: "WAITING_CASHIER" | "IN_CHECKOUT" | "COMPLETED" | "CANCELLED" | "EXPIRED"; customerTaxId: string | null; customerName: string | null;
  discountPercent: number | string; originalGrossAmount: number | string; grossAmount: number | string; sentAt: string; expiresAt: string; attendant: { id: string; name: string };
  claimedBy: { id: string; name: string } | null; store: Store; items: Array<{ id: string; ean: string; productName: string; quantity: number | string }>;
};
export type CounterDashboard = { stores: Store[]; products: Product[]; pharmacists: Pharmacist[]; orders: CounterOrder[]; discountLimit: number };

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const statusLabel: Record<CounterOrder["status"], string> = { WAITING_CASHIER: "Aguardando caixa", IN_CHECKOUT: "Em atendimento no caixa", COMPLETED: "Venda concluída", CANCELLED: "Cancelada", EXPIRED: "Expirada" };
const emptyPrescription = (): Prescription => ({ number: "", prescriberName: "", prescriberRegistration: "", prescriberState: "", issuedAt: "", retained: false });

function price(product: Product) {
  const now = new Date(); const start = product.strategyStartsAt ? new Date(product.strategyStartsAt) : null; const end = product.strategyEndsAt ? new Date(product.strategyEndsAt) : null;
  return product.salesStrategy === "PROMOTION" && product.promotionPrice !== null && (!start || start <= now) && (!end || end >= now) ? Number(product.promotionPrice) : Number(product.salePrice);
}

async function counterApi(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`/api/portal/counter/${path}`, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) throw new Error(payload.message ?? "Não foi possível concluir o atendimento.");
  return payload;
}

export function CounterService({ initial, role }: { initial: CounterDashboard; role: string }) {
  const [storeId, setStoreId] = useState(initial.stores[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Array<{ product: Product; quantity: number }>>([]);
  const [discount, setDiscount] = useState("0");
  const [customerTaxId, setCustomerTaxId] = useState(""); const [customerName, setCustomerName] = useState(""); const [customerBirthDate, setCustomerBirthDate] = useState("");
  const [pharmacistId, setPharmacistId] = useState(""); const [prescriptions, setPrescriptions] = useState<Record<string, Prescription>>({}); const [notes, setNotes] = useState("");
  const [orders, setOrders] = useState(initial.orders); const [busy, setBusy] = useState(""); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase(); if (!normalized) return [];
    return initial.products.filter((product) => `${product.ean} ${product.name} ${product.activeIngredient} ${product.laboratory}`.toLowerCase().includes(normalized)).slice(0, 8);
  }, [initial.products, query]);
  const selectedStore = initial.stores.find((store) => store.id === storeId);
  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + price(line.product) * line.quantity, 0), [cart]);
  const appliedDiscount = Math.min(initial.discountLimit, Math.max(0, Number(discount) || 0));
  const total = Math.round(subtotal * (1 - appliedDiscount / 100) * 100) / 100;
  const controlled = cart.filter((line) => line.product.controlLevel !== "NONE" || line.product.requiresPrescription || line.product.requiresPharmacist || line.product.requiresBuyerId);
  const waiting = orders.filter((order) => order.status === "WAITING_CASHIER" || order.status === "IN_CHECKOUT").length;
  function availability(product: Product) { return product.availability.find((entry) => entry.storeId === storeId)?.available ?? product.stockQuantity; }
  function add(product: Product) {
    const available = availability(product); if (available <= 0) { setError("Produto sem saldo disponível nesta loja."); return; }
    setCart((current) => { const found = current.find((line) => line.product.id === product.id); const next = (found?.quantity ?? 0) + 1; if (next > available) { setError("A quantidade supera o saldo disponível desta loja."); return current; } return found ? current.map((line) => line.product.id === product.id ? { ...line, quantity: next } : line) : [...current, { product, quantity: 1 }]; });
    setQuery(""); setError("");
  }
  function quantity(productId: string, delta: number) { setCart((current) => current.map((line) => line.product.id === productId ? { ...line, quantity: Math.min(availability(line.product), line.quantity + delta) } : line).filter((line) => line.quantity > 0)); }
  function prescription(productId: string, patch: Partial<Prescription>) { setPrescriptions((current) => ({ ...current, [productId]: { ...(current[productId] ?? emptyPrescription()), ...patch } })); }
  function reset() { setCart([]); setDiscount("0"); setCustomerTaxId(""); setCustomerName(""); setCustomerBirthDate(""); setPharmacistId(""); setPrescriptions({}); setNotes(""); }
  async function submit() {
    if (!storeId || !cart.length) return; setBusy("submit"); setError(""); setMessage("");
    try {
      const body = {
        loja_id: storeId, desconto_percentual: appliedDiscount, farmaceutico_credencial_id: pharmacistId || null,
        consumidor: customerTaxId ? { documento: customerTaxId, nome: customerName || null, data_nascimento: customerBirthDate || null } : null, observacao: notes || null,
        itens: cart.map((line) => { const form = prescriptions[line.product.id]; return { ean: line.product.ean, quantidade: line.quantity, prescricao: line.product.requiresPrescription && form ? { numero: form.number, prescritor_nome: form.prescriberName, prescritor_registro: form.prescriberRegistration, prescritor_uf: form.prescriberState.toUpperCase(), data_emissao: form.issuedAt, retida: form.retained } : null }; }),
      };
      const order = await counterApi("atendimentos", "POST", body) as unknown as CounterOrder;
      setOrders((current) => [order, ...current]); reset(); setMessage(`${order.code} confirmada e enviada ao caixa. Nenhum pagamento ou baixa de estoque ocorreu no balcão.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao enviar ao caixa."); } finally { setBusy(""); }
  }
  async function cancel(id: string) {
    setBusy(id); setError(""); try { const saved = await counterApi(`atendimentos/${id}/cancelar`, "PATCH") as unknown as CounterOrder; setOrders((current) => current.map((order) => order.id === id ? saved : order)); setMessage("Pré-venda cancelada e retirada da fila."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao cancelar."); } finally { setBusy(""); }
  }
  return <div className="counter-service">
    <div className="report-metrics counter-metrics"><div className="report-metric"><span>Em atendimento</span><strong>{cart.length}</strong><small>produto(s) no pedido atual</small></div><div className={`report-metric ${waiting ? "warning" : "success"}`}><span>Fila do caixa</span><strong>{waiting}</strong><small>pré-venda(s) aguardando</small></div><div className="report-metric"><span>Desconto permitido</span><strong>{initial.discountLimit}%</strong><small>validado novamente pela API</small></div><div className="report-metric success"><span>Separação de funções</span><strong>Balcão ≠ caixa</strong><small>recebimento somente no PDV</small></div></div>
    <div className="counter-flow" aria-label="Fluxo do atendimento"><span className="active"><b>1</b> Consultar e montar</span><i>→</i><span><b>2</b> Confirmar com o cliente</span><i>→</i><span><b>3</b> Enviar ao caixa</span><i>→</i><span><b>4</b> Receber e concluir</span></div>
    {message && <p className="form-feedback">{message}</p>}{error && <p className="form-error">{error}</p>}
    <div className="counter-layout">
      <section className="report-panel counter-builder">
        <div className="panel-title"><div><span>ATENDIMENTO ATUAL</span><h2>Consulta e pedido do consumidor</h2></div><strong>{selectedStore?.name ?? "Selecione a loja"}</strong></div>
        <div className="counter-toolbar"><label>Loja de atendimento<select value={storeId} onChange={(event) => { setStoreId(event.target.value); setCart([]); }}>{initial.stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label><label className="counter-search">Código de barras, medicamento ou princípio ativo<input autoFocus placeholder="Bipe o EAN ou digite o nome" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); const exact = initial.products.find((product) => product.ean === query.trim()); if (exact) add(exact); } }}/></label></div>
        {!!matches.length && <div className="counter-results">{matches.map((product) => <button key={product.id} onClick={() => add(product)} type="button"><span><strong>{product.name}</strong><small>{product.ean} · {product.activeIngredient || product.category.name}</small></span><span><b>{brl.format(price(product))}</b><small>{number.format(availability(product))} disponível</small></span></button>)}</div>}
        <div className="counter-cart">{cart.length === 0 ? <div className="counter-empty"><span>⌁</span><strong>Comece pelo código de barras</strong><p>O atendente consulta preço e disponibilidade antes de confirmar o pedido.</p></div> : cart.map((line) => <article key={line.product.id}><div><strong>{line.product.name}</strong><small>{line.product.ean} · {line.product.category.name} · saldo {number.format(availability(line.product))}</small>{line.product.controlLevel !== "NONE" && <em>Controle {line.product.controlLevel}</em>}</div><div className="counter-quantity"><button onClick={() => quantity(line.product.id, -1)} type="button">−</button><b>{line.quantity}</b><button onClick={() => quantity(line.product.id, 1)} type="button">+</button></div><strong>{brl.format(price(line.product) * line.quantity)}</strong></article>)}</div>
        {!!controlled.length && <div className="counter-controlled"><div><span>VALIDAÇÃO FARMACÊUTICA</span><strong>{controlled.length} item(ns) exigem atenção adicional</strong></div>{controlled.some((line) => line.product.requiresPharmacist) && <label>Farmacêutico responsável<select value={pharmacistId} onChange={(event) => setPharmacistId(event.target.value)}><option value="">Selecione a credencial</option>{initial.pharmacists.map((item) => <option key={item.id} value={item.id}>{item.user.name} · {item.council} {item.registration}/{item.state}</option>)}</select></label>}{controlled.filter((line) => line.product.requiresPrescription).map((line) => { const form = prescriptions[line.product.id] ?? emptyPrescription(); return <fieldset key={line.product.id}><legend>Receita · {line.product.name}</legend><input placeholder="Número" value={form.number} onChange={(event) => prescription(line.product.id, { number: event.target.value })}/><input placeholder="Prescritor" value={form.prescriberName} onChange={(event) => prescription(line.product.id, { prescriberName: event.target.value })}/><input placeholder="Registro profissional" value={form.prescriberRegistration} onChange={(event) => prescription(line.product.id, { prescriberRegistration: event.target.value })}/><input maxLength={2} placeholder="UF" value={form.prescriberState} onChange={(event) => prescription(line.product.id, { prescriberState: event.target.value })}/><input type="date" value={form.issuedAt} onChange={(event) => prescription(line.product.id, { issuedAt: event.target.value })}/><label><input checked={form.retained} type="checkbox" onChange={(event) => prescription(line.product.id, { retained: event.target.checked })}/> Receita retida</label></fieldset>; })}</div>}
      </section>
      <aside className="report-panel counter-summary"><div className="panel-title"><div><span>CONFIRMAÇÃO</span><h2>Enviar ao caixa</h2></div><strong>{brl.format(total)}</strong></div>
        <div className="counter-customer"><label>CPF do consumidor<input inputMode="numeric" placeholder="Somente números" value={customerTaxId} onChange={(event) => setCustomerTaxId(event.target.value)}/></label><label>Nome<input placeholder="Nome do cliente" value={customerName} onChange={(event) => setCustomerName(event.target.value)}/></label><label>Data de nascimento<input type="date" value={customerBirthDate} onChange={(event) => setCustomerBirthDate(event.target.value)}/></label><label>Desconto (%)<input max={initial.discountLimit} min="0" step="0.01" type="number" value={discount} onChange={(event) => setDiscount(event.target.value)}/><small>Limite do perfil: {initial.discountLimit}%</small></label><label className="wide">Observação para o caixa<textarea maxLength={500} placeholder="Orientação comercial ou observação do atendimento" value={notes} onChange={(event) => setNotes(event.target.value)}/></label></div>
        <div className="counter-totals"><p><span>Itens</span><b>{cart.reduce((sum, line) => sum + line.quantity, 0)}</b></p><p><span>Subtotal comercial</span><b>{brl.format(subtotal)}</b></p><p><span>Desconto</span><b>{appliedDiscount.toFixed(2)}%</b></p><p className="total"><span>Total apresentado</span><b>{brl.format(total)}</b></p></div>
        <button className="counter-submit" disabled={!cart.length || !storeId || busy === "submit"} onClick={submit} type="button">{busy === "submit" ? "Validando…" : "Confirmar e enviar ao caixa"}</button><small className="counter-boundary">O balcão não recebe pagamentos nem baixa estoque. O caixa revalida saldo, preço, desconto e controles antes de concluir.</small>
      </aside>
    </div>
    <section className="report-panel counter-history"><div className="panel-title"><div><span>RASTREABILIDADE</span><h2>Atendimentos recentes</h2></div><strong>{orders.length}</strong></div><div>{orders.length === 0 ? <p className="counter-history-empty">Nenhum atendimento enviado hoje.</p> : orders.map((order) => <article key={order.id}><span className={`counter-status ${order.status.toLowerCase()}`}>{statusLabel[order.status]}</span><div><strong>{order.code} · {order.customerName || "Consumidor não identificado"}</strong><small>{order.store.name} · {order.items.map((item) => `${item.productName} × ${Number(item.quantity)}`).join("; ")}</small></div><div><b>{brl.format(Number(order.grossAmount))}</b><small>{order.attendant.name}</small></div>{(order.status === "WAITING_CASHIER" || order.status === "IN_CHECKOUT") && <button disabled={busy === order.id} onClick={() => cancel(order.id)} type="button">Cancelar</button>}</article>)}</div></section>
  </div>;
}
