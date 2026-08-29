"use client";

import { useMemo, useState } from "react";

export type ControlProduct = { id: string; ean: string; name: string; activeIngredient: string; laboratory: string; active: boolean; controlLevel: string; requiresBuyerId: boolean; requiresPrescription: boolean; requiresPharmacist: boolean; retainsPrescription: boolean; minimumBuyerAge: number | null; controlRuleVersion: string | null; controlLegalBasis: string | null; controlMetadata: unknown };
export type PharmacistCredential = { id: string; council: string; registration: string; state: string; status: string; validFrom: string; validUntil: string | null; user: { id: string; name: string; email: string; status: string } };
export type SaleContext = { sellers: Array<{ id: string; name: string; email: string; role: string }>; pharmacists: Array<unknown> };
export type ControlledRecord = { id: string; controlLevel: string; buyerName: string | null; prescriptionNumber: string | null; prescriptionRetained: boolean; ruleVersion: string; createdAt: string; saleItem: { productName: string; ean: string; quantity: string | number }; sale: { soldAt: string; status: string; seller: { name: string } | null }; pharmacistCredential: { user: { name: string } } | null };

const levels = ["NONE", "PRESCRIPTION_PRESENTATION", "PRESCRIPTION_RETENTION", "SPECIAL_CONTROL"];
const levelLabel: Record<string, string> = { NONE: "Sem controle especial", PRESCRIPTION_PRESENTATION: "Apresentação de prescrição", PRESCRIPTION_RETENTION: "Retenção de prescrição", SPECIAL_CONTROL: "Controle especial parametrizado" };
const today = () => new Date().toISOString().slice(0, 10);
const date = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

