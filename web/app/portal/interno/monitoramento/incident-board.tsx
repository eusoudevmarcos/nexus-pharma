"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type Incident = {
  id: string;
  source: string;
  severity: string;
  status: string;
  title: string;
  detail: string | null;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  resolvedBy: { name: string } | null;
};

const labels: Record<string, string> = { OPEN: "Aberto", ACKNOWLEDGED: "Em análise", RESOLVED: "Resolvido", INFO: "Info", WARNING: "Atenção", ERROR: "Erro", CRITICAL: "Crítico" };
const formatDateTime = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

export function IncidentBoard({ incidents }: { incidents: Incident[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function update(id: string, status: "ACKNOWLEDGED" | "RESOLVED") {
    setBusy(id); setError("");
    const response = await fetch(`/api/portal/internal/incidents/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: string };
      setError(body.message ?? "Não foi possível atualizar o incidente.");
    } else router.refresh();
    setBusy(null);
  }
  if (!incidents.length) return <div className="monitor-empty"><span>✓</span><strong>Nenhum incidente registrado</strong><p>Falhas relevantes aparecerão automaticamente nesta fila.</p></div>;
  return <div className="incident-list">{error && <p className="form-error">{error}</p>}{incidents.map((incident) => <article className={`incident-row ${incident.severity.toLowerCase()}`} key={incident.id}><span className="incident-severity">{labels[incident.severity] ?? incident.severity}</span><div><strong>{incident.title}</strong><small>{incident.source} · última ocorrência {formatDateTime(incident.lastSeenAt)} · {incident.occurrenceCount} ocorrência(s)</small>{incident.detail && <p>{incident.detail}</p>}{incident.resolvedBy && <em>Resolvido por {incident.resolvedBy.name}</em>}</div><span className={`status-pill ${incident.status.toLowerCase()}`}>{labels[incident.status] ?? incident.status}</span><div className="incident-actions">{incident.status === "OPEN" && <button disabled={busy === incident.id} onClick={() => update(incident.id, "ACKNOWLEDGED")} type="button">Assumir</button>}{incident.status !== "RESOLVED" && <button disabled={busy === incident.id} onClick={() => update(incident.id, "RESOLVED")} type="button">Resolver</button>}</div></article>)}</div>;
}
