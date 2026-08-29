"use client";

import { useMemo, useState } from "react";

export type DfeDocumentSummary = {
  id: string; environment: string; accessKey: string | null; documentType: string; status: string;
  issuerName: string | null; issuerTaxId: string | null; documentNumber: string | null; issuedAt: string | null;
  totalAmount: number; receivedAt: string; _count: { items: number; discrepancies: number };
  receiving: { id: string; status: string } | null;
};
export type ProductOption = { id: string; ean: string; name: string; currentCost: number; category: { ncm: string; name: string } };
type Detail = DfeDocumentSummary & {
  items: Array<{ id: string; itemNumber: number; productId: string | null; ean: string | null; description: string; ncm: string; cest: string | null; cfop: string; cstIcms: string | null; cstPis: string | null; cstCofins: string | null; quantity: number; unitPrice: number; suggestedTax: Record<string, unknown> }>;
  discrepancies: Array<{ id: string; documentItemId: string | null; severity: string; field: string; receivedValue: string | null; suggestedValue: string | null; explanation: string; status: string }>;
  manifestations: Array<{ id: string; type: string; status: string; responseCode: string | null; responseMessage: string | null }>;
  receiving: null | { id: string; status: string; items: Array<{ id: string; documentItemId: string; productId: string | null; expectedQuantity: number; receivedQuantity: number; lotCode: string | null; manufacturedAt: string | null; expiresAt: string | null; unitCost: number; status: string }> };
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR").format(new Date(value)) : "—";
const labels: Record<string, string> = { DISCOVERED: "Localizada", XML_AVAILABLE: "XML disponível", CONFERENCING: "Em conferência", ACCEPTED: "Recebida", REJECTED: "Rejeitada", COMPLETED: "Concluída", IN_PROGRESS: "Em andamento", OPEN: "Pendente", ACCEPTED_SUGGESTION: "Sugestão aceita", KEPT_SOURCE: "XML mantido", PENDING: "Pendente", MATCHED: "Vinculado", DIVERGENT: "Divergente" };

async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`/api/portal/dfe/${path}`, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) throw new Error(payload.message ?? "Não foi possível concluir a operação.");
  return payload;
}

function ReceivingItem({ receivingId, item, source, products, onSaved }: { receivingId: string; item: NonNullable<Detail["receiving"]>["items"][number]; source: Detail["items"][number]; products: ProductOption[]; onSaved: () => void }) {
  const [productId, setProductId] = useState(item.productId ?? source.productId ?? products.find((product) => product.ean === source.ean)?.id ?? "");
  const [quantity, setQuantity] = useState(String(Number(item.receivedQuantity) || Number(item.expectedQuantity)));
  const [lot, setLot] = useState(item.lotCode ?? ""); const [manufactured, setManufactured] = useState(item.manufacturedAt?.slice(0, 10) ?? ""); const [expires, setExpires] = useState(item.expiresAt?.slice(0, 10) ?? "");
  const [cost, setCost] = useState(String(Number(item.unitCost))); const [acceptDifference, setAcceptDifference] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit() {
    setBusy(true); setError("");
    try {
      await api(`conferencias/${receivingId}/itens/${item.id}`, "PUT", { produto_id: productId, quantidade_recebida: Number(quantity), lote: lot, fabricado_em: manufactured, vence_em: expires, custo_unitario: Number(cost), aceitar_divergencia: acceptDifference });
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao salvar item."); } finally { setBusy(false); }
  }
  return <div className="dfe-conference-item">
    <div><strong>{source.itemNumber}. {source.description}</strong><small>NCM {source.ncm} · XML {Number(item.expectedQuantity)} un. · {brl.format(Number(source.unitPrice))}</small></div>
    <label>Produto<select value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">Selecione</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.ean}</option>)}</select></label>
    <label>Recebido<input min="0.001" step="0.001" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)}/></label>
    <label>Lote<input value={lot} onChange={(event) => setLot(event.target.value)}/></label>
    <label>Fabricação<input type="date" value={manufactured} onChange={(event) => setManufactured(event.target.value)}/></label>
    <label>Validade<input type="date" value={expires} onChange={(event) => setExpires(event.target.value)}/></label>
    <label>Custo unitário<input min="0" step="0.0001" type="number" value={cost} onChange={(event) => setCost(event.target.value)}/></label>
    {Number(quantity) !== Number(item.expectedQuantity) && <label className="dfe-check"><input type="checkbox" checked={acceptDifference} onChange={(event) => setAcceptDifference(event.target.checked)}/> Aceitar diferença física</label>}
    <button disabled={busy || !productId || !lot || !manufactured || !expires} onClick={submit} type="button">{busy ? "Salvando…" : "Conferir item"}</button>{error && <small className="form-error">{error}</small>}
  </div>;
}

