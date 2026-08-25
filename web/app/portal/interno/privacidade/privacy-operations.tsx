"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type InternalPrivacyRequest = { id: string; protocol: string; type: string; status: string; details: string | null; dueAt: string; resolutionSummary: string | null; retentionReason: string | null; completedAt: string | null; createdAt: string; company: { tradeName: string }; subject: { name: string; email: string }; handledBy: { name: string } | null };
type RecoveryDrill = { id: string; status: string; environment: string; backupReference: string | null; objective: string; scheduledAt: string; startedAt: string | null; completedAt: string | null; rpoMinutes: number | null; rtoMinutes: number | null; notes: string | null; performedBy: { name: string } | null };
export type PrivacyOperationsReport = { generatedAt: string; indicators: { open: number; dueSoon: number; overdue: number; completed: number }; requests: InternalPrivacyRequest[]; drills: RecoveryDrill[]; recovery: { declaredMode: "NONE" | "PITR"; declaredWindowDays: number; configured: boolean; recentPassedDrill: boolean; productionReady: boolean } };

const requestTypes: Record<string, string> = { CONFIRMATION_ACCESS: "Acesso", CORRECTION: "Correção", ANONYMIZATION_BLOCK_DELETION: "Anonimização / exclusão", PORTABILITY: "Portabilidade", CONSENT_REVOCATION: "Revogação", DATA_SHARING_INFO: "Compartilhamento", AUTOMATED_DECISION_REVIEW: "Decisão automatizada" };
const requestStatuses: Record<string, string> = { RECEIVED: "Recebida", IDENTITY_CHECK: "Validar identidade", IN_PROGRESS: "Em análise", WAITING_LEGAL_REVIEW: "Revisão legal", COMPLETED: "Concluída", REJECTED: "Não atendida", CANCELLED: "Cancelada" };
const drillStatuses: Record<string, string> = { SCHEDULED: "Agendado", RUNNING: "Em execução", PASSED: "Aprovado", FAILED: "Falhou", CANCELLED: "Cancelado" };
const terminal = new Set(["COMPLETED", "REJECTED", "CANCELLED"]);
const dateTime = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

