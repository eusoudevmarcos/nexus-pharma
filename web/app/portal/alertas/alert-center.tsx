"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export type BusinessAlert = {
  id: string;
  type: string;
  severity: string;
  status: string;
  title: string;
  message: string;
  detectedAt: string;
  dueAt: string | null;
  actionData: Record<string, number | string | null>;
  product: { name: string; ean: string; stockQuantity: number; salePrice: number } | null;
  lot: { code: string; quantity: number; expiresAt: string } | null;
  invoice: { amount: number; dueAt: string; status: string } | null;
  acknowledgedBy: { name: string } | null;
};

const groups = [
  { id: "ALL", label: "Todos" },
  { id: "PURCHASE", label: "Compras" },
  { id: "EXPIRY", label: "Vencimentos" },
  { id: "BILLING", label: "Cobrança" },
];
const labels: Record<string, string> = { STOCK_LOW: "Estoque baixo", HIGH_MARGIN_REORDER: "Oportunidade de compra", EXPIRY_90: "Vence em até 90 dias", EXPIRY_60: "Vence em até 60 dias", EXPIRY_30: "Vence em até 30 dias", BILLING_OVERDUE: "Cobrança vencida", OPEN: "Novo", ACKNOWLEDGED: "Em tratamento" };
const date = (value: string) => new Intl.DateTimeFormat("pt-BR").format(new Date(value));

function belongs(type: string, group: string) {
  if (group === "ALL") return true;
  if (group === "PURCHASE") return ["STOCK_LOW", "HIGH_MARGIN_REORDER"].includes(type);
  if (group === "EXPIRY") return type.startsWith("EXPIRY_");
  return type === "BILLING_OVERDUE";
}

export function AlertCenter({ alerts, currentRole }: { alerts: BusinessAlert[]; currentRole: string }) {
  const router = useRouter();
  const [group, setGroup] = useState("ALL");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const visible = useMemo(() => alerts.filter((alert) => belongs(alert.type, group)), [alerts, group]);
  const canResolve = ["OWNER", "ADMIN", "MANAGER", "FINANCE", "PHARMACIST"].includes(currentRole);
  const canAcknowledge = canResolve || currentRole === "OPERATOR";
  async function update(id: string, status: "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED") {
    setBusy(id); setError("");
    const response = await fetch(`/api/portal/alerts/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: string };
      setError(body.message ?? "Não foi possível atualizar o alerta.");
    } else router.refresh();
    setBusy(null);
  }
  return <><div className="alert-filter" role="tablist" aria-label="Filtrar alertas">{groups.map((item) => <button aria-selected={group === item.id} key={item.id} onClick={() => setGroup(item.id)} role="tab" type="button">{item.label}<span>{alerts.filter((alert) => belongs(alert.type, item.id)).length}</span></button>)}</div>{error && <p className="form-error">{error}</p>}{visible.length ? <div className="business-alert-list">{visible.map((alert) => <article className={`business-alert ${alert.severity.toLowerCase()}`} key={alert.id}><div className="business-alert-icon">{alert.type === "HIGH_MARGIN_REORDER" ? "↗" : alert.type.startsWith("EXPIRY") ? "⌛" : alert.type === "BILLING_OVERDUE" ? "$" : "↓"}</div><div className="business-alert-copy"><span>{labels[alert.type] ?? alert.type}</span><h2>{alert.title}</h2><p>{alert.message}</p><small>Detectado em {date(alert.detectedAt)}{alert.dueAt ? ` · prazo ${date(alert.dueAt)}` : ""}{alert.acknowledgedBy ? ` · por ${alert.acknowledgedBy.name}` : ""}</small></div><span className={`status-pill ${alert.status.toLowerCase()}`}>{labels[alert.status] ?? alert.status}</span><div className="business-alert-data">{typeof alert.actionData.suggestedQuantity === "number" && <div><span>Sugestão</span><strong>{alert.actionData.suggestedQuantity} un.</strong></div>}{typeof alert.actionData.margin === "number" && <div><span>Margem</span><strong>{new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(alert.actionData.margin)}</strong></div>}{alert.lot && <div><span>Lote</span><strong>{alert.lot.code}</strong></div>}{alert.invoice && <div><span>Valor</span><strong>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(alert.invoice.amount)}</strong></div>}</div><div className="business-alert-actions">{canAcknowledge && alert.status === "OPEN" && <button disabled={busy === alert.id} onClick={() => update(alert.id, "ACKNOWLEDGED")} type="button">Assumir</button>}{canResolve && <button disabled={busy === alert.id} onClick={() => update(alert.id, "RESOLVED")} type="button">Resolver</button>}{canResolve && <button className="quiet" disabled={busy === alert.id} onClick={() => update(alert.id, "DISMISSED")} type="button">Dispensar</button>}</div></article>)}</div> : <div className="monitor-empty"><span>✓</span><strong>Nenhum alerta nesta categoria</strong><p>A rotina diária mantém esta central atualizada.</p></div>}</>;
}
