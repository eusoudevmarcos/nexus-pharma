"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type PrivacyRequest = { id: string; protocol: string; type: string; status: string; details: string | null; dueAt: string; resolutionSummary: string | null; retentionReason: string | null; completedAt: string | null; createdAt: string; updatedAt: string };

const types: Record<string, string> = {
  CONFIRMATION_ACCESS: "Confirmação e acesso",
  CORRECTION: "Correção dos dados",
  ANONYMIZATION_BLOCK_DELETION: "Anonimização, bloqueio ou eliminação",
  PORTABILITY: "Portabilidade",
  CONSENT_REVOCATION: "Revogação de consentimento",
  DATA_SHARING_INFO: "Informações de compartilhamento",
  AUTOMATED_DECISION_REVIEW: "Revisão de decisão automatizada",
};
const statuses: Record<string, string> = { RECEIVED: "Recebida", IDENTITY_CHECK: "Verificando identidade", IN_PROGRESS: "Em análise", WAITING_LEGAL_REVIEW: "Revisão legal", COMPLETED: "Concluída", REJECTED: "Não atendida", CANCELLED: "Cancelada" };
const date = (value: string) => new Intl.DateTimeFormat("pt-BR").format(new Date(value));

export function PrivacyCenter({ requests }: { requests: PrivacyRequest[] }) {
  const router = useRouter();
  const [type, setType] = useState("CONFIRMATION_ACCESS");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    const response = await fetch("/api/portal/privacy/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tipo: type, detalhes: details || undefined }) });
    if (response.ok) { setDetails(""); setMessage("Solicitação registrada. O protocolo já aparece abaixo."); router.refresh(); }
    else { const body = await response.json().catch(() => ({})) as { message?: string }; setMessage(body.message ?? "Não foi possível registrar a solicitação."); }
    setBusy(false);
  }
  return <div className="privacy-center"><div className="privacy-notice"><span>i</span><div><strong>Resposta rastreável e sem custo</strong><p>O prazo mostrado é o SLA operacional máximo. Pedidos simples de confirmação e acesso podem ser respondidos antes. Exclusões passam por análise de obrigações legais de retenção.</p></div></div><div className="privacy-grid"><article className="report-panel privacy-form-panel"><div className="panel-title"><div><span>NOVA SOLICITAÇÃO</span><h2>Exercer um direito</h2></div></div><form onSubmit={submit}><label>Tipo de solicitação<select value={type} onChange={(event) => setType(event.target.value)}>{Object.entries(types).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Contexto para análise<textarea maxLength={4000} onChange={(event) => setDetails(event.target.value)} placeholder="Explique o que precisa ser localizado, corrigido ou revisado." rows={5} value={details}/></label><button disabled={busy} type="submit">{busy ? "Registrando..." : "Gerar protocolo"}</button>{message && <p className="form-feedback">{message}</p>}</form></article><article className="report-panel privacy-list-panel"><div className="panel-title"><div><span>ACOMPANHAMENTO</span><h2>Meus protocolos</h2></div><strong>{requests.length}</strong></div><div className="privacy-request-list">{requests.length ? requests.map((item) => <div className="privacy-request-row" key={item.id}><div><code>{item.protocol}</code><strong>{types[item.type] ?? item.type}</strong><small>Aberta em {date(item.createdAt)} · prazo operacional {date(item.dueAt)}</small></div><span className={`status-pill ${["COMPLETED"].includes(item.status) ? "active" : ["REJECTED", "CANCELLED"].includes(item.status) ? "suspended" : "pending"}`}>{statuses[item.status] ?? item.status}</span>{item.resolutionSummary && <p>{item.resolutionSummary}</p>}{item.retentionReason && <small className="retention-reason">Retenção: {item.retentionReason}</small>}</div>) : <div className="monitor-empty"><span>◇</span><strong>Nenhum protocolo aberto</strong><p>Use o formulário ao lado quando precisar exercer um direito sobre seus dados.</p></div>}</div></article></div></div>;
}
