"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type SecuritySession = { id: string; userAgent: string | null; ipAddress: string | null; expiresAt: string; lastSeenAt: string; rotatedAt: string | null; revokedAt: string | null; revokedReason: string | null; createdAt: string; status: "ACTIVE" | "REVOKED" | "EXPIRED"; user: { name: string; email: string; systemRole: string } };
export type SecurityEvent = { id: string; action: string; entityId: string | null; requestId: string | null; ipAddress: string | null; metadata: Record<string, unknown>; createdAt: string; severity: "INFO" | "WARNING" | "CRITICAL"; user: { name: string; email: string } | null; company: { tradeName: string } | null };
export type SecurityReport = { generatedAt: string; indicators: { activeSessions: number; failedLogins: number; refreshReuse: number; revokedSessions: number }; sessions: SecuritySession[]; events: SecurityEvent[] };

const dateTime = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const roleLabels: Record<string, string> = { INTERNAL_ADMIN: "Administração", DEVELOPER: "Desenvolvimento", HELPDESK: "Helpdesk", FINANCE: "Financeiro", COMMERCIAL: "Comercial", CUSTOMER: "Cliente" };
const actionLabels: Record<string, string> = { AUTH_LOGIN_SUCCEEDED: "Login autorizado", AUTH_LOGIN_FAILED: "Login recusado", AUTH_REFRESH_ROTATED: "Sessão renovada", AUTH_REFRESH_REUSE_DETECTED: "Reutilização de token bloqueada", AUTH_REFRESH_FAILED: "Renovação recusada", AUTH_SESSION_REVOKED: "Sessão revogada", AUTH_SESSION_LIMIT_REVOKED: "Limite de sessões aplicado", AUTH_TENANT_ACCESS_DENIED: "Acesso à empresa bloqueado" };

export function SecurityCenter({ report }: { report: SecurityReport }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function revoke(id: string) {
    setBusy(id); setError("");
    const response = await fetch(`/api/portal/internal/security/sessions/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ motivo: "ADMIN_SECURITY_REVIEW" }) });
    if (response.ok) router.refresh();
    else { const body = await response.json().catch(() => ({})) as { message?: string }; setError(body.message ?? "Não foi possível revogar a sessão."); }
    setBusy(null);
  }
  return <div className="security-center">{error && <p className="form-error">{error}</p>}<article className="report-panel full security-session-panel"><div className="panel-title"><div><span>SESSÕES</span><h2>Dispositivos e acessos recentes</h2></div><strong>{report.sessions.length}</strong></div><div className="security-session-list">{report.sessions.map((session) => <div className="security-session-row" key={session.id}><span className={`security-signal ${session.status.toLowerCase()}`}/><div><strong>{session.user.name}</strong><small>{session.user.email} · {roleLabels[session.user.systemRole] ?? session.user.systemRole}</small><em>{session.userAgent ?? "Dispositivo não informado"}</em></div><div><span>Último uso</span><b>{dateTime(session.lastSeenAt)}</b><small>{session.ipAddress ?? "IP indisponível"}</small></div><span className={`status-pill ${session.status.toLowerCase()}`}>{session.status === "ACTIVE" ? "Ativa" : session.status === "REVOKED" ? "Revogada" : "Expirada"}</span>{session.status === "ACTIVE" ? <button disabled={busy === session.id} onClick={() => revoke(session.id)} type="button">{busy === session.id ? "Revogando..." : "Revogar"}</button> : <small>{session.revokedReason ?? "Prazo encerrado"}</small>}</div>)}</div></article><article className="report-panel full security-event-panel"><div className="panel-title"><div><span>TRILHA DE DEFESA</span><h2>Eventos de segurança</h2></div><strong>{report.events.length}</strong></div><div className="security-event-list">{report.events.length ? report.events.map((event) => <div className={`security-event-row ${event.severity.toLowerCase()}`} key={event.id}><span>{event.severity === "CRITICAL" ? "!" : event.severity === "WARNING" ? "△" : "✓"}</span><div><strong>{actionLabels[event.action] ?? event.action}</strong><small>{event.user?.name ?? "Identidade não confirmada"}{event.company ? ` · ${event.company.tradeName}` : ""}</small></div><div><b>{dateTime(event.createdAt)}</b><small>{event.ipAddress ?? "IP não registrado"}</small></div>{event.requestId && <code>{event.requestId.slice(0, 12)}</code>}</div>) : <div className="monitor-empty"><span>✓</span><strong>Nenhum evento registrado</strong><p>A trilha será preenchida automaticamente pelos acessos.</p></div>}</div></article></div>;
}