async function controlApi(path: string, body: unknown) {
  const response = await fetch(`/api/portal/sale-control/${path}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) throw new Error(payload.message ?? "A alteração foi bloqueada.");
  return payload;
}

export function MedicineControlCenter({ context, credentials, products, records, role }: { context: SaleContext; credentials: PharmacistCredential[]; products: ControlProduct[]; records: ControlledRecord[]; role: string }) {
  const canManageProduct = ["OWNER", "ADMIN", "MANAGER", "PHARMACIST"].includes(role);
  const canManageCredential = ["OWNER", "ADMIN", "MANAGER"].includes(role);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const product = useMemo(() => products.find((item) => item.id === productId), [productId, products]);
  const [level, setLevel] = useState(products[0]?.controlLevel ?? "NONE"); const [buyer, setBuyer] = useState(products[0]?.requiresBuyerId ?? false); const [prescription, setPrescription] = useState(products[0]?.requiresPrescription ?? false); const [pharmacist, setPharmacist] = useState(products[0]?.requiresPharmacist ?? false); const [retain, setRetain] = useState(products[0]?.retainsPrescription ?? false); const [age, setAge] = useState(products[0]?.minimumBuyerAge === null || products[0]?.minimumBuyerAge === undefined ? "" : String(products[0].minimumBuyerAge)); const [version, setVersion] = useState(products[0]?.controlRuleVersion ?? ""); const [legalBasis, setLegalBasis] = useState(products[0]?.controlLegalBasis ?? "");
  const pharmacistMembers = context.sellers.filter((member) => member.role === "PHARMACIST");
  const firstCredential = credentials.find((item) => item.user.id === pharmacistMembers[0]?.id);
  const [userId, setUserId] = useState(pharmacistMembers[0]?.id ?? ""); const [council, setCouncil] = useState(firstCredential?.council ?? "CRF"); const [registration, setRegistration] = useState(firstCredential?.registration ?? ""); const [state, setState] = useState(firstCredential?.state ?? ""); const [credentialStatus, setCredentialStatus] = useState(firstCredential?.status ?? "DRAFT"); const [validFrom, setValidFrom] = useState(firstCredential?.validFrom.slice(0, 10) ?? today()); const [validUntil, setValidUntil] = useState(firstCredential?.validUntil?.slice(0, 10) ?? "");
  const [busy, setBusy] = useState(""); const [message, setMessage] = useState(""); const [error, setError] = useState("");

  function selectProduct(id: string) {
    setProductId(id); const selected = products.find((item) => item.id === id); if (!selected) return;
    setLevel(selected.controlLevel); setBuyer(selected.requiresBuyerId); setPrescription(selected.requiresPrescription); setPharmacist(selected.requiresPharmacist); setRetain(selected.retainsPrescription); setAge(selected.minimumBuyerAge === null ? "" : String(selected.minimumBuyerAge)); setVersion(selected.controlRuleVersion ?? ""); setLegalBasis(selected.controlLegalBasis ?? "");
  }
  function selectPharmacist(id: string) {
    setUserId(id); const selected = credentials.find((item) => item.user.id === id);
    setCouncil(selected?.council ?? "CRF"); setRegistration(selected?.registration ?? ""); setState(selected?.state ?? ""); setCredentialStatus(selected?.status ?? "DRAFT"); setValidFrom(selected?.validFrom.slice(0, 10) ?? today()); setValidUntil(selected?.validUntil?.slice(0, 10) ?? "");
  }

  async function saveProduct() {
    if (!product) return; setBusy("product"); setError(""); setMessage("");
    try { await controlApi(`produtos/${product.id}/politica`, { nivel: level, identificar_comprador: buyer, exigir_prescricao: prescription, exigir_farmaceutico: pharmacist, reter_prescricao: retain, idade_minima: age ? Number(age) : null, versao_regra: level === "NONE" ? null : version, base_legal: level === "NONE" ? null : legalBasis, metadata: {} }); setMessage("Política do produto salva com auditoria. Recarregue para conferir a versão persistida."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao salvar política."); } finally { setBusy(""); }
  }
  async function saveCredential() {
    if (!userId) return; setBusy("credential"); setError(""); setMessage("");
    try { await controlApi(`farmaceuticos/${userId}`, { conselho: council, registro: registration, uf: state.toUpperCase(), status: credentialStatus, vigencia_inicio: validFrom, vigencia_fim: validUntil || null }); setMessage("Credencial farmacêutica registrada. A venda usará somente credenciais verificadas e vigentes."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao salvar credencial."); } finally { setBusy(""); }
  }

  return <div className="medicine-control-center">
    <div className="report-metrics"><div className="report-metric"><span>Produtos</span><strong>{products.length}</strong><small>{products.filter((item) => item.controlLevel !== "NONE").length} com política de controle</small></div><div className="report-metric"><span>Farmacêuticos</span><strong>{credentials.length}</strong><small>{credentials.filter((item) => item.status === "VERIFIED").length} verificados</small></div><div className="report-metric"><span>Registros auditáveis</span><strong>{records.length}</strong><small>Últimas vendas controladas</small></div><div className="report-metric warning"><span>Regra essencial</span><strong>Humana</strong><small>Nenhum enquadramento é inferido só pelo NCM</small></div></div>
    {message && <p className="form-feedback">{message}</p>}{error && <p className="form-error">{error}</p>}
    <div className="medicine-control-grid">
      <article className="report-panel medicine-policy"><div className="panel-title"><div><span>REQUISITOS POR PRODUTO</span><h2>Política de dispensação</h2></div><strong>Versionada</strong></div><label>Produto<select value={productId} onChange={(event) => selectProduct(event.target.value)}>{products.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.ean}</option>)}</select></label><div className="medicine-form-grid"><label>Nível<select value={level} onChange={(event) => setLevel(event.target.value)}>{levels.map((item) => <option key={item} value={item}>{levelLabel[item]}</option>)}</select></label><label>Idade mínima<input min="0" max="130" type="number" value={age} onChange={(event) => setAge(event.target.value)}/></label><label>Versão da regra<input disabled={level === "NONE"} value={version} onChange={(event) => setVersion(event.target.value)}/></label></div><div className="medicine-checks"><label><input checked={buyer} type="checkbox" onChange={(event) => setBuyer(event.target.checked)}/>Identificar comprador</label><label><input checked={prescription} type="checkbox" onChange={(event) => { setPrescription(event.target.checked); if (!event.target.checked) setRetain(false); }}/>Exigir prescrição</label><label><input checked={pharmacist} type="checkbox" onChange={(event) => setPharmacist(event.target.checked)}/>Exigir farmacêutico</label><label><input checked={retain} type="checkbox" onChange={(event) => { setRetain(event.target.checked); if (event.target.checked) setPrescription(true); }}/>Confirmar retenção</label></div><label>Fundamento legal e escopo<textarea disabled={level === "NONE"} placeholder="Fonte, ato, versão, vigência e escopo revisados pelo responsável." value={legalBasis} onChange={(event) => setLegalBasis(event.target.value)}/></label><button disabled={!canManageProduct || busy === "product" || !product} onClick={saveProduct} type="button">{busy === "product" ? "Validando…" : "Salvar política"}</button></article>
      <article className="report-panel pharmacist-policy"><div className="panel-title"><div><span>RESPONSABILIDADE PROFISSIONAL</span><h2>Credencial farmacêutica</h2></div><strong>Vigência</strong></div><label>Usuário farmacêutico<select value={userId} onChange={(event) => selectPharmacist(event.target.value)}><option value="">Selecione</option>{pharmacistMembers.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.email}</option>)}</select></label><div className="medicine-form-grid"><label>Conselho<input value={council} onChange={(event) => setCouncil(event.target.value)}/></label><label>Registro<input value={registration} onChange={(event) => setRegistration(event.target.value)}/></label><label>UF<input maxLength={2} value={state} onChange={(event) => setState(event.target.value.toUpperCase())}/></label><label>Status<select value={credentialStatus} onChange={(event) => setCredentialStatus(event.target.value)}><option value="DRAFT">Rascunho</option><option value="VERIFIED">Verificada</option><option value="SUSPENDED">Suspensa</option><option value="EXPIRED">Expirada</option></select></label><label>Início<input type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)}/></label><label>Fim<input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)}/></label></div><p className="medicine-notice">Somente um gestor pode verificar a credencial. O perfil do usuário também precisa continuar ativo como farmacêutico.</p><button disabled={!canManageCredential || busy === "credential" || !userId} onClick={saveCredential} type="button">{busy === "credential" ? "Validando…" : "Salvar credencial"}</button></article>
    </div>
    <article className="report-panel controlled-records"><div className="panel-title"><div><span>TRILHA IMUTÁVEL</span><h2>Vendas controladas recentes</h2></div><strong>{records.length}</strong></div>{records.length === 0 ? <p className="post-sale-empty">Nenhuma venda controlada registrada.</p> : records.map((record) => <div key={record.id}><span className="status-pill pending">{levelLabel[record.controlLevel] ?? record.controlLevel}</span><p><strong>{record.saleItem.productName} · {record.saleItem.quantity} un.</strong><small>{date(record.sale.soldAt)} · vendedor {record.sale.seller?.name ?? "legado"} · farmacêutico {record.pharmacistCredential?.user.name ?? "não exigido"}</small></p><div><b>{record.buyerName ?? "Comprador não exigido"}</b><small>{record.prescriptionNumber ? `Prescrição ${record.prescriptionNumber}${record.prescriptionRetained ? " · retida" : ""}` : `Regra ${record.ruleVersion}`}</small></div></div>)}</article>
  </div>;
}
