"use client";

import { useMemo, useState } from "react";

type NfceConfiguration = {
  environment: "HOMOLOGATION" | "PRODUCTION"; state: string; series: number; qrCodeVersion: number;
  cscIdentifier: string | null; cscConfigured: boolean; authorizationUrl: string | null; statusServiceUrl: string | null;
  eventUrl: string | null; qrCodeBaseUrl: string | null; consultationUrl: string | null;
  officialSchemaVersion: string | null; homologatedAt: string | null; active: boolean;
};
type CatalogRelease = {
  id: string; catalog: string; sourceVersion: string; sourceUrl: string; sourcePublishedAt: string | null;
  payloadHash: string | null; itemCount: number; status: string; notes: string | null; _count: { entries: number };
};
export type NfceCatalogGroup = { catalog: string; active: CatalogRelease | null; releases: CatalogRelease[] };
export type NfceReadiness = {
  localDraftReady: boolean; operationalReady: boolean; transmissionReady: boolean; productionPreparationEnabled: boolean;
  sefazTransmissionEnabled: boolean; officialXsdValidationEnabled: boolean; digitalSignatureEnabled: boolean;
  schemaVersion: string; environment: string; companyState: string | null; configuration: NfceConfiguration | null;
  certificate: { fingerprint: string; validUntil: string } | null;
  catalogs: Array<{ catalog: string; release: { sourceVersion: string; sourcePublishedAt: string | null; itemCount: number } | null }>;
  stages: Array<{ code: string; label: string; ready: boolean; detail: string }>; requirements: string[]; pendingExternal: string[];
};
export type NfceSale = {
  id: string; soldAt: string; grossAmount: number; taxAmount: number; _count: { items: number };
  nfceDocuments: Array<{ id: string; environment: string; status: string; series: number; number: number; accessKey: string }>;
};
export type NfceDocumentSummary = {
  id: string; saleId: string; environment: string; emissionType: string; status: string; schemaVersion: string;
  series: number; number: number; accessKey: string; issuedAt: string; paymentMethod: string; payloadHash: string;
  sale: { grossAmount: number; taxAmount: number; _count: { items: number } }; _count: { transmissions: number };
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const date = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(value)) : "data não informada";
const statusLabels: Record<string, string> = { VALIDATED: "Validado localmente", TRANSMISSION_BLOCKED: "Transmissão bloqueada", AUTHORIZED: "Autorizado", REJECTED: "Rejeitado", CANCELLED: "Cancelado", DRAFT: "Rascunho" };
const paymentLabels: Record<string, string> = { "01": "Dinheiro", "03": "Cartão de crédito", "04": "Cartão de débito", "17": "PIX", "99": "Outros" };
const catalogLabels: Record<string, string> = { CCLASS_TRIB: "cClassTrib", ALIQUOTAS_CBS: "Alíquotas CBS", MEIOS_PAGAMENTO: "Meios de pagamento" };

async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`/api/portal/nfce/${path}`, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => ({})) as { erro?: string; message?: string; validacoes?: Array<{ message: string }> };
  if (!response.ok) throw new Error(payload.validacoes?.map((item) => item.message).join(" ") || payload.erro?.replaceAll("_", " ") || payload.message || "Não foi possível concluir a operação.");
  return payload;
}

function configForm(readiness: NfceReadiness | null) {
  const current = readiness?.configuration;
  return {
    state: current?.state ?? readiness?.companyState ?? "", series: String(current?.series ?? 1), qrCodeVersion: String(current?.qrCodeVersion ?? 3),
    cscIdentifier: current?.cscIdentifier ?? "", cscSecret: "", authorizationUrl: current?.authorizationUrl ?? "",
    statusServiceUrl: current?.statusServiceUrl ?? "", eventUrl: current?.eventUrl ?? "", qrCodeBaseUrl: current?.qrCodeBaseUrl ?? "",
    consultationUrl: current?.consultationUrl ?? "", officialSchemaVersion: current?.officialSchemaVersion ?? "",
  };
}