export function DfeCenter({ initialDocuments, products, role }: { initialDocuments: DfeDocumentSummary[]; products: ProductOption[]; role: string }) {
  const [documents, setDocuments] = useState(initialDocuments); const [selected, setSelected] = useState<Detail | null>(null); const [environment, setEnvironment] = useState("HOMOLOGATION"); const [busy, setBusy] = useState(""); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const canWrite = role !== "VIEWER"; const canConfigure = ["OWNER", "ADMIN"].includes(role);
  const counts = useMemo(() => ({ pending: documents.filter((item) => !["ACCEPTED", "REJECTED"].includes(item.status)).length, conference: documents.filter((item) => item.status === "CONFERENCING").length, discrepancies: documents.reduce((sum, item) => sum + item._count.discrepancies, 0), completed: documents.filter((item) => item.status === "ACCEPTED").length }), [documents]);
  async function refreshDocuments() { const entries = await api("documentos?limite=100") as unknown as DfeDocumentSummary[]; setDocuments(entries); }
  async function open(id: string) { setBusy(id); setError(""); try { setSelected(await api(`documentos/${id}`) as unknown as Detail); } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao abrir NF-e."); } finally { setBusy(""); } }
  async function uploadXml(file: File) { setBusy("xml"); setError(""); try { await api("importar-xml", "POST", { ambiente: environment, xml: await file.text() }); setMessage("XML importado, validado e preservado com hash."); await refreshDocuments(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha no XML."); } finally { setBusy(""); } }
  async function sync() { setBusy("sync"); setError(""); try { const result = await api("sincronizar", "POST", { ambiente: environment }) as { imported?: number }; setMessage(`Consulta concluída: ${result.imported ?? 0} documento(s) importado(s).`); await refreshDocuments(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Sincronização indisponível."); } finally { setBusy(""); } }
  async function installCertificate(file: File, password: string) { setBusy("certificate"); setError(""); try { const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ""; bytes.forEach((byte) => { binary += String.fromCharCode(byte); }); await api("certificados", "POST", { ambiente: environment, pfx_base64: btoa(binary), senha: password }); setMessage("Certificado A1 instalado de forma criptografada."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha no certificado."); } finally { setBusy(""); } }
  async function startReceiving() { if (!selected) return; setBusy("receiving"); try { await api(`documentos/${selected.id}/conferencia`, "POST", {}); await open(selected.id); await refreshDocuments(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao iniciar conferência."); } finally { setBusy(""); } }
  async function resolve(id: string, decision: "ACCEPTED_SUGGESTION" | "KEPT_SOURCE") { setBusy(id); try { await api(`divergencias/${id}`, "PUT", { decisao: decision }); if (selected) await open(selected.id); } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha na decisão."); } finally { setBusy(""); } }
  async function complete() { if (!selected?.receiving) return; setBusy("complete"); try { await api(`conferencias/${selected.receiving.id}/concluir`, "POST", {}); setMessage("Entrada concluída, estoque e rastreabilidade fiscal atualizados."); await open(selected.id); await refreshDocuments(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao concluir."); } finally { setBusy(""); } }
  return <div className="dfe-center">
    <div className="report-metrics"><div className="report-metric warning"><span>Aguardando ação</span><strong>{counts.pending}</strong><small>Resumos, XMLs e conferências</small></div><div className="report-metric"><span>Em conferência</span><strong>{counts.conference}</strong><small>Recebimentos iniciados</small></div><div className="report-metric warning"><span>Alertas encontrados</span><strong>{counts.discrepancies}</strong><small>Não alteram o XML original</small></div><div className="report-metric success"><span>Entradas concluídas</span><strong>{counts.completed}</strong><small>Com lote e origem fiscal</small></div></div>
    <div className="dfe-toolbar"><label>Ambiente<select value={environment} onChange={(event) => setEnvironment(event.target.value)}><option value="HOMOLOGATION">Homologação</option><option value="PRODUCTION">Produção</option></select></label>{canWrite && <label className="dfe-file">{busy === "xml" ? "Importando…" : "Importar XML"}<input accept=".xml,text/xml" disabled={Boolean(busy)} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadXml(file); }} type="file"/></label>}{canConfigure && <button disabled={Boolean(busy)} onClick={sync} type="button">{busy === "sync" ? "Consultando…" : "Buscar na SEFAZ"}</button>}{canConfigure && <details><summary>Certificado A1</summary><CertificateForm busy={busy === "certificate"} onSubmit={installCertificate}/></details>}</div>
    {message && <p className="form-feedback">{message}</p>}{error && <p className="form-error">{error}</p>}
    <div className="dfe-layout"><article className="report-panel dfe-list-panel"><div className="panel-title"><div><span>DOCUMENTOS RECEBIDOS</span><h2>Fila de NF-e</h2></div><strong>{documents.length}</strong></div><div className="dfe-list">{documents.map((document) => <button aria-pressed={selected?.id === document.id} disabled={busy === document.id} key={document.id} onClick={() => open(document.id)} type="button"><span className={`status-pill ${document.status.toLowerCase()}`}>{labels[document.status] ?? document.status}</span><div><strong>{document.issuerName ?? "Emitente não identificado"}</strong><small>NF-e {document.documentNumber ?? "resumo"} · {date(document.issuedAt)} · {document._count.items} item(ns)</small></div><b>{brl.format(Number(document.totalAmount))}</b>{document._count.discrepancies > 0 && <i>{document._count.discrepancies} alerta(s)</i>}</button>)}</div></article>
      <article className="report-panel dfe-detail-panel">{!selected ? <div className="monitor-empty"><span>⇣</span><strong>Selecione uma NF-e</strong><p>Veja itens, divergências e o andamento da conferência física.</p></div> : <><div className="panel-title"><div><span>NF-e {selected.documentNumber ?? "SEM NÚMERO"}</span><h2>{selected.issuerName ?? "Emitente não identificado"}</h2></div><strong>{brl.format(Number(selected.totalAmount))}</strong></div><div className="dfe-key">{selected.accessKey ?? "Aguardando chave de acesso"}</div>
      {selected.discrepancies.length > 0 && <section className="dfe-discrepancies"><h3>Divergências e sugestões</h3>{selected.discrepancies.map((entry) => <div key={entry.id}><span>{entry.severity}</span><p><strong>{entry.field}: {entry.receivedValue ?? "vazio"} → {entry.suggestedValue ?? "revisão"}</strong>{entry.explanation}</p><b>{labels[entry.status] ?? entry.status}</b>{canWrite && entry.status === "OPEN" && <div><button disabled={busy === entry.id} onClick={() => resolve(entry.id, "ACCEPTED_SUGGESTION")} type="button">Aceitar sugestão</button><button className="quiet" disabled={busy === entry.id} onClick={() => resolve(entry.id, "KEPT_SOURCE")} type="button">Manter origem</button></div>}</div>)}</section>}
      {!selected.receiving && selected.documentType === "NFE" && canWrite && <button className="button dfe-start" disabled={Boolean(busy)} onClick={startReceiving} type="button">Iniciar conferência e registrar ciência</button>}
      {selected.receiving && <section className="dfe-receiving"><div className="dfe-section-title"><div><span>CONFERÊNCIA FÍSICA</span><h3>{labels[selected.receiving.status] ?? selected.receiving.status}</h3></div>{selected.receiving.status === "IN_PROGRESS" && canWrite && <button disabled={Boolean(busy)} onClick={complete} type="button">{busy === "complete" ? "Validando…" : "Concluir entrada"}</button>}</div>{selected.receiving.items.map((item) => { const source = selected.items.find((entry) => entry.id === item.documentItemId); return source ? <ReceivingItem receivingId={selected.receiving!.id} item={item} key={item.id} source={source} products={products} onSaved={() => open(selected.id)}/> : null; })}</section>}
      {!selected.receiving && <div className="dfe-items"><h3>Itens do XML</h3>{selected.items.map((item) => <div key={item.id}><span>{item.itemNumber}</span><p><strong>{item.description}</strong><small>NCM {item.ncm} · CFOP {item.cfop} · CST PIS/COFINS {item.cstPis ?? "--"}/{item.cstCofins ?? "--"}</small></p><b>{Number(item.quantity)} un.</b></div>)}</div>}</>}</article></div>
  </div>;
}

function CertificateForm({ busy, onSubmit }: { busy: boolean; onSubmit: (file: File, password: string) => void }) {
  const [file, setFile] = useState<File | null>(null); const [password, setPassword] = useState("");
  return <div className="dfe-certificate-form"><input accept=".pfx,.p12,application/x-pkcs12" onChange={(event) => setFile(event.target.files?.[0] ?? null)} type="file"/><input onChange={(event) => setPassword(event.target.value)} placeholder="Senha do certificado" type="password" value={password}/><button disabled={busy || !file} onClick={() => file && onSubmit(file, password)} type="button">{busy ? "Protegendo…" : "Instalar"}</button></div>;
}
