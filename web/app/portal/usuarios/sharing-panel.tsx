"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type SharingConnection = {
  id: string;
  status: "ACTIVE" | "SUSPENDED" | "TERMINATED";
  suspendedBy: "PHARMACY" | "NEXUS" | null;
  startsAt: string;
  endsAt: string | null;
  organization: { tradeName: string; kind: string; status: string };
};

const kindLabels: Record<string, string> = { LABORATORY: "Laboratório", DISTRIBUTOR: "Distribuidora", WHOLESALER: "Atacadista" };
const date = (value: string) => new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

function statusText(item: SharingConnection) {
  if (item.status === "ACTIVE") return item.organization.status === "ACTIVE" ? "Compartilhando" : "Organização inativa";
  if (item.status === "TERMINATED") return `Encerrado${item.endsAt ? ` em ${date(item.endsAt)}` : ""}`;
  return item.suspendedBy === "PHARMACY" ? "Suspenso por você" : "Suspenso pela Nexus";
}

function SharingRow({ item, canManage }: { item: SharingConnection; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function change(status: "ACTIVE" | "SUSPENDED") {
    setBusy(true);
    setFeedback(null);
    const response = await fetch(`/api/portal/sharing/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    if (response.ok) router.refresh();
    else setFeedback(((await response.json().catch(() => ({}))) as { message?: string }).message ?? "Não foi possível alterar o compartilhamento.");
    setBusy(false);
  }

  const canSuspend = canManage && item.status === "ACTIVE";
  const canResume = canManage && item.status === "SUSPENDED" && item.suspendedBy === "PHARMACY";
  return (
    <div className="internal-row sharing-row">
      <div>
        <strong>{item.organization.tradeName}</strong>
        <small>{kindLabels[item.organization.kind] ?? item.organization.kind} · desde {date(item.startsAt)}</small>
      </div>
      <span className={`status-pill ${item.status === "ACTIVE" ? "active" : item.status === "SUSPENDED" ? "pending" : "disabled"}`}>{statusText(item)}</span>
      {canSuspend && <button className="team-suspend-btn" disabled={busy} onClick={() => change("SUSPENDED")} type="button">{busy ? "…" : "Suspender"}</button>}
      {canResume && <button className="team-suspend-btn resume" disabled={busy} onClick={() => change("ACTIVE")} type="button">{busy ? "…" : "Religar"}</button>}
      {feedback && <small className="team-row-feedback">{feedback}</small>}
    </div>
  );
}

/**
 * Transparência para a farmácia: quais indústrias e distribuidoras recebem os
 * dados dela (estoque e vendas em quantidade) e o controle para suspender.
 */
export function SharingPanel({ connections, currentRole }: { connections: SharingConnection[]; currentRole: string }) {
  const canManage = ["OWNER", "ADMIN"].includes(currentRole);
  return (
    <article className="report-panel full sharing-panel">
      <div className="panel-title">
        <div>
          <span>INDÚSTRIA E DISTRIBUIÇÃO</span>
          <h2>Quem acompanha seu estoque e suas vendas</h2>
        </div>
        <strong>{connections.filter((item) => item.status === "ACTIVE").length}</strong>
      </div>
      <p className="team-hint">
        Estas organizações veem, em tempo real, <b>quantidades</b> de estoque, vendas e validade dos produtos delas na sua farmácia.
        Nunca veem preço, margem, financeiro ou dados de clientes. Você pode suspender a qualquer momento.
      </p>
      {connections.length ? (
        <div className="team-list">{connections.map((item) => <SharingRow canManage={canManage} item={item} key={item.id} />)}</div>
      ) : (
        <p className="sharing-empty">Nenhuma indústria ou distribuidora recebe dados desta farmácia.</p>
      )}
      {!canManage && connections.length > 0 && <p className="team-hint">Somente o proprietário ou um administrador pode suspender ou religar.</p>}
    </article>
  );
}