export function NfceCenter({ catalogs, initialDocuments, readiness: initialReadiness, role, sales }: { catalogs: NfceCatalogGroup[]; initialDocuments: NfceDocumentSummary[]; readiness: NfceReadiness | null; role: string; sales: NfceSale[] }) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [readiness, setReadiness] = useState(initialReadiness);
  const [form, setForm] = useState(() => configForm(initialReadiness));
  const [showConfiguration, setShowConfiguration] = useState(false);
  const [saleId, setSaleId] = useState(sales[0]?.id ?? "");
  const [emissionType, setEmissionType] = useState("NORMAL"); const [series, setSeries] = useState(String(initialReadiness?.configuration?.series ?? 1));
  const [payment, setPayment] = useState("01"); const [taxId, setTaxId] = useState("");
  const [busy, setBusy] = useState(""); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const canWrite = role !== "VIEWER"; const canConfigure = ["OWNER", "ADMIN", "MANAGER"].includes(role);
  const counts = useMemo(() => ({ validated: documents.filter((item) => item.status === "VALIDATED").length, blocked: documents.filter((item) => item.status === "TRANSMISSION_BLOCKED").length, contingency: documents.filter((item) => item.emissionType === "OFFLINE_CONTINGENCY").length }), [documents]);
  async function refresh() { setDocuments(await api("documentos?limite=100") as unknown as NfceDocumentSummary[]); }
  async function refreshReadiness() { setReadiness(await api("prontidao?ambiente=HOMOLOGATION") as unknown as NfceReadiness); }
  async function prepare() {
    if (!saleId) return; setBusy("prepare"); setError(""); setMessage("");
    try {
      const result = await api(`vendas/${saleId}/preparar`, "POST", { ambiente: "HOMOLOGATION", tipo_emissao: emissionType, serie: Number(series), meio_pagamento: payment, documento_consumidor: taxId || null }) as { idempotent?: boolean };
      setMessage(result.idempotent ? "O rascunho homologatório desta venda já existia; nenhum número novo foi consumido." : "Rascunho homologatório preparado, numerado e protegido por hash."); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao preparar NFC-e."); } finally { setBusy(""); }
  }
  async function transmit(id: string) {
    setBusy(id); setError(""); setMessage("");
    try { await api(`documentos/${id}/transmitir`, "POST", {}); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Transmissão bloqueada."); await refresh(); }
    finally { setBusy(""); }
  }
  async function saveConfiguration() {
    setBusy("configuration"); setError(""); setMessage("");
    try {
      await api("configuracao", "PUT", {
        ambiente: "HOMOLOGATION", uf: form.state.toUpperCase(), serie: Number(form.series), versao_qrcode: Number(form.qrCodeVersion),
        identificador_csc: form.cscIdentifier || null, segredo_csc: form.cscSecret || null,
        url_autorizacao: form.authorizationUrl || null, url_status: form.statusServiceUrl || null, url_evento: form.eventUrl || null,
        url_qrcode: form.qrCodeBaseUrl || null, url_consulta: form.consultationUrl || null,
        versao_schema_oficial: form.officialSchemaVersion || null, ativa: true,
      });
      await refreshReadiness(); setMessage("Configuração homologatória salva com segredo protegido e trilha de auditoria."); setShowConfiguration(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao salvar a configuração."); } finally { setBusy(""); }
  }
  return <div className="nfce-center">
    <div className="report-metrics"><div className={`report-metric ${readiness?.operationalReady ? "success" : "warning"}`}><span>Prontidão operacional</span><strong>{readiness?.operationalReady ? "Pronta" : "Pendente"}</strong><small>Configuração, certificado e catálogos</small></div><div className="report-metric"><span>Validados</span><strong>{counts.validated}</strong><small>Snapshot e chave preservados</small></div><div className="report-metric warning"><span>Bloqueios seguros</span><strong>{counts.blocked}</strong><small>Tentativas auditadas</small></div><div className="report-metric"><span>Contingência</span><strong>{counts.contingency}</strong><small>Rascunhos offline</small></div></div>
    <div className="nfce-safety"><div><strong>Ambiente controlado · {readiness?.schemaVersion ?? "local"}</strong><span>Assinatura, XSD oficial e autorização continuam bloqueados até a homologação completa.</span></div>{canConfigure && <button onClick={() => setShowConfiguration((value) => !value)} type="button">{showConfiguration ? "Fechar configuração" : "Configurar homologação"}</button>}</div>
    {message && <p className="form-feedback">{message}</p>}{error && <p className="form-error">{error}</p>}
    <div className="nfce-governance">
      <article className="report-panel nfce-readiness"><div className="panel-title"><div><span>CHECKLIST TÉCNICO</span><h2>Prontidão da emissão</h2></div><strong>{readiness?.stages.filter((item) => item.ready).length ?? 0}/{readiness?.stages.length ?? 0}</strong></div><div className="nfce-stage-list">{readiness?.stages.map((stage) => <section className={stage.ready ? "ready" : "pending"} key={stage.code}><b>{stage.ready ? "✓" : "!"}</b><span><strong>{stage.label}</strong><small>{stage.detail}</small></span></section>)}</div></article>
      <article className="report-panel nfce-catalogs"><div className="panel-title"><div><span>VERSÕES OFICIAIS</span><h2>Catálogos fiscais</h2></div><strong>{catalogs.filter((group) => group.active).length}/{catalogs.length}</strong></div><div>{catalogs.map((group) => { const latest = group.active ?? group.releases[0]; return <section key={group.catalog}><span className={`status-pill ${group.active ? "authorized" : "draft"}`}>{group.active ? "Ativo" : latest ? "Revisão pendente" : "Ausente"}</span><div><strong>{catalogLabels[group.catalog] ?? group.catalog}</strong><small>{latest ? `${latest.sourceVersion} · ${date(latest.sourcePublishedAt)} · ${latest.itemCount} itens` : "Nenhuma publicação registrada"}</small>{latest && <a href={latest.sourceUrl} rel="noreferrer" target="_blank">Abrir fonte oficial ↗</a>}</div></section>; })}</div><p>Publicações descobertas não entram no cálculo. Somente uma versão importada, comparada e aprovada internamente pode ficar ativa.</p></article>
    </div>
    {showConfiguration && <article className="report-panel nfce-configuration"><div className="panel-title"><div><span>AMBIENTE DE HOMOLOGAÇÃO</span><h2>Autorizador e QR Code</h2></div><strong>Segredos não retornam pela API</strong></div><div className="nfce-config-grid"><label>UF<input maxLength={2} value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value.toUpperCase() })}/></label><label>Série<input min="1" max="999" type="number" value={form.series} onChange={(event) => setForm({ ...form, series: event.target.value })}/></label><label>QR Code<select value={form.qrCodeVersion} onChange={(event) => setForm({ ...form, qrCodeVersion: event.target.value })}><option value="3">Versão 3 — sem CSC</option><option value="2">Versão 2 — com CSC</option></select></label><label>Leiaute/XSD oficial<input placeholder="Ex.: 4.00 + NT vigente" value={form.officialSchemaVersion} onChange={(event) => setForm({ ...form, officialSchemaVersion: event.target.value })}/></label>{form.qrCodeVersion === "2" && <><label>ID CSC<input value={form.cscIdentifier} onChange={(event) => setForm({ ...form, cscIdentifier: event.target.value })}/></label><label>CSC {readiness?.configuration?.cscConfigured && <small>já protegido</small>}<input type="password" value={form.cscSecret} onChange={(event) => setForm({ ...form, cscSecret: event.target.value })}/></label></>}<label className="wide">URL de autorização<input placeholder="https://..." value={form.authorizationUrl} onChange={(event) => setForm({ ...form, authorizationUrl: event.target.value })}/></label><label className="wide">URL de status<input placeholder="https://..." value={form.statusServiceUrl} onChange={(event) => setForm({ ...form, statusServiceUrl: event.target.value })}/></label><label className="wide">URL do QR Code<input placeholder="https://..." value={form.qrCodeBaseUrl} onChange={(event) => setForm({ ...form, qrCodeBaseUrl: event.target.value })}/></label><label className="wide">URL de consulta pública<input placeholder="https://..." value={form.consultationUrl} onChange={(event) => setForm({ ...form, consultationUrl: event.target.value })}/></label><label className="wide">URL de eventos <small>(opcional nesta etapa)</small><input placeholder="https://..." value={form.eventUrl} onChange={(event) => setForm({ ...form, eventUrl: event.target.value })}/></label></div><button disabled={busy === "configuration"} onClick={saveConfiguration} type="button">{busy === "configuration" ? "Protegendo…" : "Salvar configuração homologatória"}</button></article>}
    <div className="nfce-layout">
      <article className="report-panel nfce-form"><div className="panel-title"><div><span>PREPARAÇÃO</span><h2>Nova NFC-e homologatória</h2></div><strong>Modelo 65</strong></div><label>Venda concluída<select value={saleId} onChange={(event) => setSaleId(event.target.value)}><option value="">Selecione</option>{sales.map((sale) => <option key={sale.id} value={sale.id}>{dateTime(sale.soldAt)} · {sale._count.items} item(ns) · {brl.format(Number(sale.grossAmount))}</option>)}</select></label><div className="nfce-fields"><label>Emissão<select value={emissionType} onChange={(event) => setEmissionType(event.target.value)}><option value="NORMAL">Normal</option><option value="OFFLINE_CONTINGENCY">Contingência offline</option></select></label><label>Série<input min="1" max="999" type="number" value={series} onChange={(event) => setSeries(event.target.value)}/></label></div><label>Meio de pagamento<select value={payment} onChange={(event) => setPayment(event.target.value)}>{Object.entries(paymentLabels).map(([code, label]) => <option key={code} value={code}>{code} · {label}</option>)}</select></label><label>CPF/CNPJ do consumidor <small>(opcional)</small><input inputMode="numeric" maxLength={18} placeholder="Somente se informado pelo cliente" value={taxId} onChange={(event) => setTaxId(event.target.value)}/></label><button disabled={!canWrite || !saleId || busy === "prepare"} onClick={prepare} type="button">{busy === "prepare" ? "Validando…" : "Preparar rascunho seguro"}</button>{!readiness?.localDraftReady && <div className="nfce-requirements"><strong>Complete antes de preparar</strong><ul>{readiness?.requirements.map((item) => <li key={item}>{item}</li>)}</ul></div>}</article>
      <article className="report-panel nfce-list"><div className="panel-title"><div><span>TRILHA DE EMISSÃO</span><h2>Documentos preparados</h2></div><strong>{documents.length}</strong></div><div>{documents.length === 0 ? <div className="monitor-empty"><span>▤</span><strong>Nenhum rascunho</strong><p>Selecione uma venda concluída para iniciar.</p></div> : documents.map((document) => <section key={document.id}><span className={`status-pill ${document.status.toLowerCase()}`}>{statusLabels[document.status] ?? document.status}</span><div><strong>NFC-e {document.series}/{document.number}</strong><small>{dateTime(document.issuedAt)} · {document.sale._count.items} item(ns) · {brl.format(Number(document.sale.grossAmount))}</small><code>{document.accessKey}</code></div><aside><a href={`/api/portal/nfce/documentos/${document.id}/xml`}>XML local</a>{canWrite && <button disabled={busy === document.id} onClick={() => transmit(document.id)} type="button">Testar bloqueio</button>}</aside></section>)}</div></article>
    </div>
  </div>;
}