function RequestRow({ item }: { item: InternalPrivacyRequest }) {
  const router = useRouter();
  const [status, setStatus] = useState(item.status === "RECEIVED" ? "IN_PROGRESS" : item.status);
  const [summary, setSummary] = useState(item.resolutionSummary ?? "");
  const [retention, setRetention] = useState(item.retentionReason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true); setError("");
    const response = await fetch(`/api/portal/internal/privacy/requests/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, resumo: summary || undefined, motivo_retencao: retention || undefined }) });
    if (response.ok) router.refresh(); else { const body = await response.json().catch(() => ({})) as { message?: string }; setError(body.message ?? "Falha ao atualizar."); }
    setBusy(false);
  }
  const overdue = !terminal.has(item.status) && new Date(item.dueAt) < new Date();
  return <div className={`privacy-admin-row ${overdue ? "overdue" : ""}`}><div className="privacy-admin-identity"><code>{item.protocol}</code><strong>{item.subject.name}</strong><small>{item.subject.email} · {item.company.tradeName}</small><b>{requestTypes[item.type] ?? item.type}</b><span>Prazo {dateTime(item.dueAt)}</span>{item.details && <p>{item.details}</p>}</div><div className="privacy-admin-resolution"><select disabled={terminal.has(item.status)} value={status} onChange={(event) => setStatus(event.target.value)}>{Object.entries(requestStatuses).filter(([value]) => value !== "RECEIVED").map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><textarea disabled={terminal.has(item.status)} onChange={(event) => setSummary(event.target.value)} placeholder="Conclusão ou providência adotada" rows={2} value={summary}/>{item.type === "ANONYMIZATION_BLOCK_DELETION" && <textarea disabled={terminal.has(item.status)} onChange={(event) => setRetention(event.target.value)} placeholder="Base/motivo de retenção, quando aplicável" rows={2} value={retention}/>}<button disabled={busy || terminal.has(item.status)} onClick={save} type="button">{busy ? "Salvando..." : terminal.has(item.status) ? requestStatuses[item.status] : "Atualizar protocolo"}</button>{error && <small className="form-error">{error}</small>}</div></div>;
}

function DrillRow({ drill }: { drill: RecoveryDrill }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rpo, setRpo] = useState("");
  const [rto, setRto] = useState("");
  const [notes, setNotes] = useState("");
  async function update(status: "RUNNING" | "PASSED" | "FAILED") {
    setBusy(true);
    const payload = status === "PASSED" ? { status, rpo_minutos: Number(rpo), rto_minutos: Number(rto), verificacoes: [{ item: "Integridade e acesso ao banco restaurado", resultado: "PASS" }], observacoes: notes || "Validação manual registrada pelo responsável." } : status === "FAILED" ? { status, observacoes: notes } : { status };
    const response = await fetch(`/api/portal/internal/privacy/drills/${drill.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    if (response.ok) router.refresh();
    setBusy(false);
  }
  const closed = ["PASSED", "FAILED", "CANCELLED"].includes(drill.status);
  return <div className="recovery-drill-row"><span className={`recovery-signal ${drill.status.toLowerCase()}`}/><div><strong>{drill.objective}</strong><small>{drill.environment} · {dateTime(drill.scheduledAt)}</small><p>{drill.backupReference ? `Referência: ${drill.backupReference}` : "Referência será registrada na execução"}</p></div><span className={`status-pill ${drill.status === "PASSED" ? "active" : drill.status === "FAILED" ? "suspended" : "pending"}`}>{drillStatuses[drill.status] ?? drill.status}</span>{!closed && <div className="recovery-evidence"><input aria-label="RPO observado em minutos" min="0" onChange={(event) => setRpo(event.target.value)} placeholder="RPO min" type="number" value={rpo}/><input aria-label="RTO observado em minutos" min="0" onChange={(event) => setRto(event.target.value)} placeholder="RTO min" type="number" value={rto}/><input aria-label="Observações do teste" onChange={(event) => setNotes(event.target.value)} placeholder="Evidência ou falha observada" value={notes}/><div className="recovery-actions">{drill.status === "SCHEDULED" && <button disabled={busy} onClick={() => update("RUNNING")} type="button">Iniciar</button>}<button disabled={busy || rpo === "" || rto === ""} onClick={() => update("PASSED")} type="button">Validar</button><button className="danger" disabled={busy || notes.trim().length < 10} onClick={() => update("FAILED")} type="button">Falhou</button></div></div>}{closed && <small>{drill.rpoMinutes !== null ? `RPO ${drill.rpoMinutes} min · RTO ${drill.rtoMinutes} min` : drill.notes}</small>}</div>;
}

export function PrivacyOperations({ report }: { report: PrivacyOperationsReport }) {
  const router = useRouter();
  const [objective, setObjective] = useState("Validar restauração isolada do banco e integridade das operações críticas");
  const [scheduledAt, setScheduledAt] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  async function schedule(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    const response = await fetch("/api/portal/internal/privacy/drills", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ambiente: "staging-isolado", objetivo: objective, agendado_para: scheduledAt, referencia_backup: reference || undefined }) });
    if (response.ok) { setScheduledAt(""); setReference(""); router.refresh(); }
    setBusy(false);
  }
  return <div className="privacy-operations"><div className={`recovery-readiness ${report.recovery.productionReady ? "ready" : "blocked"}`}><span>{report.recovery.productionReady ? "✓" : "!"}</span><div><strong>{report.recovery.productionReady ? "Recuperação pronta para produção" : "Recuperação ainda bloqueia o go-live"}</strong><p>{report.recovery.configured ? `PITR declarado por ${report.recovery.declaredWindowDays} dia(s).` : "Nenhuma restauração gerenciada está declarada na infraestrutura."} {report.recovery.recentPassedDrill ? "Há teste aprovado nos últimos 90 dias." : "Falta um teste aprovado nos últimos 90 dias."}</p></div></div><article className="report-panel full privacy-queue-panel"><div className="panel-title"><div><span>FILA LGPD</span><h2>Solicitações dos titulares</h2></div><strong>{report.requests.length}</strong></div><div className="privacy-admin-list">{report.requests.length ? report.requests.map((item) => <RequestRow item={item} key={item.id}/>) : <div className="monitor-empty"><span>✓</span><strong>Fila vazia</strong><p>Novos protocolos aparecerão aqui com prazo e titular identificados.</p></div>}</div></article><div className="privacy-dr-grid"><article className="report-panel recovery-form-panel"><div className="panel-title"><div><span>CONTINUIDADE</span><h2>Agendar teste</h2></div></div><form onSubmit={schedule}><label>Objetivo<textarea required minLength={10} onChange={(event) => setObjective(event.target.value)} rows={3} value={objective}/></label><label>Data e hora<input required type="datetime-local" onChange={(event) => setScheduledAt(event.target.value)} value={scheduledAt}/></label><label>Referência do backup<input maxLength={200} onChange={(event) => setReference(event.target.value)} placeholder="ID ou exportação; nunca uma senha" value={reference}/></label><button disabled={busy} type="submit">{busy ? "Agendando..." : "Agendar teste"}</button></form></article><article className="report-panel recovery-list-panel"><div className="panel-title"><div><span>EVIDÊNCIAS</span><h2>Testes de restauração</h2></div><strong>{report.drills.length}</strong></div><div className="recovery-drill-list">{report.drills.length ? report.drills.map((drill) => <DrillRow drill={drill} key={drill.id}/>) : <div className="monitor-empty"><span>◇</span><strong>Nenhum teste registrado</strong><p>Agende o primeiro ensaio em ambiente isolado.</p></div>}</div></article></div></div>;
}
